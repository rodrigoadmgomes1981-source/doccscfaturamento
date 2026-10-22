// Testes das regras de cálculo, com números reais do fechamento PAP 07/2026.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePega, agregar, calcular, calcFolha, descricaoNF, numeroDocumento, codReduzido, ultimoDiaMesSeguinte, crmKey, compDoPeriodo } from '../src/core.js';

const ctPAP = {
  sigla: 'PAP', numero: '98687', ano: '/2025', empresa: 'ATENA', taxaSocio: 150, taxaSocioMinHoras: 24, alertaValor: 20000, vinculoPadrao: 'SOCIO',
  itens: [
    { id: 'pacs', especialidade: 'Pediatria', tipo: 'PACS', unidadePag: 'hora', unidadeFat: 'hora', qtdMes: 2200, valorFaturar: 189.38, valorPagar: 166.6666666667 },
    { id: 'hps', especialidade: 'Pediatria', tipo: 'HPS', unidadePag: 'hora', unidadeFat: 'hora', qtdMes: 0, valorFaturar: 189.38, valorPagar: 165 },
  ],
  mapeamento: [{ s: 'PAP | PACS', item: 'pacs' }, { s: 'PAP | HPS', item: 'hps' }],
  descricaoNF: 'PERIODO {PERIODO} - QUANTIDADE DE HORAS EXECUTADAS {QTD_TOTAL} HORAS, VALOR DE HORA {VALOR_UNITARIO}, TOTALIZANDO {VALOR_TOTAL}.',
};
// horas por médico (aba "Resumo Geral Valores" do fechamento PAP 07/2026)
const horas = [['38644','PACS',12],['63383','PACS',102],['54797','PACS',54],['48416','PACS',168],['30493','PACS',60],['10625','PACS',126],['30978','PACS',60],['56596','PACS',78],['46189','HPS',8],['13123','PACS',78],['52138','PACS',96],['48916','PACS',12],['41261','HPS',16],['11632','PACS',132],['9283','PACS',60],['40635','PACS',24],['12375','PACS',114],['57566','PACS',102],['40862','PACS',222],['47446','HPS',16],['31823','PACS',12],['55446','PACS',54],['54677','PACS',24],['51004','PACS',18],['55497','PACS',60]];
const fPAP = {
  base: horas.map(([k, t, h]) => ({ k, s: 'PAP | ' + t, n: 1, na: 1, plan: h, real: h, apur: h, vApur: 0 })),
  medicos: Object.fromEntries(horas.map(([k]) => [k, { nome: 'Dr ' + k, crm: k }])),
};

test('faturamento e pagamento do PAP 07/2026 batem com a planilha', () => {
  const c = calcular(fPAP, ctPAP);
  assert.equal(c.totais.apur, 1708);
  assert.equal(c.totais.totFat, 323461.04);
  assert.equal(c.totais.totPag, 284600);
  assert.deepEqual(c.porItem.map((p) => [p.tipo, p.apur, p.totFat]), [['PACS', 1668, 315885.84], ['HPS', 40, 7575.2]]);
});

test('folha: taxa de sócio acima de 24 h, líquido e códigos do ERP', () => {
  const c = calcular(fPAP, ctPAP);
  const F = calcFolha(c, ctPAP, {}, {}, { empresas: [{ sigla: 'ATENA', razao: 'ATENA SERVIÇOS', cod: 4 }] });
  assert.equal(F.tot.taxa, 2400);
  assert.equal(F.tot.liq, 282200);
  const aline = F.rows.find((r) => r.k === '38644');
  assert.equal(aline.taxa, 0);
  assert.equal(aline.codEmpresa, 4);
  assert.equal(aline.natureza, 120101);
  assert.equal(F.rows.filter((r) => r.alertas.some((a) => /Acima/.test(a.t))).length, 4);
  assert.equal(numeroDocumento(ctPAP, '2026-07'), '986870726');
  assert.equal(codReduzido(ctPAP, '2026-07'), 'PAP0726');
  assert.equal(ultimoDiaMesSeguinte('2026-07'), '2026-08-31');
});

test('ajuste na conferência substitui a quantidade apurada', () => {
  const f = { ...fPAP, ajustes: { '38644|pacs': { qPag: 6, qFat: null, just: 'teste' } } };
  const l = calcular(f, ctPAP).linhas.find((x) => x.key === '38644|pacs');
  assert.equal(l.qPag, 6); assert.equal(l.qFat, 12); assert.equal(l.totPag, 1000); assert.ok(l.ajustado);
});

test('descrição da NF com campos automáticos', () => {
  const t = descricaoNF(ctPAP.descricaoNF, calcular(fPAP, ctPAP), '2026-07', ctPAP);
  assert.match(t, /01\/07\/2026 A 31\/07\/2026/);
  assert.match(t, /EXECUTADAS 1708 HORAS/);
  assert.match(t, /R\$189,38/);
  assert.match(t, /323\.461,04/);
});

test('leitura do relatório Financeiro do Pega Plantão', () => {
  const aoa = [
    ['gerado em 19/10/2026 20:12:44 (UTC -3)'], ['FINANCEIRO'], ['01/10/2026~31/10/2026'], [],
    ['Nome','CRM','CPF','Email','Modalidade','Cód. Empresa Pagadora','Cód. Empresa Faturamento','Apto?','Local','Setor','Data','Dia da Semana','Tipo de Plantão','Valor / Hora (Configurado)','Valor / Hora Bruto (Configurado)','Início (Previsto)','Fim  (Previsto)','Duração (h) (Previsto)','Total (Previsto)','Total Bruto (Previsto)','Registro de Entrada (Realizado)','Registro de Saída (Realizado)','Duração (Realizado)','Total (Realizado)','Total Bruto (Realizado)','Registro de Entrada (Tolerância)','Registro de Saída (Tolerância)','Duração (Tolerância)','Total (Tolerância)','Total Bruto (Tolerância)','Situação'],
    ['FULANA','47091/PR','066.073.899-61','a@b.com','','','','','MPF','Pediatria - Plantão - CCO','01/10/2026','QUINTA-FEIRA','Diurno',180.91,180.91,'01/10/2026 07:00','01/10/2026 13:00',6,1085.46,1085.46,'','',6.05,1095.83,1095.83,'','',6,1085.46,1085.46,'Designado'],
    ['FULANA','47091/PR',null,'a@b.com','','','','','MPF','Pediatria - Plantão - CCO','02/10/2026','SEXTA-FEIRA','Diurno',180.91,180.91,'','',12,0,0,'','',0,0,0,'','',0,0,0,'Trocado'],
    ['Total Geral',null,'2 Plantões'],
  ];
  const p = parsePega(aoa);
  assert.equal(p.periodo, '01/10/2026 a 31/10/2026');
  assert.equal(compDoPeriodo(p.periodo), '2026-10');
  assert.equal(p.rows.length, 2);
  const ag = agregar(p.rows);
  assert.equal(ag.base.length, 1);
  assert.deepEqual([ag.base[0].plan, ag.base[0].real, ag.base[0].apur, ag.base[0].na], [18, 6.05, 6, 1]);
  assert.equal(crmKey('47091/PR'), '47091-PR');
});
