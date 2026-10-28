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

test('taxa de sócio não é cobrada de quem não tem valor a receber', () => {
  const f = { base: [{ k: '1', s: 'PAP | HPS', n: 3, na: 3, plan: 36, real: 36, apur: 36, vApur: 0 }], medicos: { 1: { nome: 'Sem valor', crm: '1' } } };
  const ct = { ...ctPAP, itens: [{ ...ctPAP.itens[1], valorPagar: 0 }] };
  const F = calcFolha(calcular(f, ct), ct, {}, {}, {});
  assert.equal(F.rows[0].taxa, 0);
  assert.equal(F.rows[0].liq, 0);
});

test('período de corte (26 a 25) cai na competência do mês final e vai para o PENF', async () => {
  const { compDoPeriodo, periodoMeses } = await import('../src/core.js');
  assert.equal(compDoPeriodo('26/08/2026 a 25/09/2026'), '2026-09');
  assert.deepEqual(periodoMeses('26/08/2026 a 25/09/2026'), ['2026-08', '2026-09']);
  assert.equal(compDoPeriodo('01/10/2026 a 31/10/2026'), '2026-10');
  const t = descricaoNF('PERIODO {PERIODO}', calcular(fPAP, ctPAP), '2026-09', ctPAP, '26/08/2026 a 25/09/2026');
  assert.equal(t, 'PERIODO 26/08/2026 A 25/09/2026');
});

test('linha excluída sai dos totais e volta ao restaurar', () => {
  const base = calcular(fPAP, ctPAP).totais;
  const sem = calcular({ ...fPAP, excluidos: { '63383|pacs': { motivo: 'teste' } } }, ctPAP);
  assert.equal(sem.totais.apur, base.apur - 102);
  assert.equal(sem.totais.totFat, Math.round((base.totFat - 102 * 189.38) * 100) / 100);
  assert.equal(sem.linhas.length, 24);
  assert.equal(calcular({ ...fPAP, excluidos: { '63383|pacs': null } }, ctPAP).totais.apur, base.apur);
});

test('valores no formato brasileiro e com R$', async () => {
  const { num } = await import('../src/core.js');
  for (const [t, v] of [['189,38', 189.38], ['1.234,56', 1234.56], ['R$ 1.234,56', 1234.56], ['1234.56', 1234.56], ['1,234.56', 1234.56], ['166,6666666667', 166.6666666667], ['2.000', 2000], ['', 0], ['abc', 0], [42, 42]]) assert.equal(num(t), v, String(t));
});

test('sem valor a pagar no contrato usa o valor/hora do Pega Plantão (PP)', () => {
  const ct = { ...ctPAP, itens: [{ ...ctPAP.itens[0], valorPagar: 0 }, ctPAP.itens[1]] };
  const f = { base: [{ k: '1', s: 'PAP | PACS', n: 2, na: 2, plan: 12, real: 12, apur: 12, vApur: 2170.92 }], medicos: { 1: { nome: 'A', crm: '1' } } };
  const l = calcular(f, ct).linhas[0];
  assert.equal(l.pagPP, true); assert.equal(l.vPag, 180.91); assert.equal(l.totPag, 2170.92); assert.equal(l.vFat, 189.38);
  const l2 = calcular(f, ctPAP).linhas[0];
  assert.equal(l2.pagPP, false); assert.equal(l2.totPag, 2000);
});

test('fonte "Pega Plantão" sem valor/hora no relatório usa o valor do contrato', () => {
  const ct = { ...ctPAP, itens: [{ ...ctPAP.itens[0], fontePag: 'pega' }, ctPAP.itens[1]] };
  const f = { base: [{ k: '1', s: 'PAP | PACS', n: 4, na: 4, plan: 48, real: 46.8, apur: 46.8667, vApur: 0 }], medicos: { 1: { nome: 'A', crm: '1' } } };
  const l = calcular(f, ct).linhas[0];
  assert.equal(l.pagPP, false); assert.equal(l.vPag, 166.6667); assert.equal(l.totPag, 7811.12);
  const comPP = calcular({ ...f, base: [{ ...f.base[0], vApur: 46.8667 * 150 }] }, ct).linhas[0];
  assert.equal(comPP.pagPP, true); assert.equal(comPP.vPag, 150);
});

test('retenções da NF (exemplo de R$ 9.500,00) e folha de PJ não optante', async () => {
  const { retencoesNF } = await import('../src/core.js');
  const R = retencoesNF(9500);
  assert.deepEqual(R.itens.map((i) => i.valor), [61.75, 285, 95, 142.5]);
  assert.equal(R.total, 584.25); assert.equal(R.liquido, 8915.75);
  const c = calcular(fPAP, ctPAP);
  const F = calcFolha(c, ctPAP, { '63383': { vinculo: 'PJ', simples: 'NAO' }, '54797': { vinculo: 'PJ', simples: 'SIM' } }, {}, {});
  const pj = F.rows.find((r) => r.k === '63383'); const sn = F.rows.find((r) => r.k === '54797');
  assert.equal(pj.ret, retencoesNF(17000).total); assert.equal(pj.taxa, 0); assert.equal(pj.liq, 17000 - pj.ret);
  assert.equal(sn.ret, 0);
  const man = calcFolha(c, ctPAP, { '63383': { vinculo: 'PJ' } }, { ret: { '63383': 100 } }, {}).rows.find((r) => r.k === '63383');
  assert.equal(man.ret, 100);
});

test('meta escolhida usa os valores da meta; sem valor na meta usa o padrão', () => {
  const ct = { ...ctPAP, itens: [{ ...ctPAP.itens[0], metas: { maxima: { valorFaturar: 200, valorPagar: 175 }, minima: { valorFaturar: 150 } } }, ctPAP.itens[1]] };
  const f = { base: [{ k: '1', s: 'PAP | PACS', n: 1, na: 1, plan: 10, real: 10, apur: 10, vApur: 0 }], medicos: { 1: { nome: 'A', crm: '1' } } };
  assert.equal(calcular({ ...f, meta: 'maxima' }, ct).linhas[0].totFat, 2000);
  assert.equal(calcular({ ...f, meta: 'maxima' }, ct).linhas[0].totPag, 1750);
  const mn = calcular({ ...f, meta: 'minima' }, ct).linhas[0];
  assert.equal(mn.vFat, 150); assert.equal(mn.totPag, 1666.67);
  assert.equal(calcular(f, ct).linhas[0].vFat, 189.38);
});

test('faturamento líquido = faturamento − impostos do contrato', async () => {
  const { impostosFat, aliquotasContrato } = await import('../src/core.js');
  const a = aliquotasContrato({ impISS: 5, impPIS: 0.65, impCOFINS: '3', impCSLL: 1, impIR: '1,5' });
  const r = impostosFat(323461.04, a);
  assert.deepEqual(r.itens.map((i) => i.valor), [16173.05, 2102.5, 9703.83, 3234.61, 4851.92]);
  assert.equal(r.total, 36065.91); assert.equal(r.liquido, 287395.13);
  assert.equal(impostosFat(1000, aliquotasContrato({})).liquido, 1000);
});

test('tabelas de valores: escolhe a vigente pela competência e calcula com ela', async () => {
  const { tabelaVigente, itensUniao, diffValores } = await import('../src/core.js');
  const orig = ctPAP.itens;
  const reaj = orig.map((i) => ({ ...i, valorFaturar: 200, valorPagar: 175 }));
  const adit = [...reaj, { id: 'neo', especialidade: 'Neonatologia', tipo: 'UTI', unidadePag: 'hora', unidadeFat: 'hora', valorFaturar: 300, valorPagar: 250 }];
  const ct = { ...ctPAP, tabelas: [
    { id: 't0', nome: 'Original', tipo: 'original', vigencia: '', itens: orig },
    { id: 't2', nome: '1º aditivo', tipo: 'aditivo', vigencia: '2026-11', itens: adit },
    { id: 't1', nome: 'Reajuste', tipo: 'reajuste', vigencia: '2026-09', itens: reaj },
  ] };
  assert.equal(tabelaVigente(ct, '2026-07').id, 't0');
  assert.equal(tabelaVigente(ct, '2026-09').id, 't1');
  assert.equal(tabelaVigente(ct, '2026-10').id, 't1');
  assert.equal(tabelaVigente(ct, '2027-01').id, 't2');
  assert.equal(tabelaVigente(ct).id, 't2');
  assert.equal(itensUniao(ct).length, 3);
  const f = { base: [{ k: '1', s: 'PAP | PACS', n: 1, na: 1, plan: 10, real: 10, apur: 10, vApur: 0 }], medicos: { 1: { nome: 'A', crm: '1' } } };
  assert.equal(calcular({ ...f, competencia: '2026-07' }, ct).totais.totFat, 1893.8);
  const set = calcular({ ...f, competencia: '2026-09' }, ct);
  assert.equal(set.totais.totFat, 2000); assert.equal(set.totais.totPag, 1750); assert.equal(set.tabela.nome, 'Reajuste');
  // contrato antigo sem tabelas continua igual
  assert.equal(calcular({ ...f, competencia: '2026-09' }, ctPAP).totais.totFat, 1893.8);
  // diferenças
  const d = diffValores(orig, adit);
  assert.equal(d.filter((x) => x.campo === 'valor a faturar').length, 2);
  assert.equal(d.filter((x) => x.campo === 'item novo').length, 1);
  assert.equal(diffValores(orig, JSON.parse(JSON.stringify(orig))).length, 0);
});
