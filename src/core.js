/* Regras de cálculo do fechamento (sem DOM). */
const UNIDADES = {hora:'Hora', plantao:'Plantão', consulta:'Consulta', procedimento:'Procedimento'};
const VINCULOS = ['SOCIO','RPA','PJ','PRO-LABORE'];
const TIPO_PAG = {'SOCIO':'Honorários','RPA':'RPA','PJ':'PJ','PRO-LABORE':'Pró-Labore'};
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
    totApur:col('Total (Tolerância)'),sit:col('Situação')};
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
      sit:cellStr(g(r,'sit')), ini:cellStr(g(r,'ini')), fim:cellStr(g(r,'fim'))});
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
  const base={}, meds={}, setores={};
  for(const r of rows){
    const sk=setorKey(r); setores[sk]=(setores[sk]||0)+1;
    const key=r.k+'||'+sk;
    const b=base[key]||(base[key]={k:r.k,s:sk,n:0,na:0,plan:0,real:0,apur:0,vApur:0});
    b.n++; if(r.apur>0) b.na++; b.plan+=r.plan; b.real+=r.real; b.apur+=r.apur; b.vApur+= r.totApur || (r.apur*r.vh) || 0;
    const m=meds[r.k]||(meds[r.k]={nome:r.nome,crm:r.crm,cpf:'',email:''});
    if(!m.cpf&&r.cpf) m.cpf=r.cpf; if(!m.email&&r.email) m.email=r.email;
  }
  const arr=Object.values(base).map(b=>({...b,plan:r4(b.plan),real:r4(b.real),apur:r4(b.apur),vApur:r2(b.vApur)}));
  return {base:arr, medicos:meds, setores};
}

/** Sugere o item do contrato para um setor do Pega Plantão. */
function sugerirItem(sk, itens){
  const setor=normTxt(sk.includes(' | ')? sk.split(' | ').slice(1).join(' | ') : sk);
  let hit=itens.find(i=>normTxt(i.especialidade+' - '+i.tipo)===setor) || itens.find(i=>i.tipo&&normTxt(i.tipo)===setor);
  if(hit) return hit.id;
  const cand=itens.filter(i=>i.especialidade && setor.startsWith(normTxt(i.especialidade)) && i.tipo && setor.includes(normTxt(i.tipo)));
  return cand.length===1? cand[0].id : '';
}
function baseQtd(unid,g){ return unid==='hora'? g.apur : unid==='plantao'? g.na : 0; }

/* ---------- tabelas de valores do contrato (original, reajustes, aditivos) ---------- */
/** Tabelas do contrato. Contratos sem tabelas: uma tabela original com os itens atuais. */
function tabelasDoContrato(ct){
  if(ct&&Array.isArray(ct.tabelas)&&ct.tabelas.length) return ct.tabelas;
  return [{id:'t_original',nome:'Tabela original do contrato',tipo:'original',vigencia:String((ct&&ct.vigIni)||'').slice(0,7),itens:(ct&&ct.itens)||[]}];
}
/** Tabela vigente na competência AAAA-MM: a de vigência mais recente que não seja posterior à competência. Sem competência: a mais recente. */
function tabelaVigente(ct, comp){
  const ts=tabelasDoContrato(ct).slice().sort((a,b)=>String(a.vigencia||'').localeCompare(String(b.vigencia||'')));
  let t=ts[0]; for(const x of ts){ if(!x.vigencia||!comp||x.vigencia<=comp) t=x; }
  return t||{id:'',nome:'',vigencia:'',itens:[]};
}
function itensVigentes(ct, comp){ return tabelaVigente(ct,comp).itens||[]; }
/** Todos os itens já usados em qualquer tabela (para vínculos de setor e valores diferenciados). */
function itensUniao(ct){
  const m=new Map();
  tabelasDoContrato(ct).slice().sort((a,b)=>String(a.vigencia||'').localeCompare(String(b.vigencia||''))).forEach(t=>(t.itens||[]).forEach(i=>m.set(i.id,i)));
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
  }
  for(const id of Object.keys(A)) if(!B[id]&&(num(A[id].valorFaturar)||num(A[id].valorPagar))) out.push({item:lab(A[id]),campo:'item removido',de:null,para:null,texto:'removido'});
  return out;
}

/** Calcula as linhas do fechamento (médico x item) aplicando cadastro, valores diferenciados e ajustes da conferência. */
function calcular(fech, contrato){
  if(fech.congelado&&fech.congelado.calc) return fech.congelado.calc;
  // valores da tabela vigente na competência do fechamento (original, reajuste ou aditivo)
  const tabV=contrato? tabelaVigente(contrato, fech.competencia) : {itens:[]};
  const itens=tabV.itens||[];
  const itMap=Object.fromEntries(itens.map(i=>[i.id,i]));
  const map=Object.fromEntries((contrato&&contrato.mapeamento||[]).map(m=>[m.s,m.item]));
  const dif={}; for(const d of (contrato&&contrato.diferenciados||[])) if(d.crm&&d.item) dif[crmDigits(crmKey(d.crm))+'|'+d.item]=num(d.valorPagar);
  const meds=fech.medicos||{}; const aj=fech.ajustes||{}; const conf=fech.conferidos||{}; const exc=fech.excluidos||{};
  // meta escolhida no fechamento (mínima/mediana/máxima): usa os valores da meta; sem valor na meta, usa o valor padrão do item
  const meta=fech.meta||'';
  const mv=(item,f)=>{ const m=meta&&item.metas&&item.metas[meta]; const v=m?num(m[f]):0; return v||num(item[f]); };
  const groups={}; const naoMap={};
  for(const b of (fech.base||[])){
    const it=map[b.s];
    if(it==='__ignorar') continue;
    if(!it||!itMap[it]){ naoMap[b.s]=(naoMap[b.s]||0)+b.n; continue; }
    const key=b.k+'|'+it;
    const g=groups[key]||(groups[key]={key,k:b.k,item:it,n:0,na:0,plan:0,real:0,apur:0,vApur:0});
    g.n+=b.n; g.na+=b.na; g.plan+=b.plan; g.real+=b.real; g.apur+=b.apur; g.vApur+=b.vApur;
  }
  const linhas=Object.values(groups).filter(g=>!exc[g.key]).map(g=>{
    const item=itMap[g.item]; const a=aj[g.key]||{};
    const qPagBase=r4(baseQtd(item.unidadePag||'hora',g)), qFatBase=r4(baseQtd(item.unidadeFat||'hora',g));
    const qPag= a.qPag!=null? num(a.qPag) : qPagBase;
    const qFat= a.qFat!=null? num(a.qFat) : qFatBase;
    const d=dif[crmDigits(g.k)+'|'+g.item];
    // Valor a pagar: valor diferenciado do médico > contrato. O valor/hora do Pega Plantão (PP) entra
    // quando a fonte do item é "Pega Plantão" ou o contrato não tem valor — e só se o relatório trouxer valor.
    const vCont = d!=null? d : mv(item,'valorPagar');
    const vPP = g.apur>0 && g.vApur>0 ? g.vApur/g.apur : 0;
    const pagPP = d==null && vPP>0 && (item.fontePag==='pega' || !vCont);
    let vPag = pagPP? vPP : vCont;
    const totPag = pagPP && a.qPag==null ? r2(g.vApur) : r2(qPag*vPag);
    const vFat=mv(item,'valorFaturar'); const totFat=r2(qFat*vFat);
    const m=meds[g.k]||{};
    return {key:g.key,k:g.k,nome:m.nome||g.k,crm:m.crm||g.k,itemId:g.item,esp:item.especialidade||'',tipo:item.tipo||'',
      uPag:item.unidadePag||'hora',uFat:item.unidadeFat||'hora',n:g.n,na:g.na,plan:r4(g.plan),real:r4(g.real),apur:r4(g.apur),
      qPagBase,qFatBase,qPag:r4(qPag),qFat:r4(qFat),vPag:r4(vPag),vFat,totPag,totFat,difer:d!=null,pagPP,
      ajustado:a.qPag!=null||a.qFat!=null, just:a.just||'', conferido:!!conf[g.key]};
  }).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')||a.esp.localeCompare(b.esp,'pt-BR'));
  const porItem=itens.map(i=>({itemId:i.id,esp:i.especialidade||'',tipo:i.tipo||'',uPag:i.unidadePag||'hora',uFat:i.unidadeFat||'hora',
    contratado:num(i.qtdMes),plan:0,real:0,apur:0,qPag:0,qFat:0,totPag:0,totFat:0,medicos:0}));
  const pi=Object.fromEntries(porItem.map(p=>[p.itemId,p]));
  for(const l of linhas){ const p=pi[l.itemId]; if(!p) continue; p.plan+=l.plan;p.real+=l.real;p.apur+=l.apur;p.qPag+=l.qPag;p.qFat+=l.qFat;p.totPag+=l.totPag;p.totFat+=l.totFat;p.medicos++; }
  porItem.forEach(p=>{['plan','real','apur','qPag','qFat'].forEach(f=>p[f]=r4(p[f])); p.totPag=r2(p.totPag); p.totFat=r2(p.totFat);});
  const tot=linhas.reduce((t,l)=>{t.plan+=l.plan;t.real+=l.real;t.apur+=l.apur;t.totPag+=l.totPag;t.totFat+=l.totFat;t.qFat+=l.qFat;t.qPag+=l.qPag;return t;},{plan:0,real:0,apur:0,totPag:0,totFat:0,qFat:0,qPag:0});
  Object.keys(tot).forEach(k=>tot[k]= /tot/.test(k)? r2(tot[k]) : r4(tot[k]));
  tot.margem=r2(tot.totFat-tot.totPag); tot.pctPag= tot.totFat? tot.totPag/tot.totFat : null;
  tot.conferidos=linhas.filter(l=>l.conferido).length; tot.linhas=linhas.length;
  return {tabela:{id:tabV.id||'',nome:tabV.nome||'',vigencia:tabV.vigencia||''}, linhas, porItem, totais:tot, naoMapeados:Object.entries(naoMap).map(([s,n])=>({s,n}))};
}

function mmYY(comp){ const [y,m]=String(comp).split('-'); return {mm:m, yy:String(y).slice(2), y, m}; }
function ultimoDiaMesSeguinte(comp){ const {y,m}=mmYY(comp); const d=new Date(Date.UTC(+y, +m+1, 0)); return d.toISOString().slice(0,10); }
function numeroDocumento(ct,comp){ const {mm,yy}=mmYY(comp); return String(ct.numero||'').replace(/\D/g,'')+mm+yy; }
function codReduzido(ct,comp){ const {mm,yy}=mmYY(comp); return String(ct.sigla||'')+mm+yy; }

const RETENCOES_PADRAO={pis:0.65,cofins:3,csll:1,ir:1.5};
const IMPOSTOS_FAT=[['ISS','impISS'],['PIS','impPIS'],['COFINS','impCOFINS'],['CSLL','impCSLL'],['IR','impIR']];
/** Alíquotas (%) de impostos do contrato sobre o faturamento bruto. */
function aliquotasContrato(ct){ const o={}; IMPOSTOS_FAT.forEach(([n,k])=>o[k]=num(ct&&ct[k])); return o; }
/** Impostos sobre o faturamento bruto e faturamento líquido (FAT − IMPOSTOS). */
function impostosFat(bruto, aliq){
  const A=aliq||{};
  const itens=IMPOSTOS_FAT.map(([n,k])=>({nome:n,pct:num(A[k]),valor:r2(bruto*num(A[k])/100)}));
  const total=r2(itens.reduce((s,i)=>s+i.valor,0));
  return {bruto:r2(bruto),itens,total,liquido:r2(bruto-total),pct:itens.reduce((s,i)=>s+i.pct,0)};
}
/** Retenções federais da NF de PJ não optante do Simples (PIS, COFINS, CSLL, IR) sobre o valor bruto. */
function retencoesNF(bruto, taxas){
  const T=Object.assign({},RETENCOES_PADRAO,taxas||{});
  const itens=[['PIS','pis'],['COFINS','cofins'],['CSLL','csll'],['IR','ir']].map(([n,k])=>({nome:n,pct:num(T[k]),valor:r2(bruto*num(T[k])/100)}));
  const total=r2(itens.reduce((s,i)=>s+i.valor,0));
  return {base:r2(bruto),itens,total,liquido:r2(bruto-total)};
}
/** Monta a folha de pagamento por médico a partir das linhas aprovadas. */
function calcFolha(calc, ct, medReg, params, config){
  const emp=(config&&config.empresas)||[]; const nat=Object.assign({},NATUREZAS_PADRAO,(config&&config.naturezas)||{});
  const by={};
  for(const l of calc.linhas){ const f=by[l.k]||(by[l.k]={k:l.k,nome:l.nome,crm:l.crm,horas:0,total:0}); f.horas+= l.uPag==='hora'? l.qPag : l.apur; f.total+=l.totPag; }
  const P=params||{}; const pn=P.pn||{}, ret=P.ret||{};
  const taxaV=ct.taxaSocio==null?150:num(ct.taxaSocio), taxaMin=ct.taxaSocioMinHoras==null?24:num(ct.taxaSocioMinHoras), alerta=ct.alertaValor==null?20000:num(ct.alertaValor);
  const rows=Object.values(by).filter(f=>f.total!==0||f.horas!==0).map(f=>{
    const m=(medReg&&medReg[f.k])||{};
    const vinc=String(m.vinculo||ct.vinculoPadrao||'SOCIO').toUpperCase();
    const total=r2(f.total), vpn=r2(num(pn[f.k])), aReceber=r2(total-vpn);
    const simples=String(m.simples||'').toUpperCase()==='SIM';
    const retAuto= vinc==='PJ' && !simples && aReceber>0 ? retencoesNF(aReceber,config&&config.retencoes) : null;
    const retManual= ret[f.k]!=null && ret[f.k]!=='';
    const vret= retManual? r2(num(ret[f.k])) : (retAuto? retAuto.total : 0);
    const taxa= vinc==='SOCIO' && f.horas>taxaMin && aReceber>0 ? taxaV : 0;
    const liq=r2(aReceber-vret-taxa);
    const empresa=(m.empresaPagadora||ct.empresa||'').trim();
    const e=emp.find(x=>normTxt(x.sigla)===normTxt(empresa))||emp.find(x=>normTxt(x.razao)===normTxt(empresa));
    const tipoPag=TIPO_PAG[vinc]||'Honorários';
    return {k:f.k,crm:crmDigits(f.k),crmFull:f.crm,nome:f.nome,horas:r4(f.horas),total,pn:vpn,aReceber,ret:vret,retManual,retAuto,simples,taxa,liq,vinculo:vinc,
      empresa, codEmpresa: e? e.cod : (ct.codEmpresaPagadora||''), razaoEmpresa: e? e.razao : empresa, cpfConta: m.cpfConta||m.cpf||'',
      empresaPJ:m.empresaPJ||'', formalizacao:m.formalizacao||'', obs:m.observacoes||'', email:m.email||'', contato:m.contato||'',
      tipoPag, natureza: nat[tipoPag]||'', alertas:[]};
  }).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  const cpfs={}; rows.forEach(r=>{ if(r.cpfConta){ cpfs[r.cpfConta]=(cpfs[r.cpfConta]||0)+1; } });
  rows.forEach(r=>{
    if(r.liq>alerta) r.alertas.push({t:'Acima de '+alerta.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}),c:'warn'});
    if(r.cpfConta&&cpfs[r.cpfConta]>1) r.alertas.push({t:'CPF/CNPJ duplicado',c:'bad'});
    if(!r.cpfConta) r.alertas.push({t:'Sem CPF/CNPJ da conta',c:'bad'});
    if(!r.codEmpresa) r.alertas.push({t:'Empresa pagadora sem código',c:'bad'});
    if(r.liq<0) r.alertas.push({t:'Líquido negativo',c:'bad'});
  });
  const tot=rows.reduce((t,r)=>{t.horas+=r.horas;t.total+=r.total;t.pn+=r.pn;t.aReceber+=r.aReceber;t.ret+=r.ret;t.taxa+=r.taxa;t.liq+=r.liq;return t;},{horas:0,total:0,pn:0,aReceber:0,ret:0,taxa:0,liq:0});
  Object.keys(tot).forEach(k=>tot[k]=k==='horas'?r4(tot[k]):r2(tot[k]));
  return {rows, tot};
}

function brl(n){return (n==null||isNaN(n))?'—':Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function qtdTxt(n){ return Number.isInteger(+n)? String(+n) : Number(n).toLocaleString('pt-BR',{maximumFractionDigits:2}); }
function periodoTxt(comp){ const {y,m}=mmYY(comp); const fim=new Date(Date.UTC(+y,+m,0)).getUTCDate(); return '01/'+m+'/'+y+' A '+String(fim).padStart(2,'0')+'/'+m+'/'+y; }

/** Preenche o modelo de descrição da NF com os números do fechamento. */
function descricaoNF(tpl, calc, comp, ct, periodo){
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
  return String(tpl||'REFERENTE A PRESTAÇÃO DE SERVIÇOS MÉDICOS ({ESPECIALIDADES}) - PERÍODO {PERIODO}\n{ITENS}\nVALOR TOTAL {VALOR_TOTAL}').replace(/\{([A-Z_]+)\}/g,(m,k)=>ctx[k]!=null?ctx[k]:m);
}

export {UNIDADES, VINCULOS, TIPO_PAG, NATUREZAS_PADRAO, normTxt, num, r2, r4, crmKey, crmDigits, safeKey, cellStr, parsePega, periodoMeses, compDoPeriodo, setorKey, agregar, sugerirItem, baseQtd, tabelasDoContrato, tabelaVigente, itensVigentes, itensUniao, diffValores, calcular, mmYY, ultimoDiaMesSeguinte, numeroDocumento, codReduzido, calcFolha, IMPOSTOS_FAT, aliquotasContrato, impostosFat, retencoesNF, RETENCOES_PADRAO, brl, qtdTxt, periodoTxt, descricaoNF};
