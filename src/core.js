/* Regras de cálculo do fechamento (sem DOM). */
const UNIDADES = {hora:'Hora', plantao:'Plantão', consulta:'Consulta', procedimento:'Procedimento'};
const VINCULOS = ['SOCIO','RPA','PJ','CONCURSADO','COOPERADO'];
const TIPO_PAG = {'SOCIO':'Honorários','RPA':'RPA','PJ':'PJ','PRO-LABORE':'Pró-Labore','CLT':'CLT','CONCURSADO':'Concursado','COOPERADO':'Cooperado'};
/** Vínculos enviados na folha de pagamento (ERP). */
const FOLHA_VINC = ['SOCIO','PJ','RPA'];
/** Base da escala para pagamento e faturamento. */
const BASES_ESCALA = {planejada:'Planejada',realizada:'Realizada',apurada:'Apurada'};
const BASES_FAT = {planejada:'Planejada',realizada:'Realizada',apurada:'Apurada',fixo:'Valor fixo mensal'};
/** Vínculos informados na empresa de faturamento (PENF) e aceitos na folha/ERP. */
const VINC_NF = [['SOCIO','Sócio'],['PJ','PJ'],['CLT','CLT']];
const VINC_FOLHA = [['SOCIO','Sócio'],['PJ','PJ'],['RPA','RPA']];
const NATUREZAS_PADRAO = {'Honorários':120101,'PJ':120102,'RPA':120103,'Pró-Labore':120104};

function normTxt(s){return String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();}
/** Número a partir de 189,38 · 1.234,56 · R$ 1.234,56 · 1234.56 · 1,234.56 (o último separador é o decimal). */
function num(v){ if(v==null||v==='') return 0; if(typeof v==='number') return isFinite(v)?v:0;
  let s=String(v).replace(/[^\d,.\-]/g,''); if(!s) return 0;
  const iv=s.lastIndexOf(','), ip=s.lastIndexOf('.');
  if(iv>=0&&ip>=0){ s= iv>ip ? s.replace(/\./g,'').replace(',','.') : s.replace(/,/g,''); }
  else if(iv>=0){ s= /,\d{3}$/.test(s)&&s.split(',').length>2 ? s.replace(/,/g,'') : s.replace(/,/g,'.'); }
  else if(ip>=0&&/^-?\d{1,3}(\.\d{3})+$/.test(s)){ s=s.replace(/\./g,''); }
  const n=parseFloat(s); return isFinite(n)?n:0; }
function r2(n){return Math.round((n+(n>=0?1:-1)*1e-9)*100)/100;}
function r4(n){return Math.round(n*10000)/10000;}
function crmKey(crm){ const s=String(crm==null?'':crm).toUpperCase(); const m=s.match(/\d+/); if(!m) return ''; const d=m[0].replace(/^0+/,'')||'0'; const uf=(s.replace(/\d/g,'').match(/[A-Z]{2}/)||[''])[0]; return uf? d+'-'+uf : d; }
function crmDigits(k){return String(k||'').split('-')[0];}
function safeKey(s){return normTxt(s).replace(/[^a-z0-9]+/g,'_').slice(0,60);}
function cellStr(v){ if(v==null) return ''; if(v instanceof Date){ const d=v; return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear(); } return String(v).trim(); }

/** Classe do plantão pelo dia em que começa: FDS (sábado ou domingo) ou DS (segunda a sexta). Usa a coluna "Dia da Semana" ou a data. */
function classeDia(dia, data){
  const t=normTxt(dia);
  if(/^(sab|dom)/.test(t)) return 'FDS';
  if(/^(seg|ter|qua|qui|sex)/.test(t)) return 'DS';
  let d=null;
  if(data instanceof Date) d=new Date(Date.UTC(data.getFullYear(),data.getMonth(),data.getDate()));
  else if(typeof data==='number'&&data>20000) d=new Date(Math.round((data-25569)*864e5));
  else { const s=String(data||''); const m=s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); const m2=s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if(m) d=new Date(Date.UTC(+m[3],+m[2]-1,+m[1])); else if(m2) d=new Date(Date.UTC(+m2[1],+m2[2]-1,+m2[3])); }
  if(!d||isNaN(d.getTime())) return '';
  const w=d.getUTCDay(); return (w===0||w===6)?'FDS':'DS';
}
/** O item vale para a classe do plantão? (marcações DS / FDS do item; sem marcação = ambos) */
function cobreClasse(item,c){ return !c || (c==='FDS'? item.fds!==false : item.ds!==false); }
/** Nome do setor para exibição: "Setor#FDS" → "Setor (fim de semana)". */
function rotuloSetor(s){ return String(s||'').replace(/#FDS$/,' (fim de semana)').replace(/#DS$/,' (dia de semana)'); }
function separaSetor(s){ const m=String(s||'').match(/^(.*)#(FDS|DS)$/); return m? [m[1],m[2]] : [String(s||''),'']; }

/** Lê a matriz (linhas x colunas) do relatório Financeiro do Pega Plantão. */
function parsePega(aoa){
  let hi=-1;
  for(let i=0;i<Math.min(aoa.length,60);i++){ const n=(aoa[i]||[]).map(normTxt); if(n.includes('nome')&&n.includes('crm')&&n.includes('setor')){hi=i;break;} }
  if(hi<0) throw new Error('Não encontrei o cabeçalho do relatório (linha com Nome, CRM e Setor). Use o relatório Financeiro exportado do Pega Plantão.');
  const H=(aoa[hi]||[]).map(normTxt);
  const col=(...c)=>{for(const x of c){const i=H.indexOf(normTxt(x)); if(i>=0) return i;} return -1;};
  const C={nome:col('Nome'),crm:col('CRM'),cpf:col('CPF'),email:col('Email','E-mail'),local:col('Local'),setor:col('Setor'),data:col('Data'),
    tipo:col('Tipo de Plantão'),vh:col('Valor / Hora (Configurado)'),ini:col('Início (Previsto)'),fim:col('Fim (Previsto)'),
    plan:col('Duração (h) (Previsto)','Duração (Previsto)'),real:col('Duração (Realizado)'),apur:col('Duração (Tolerância)'),
    totApur:col('Total (Tolerância)'),sit:col('Situação'),dia:col('Dia da Semana','Dia semana','Dia da semana (início)')};
  const falta=['nome','crm','setor','plan','real','apur'].filter(k=>C[k]<0);
  if(falta.length) throw new Error('Colunas obrigatórias ausentes no relatório: '+falta.join(', ')+'.');
  let periodo='', geradoEm='';
  for(let i=0;i<hi;i++){ for(const v of (aoa[i]||[])){ const s=cellStr(v); const m=s.match(/(\d{2}\/\d{2}\/\d{4})\s*~\s*(\d{2}\/\d{2}\/\d{4})/); if(m&&!periodo) periodo=m[1]+' a '+m[2]; if(/gerado em/i.test(s)&&!geradoEm) geradoEm=s.replace(/^gerado em\s*/i,''); } }
  const g=(r,k)=>C[k]>=0?r[C[k]]:null;
  const rows=[];
  for(let i=hi+1;i<aoa.length;i++){
    const r=aoa[i]||[]; const nome=cellStr(g(r,'nome'));
    if(!nome) continue;
    if(/^total geral/i.test(nome)) break;
    if(nome.startsWith('*')) continue;
    const crm=cellStr(g(r,'crm'));
    rows.push({nome, crm, k: crmKey(crm) || ('SEMCRM_'+safeKey(nome)), cpf:cellStr(g(r,'cpf')), email:cellStr(g(r,'email')),
      local:cellStr(g(r,'local')), setor:cellStr(g(r,'setor')), data:cellStr(g(r,'data')), tipo:cellStr(g(r,'tipo')),
      vh:num(g(r,'vh')), plan:num(g(r,'plan')), real:num(g(r,'real')), apur:num(g(r,'apur')), totApur:num(g(r,'totApur')),
      sit:cellStr(g(r,'sit')), ini:cellStr(g(r,'ini')), fim:cellStr(g(r,'fim')), c:classeDia(g(r,'dia'),g(r,'data'))});
  }
  if(!rows.length) throw new Error('O relatório não tem plantões.');
  return {periodo, geradoEm, rows};
}
/** Meses (AAAA-MM) de início e fim do período do relatório, ex.: "26/08/2026 a 25/09/2026" → ['2026-08','2026-09']. */
function periodoMeses(periodo){ return [...String(periodo||'').matchAll(/\d{2}\/(\d{2})\/(\d{4})/g)].map(m=>m[2]+'-'+m[1]); }
/** Competência sugerida = mês em que o período termina (ciclos de corte como 26 a 25 caem no mês final). */
function compDoPeriodo(periodo){ const ms=periodoMeses(periodo); return ms.length? ms[ms.length-1] : ''; }
function setorKey(r){ return (r.local? r.local+' | ' : '')+r.setor; }

/** Agrega os plantões por médico x setor (base imutável do fechamento). */
function agregar(rows){
  const base={}, meds={}, setores={}, cls={};
  for(const r of rows){
    const sk=setorKey(r); setores[sk]=(setores[sk]||0)+1;
    const c=r.c||''; (cls[sk]||(cls[sk]={}))[c]=1;
    const key=r.k+'||'+sk+'||'+c;
    const b=base[key]||(base[key]={k:r.k,s:sk,c,n:0,na:0,nr:0,plan:0,real:0,apur:0,vApur:0});
    b.n++; if(r.apur>0) b.na++; if(r.real>0) b.nr++; b.plan+=r.plan; b.real+=r.real; b.apur+=r.apur; b.vApur+= r.totApur || (r.apur*r.vh) || 0;
    const m=meds[r.k]||(meds[r.k]={nome:r.nome,crm:r.crm,cpf:'',email:''});
    if(!m.cpf&&r.cpf) m.cpf=r.cpf; if(!m.email&&r.email) m.email=r.email;
  }
  const arr=Object.values(base).map(b=>({...b,plan:r4(b.plan),real:r4(b.real),apur:r4(b.apur),vApur:r2(b.vApur)}));
  return {base:arr, medicos:meds, setores, classes:Object.fromEntries(Object.entries(cls).map(([k,o])=>[k,Object.keys(o)]))};
}

/** Sugere o item do contrato para um setor do Pega Plantão. */
function sugerirItem(sk, itens, c){
  if(c) itens=itens.filter(i=>cobreClasse(i,c));
  const setor=normTxt(sk.includes(' | ')? sk.split(' | ').slice(1).join(' | ') : sk);
  let hit=itens.find(i=>normTxt(i.especialidade+' - '+i.tipo)===setor) || itens.find(i=>i.tipo&&normTxt(i.tipo)===setor);
  if(hit) return hit.id;
  const cand=itens.filter(i=>i.especialidade && setor.startsWith(normTxt(i.especialidade)) && i.tipo && setor.includes(normTxt(i.tipo)));
  return cand.length===1? cand[0].id : '';
}
/** Quantidade pela base da escala: horas planejadas/realizadas/apuradas ou nº de plantões (todos, realizados, apurados). */
function baseQtd(unid,g,base){
  const b=base||'apurada';
  if(unid==='hora') return b==='planejada'? g.plan : b==='realizada'? g.real : g.apur;
  if(unid==='plantao') return b==='planejada'? g.n : b==='realizada'? (g.nr!=null?g.nr:g.na) : g.na;
  return 0;
}
/* ---------- datas de vigência ---------- */
function fimMes(comp){ const [y,m]=String(comp).split('-').map(Number); return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10); }
/** Vigência como data AAAA-MM-DD (vigências antigas em AAAA-MM viram o dia 1º). */
function normVig(v){ v=String(v||''); return /^\d{4}-\d{2}$/.test(v)? v+'-01' : v.slice(0,10); }
/** Data de referência: AAAA-MM vira o último dia do mês. */
function refData(ref){ ref=String(ref||''); return /^\d{4}-\d{2}$/.test(ref)? fimMes(ref) : ref.slice(0,10); }
function datasPeriodo(periodo){ return [...String(periodo||'').matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)].map(m=>m[3]+'-'+m[2]+'-'+m[1]); }
/** Data que decide a tabela do fechamento: fim do período do relatório (se cair na competência) ou último dia da competência. */
function refFech(f){ const ds=datasPeriodo(f&&f.periodo); const fim=ds[ds.length-1]; return fim&&fim.slice(0,7)===String(f.competencia||'')? fim : (f&&f.competencia? fimMes(f.competencia) : ''); }
/** Início do período do fechamento (início do relatório ou dia 1º da competência). */
function inicioFech(f){ const ds=datasPeriodo(f&&f.periodo); const fim=ds[ds.length-1]; return ds.length>1&&fim.slice(0,7)===String(f.competencia||'')? ds[0] : (f&&f.competencia? f.competencia+'-01' : ''); }


/* ---------- tabelas de valores do contrato (original, reajustes, aditivos) ---------- */
/** Tabelas do contrato. Contratos sem tabelas: uma tabela original com os itens atuais. */
function tabelasDoContrato(ct){
  if(ct&&Array.isArray(ct.tabelas)&&ct.tabelas.length) return ct.tabelas;
  return [{id:'t_original',nome:'Tabela original do contrato',tipo:'original',vigencia:String((ct&&ct.vigIni)||'').slice(0,10),itens:(ct&&ct.itens)||[]}];
}
/** Tabela vigente na data de referência (AAAA-MM-DD; AAAA-MM = último dia do mês): a de vigência mais recente que não seja posterior. Sem referência: a mais recente. */
function tabelaVigente(ct, ref){
  const R=ref? refData(ref) : '';
  const ts=tabelasDoContrato(ct).slice().sort((a,b)=>normVig(a.vigencia).localeCompare(normVig(b.vigencia)));
  let t=ts[0]; for(const x of ts){ if(!x.vigencia||!R||normVig(x.vigencia)<=R) t=x; }
  return t||{id:'',nome:'',vigencia:'',itens:[]};
}
function itensVigentes(ct, comp){ return tabelaVigente(ct,comp).itens||[]; }
/** Todos os itens já usados em qualquer tabela (para vínculos de setor e valores diferenciados). */
function itensUniao(ct){
  const m=new Map();
  tabelasDoContrato(ct).slice().sort((a,b)=>normVig(a.vigencia).localeCompare(normVig(b.vigencia))).forEach(t=>(t.itens||[]).forEach(i=>m.set(i.id,i)));
  return [...m.values()];
}
/** Diferenças de valores (faturar, pagar e metas) entre duas versões dos itens de uma tabela. */
function diffValores(antes, depois){
  const out=[]; const A=Object.fromEntries((antes||[]).map(i=>[i.id,i])), B=Object.fromEntries((depois||[]).map(i=>[i.id,i]));
  const lab=i=>(i.especialidade||'?')+' · '+(i.tipo||'?');
  for(const id of Object.keys(B)){ const b=B[id], a=A[id];
    if(!a){ if(num(b.valorFaturar)||num(b.valorPagar)) out.push({item:lab(b),campo:'item novo',de:null,para:null,texto:'faturar '+brl(num(b.valorFaturar))+' / pagar '+brl(num(b.valorPagar))}); continue; }
    for(const [f,n] of [['valorFaturar','valor a faturar'],['valorPagar','valor a pagar']]) if(num(a[f])!==num(b[f])) out.push({item:lab(b),campo:n,de:num(a[f]),para:num(b[f])});
    for(const [m,mn] of [['minima','mínima'],['mediana','mediana'],['maxima','máxima']]) for(const [f,n] of [['valorFaturar','a faturar'],['valorPagar','a pagar']]){
      const va=num(a.metas&&a.metas[m]&&a.metas[m][f]), vb=num(b.metas&&b.metas[m]&&b.metas[m][f]);
      if(va!==vb) out.push({item:lab(b),campo:'meta '+mn+' '+n,de:va,para:vb});
    }
    for(const [f,n] of [['ds','dia de semana (DS)'],['fds','fim de semana (FDS)']]) if((a[f]!==false)!==(b[f]!==false)) out.push({item:lab(b),campo:n,de:null,para:null,texto:b[f]!==false?'passa a valer':'deixa de valer'});
    for(const [f,n] of [['empresaFat','empresa de faturamento'],['empresaPag','empresa de pagamento']]) if((a[f]||'')!==(b[f]||'')) out.push({item:lab(b),campo:n,de:null,para:null,texto:(a[f]||'padrão')+' → '+(b[f]||'padrão')});
  }
  for(const id of Object.keys(A)) if(!B[id]&&(num(A[id].valorFaturar)||num(A[id].valorPagar))) out.push({item:lab(A[id]),campo:'item removido',de:null,para:null,texto:'removido'});
  return out;
}

/** Diferenças entre duas versões de uma tabela: valores dos itens + base da escala e valor fixo mensal. */
function diffTabela(a, b){
  const out=diffValores(a&&a.itens, b&&b.itens); const A=a||{}, B=b||{};
  for(const [f,n,L] of [['basePag','pagamento pela escala',BASES_ESCALA],['baseFat','faturamento pela escala',BASES_FAT]]) if((A[f]||'apurada')!==(B[f]||'apurada')) out.push({item:'Tabela',campo:n,de:null,para:null,texto:L[A[f]||'apurada']+' → '+L[B[f]||'apurada']});
  if(num(A.valorFixoMensal)!==num(B.valorFixoMensal)&&((A.baseFat==='fixo')||(B.baseFat==='fixo'))) out.push({item:'Tabela',campo:'valor fixo mensal',de:num(A.valorFixoMensal),para:num(B.valorFixoMensal)});
  return out;
}
/** Empresa de faturamento principal do contrato (primeira cadastrada; sem cadastro, a empresa do contrato). */
function empresaPrincipal(ct){ const e=(ct&&ct.empresasFat||[]).find(x=>x&&x.sigla); return e? e.sigla : String((ct&&ct.empresa)||''); }

/** Calcula as linhas do fechamento (médico x item) aplicando cadastro, valores diferenciados e ajustes da conferência. */
function calcular(fech, contrato){
  if(fech.congelado&&fech.congelado.calc) return fech.congelado.calc;
  // valores da tabela vigente na data de referência do fechamento (fim do período): original, reajuste ou aditivo
  const tabV=contrato? tabelaVigente(contrato, refFech(fech)) : {itens:[]};
  const itens=tabV.itens||[];
  // base da escala usada para pagar e faturar (planejada, realizada, apurada; faturamento também valor fixo mensal)
  const basePag=tabV.basePag||'apurada', baseFat=tabV.baseFat||'apurada';
  const fixo= baseFat==='fixo'? num(tabV.valorFixoMensal) : null;
  const principal=empresaPrincipal(contrato);
  const itMap=Object.fromEntries(itens.map(i=>[i.id,i]));
  const map=Object.fromEntries((contrato&&contrato.mapeamento||[]).map(m=>[m.s,m.item]));
  const dif={}; for(const d of (contrato&&contrato.diferenciados||[])) if(d.crm&&d.item) dif[crmDigits(crmKey(d.crm))+'|'+d.item]=num(d.valorPagar);
  const meds=fech.medicos||{}; const aj=fech.ajustes||{}; const conf=fech.conferidos||{}; const exc=fech.excluidos||{};
  // meta escolhida no fechamento (mínima/mediana/máxima): usa os valores da meta; sem valor na meta, usa o valor padrão do item
  const meta=fech.meta||'';
  const mv=(item,f)=>{ const m=meta&&item.metas&&item.metas[meta]; const v=m?num(m[f]):0; return v||num(item[f]); };
  const groups={}; const naoMap={};
  for(const b of (fech.base||[])){
    // classe do plantão: DS (dia de semana) ou FDS (sábado/domingo). Vínculo específico "setor#FDS" tem prioridade.
    const c=b.c||''; const esp=c&&map[b.s+'#'+c];
    let it= esp || map[b.s];
    if(it==='__ignorar') continue;
    if(it&&itMap[it]&&!esp&&!cobreClasse(itMap[it],c)) it='';
    if(!it||!itMap[it]){ const ks= c&&map[b.s]&&map[b.s]!=='__ignorar'? b.s+'#'+c : b.s; naoMap[ks]=(naoMap[ks]||0)+b.n; continue; }
    const key=b.k+'|'+it;
    const g=groups[key]||(groups[key]={key,k:b.k,item:it,n:0,na:0,nr:0,plan:0,real:0,apur:0,vApur:0,ds:0,fds:0});
    g.n+=b.n; g.na+=b.na; g.nr+=(b.nr!=null?b.nr:b.na); g.plan+=b.plan; g.real+=b.real; g.apur+=b.apur; g.vApur+=b.vApur;
    if(c==='FDS') g.fds+=b.n; else if(c==='DS') g.ds+=b.n;
  }
  const linhas=Object.values(groups).filter(g=>!exc[g.key]).map(g=>{
    const item=itMap[g.item]; const a=aj[g.key]||{};
    const qPagBase=r4(baseQtd(item.unidadePag||'hora',g,basePag)), qFatBase=r4(baseQtd(item.unidadeFat||'hora',g,baseFat==='fixo'?'apurada':baseFat));
    const qPag= a.qPag!=null? num(a.qPag) : qPagBase;
    const qFat= a.qFat!=null? num(a.qFat) : qFatBase;
    const d=dif[crmDigits(g.k)+'|'+g.item];
    // Valor a pagar: valor diferenciado do médico > contrato. O valor/hora do Pega Plantão (PP) entra
    // quando a fonte do item é "Pega Plantão" ou o contrato não tem valor — e só se o relatório trouxer valor.
    const vCont = d!=null? d : mv(item,'valorPagar');
    const vPP = g.apur>0 && g.vApur>0 ? g.vApur/g.apur : 0;
    const pagPP = d==null && vPP>0 && (item.fontePag==='pega' || !vCont);
    let vPag = pagPP? vPP : vCont;
    const totPag = pagPP && a.qPag==null && basePag==='apurada' ? r2(g.vApur) : r2(qPag*vPag);
    const vFat=mv(item,'valorFaturar'); const totFat=r2(qFat*vFat);
    const m=meds[g.k]||{};
    return {key:g.key,k:g.k,nome:m.nome||g.k,crm:m.crm||g.k,itemId:g.item,esp:item.especialidade||'',tipo:item.tipo||'',
      uPag:item.unidadePag||'hora',uFat:item.unidadeFat||'hora',n:g.n,na:g.na,nr:g.nr,nDS:g.ds,nFDS:g.fds,plan:r4(g.plan),real:r4(g.real),apur:r4(g.apur),
      qPagBase,qFatBase,qPag:r4(qPag),qFat:r4(qFat),vPag:r4(vPag),vFat,totPag,totFat,difer:d!=null,pagPP,
      empresaFat:item.empresaFat||principal, empresaPag:item.empresaPag||'',
      ajustado:a.qPag!=null||a.qFat!=null, just:a.just||'', conferido:!!conf[g.key]};
  }).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')||a.esp.localeCompare(b.esp,'pt-BR'));
  // faturamento por valor fixo mensal: o valor é rateado entre as linhas pela quantidade apurada
  if(fixo!=null&&linhas.length){
    const W=linhas.reduce((s,l)=>s+l.qFat,0); let rest=r2(fixo);
    linhas.forEach((l,i)=>{ const v= i===linhas.length-1? rest : r2(fixo*(W? l.qFat/W : 1/linhas.length)); rest=r2(rest-v); l.totFat=v; l.vFat= l.qFat? r4(v/l.qFat) : 0; l.fixo=true; });
  }
  const porItem=itens.map(i=>({itemId:i.id,esp:i.especialidade||'',tipo:i.tipo||'',uPag:i.unidadePag||'hora',uFat:i.unidadeFat||'hora',
    empresaFat:i.empresaFat||principal,empresaPag:i.empresaPag||'',
    contratado:num(i.qtdMes),plan:0,real:0,apur:0,qPag:0,qFat:0,totPag:0,totFat:0,medicos:0}));
  const pi=Object.fromEntries(porItem.map(p=>[p.itemId,p]));
  for(const l of linhas){ const p=pi[l.itemId]; if(!p) continue; p.plan+=l.plan;p.real+=l.real;p.apur+=l.apur;p.qPag+=l.qPag;p.qFat+=l.qFat;p.totPag+=l.totPag;p.totFat+=l.totFat;p.medicos++; }
  porItem.forEach(p=>{['plan','real','apur','qPag','qFat'].forEach(f=>p[f]=r4(p[f])); p.totPag=r2(p.totPag); p.totFat=r2(p.totFat);});
  const tot=linhas.reduce((t,l)=>{t.plan+=l.plan;t.real+=l.real;t.apur+=l.apur;t.totPag+=l.totPag;t.totFat+=l.totFat;t.qFat+=l.qFat;t.qPag+=l.qPag;return t;},{plan:0,real:0,apur:0,totPag:0,totFat:0,qFat:0,qPag:0});
  Object.keys(tot).forEach(k=>tot[k]= /tot/.test(k)? r2(tot[k]) : r4(tot[k]));
  tot.margem=r2(tot.totFat-tot.totPag); tot.pctPag= tot.totFat? tot.totPag/tot.totFat : null;
  tot.conferidos=linhas.filter(l=>l.conferido).length; tot.linhas=linhas.length;
  return {tabela:{id:tabV.id||'',nome:tabV.nome||'',vigencia:tabV.vigencia||'',basePag,baseFat,valorFixoMensal:fixo}, linhas, porItem, totais:tot, naoMapeados:Object.entries(naoMap).map(([s,n])=>({s,n}))};
}

function mmYY(comp){ const [y,m]=String(comp).split('-'); return {mm:m, yy:String(y).slice(2), y, m}; }
function ultimoDiaMesSeguinte(comp){ const {y,m}=mmYY(comp); const d=new Date(Date.UTC(+y, +m+1, 0)); return d.toISOString().slice(0,10); }
function numeroDocumento(ct,comp){ const {mm,yy}=mmYY(comp); return String(ct.numero||'').replace(/\D/g,'')+mm+yy; }
function codReduzido(ct,comp){ const {mm,yy}=mmYY(comp); return String(ct.sigla||'')+mm+yy; }

const RETENCOES_PADRAO={pis:0.65,cofins:3,csll:1,ir:1.5};
const IMPOSTOS_FAT=[['ISS','impISS'],['PIS','impPIS'],['COFINS','impCOFINS'],['CSLL','impCSLL'],['IR','impIR']];
/** Alíquotas (%) de impostos do contrato sobre o faturamento bruto. */
function aliqDe(o){ const r={}; IMPOSTOS_FAT.forEach(([n,k])=>r[k]=num(o&&o[k])); return r; }
function aliquotasContrato(ct){ return aliqDe(ct); }
/** Alíquotas por empresa de faturamento do contrato (fotografadas na aprovação). */
function fiscalContrato(ct){ const empresas={}; (ct&&ct.empresasFat||[]).forEach(e=>{ if(e&&e.sigla) empresas[e.sigla]=aliqDe(e); }); return {padrao:aliqDe(ct), empresas, principal:empresaPrincipal(ct)}; }
/** Alíquotas para uma empresa (aceita também o formato antigo, só com as alíquotas do contrato). */
function aliqPara(fiscal, sig){ if(!fiscal) return {}; if(!fiscal.empresas) return fiscal; return fiscal.empresas[sig]||fiscal.empresas[fiscal.principal]||fiscal.padrao||{}; }
/** Impostos sobre o faturamento bruto e faturamento líquido (FAT − IMPOSTOS). */
function impostosFat(bruto, aliq){
  const A=aliq||{};
  const itens=IMPOSTOS_FAT.map(([n,k])=>({nome:n,pct:num(A[k]),valor:r2(bruto*num(A[k])/100)}));
  const total=r2(itens.reduce((s,i)=>s+i.valor,0));
  return {bruto:r2(bruto),itens,total,liquido:r2(bruto-total),pct:itens.reduce((s,i)=>s+i.pct,0)};
}
/** Impostos do fechamento somando cada empresa de faturamento com suas alíquotas. */
function impostosCalc(calc, fiscal){
  const g={}; for(const p of ((calc&&calc.porItem)||[])){ const sg=p.empresaFat||''; g[sg]=(g[sg]||0)+num(p.totFat); }
  const porEmpresa=Object.entries(g).filter(([sg,v])=>v).map(([sg,v])=>({empresa:sg,...impostosFat(v,aliqPara(fiscal,sg))}));
  const bruto=r2(porEmpresa.reduce((t,e)=>t+e.bruto,0));
  const itens=IMPOSTOS_FAT.map(([n,k],ix)=>{ const valor=r2(porEmpresa.reduce((t,e)=>t+e.itens[ix].valor,0)); return {nome:n,valor,pct: bruto? r4(valor/bruto*100) : num(aliqPara(fiscal,'')[k])}; });
  const total=r2(itens.reduce((t,i)=>t+i.valor,0));
  return {bruto,itens,total,liquido:r2(bruto-total),pct:r4(itens.reduce((t,i)=>t+i.pct,0)),porEmpresa};
}
/** Retenções federais da NF de PJ não optante do Simples (PIS, COFINS, CSLL, IR) sobre o valor bruto. */
function retencoesNF(bruto, taxas){
  const T=Object.assign({},RETENCOES_PADRAO,taxas||{});
  const itens=[['PIS','pis'],['COFINS','cofins'],['CSLL','csll'],['IR','ir']].map(([n,k])=>({nome:n,pct:num(T[k]),valor:r2(bruto*num(T[k])/100)}));
  const total=r2(itens.reduce((s,i)=>s+i.valor,0));
  return {base:r2(bruto),itens,total,liquido:r2(bruto-total)};
}
/** Vínculo do médico que vale para a linha: o 2º vínculo quando a especialidade/tipo da linha está marcada nele; senão o 1º. */
function vinculoDaLinha(m, ct, itemId){
  const v2=m&&m.vinculo2;
  if(v2&&v2.tipo&&Array.isArray(v2.itens)&&v2.itens.includes(itemId))
    return {slot:2,tipo:String(v2.tipo).toUpperCase(),empresaPagadora:v2.empresaPagadora||'',cpfConta:v2.cpfConta||(m.cpfConta||m.cpf||''),empresaPJ:v2.empresaPJ||'',simples:v2.simples||''};
  return {slot:1,tipo:String((m&&m.vinculo)||(ct&&ct.vinculoPadrao)||'SOCIO').toUpperCase(),empresaPagadora:(m&&m.empresaPagadora)||'',cpfConta:(m&&(m.cpfConta||m.cpf))||'',empresaPJ:(m&&m.empresaPJ)||'',simples:(m&&m.simples)||''};
}
/** Vínculos que vão para a folha do ERP: só Sócio, PJ e RPA (o contrato pode restringir ainda mais). */
function vinculosNaFolha(ct){
  const c=Array.isArray(ct&&ct.vinculosFolha)&&ct.vinculosFolha.length? ct.vinculosFolha.map(v=>String(v).toUpperCase()) : FOLHA_VINC;
  const r=c.filter(v=>FOLHA_VINC.includes(v)); return r.length? r : FOLHA_VINC.slice();
}
/**
 * Monta a folha de pagamento a partir das linhas aprovadas: uma linha por médico, vínculo e empresa pagadora.
 * params.manual = ajustes da folha {add:{id:{...}}, edit:{rowId:{...}}, del:{rowId:{...}}} (todos com justificativa).
 * Retorna {rows (vão ao ERP), tot, fora:{rows,tot} (vínculos fora da folha), removidas, ajuste (efeito dos ajustes manuais no total)}.
 */
function calcFolha(calc, ct, medReg, params, config){
  const emp=(config&&config.empresas)||[]; const nat=Object.assign({},NATUREZAS_PADRAO,(config&&config.naturezas)||{});
  const P=params||{}; const pn=P.pn||{}, ret=P.ret||{}; const A=P.manual||{}; const adds=A.add||{}, edits=A.edit||{}, dels=A.del||{};
  // empresa pagadora: item do contrato > vínculo do médico > contrato
  const by={};
  for(const l of calc.linhas){
    const m=(medReg&&medReg[l.k])||{}; const V=vinculoDaLinha(m,ct,l.itemId);
    const empresa=String(l.empresaPag||V.empresaPagadora||ct.empresa||'').trim();
    const gk=l.k+'@'+V.slot+'@'+normTxt(empresa);
    const f=by[gk]||(by[gk]={k:l.k,V,empresa,nome:l.nome,crm:l.crm,horas:0,total:0});
    f.horas+= l.uPag==='hora'? l.qPag : l.apur; f.total+=l.totPag;
  }
  let grupos=Object.values(by).filter(f=>f.total!==0||f.horas!==0);
  const nK={}; grupos.forEach(f=>nK[f.k]=(nK[f.k]||0)+1);
  grupos.forEach(f=>{ f.id= nK[f.k]>1? f.k+'@'+(f.V.slot===2?'v2_':'')+(safeKey(f.empresa)||'sem_empresa') : f.k; });
  // ajustes manuais (exclusões, alterações e inclusões)
  let ajuste=0; const removidas=[];
  grupos=grupos.filter(f=>{ const d=dels[f.id]; if(d){ removidas.push({id:f.id,k:f.k,nome:f.nome,crm:f.crm,empresa:f.empresa,vinculo:f.V.tipo,total:r2(f.total),horas:r4(f.horas),just:d.just||'',por:d.por||'',em:d.em||''}); ajuste-=f.total; return false; } return true; });
  grupos.forEach(f=>{ const e=edits[f.id]; if(!e) return; const t0=f.total; f.orig={total:r2(f.total),horas:r4(f.horas),vinculo:f.V.tipo,empresa:f.empresa};
    if(e.total!=null&&e.total!=='') f.total=num(e.total); if(e.horas!=null&&e.horas!=='') f.horas=num(e.horas);
    if(e.vinculo) f.V={...f.V,tipo:String(e.vinculo).toUpperCase()}; if(e.empresa) f.empresa=String(e.empresa).trim(); if(e.cpfConta) f.V={...f.V,cpfConta:e.cpfConta};
    f.edit=e; ajuste+=f.total-t0; });
  Object.entries(adds).forEach(([id,a])=>{ if(!a) return;
    const g={id,k:crmKey(a.crm)||('MAN_'+id),manual:a,nome:a.nome||'',crm:a.crm||'',empresa:String(a.empresa||ct.empresa||'').trim(),horas:num(a.horas),total:num(a.total),
      V:{slot:1,tipo:String(a.vinculo||'RPA').toUpperCase(),cpfConta:a.cpfConta||'',empresaPJ:a.empresaPJ||'',simples:a.simples||''}};
    grupos.push(g); ajuste+=g.total; });
  const hK={}, maior={};
  grupos.forEach(f=>{ hK[f.k]=(hK[f.k]||0)+f.horas; if(!maior[f.k]||f.total>maior[f.k].total) maior[f.k]=f; });
  const taxaV=ct.taxaSocio==null?150:num(ct.taxaSocio), taxaMin=ct.taxaSocioMinHoras==null?24:num(ct.taxaSocioMinHoras), alerta=ct.alertaValor==null?20000:num(ct.alertaValor);
  const permit=vinculosNaFolha(ct);
  const todas=grupos.map(f=>{
    const m=(f.manual? null : (medReg&&medReg[f.k]))||{}; const V=f.V; const vinc=V.tipo;
    const total=r2(f.total), vpn=r2(num(pn[f.id])), aReceber=r2(total-vpn);
    const simples=String(V.simples||m.simples||'').toUpperCase()==='SIM';
    const retAuto= vinc==='PJ' && !simples && aReceber>0 ? retencoesNF(aReceber,config&&config.retencoes) : null;
    const retManual= ret[f.id]!=null && ret[f.id]!=='';
    const vret= retManual? r2(num(ret[f.id])) : (retAuto? retAuto.total : 0);
    // taxa de sócio: uma vez por médico (na linha de maior valor), pelas horas totais do médico
    const taxa= vinc==='SOCIO' && maior[f.k]===f && hK[f.k]>taxaMin && aReceber>0 ? taxaV : 0;
    const liq=r2(aReceber-vret-taxa);
    const empresa=f.empresa;
    const e=emp.find(x=>normTxt(x.sigla)===normTxt(empresa))||emp.find(x=>normTxt(x.razao)===normTxt(empresa));
    const tipoPag=TIPO_PAG[vinc]||'Honorários';
    return {id:f.id,k:f.k,slot:V.slot,manual:!!f.manual,editado:!!f.edit,orig:f.orig||null,just:((f.manual||f.edit||{}).just)||'',
      crm:f.manual? crmDigits(crmKey(f.crm))||f.crm : crmDigits(f.k),crmFull:f.crm,nome:f.nome,horas:r4(f.horas),total,pn:vpn,aReceber,ret:vret,retManual,retAuto,simples,taxa,liq,vinculo:vinc,
      empresa, codEmpresa: e? e.cod : (ct.codEmpresaPagadora||''), razaoEmpresa: e? e.razao : empresa, cpfConta: V.cpfConta||m.cpfConta||m.cpf||'', multiEmpresa:nK[f.k]>1,
      empresaPJ:V.empresaPJ||m.empresaPJ||'', formalizacao:m.formalizacao||'', obs:m.observacoes||'', email:m.email||'', contato:m.contato||'',
      tipoPag, natureza: nat[tipoPag]||'', alertas:[], foraFolha:!permit.includes(vinc)};
  }).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')||a.empresa.localeCompare(b.empresa,'pt-BR'));
  const rows=todas.filter(r=>!r.foraFolha), fora=todas.filter(r=>r.foraFolha);
  const cpfs={}; rows.forEach(r=>{ if(r.cpfConta){ (cpfs[r.cpfConta]=cpfs[r.cpfConta]||new Set()).add(r.k); } });
  rows.forEach(r=>{
    if(r.liq>alerta) r.alertas.push({t:'Acima de '+alerta.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}),c:'warn'});
    if(r.cpfConta&&cpfs[r.cpfConta].size>1) r.alertas.push({t:'CPF/CNPJ duplicado',c:'bad'});
    if(!r.cpfConta) r.alertas.push({t:'Sem CPF/CNPJ da conta',c:'bad'});
    if(!r.codEmpresa) r.alertas.push({t:'Empresa pagadora sem código',c:'bad'});
    if(r.liq<0) r.alertas.push({t:'Líquido negativo',c:'bad'});
  });
  const somar=lst=>{ const t=lst.reduce((t,r)=>{t.horas+=r.horas;t.total+=r.total;t.pn+=r.pn;t.aReceber+=r.aReceber;t.ret+=r.ret;t.taxa+=r.taxa;t.liq+=r.liq;return t;},{horas:0,total:0,pn:0,aReceber:0,ret:0,taxa:0,liq:0});
    Object.keys(t).forEach(k=>t[k]=k==='horas'?r4(t[k]):r2(t[k])); return t; };
  return {rows, tot:somar(rows), fora:{rows:fora,tot:somar(fora)}, removidas, ajuste:r2(ajuste)};
}

function brl(n){return (n==null||isNaN(n))?'—':Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function qtdTxt(n){ return Number.isInteger(+n)? String(+n) : Number(n).toLocaleString('pt-BR',{maximumFractionDigits:2}); }
function periodoTxt(comp){ const {y,m}=mmYY(comp); const fim=new Date(Date.UTC(+y,+m,0)).getUTCDate(); return '01/'+m+'/'+y+' A '+String(fim).padStart(2,'0')+'/'+m+'/'+y; }

/** Preenche o modelo de descrição da NF com os números do fechamento. */
function descricaoNF(tpl, calc, comp, ct, periodo, extra){
  const itens=calc.porItem.filter(p=>p.qFat>0||p.totFat>0);
  const unid=itens.length? (UNIDADES[itens[0].uFat]||'').toUpperCase() : 'HORA';
  const unidPl = unid==='HORA'?'HORAS':unid==='PLANTÃO'?'PLANTÕES':unid==='CONSULTA'?'CONSULTAS':'PROCEDIMENTOS';
  const vu=[...new Set(itens.map(p=>p.qFat?r2(p.totFat/p.qFat):0))];
  const ctx={
    ESPECIALIDADES:[...new Set(itens.map(p=>p.esp.toUpperCase()))].join(', '),
    PERIODO: periodo? String(periodo).toUpperCase().replace(/\s+A\s+/,' A ') : periodoTxt(comp), COMPETENCIA:mmYY(comp).m+'/'+mmYY(comp).y,
    QTD_TOTAL:qtdTxt(r4(itens.reduce((s,p)=>s+p.qFat,0))), UNIDADE:unidPl,
    VALOR_UNITARIO: vu.length===1? brl(vu[0]).replace(/\s/g,'') : 'CONFORME ITENS',
    VALOR_TOTAL: brl(r2(itens.reduce((s,p)=>s+p.totFat,0))).replace(/ /g,' '),
    CONTRATO:(ct.numero||'')+(ct.ano||''),
    ITENS: itens.map(p=>'- '+p.esp.toUpperCase()+' / '+p.tipo.toUpperCase()+': '+qtdTxt(p.qFat)+' '+(UNIDADES[p.uFat]||'').toUpperCase()+' x '+brl(p.qFat?p.totFat/p.qFat:0)+' = '+brl(p.totFat)).join('\n')
  };
  Object.assign(ctx, extra||{});
  if(ctx.VINCULOS==null) ctx.VINCULOS='';
  return String(tpl||'REFERENTE A PRESTAÇÃO DE SERVIÇOS MÉDICOS ({ESPECIALIDADES}) - PERÍODO {PERIODO}\n{ITENS}\nVALOR TOTAL {VALOR_TOTAL}').replace(/\{([A-Z_]+)\}/g,(m,k)=>ctx[k]!=null?ctx[k]:m);
}

export {UNIDADES, VINCULOS, TIPO_PAG, NATUREZAS_PADRAO, normTxt, num, r2, r4, crmKey, crmDigits, safeKey, cellStr, parsePega, periodoMeses, compDoPeriodo, setorKey, agregar, sugerirItem, baseQtd, tabelasDoContrato, tabelaVigente, itensVigentes, itensUniao, diffValores, calcular, mmYY, ultimoDiaMesSeguinte, numeroDocumento, codReduzido, calcFolha, IMPOSTOS_FAT, aliquotasContrato, impostosFat, retencoesNF, RETENCOES_PADRAO, brl, qtdTxt, periodoTxt, descricaoNF, classeDia, cobreClasse, rotuloSetor, separaSetor, BASES_ESCALA, BASES_FAT, VINC_NF, VINC_FOLHA, fimMes, normVig, refData, datasPeriodo, refFech, inicioFech, diffTabela, empresaPrincipal, aliqDe, fiscalContrato, aliqPara, impostosCalc, FOLHA_VINC, vinculoDaLinha, vinculosNaFolha};
