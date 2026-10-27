import {UNIDADES, VINCULOS, TIPO_PAG, NATUREZAS_PADRAO, normTxt, num, r2, r4, crmKey, crmDigits, safeKey, cellStr, parsePega, periodoMeses, compDoPeriodo, setorKey, agregar, sugerirItem, baseQtd, calcular, mmYY, ultimoDiaMesSeguinte, numeroDocumento, codReduzido, calcFolha, brl, qtdTxt, periodoTxt, descricaoNF} from './core.js';

/* ============================================================
   APP
   ============================================================ */
const PERMS=[
  ['dashboard','Ver dashboard gerencial'],['fechamentos','Ver fechamentos'],['importar','Importar relatório Pega Plantão'],
  ['conferir','Conferir e ajustar quantidades'],['aprovar','Aprovar ou devolver fechamento'],['emitir_nf','Emitir pedido de NF'],
  ['gerar_folha','Gerar folha de pagamento'],['observacoes','Registrar observações'],['contratos','Cadastrar contratos'],
  ['medicos','Cadastrar médicos'],['reabrir','Reabrir fechamento aprovado'],['excluir','Excluir fechamentos e linhas de médico'],['admin','Administrar usuários e parâmetros']];
const ALL=Object.fromEntries(PERMS.map(p=>[p[0],true]));
const PERFIS={
  admin:{label:'Administrador',perms:ALL},
  faturamento:{label:'Faturamento',perms:{dashboard:1,fechamentos:1,importar:1,conferir:1,emitir_nf:1,observacoes:1,contratos:1,medicos:1,excluir:1}},
  aprovador:{label:'Aprovador',perms:{dashboard:1,fechamentos:1,aprovar:1,observacoes:1}},
  folha:{label:'Folha / Financeiro',perms:{dashboard:1,fechamentos:1,gerar_folha:1,medicos:1,observacoes:1}},
  consulta:{label:'Consulta',perms:{dashboard:1,fechamentos:1}}
};
const STATUS={conferencia:['Em conferência','p-info'],aguardando:['Aguardando aprovação','p-warn'],aprovado:['Aprovado · travado','p-acc'],concluido:['Concluído','p-ok']};
const MESES=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

const S={boot:'loading',db:null,U:null,DL:null,me:null,owner:false,uid:null,
  contratos:null,auditoria:[],fechs:null,fechsRaw:null,cong:{},folhas:{},usuarios:[],config:null,medicos:{},prof:{},
  v:'dash',fid:null,tab:'conf',modal:null,toast:null,draft:null,
  dash:{ct:'',comp:'',andamento:false},conf:{modo:'medico',q:'',open:{}},medCt:'',medQ:'',shifts:{},userHits:[],busy:false,obsDraft:{},devolver:''};

const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fN=(n,d=2)=>(n==null||isNaN(n))?'—':Number(n).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const fH=n=>(n==null||isNaN(n))?'—':Number(n).toLocaleString('pt-BR',{maximumFractionDigits:2});
const dec=v=>(v==null||v==='')?'':String(v).replace('.',',');
const fPct=n=>(n==null||isNaN(n)||!isFinite(n))?'—':(n*100).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
const fDT=iso=>{ if(!iso) return '—'; const d=new Date(iso); return d.toLocaleDateString('pt-BR')+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); };
const fD=iso=>{ if(!iso) return '—'; const [y,m,d]=String(iso).slice(0,10).split('-'); return d+'/'+m+'/'+y; };
const compTxt=c=>{ if(!c) return '—'; const [y,m]=c.split('-'); return MESES[+m-1]+'/'+y; };
function fDur(ms){ if(ms==null||ms<0) return '—'; const m=Math.round(ms/60000); const d=Math.floor(m/1440), h=Math.floor((m%1440)/60), mi=m%60; return (d? d+'d ':'')+(d||h? h+'h ':'')+mi+'min'; }
const nowISO=()=>new Date().toISOString();
const uidGen=p=>(p||'')+Math.random().toString(36).slice(2,9);
const ICON={
  dash:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  fech:'<path d="M7 3h10l4 4v14H3V3h4"/><path d="M7 12h10M7 16h7M7 8h4"/>',
  ct:'<path d="M5 3h10l4 4v14H5z"/><path d="M15 3v4h4M8 12h8M8 16h8"/>',
  med:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  admin:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'
};
const ico=n=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+ICON[n]+'</svg>';

/* ---------- permissões ---------- */
function meuUsuario(){ return S.uid? S.usuarios.find(u=>u.id===S.uid) : null; }
function can(p){ if(S.owner) return true; const u=meuUsuario(); return !!(u&&u.ativo!==false&&u.perms&&u.perms[p]); }
function temAcesso(){ return S.owner || !!(meuUsuario()&&meuUsuario().ativo!==false); }
function nomeDe(id){ if(!id) return 'Sistema'; if(id===S.uid) return (S.me&&S.me.name)||'Você'; return (S.prof[id]&&S.prof[id].name)||'Usuário'; }
let profPend=false;
async function resolverPerfis(){
  if(!S.U||profPend) return;
  const ids=new Set(S.usuarios.map(u=>u.id));
  (S.auditoria||[]).forEach(a=>a.por&&ids.add(a.por));
  (S.fechs||[]).forEach(f=>{(f.eventos||[]).forEach(e=>e.por&&ids.add(e.por)); ((f.obs&&f.obs.historico)||[]).forEach(e=>e.por&&ids.add(e.por));});
  const falta=[...ids].filter(i=>!S.prof[i]); if(!falta.length) return;
  profPend=true; try{ const ps=await S.U.profiles([...ids]); S.prof=ps; }catch(e){} profPend=false; render();
}

/* ---------- escrita serializada por documento ---------- */
const Q={};
function wr(path,fn){ const p=(Q[path]||Promise.resolve()).then(fn); Q[path]=p.catch(()=>{}); p.catch(e=>{console.error(e); toast(errMsg(e),'bad');}); return p; }
function errMsg(e){ const c=e&&e.code; if(c==='invalid_argument') return 'Não foi possível salvar: sua permissão neste painel não permite alterar dados, ou o registro ficou grande demais.'; if(c==='quota_exceeded') return 'Limite de armazenamento atingido. Exclua fechamentos antigos de teste.'; if(c==='resource_exhausted') return 'Muitas gravações seguidas. Aguarde alguns segundos e tente de novo.'; return (e&&e.message)||'Erro ao salvar.'; }
const fechRef=id=>S.db.doc('fechamentos/'+id);
function updFech(id,patch){ return wr('fechamentos/'+id,()=>fechRef(id).update(patch)); }
function evento(f,tipo,texto){ const ev=(f.eventos||[]).slice(-299); ev.push({tipo,texto,por:S.uid,em:nowISO()}); return ev; }

let toastT;
function toast(msg,kind){ S.toast={msg,kind}; render(); clearTimeout(toastT); toastT=setTimeout(()=>{S.toast=null;render();},4200); }

/* ---------- boot ---------- */
async function boot(){
  render();
  if(!window.__platform||!window.__platform.use){ S.boot='offline'; render(); return; }
  const [db,U,DL]=await Promise.all(['db','user','downloads'].map(n=>window.__platform.use(n).catch(()=>null)));
  S.db=db; S.U=U; S.DL=DL;
  if(!db){ S.boot='nodb'; render(); return; }
  if(U){ try{ S.me=await U.me(); S.owner=!!S.me.isOwner; S.uid=S.me.id; }catch(e){} }
  const onErr=e=>{ console.error(e); if(e&&e.code==='revoked'){S.boot='nodb';render();} };
  db.collection('contratos').onSnapshot(s=>{S.contratos=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.sigla||'').localeCompare(b.sigla||'')); render();},onErr);
  db.collection('fechamentos').onSnapshot(s=>{S.fechsRaw=s.docs.map(d=>({id:d.id,...d.data()})); montarFechs(); render(); resolverPerfis();},onErr);
  db.collection('congelados').onSnapshot(s=>{S.cong={}; s.docs.forEach(d=>S.cong[d.id]=d.data()); montarFechs(); render();},onErr);
  db.collection('folhas').onSnapshot(s=>{S.folhas={}; s.docs.forEach(d=>S.folhas[d.id]=d.data()); montarFechs(); render();},onErr);
  db.collection('usuarios').onSnapshot(s=>{S.usuarios=s.docs.map(d=>({id:d.id,...d.data()})); render(); resolverPerfis();},onErr);
  db.collection('auditoria').onSnapshot(s=>{S.auditoria=s.docs.map(d=>({id:d.id,...d.data()})).sort((x,y)=>(y.em||'').localeCompare(x.em||'')); render(); resolverPerfis();},onErr);
  db.collection('medicos').onSnapshot(s=>{const m={}; s.docs.forEach(d=>m[d.id]=(d.data().lista)||{}); S.medicos=m; render();},onErr);
  db.doc('config/geral').onSnapshot(s=>{S.config=s.exists?s.data():{}; render();},onErr);
  try{ if(location.hash){ const h=location.hash.slice(1); if(['dash','fech','ct','med','admin'].includes(h)) S.v=h; } }catch(e){}
  S.boot='ok'; render();
}

/* Resumo congelado e folha ficam em documentos próprios (limite de tamanho por documento). */
function montarFechs(){
  if(!S.fechsRaw) return;
  S.fechs=S.fechsRaw.map(f=>{
    const g={...f};
    g.congelado = f.aprovadoEm && S.cong[f.id] && S.cong[f.id].em===f.aprovadoEm ? S.cong[f.id] : null;
    g.folha = f.folhaInfo ? Object.assign({rows:null}, (S.folhas[f.id]&&S.folhas[f.id].geradaEm===f.folhaInfo.geradaEm)? S.folhas[f.id] : {}, f.folhaInfo) : null;
    return g; });
}

/* ---------- render ---------- */
let charts=[];
// evita redesenhar a tela dentro de outro redesenho (ex.: campo perde o foco durante a troca)
let renderizando=false, renderPendente=false;
function render(){
  if(renderizando){ renderPendente=true; return; }
  renderizando=true;
  try{ renderAgora(); } finally { renderizando=false; }
  if(renderPendente){ renderPendente=false; render(); }
}
function renderAgora(){
  const app=$('#app');
  const a=document.activeElement; let keep=null;
  if(a&&a.id&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA')&&a.type!=='file'&&a.type!=='checkbox'){ keep={id:a.id,val:a.value,s:a.selectionStart,e:a.selectionEnd}; }
  const scrolls={}; document.querySelectorAll('[data-keep]').forEach(el=>scrolls[el.dataset.keep]=el.scrollLeft);
  app.innerHTML=viewApp();
  document.querySelectorAll('[data-keep]').forEach(el=>{ if(scrolls[el.dataset.keep]) el.scrollLeft=scrolls[el.dataset.keep]; });
  if(keep){ const el=document.getElementById(keep.id); if(el){ el.value=keep.val; el.focus(); try{el.setSelectionRange(keep.s,keep.e);}catch(e){} } }
  if(S.v==='dash'&&S.boot==='ok') drawCharts();
}

function viewApp(){
  const nav=[['dash','Dashboard','dashboard'],['fech','Fechamentos','fechamentos'],['ct','Contratos','contratos'],['med','Médicos','medicos'],['admin','Administração','admin']];
  const vis=S.boot==='ok'&&temAcesso()? nav.filter(n=>n[0]==='ct'||n[0]==='med'? (can(n[2])||can('fechamentos')) : can(n[2])) : [];
  const curNav = S.v==='fechDet'?'fech': S.v==='ctEd'?'ct': S.v;
  const me=S.me;
  return '<div class="app"><aside class="side"><div class="brand"><b>Faturamento Médico</b><span>Fechamento mensal</span></div>'+
    '<nav class="nav">'+vis.map(n=>'<button data-act="nav" data-v="'+n[0]+'" aria-current="'+(curNav===n[0])+'">'+ico(n[0])+'<span>'+n[1]+'</span></button>').join('')+'</nav>'+
    (me? '<div class="who"><img src="'+esc(me.avatarUrl)+'" alt=""><div><b>'+esc(me.name||'Você')+'</b><small>'+esc(S.owner?'Administrador geral':(PERFIS[(meuUsuario()||{}).perfil]||{}).label||'Sem perfil')+'</small></div>'+'</div>'+(window.__logout?'<div class="who-acts">'+(window.__trocarSenha?'<button class="btn sm ghost" data-act="trocarSenha">Trocar senha</button>':'')+'<button class="btn sm ghost" data-act="logout">Sair</button></div>':''):'')+
    '</aside><main class="main">'+viewMain()+'</main></div>'+
    (S.modal? '<div class="overlay" data-act="ovl"><div class="modal" role="dialog" aria-modal="true">'+viewModal()+'</div></div>':'')+
    (S.toast? '<div class="toast '+(S.toast.kind||'')+'" role="status">'+esc(S.toast.msg)+'</div>':'');
}

function emptyState(t,p,extra){ return '<div class="card"><div class="empty"><h2>'+t+'</h2><p>'+p+'</p>'+(extra||'')+'</div></div>'; }

function viewMain(){
  if(S.boot==='loading') return emptyState('Carregando','Conectando à base de contratos e fechamentos…');
  if(S.boot==='offline') return emptyState('Sistema não configurado','Configure as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY e publique novamente.');
  if(S.boot==='nodb') return emptyState('Base de dados indisponível','Não foi possível conectar ao banco. Verifique sua conexão e tente novamente.');
  if(S.contratos===null||S.fechs===null) return emptyState('Carregando','Lendo contratos e fechamentos…');
  if(!temAcesso()) return emptyState('Seu acesso ainda não foi liberado','Peça a um administrador para incluir você em Administração › Usuários. Ele vai encontrar seu nome ou e-mail na busca'+(S.me&&S.me.name?' (<b>'+esc(S.me.name)+'</b>)':'')+'.');
  switch(S.v){
    case 'fech': return can('fechamentos')? viewFechs() : semPerm();
    case 'fechDet': return can('fechamentos')? viewFech() : semPerm();
    case 'ct': return viewContratos();
    case 'ctEd': return viewContratoEd();
    case 'med': return viewMedicos();
    case 'admin': return can('admin')? viewAdmin() : semPerm();
    default: return can('dashboard')? viewDash() : (can('fechamentos')? viewFechs() : semPerm());
  }
}
const semPerm=()=>emptyState('Sem permissão para esta tela','Seu perfil não inclui esta função. Fale com um administrador.');
const ctById=id=>(S.contratos||[]).find(c=>c.id===id);
const fechById=id=>(S.fechs||[]).find(f=>f.id===id);
function statusDe(f){ return (f.penf&&f.penf.emitidaEm&&f.folha&&f.folha.geradaEm)?'concluido':(f.status||'conferencia'); }
function pill(st){ const s=STATUS[st]||STATUS.conferencia; return '<span class="pill '+s[1]+'">'+s[0]+'</span>'; }
function tempoFech(f){ const t=f.t||{}; if(!t.inicio) return null; const nf=f.penf&&f.penf.emitidaEm, fo=f.folha&&f.folha.geradaEm; if(nf&&fo) return {ms:new Date(nf>fo?nf:fo)-new Date(t.inicio),fim:true}; return {ms:Date.now()-new Date(t.inicio),fim:false}; }
function lock(f){ return ['aprovado','concluido'].includes(statusDe(f)); }

/* ================= DASHBOARD ================= */
function dashData(){
  const d=S.dash; const fs=(S.fechs||[]).filter(f=>(!d.ct||f.contratoId===d.ct)&&(!d.comp||f.competencia===d.comp)&&(d.andamento||lock(f)));
  const multi=new Set(fs.map(f=>f.contratoId)).size>1;
  const rows={}; const tot={fat:0,pag:0,plan:0,real:0,apur:0,contr:0}; const porComp={};
  for(const f of fs){
    const ct=ctById(f.contratoId); if(!ct) continue;
    const c=calcular(f,ct);
    for(const p of c.porItem){
      const key=f.contratoId+'|'+p.itemId;
      const r=rows[key]||(rows[key]={label:(multi?(ct.sigla||'')+' · ':'')+p.esp+' — '+p.tipo,sigla:ct.sigla,esp:p.esp,tipo:p.tipo,contr:0,plan:0,real:0,apur:0,fat:0,pag:0});
      r.contr+=p.contratado; r.plan+=p.plan; r.real+=p.real; r.apur+=p.apur; r.fat+=p.totFat; r.pag+=p.totPag;
    }
    tot.fat+=c.totais.totFat; tot.pag+=c.totais.totPag; tot.plan+=c.totais.plan; tot.real+=c.totais.real; tot.apur+=c.totais.apur;
    tot.contr+=c.porItem.reduce((s,p)=>s+p.contratado,0);
    const pc=porComp[f.competencia]||(porComp[f.competencia]={fat:0,pag:0}); pc.fat+=c.totais.totFat; pc.pag+=c.totais.totPag;
  }
  const lista=Object.values(rows).filter(r=>r.fat||r.pag||r.plan||r.apur||r.contr).sort((a,b)=>b.fat-a.fat||b.pag-a.pag);
  // saldo remanescente: valor global - faturamento aprovado acumulado até a competência
  const cts=d.ct? [ctById(d.ct)].filter(Boolean) : [...new Set(fs.map(f=>f.contratoId))].map(ctById).filter(Boolean);
  let saldo=0, global=0, hSaldo=0, hGlobal=0;
  for(const ct of cts){ const vg=num(ct.valorGlobal); const hg=num(ct.qtdGlobal);
    if(!vg&&!hg) continue;
    let fat=0,q=0; (S.fechs||[]).filter(f=>f.contratoId===ct.id&&lock(f)&&(!d.comp||f.competencia<=d.comp)).forEach(f=>{const c=calcular(f,ct); fat+=c.totais.totFat; q+=c.totais.qFat;});
    if(vg){global+=vg; saldo+=vg-fat;} if(hg){hGlobal+=hg; hSaldo+=hg-q;} }
  const tempos=fs.map(f=>tempoFech(f)).filter(t=>t&&t.fim).map(t=>t.ms);
  return {fs,lista,tot,porComp,saldo,global,hSaldo,hGlobal,tempos,multi};
}
function viewDash(){
  const d=S.dash; const D=dashData(); S._dash=D;
  const comps=[...new Set((S.fechs||[]).filter(f=>!d.ct||f.contratoId===d.ct).map(f=>f.competencia))].sort().reverse();
  const pct=D.tot.fat? D.tot.pag/D.tot.fat : null;
  const tempoTxt = D.fs.length===1 ? (()=>{const t=tempoFech(D.fs[0]); return t? fDur(t.ms)+(t.fim?'':' (em andamento)') : '—';})() :
    D.tempos.length? fDur(D.tempos.reduce((a,b)=>a+b,0)/D.tempos.length) : '—';
  const tempoSub = D.fs.length===1? 'Do início até NF e folha emitidas' : D.tempos.length? 'Média de '+D.tempos.length+' fechamento(s) concluído(s)' : 'Nenhum fechamento concluído no filtro';
  const head='<div class="head"><div><div class="eyebrow">Visão gerencial</div><h1>Dashboard</h1><p>'+(d.andamento?'Inclui fechamentos em andamento (prévia).':'Somente fechamentos aprovados e travados.')+'</p></div>'+
    '<div class="row"><label class="f">Contrato<select id="dCt" data-chg="dash" data-f="ct"><option value="">Todos os contratos</option>'+(S.contratos||[]).map(c=>'<option value="'+c.id+'"'+(c.id===d.ct?' selected':'')+'>'+esc(c.sigla+' — '+c.nome)+'</option>').join('')+'</select></label>'+
    '<label class="f">Competência<select id="dComp" data-chg="dash" data-f="comp"><option value="">Todas</option>'+comps.map(c=>'<option value="'+c+'"'+(c===d.comp?' selected':'')+'>'+compTxt(c)+'</option>').join('')+'</select></label>'+
    '<label class="f chk"><input type="checkbox" id="dAnd" data-chg="dash" data-f="andamento"'+(d.andamento?' checked':'')+'> Incluir em andamento</label></div></div>';
  if(!D.fs.length) return head+emptyState('Nenhum fechamento neste filtro', d.andamento? 'Importe o relatório do Pega Plantão em Fechamentos para começar.' : 'Os números aparecem aqui quando um fechamento é aprovado. Marque “Incluir em andamento” para ver a prévia.', can('importar')?'<button class="btn pri" data-act="nav" data-v="fech">Ir para Fechamentos</button>':'');
  const kpis='<div class="kpis">'+
    '<div class="kpi fat"><span class="eyebrow">Faturamento total</span><span class="v">'+brl(D.tot.fat)+'</span><span class="s">'+D.fs.length+' fechamento(s)</span></div>'+
    '<div class="kpi pag"><span class="eyebrow">Pagamento total</span><span class="v">'+brl(D.tot.pag)+'</span><span class="s">Repasse aos médicos</span></div>'+
    '<div class="kpi"><span class="eyebrow">% pagamento / faturamento</span><span class="v">'+fPct(pct)+'</span><span class="s">Margem operacional '+brl(D.tot.fat-D.tot.pag)+'</span></div>'+
    '<div class="kpi"><span class="eyebrow">Saldo remanescente</span><span class="v">'+(D.global?brl(D.saldo):'—')+'</span><span class="s">'+(D.global?'de '+brl(D.global)+' do valor global'+(D.hGlobal?' · '+fH(D.hSaldo)+' h de '+fH(D.hGlobal):''):'Cadastre o valor global no contrato')+'</span></div>'+
    '<div class="kpi"><span class="eyebrow">Horas (plan. / real. / apur.)</span><span class="v">'+fH(D.tot.apur)+' h</span><span class="s">'+fH(D.tot.plan)+' planejadas · '+fH(D.tot.real)+' realizadas</span></div>'+
    '<div class="kpi"><span class="eyebrow">Tempo de fechamento</span><span class="v">'+tempoTxt+'</span><span class="s">'+tempoSub+'</span></div></div>';
  const h1=Math.max(160,D.lista.length*34+50);
  const charts='<div class="grid g2"><div class="card"><h3>Faturamento × pagamento por especialidade e tipo/local</h3><div class="leg"><span><i class="sw" style="background:var(--accent)"></i>Faturamento</span><span><i class="sw" style="background:var(--pay)"></i>Pagamento</span></div><div class="chart" style="height:'+h1+'px"><canvas id="cFat" role="img" aria-label="Faturamento e pagamento por especialidade e tipo"></canvas></div></div>'+
    '<div class="card"><h3>Horas planejadas, realizadas e apuradas</h3><div class="leg"><span><i class="sw" style="background:var(--plan)"></i>Planejadas</span><span><i class="sw" style="background:var(--real)"></i>Realizadas</span><span><i class="sw" style="background:var(--accent)"></i>Apuradas</span></div><div class="chart" style="height:'+h1+'px"><canvas id="cHor" role="img" aria-label="Horas por especialidade e tipo"></canvas></div></div></div>';
  const trend=Object.keys(D.porComp).length>1? '<div class="card"><h3>Evolução por competência</h3><div class="leg"><span><i class="sw" style="background:var(--accent)"></i>Faturamento</span><span><i class="sw" style="background:var(--pay)"></i>Pagamento</span><span><i class="sw" style="background:var(--fg)"></i>% pagamento/faturamento</span></div><div class="chart" style="height:260px"><canvas id="cTr" role="img" aria-label="Evolução mensal"></canvas></div></div>':'';
  const tbl='<div class="card"><h3>Detalhe por especialidade e tipo/local</h3><div class="tbl" data-keep="dtbl"><table><thead><tr><th>Especialidade</th><th>Tipo / local</th><th class="n">Contratado</th><th class="n">Planejadas</th><th class="n">Realizadas</th><th class="n">Apuradas</th><th class="n">Faturamento</th><th class="n">Pagamento</th><th class="n">% pag/fat</th><th class="n">Margem</th></tr></thead><tbody>'+
    D.lista.map(r=>'<tr><td>'+esc((D.multi?r.sigla+' · ':'')+r.esp)+'</td><td>'+esc(r.tipo)+'</td><td class="n">'+fH(r.contr)+'</td><td class="n">'+fH(r.plan)+'</td><td class="n">'+fH(r.real)+'</td><td class="n">'+fH(r.apur)+'</td><td class="n">'+brl(r.fat)+'</td><td class="n">'+brl(r.pag)+'</td><td class="n">'+fPct(r.fat?r.pag/r.fat:null)+'</td><td class="n">'+brl(r.fat-r.pag)+'</td></tr>').join('')+
    '</tbody><tfoot><tr><td colspan="2">Total</td><td class="n">'+fH(D.tot.contr)+'</td><td class="n">'+fH(D.tot.plan)+'</td><td class="n">'+fH(D.tot.real)+'</td><td class="n">'+fH(D.tot.apur)+'</td><td class="n">'+brl(D.tot.fat)+'</td><td class="n">'+brl(D.tot.pag)+'</td><td class="n">'+fPct(pct)+'</td><td class="n">'+brl(D.tot.fat-D.tot.pag)+'</td></tr></tfoot></table></div></div>';
  const lst='<div class="card"><h3>Fechamentos no filtro</h3><div class="tbl"><table><thead><tr><th>Contrato</th><th>Competência</th><th>Status</th><th class="n">Faturamento</th><th class="n">Pagamento</th><th class="n">Tempo de fechamento</th></tr></thead><tbody>'+
    D.fs.sort((a,b)=>b.competencia.localeCompare(a.competencia)).map(f=>{const ct=ctById(f.contratoId)||{}; const c=calcular(f,ct); const t=tempoFech(f); return '<tr><td><button class="btn ghost sm" data-act="openFech" data-id="'+f.id+'">'+esc(ct.sigla||'?')+' — '+esc(ct.nome||'')+'</button></td><td>'+compTxt(f.competencia)+'</td><td>'+pill(statusDe(f))+'</td><td class="n">'+brl(c.totais.totFat)+'</td><td class="n">'+brl(c.totais.totPag)+'</td><td class="n">'+(t?fDur(t.ms)+(t.fim?'':' …'):'—')+'</td></tr>';}).join('')+'</tbody></table></div></div>';
  return head+kpis+charts+trend+tbl+lst;
}
function drawCharts(){
  charts.forEach(c=>c.destroy()); charts=[];
  if(!window.Chart||!S._dash) return;
  const cs=getComputedStyle(document.documentElement); const tk=n=>cs.getPropertyValue(n).trim();
  Chart.defaults.color=tk('--muted'); Chart.defaults.borderColor=tk('--line'); Chart.defaults.font.family=tk('--f-body'); Chart.defaults.animation=false;
  const D=S._dash; const labels=D.lista.map(r=>r.label.length>40?r.label.slice(0,39)+'…':r.label);
  const money=v=>'R$ '+Number(v).toLocaleString('pt-BR',{notation:'compact',maximumFractionDigits:1});
  const base={responsive:true,maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{grid:{color:tk('--line')},ticks:{}},y:{grid:{display:false},ticks:{autoSkip:false,font:{size:11}}}}};
  const el1=$('#cFat'); if(el1) charts.push(new Chart(el1,{type:'bar',data:{labels,datasets:[
    {label:'Faturamento',data:D.lista.map(r=>r.fat),backgroundColor:tk('--accent'),borderRadius:3,barPercentage:.85,categoryPercentage:.75},
    {label:'Pagamento',data:D.lista.map(r=>r.pag),backgroundColor:tk('--pay'),borderRadius:3,barPercentage:.85,categoryPercentage:.75}]},
    options:{...base,scales:{...base.scales,x:{...base.scales.x,ticks:{callback:money}}},plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.dataset.label+': '+brl(c.raw)}}}}}));
  const el2=$('#cHor'); if(el2) charts.push(new Chart(el2,{type:'bar',data:{labels,datasets:[
    {label:'Planejadas',data:D.lista.map(r=>r.plan),backgroundColor:tk('--plan'),borderRadius:3,barPercentage:.9,categoryPercentage:.8},
    {label:'Realizadas',data:D.lista.map(r=>r.real),backgroundColor:tk('--real'),borderRadius:3,barPercentage:.9,categoryPercentage:.8},
    {label:'Apuradas',data:D.lista.map(r=>r.apur),backgroundColor:tk('--accent'),borderRadius:3,barPercentage:.9,categoryPercentage:.8}]},
    options:{...base,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.dataset.label+': '+fH(c.raw)+' h'}}}}}));
  const el3=$('#cTr'); if(el3){ const ks=Object.keys(D.porComp).sort(); charts.push(new Chart(el3,{data:{labels:ks.map(compTxt),datasets:[
    {type:'bar',label:'Faturamento',data:ks.map(k=>D.porComp[k].fat),backgroundColor:tk('--accent'),borderRadius:3,yAxisID:'y'},
    {type:'bar',label:'Pagamento',data:ks.map(k=>D.porComp[k].pag),backgroundColor:tk('--pay'),borderRadius:3,yAxisID:'y'},
    {type:'line',label:'% pag/fat',data:ks.map(k=>D.porComp[k].fat?D.porComp[k].pag/D.porComp[k].fat*100:null),borderColor:tk('--fg'),backgroundColor:tk('--fg'),pointRadius:3,yAxisID:'y1'}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.dataset.yAxisID==='y1'?c.dataset.label+': '+fN(c.raw,1)+'%':c.dataset.label+': '+brl(c.raw)}}},
      scales:{y:{ticks:{callback:money},grid:{color:tk('--line')}},y1:{position:'right',grid:{display:false},ticks:{callback:v=>v+'%'}},x:{grid:{display:false}}}}})); }
}

/* ================= FECHAMENTOS ================= */
function viewFechs(){
  const fs=(S.fechs||[]).slice().sort((a,b)=>b.competencia.localeCompare(a.competencia)||(a.contratoId||'').localeCompare(b.contratoId||''));
  const head='<div class="head"><div><div class="eyebrow">Processo mensal</div><h1>Fechamentos</h1><p>Importe o relatório Financeiro do Pega Plantão, confira, aprove e emita NF e folha.</p></div>'+
    (can('importar')?'<button class="btn pri" data-act="novoFech">Importar relatório Pega Plantão</button>':'')+'</div>';
  if(!(S.contratos||[]).length) return head+emptyState('Cadastre um contrato primeiro','O fechamento usa os valores a pagar e a faturar de cada especialidade e tipo do contrato.',can('contratos')?'<button class="btn pri" data-act="novoCt">Cadastrar contrato</button>':'');
  if(!fs.length) return head+emptyState('Nenhum fechamento ainda','Clique em “Importar relatório Pega Plantão” e escolha o arquivo Financeiro exportado do Pega Plantão (.xlsx). O sistema calcula as horas apuradas e os valores por médico, especialidade e tipo.')+viewAuditoria();
  const del=can('excluir');
  return head+'<div class="tbl"><table><thead><tr>'+(del?'<th style="width:1%"><span class="sr">Excluir</span></th>':'')+'<th>Contrato</th><th>Competência</th><th>Status</th><th class="n">Horas apuradas</th><th class="n">Faturamento</th><th class="n">Pagamento</th><th class="n">Margem</th><th>Iniciado em</th><th class="n">Tempo</th></tr></thead><tbody>'+
    fs.map(f=>{const ct=ctById(f.contratoId)||{}; const c=calcular(f,ct); const t=tempoFech(f);
      return '<tr>'+(del?'<td><button class="btn ghost sm del" data-act="excluirFechLista" data-id="'+f.id+'" title="Excluir fechamento" aria-label="Excluir fechamento '+esc((ct.sigla||'')+' '+compTxt(f.competencia))+'"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6\"/></svg></button></td>':'')+'<td><button class="btn ghost sm" data-act="openFech" data-id="'+f.id+'"><b>'+esc(ct.sigla||'?')+'</b>&nbsp;'+esc(ct.nome||'Contrato removido')+'</button></td><td>'+compTxt(f.competencia)+'</td><td>'+pill(statusDe(f))+'</td><td class="n">'+fH(c.totais.apur)+'</td><td class="n">'+brl(c.totais.totFat)+'</td><td class="n">'+brl(c.totais.totPag)+'</td><td class="n">'+brl(c.totais.margem)+'</td><td>'+fDT(f.t&&f.t.inicio)+'</td><td class="n">'+(t?fDur(t.ms)+(t.fim?'':' …'):'—')+'</td></tr>';}).join('')+
    '</tbody></table></div>'+viewAuditoria();
}
function viewAuditoria(){
  const lista=(S.auditoria||[]).slice(0,100);
  if(!lista.length) return '';
  return '<div class="card"><h3>Registro de exclusões</h3><p class="muted" style="margin-top:0">Fechamentos excluídos, com quem excluiu, quando e o motivo. Este registro não pode ser apagado pelo sistema.</p><div class="tbl"><table><thead><tr><th>Data e hora</th><th>Usuário</th><th>Contrato</th><th>Competência</th><th>Status</th><th class="n">Faturamento</th><th class="n">Pagamento</th><th>Motivo</th></tr></thead><tbody>'+
    lista.map(a=>'<tr><td>'+fDT(a.em)+'</td><td>'+esc(nomeDe(a.por))+'</td><td>'+esc(a.contrato||'')+'</td><td>'+compTxt(a.competencia)+'</td><td>'+esc(a.status||'')+'</td><td class="n">'+brl(a.faturamento)+'</td><td class="n">'+brl(a.pagamento)+'</td><td style="white-space:normal;min-width:220px">'+esc(a.motivo||'')+'</td></tr>').join('')+'</tbody></table></div></div>';
}

function viewFech(){
  const f=fechById(S.fid); if(!f) return emptyState('Fechamento não encontrado','Ele pode ter sido removido.','<button class="btn" data-act="nav" data-v="fech">Voltar</button>');
  const ct=ctById(f.contratoId)||{itens:[]}; const c=calcular(f,ct); const st=statusDe(f); const t=tempoFech(f);
  const steps=[['Importação',f.t&&f.t.inicio,'Relatório '+(f.arquivo?esc(f.arquivo):'')],
    ['Conferência',f.t&&f.t.enviado,c.totais.conferidos+' de '+c.totais.linhas+' linhas conferidas'],
    ['Aprovação',f.t&&f.t.aprovado,f.t&&f.t.aprovado?'por '+esc(nomeDe(f.aprovadoPor)):'Trava o relatório'],
    ['Pedido de NF',f.penf&&f.penf.emitidaEm,f.penf&&f.penf.emitidaEm?fDT(f.penf.emitidaEm):'Após aprovação'],
    ['Folha ERP',f.folha&&f.folha.geradaEm,f.folha&&f.folha.geradaEm?fDT(f.folha.geradaEm):'Após aprovação']];
  const curIdx=steps.findIndex(s=>!s[1]);
  const stepper='<div class="steps">'+steps.map((s,i)=>'<div class="step '+(s[1]?'done':(i===curIdx?'cur':''))+'"><b>'+s[0]+'</b>'+(s[1]&&i<3?fDT(s[1])+'<br>':'')+'<span class="muted">'+s[2]+'</span></div>').join('')+'</div>';
  const head='<div class="head"><div><button class="btn ghost sm" data-act="nav" data-v="fech">← Fechamentos</button><div class="eyebrow" style="margin-top:6px">'+esc(ct.sigla||'')+' · Contrato '+esc((ct.numero||'')+(ct.ano||''))+'</div><h1>'+esc(ct.nome||'Contrato')+' — '+compTxt(f.competencia)+'</h1><p>'+pill(st)+' &nbsp;Tempo de fechamento: <b>'+(t?fDur(t.ms):'—')+'</b>'+(t&&!t.fim?' (em andamento)':'')+(f.periodo?' · Período do relatório: '+esc(f.periodo):'')+'</p></div>'+
    '<div class="row">'+(can('reabrir')&&lock(f)?'<button class="btn warn" data-act="reabrir">Reabrir</button>':'')+(can('excluir')?'<button class="btn bad" data-act="excluirFech">Excluir fechamento</button>':'')+'</div></div>';
  const tabs=[['conf','Conferência'],['resumo','Resumo faturamento e pagamento'],['nf','Pedido de NF'],['folha','Folha de pagamento'],['obs','Observações e log']];
  const tabBar='<div class="tabs" role="tablist">'+tabs.map(x=>'<button role="tab" data-act="tab" data-tab="'+x[0]+'" aria-selected="'+(S.tab===x[0])+'">'+x[1]+'</button>').join('')+'</div>';
  let body='';
  if(S.tab==='conf') body=tabConf(f,ct,c);
  else if(S.tab==='resumo') body=tabResumo(f,ct,c);
  else if(S.tab==='nf') body=tabNF(f,ct,c);
  else if(S.tab==='folha') body=tabFolha(f,ct,c);
  else body=tabObs(f);
  return head+stepper+tabBar+body;
}

function tabConf(f,ct,c){
  const L=lock(f), st=statusDe(f); const ed=!L&&can('conferir')&&st==='conferencia';
  let out='';
  if(f.devolucao&&st==='conferencia') out+='<div class="banner warn"><div><b>Devolvido para ajuste</b> por '+esc(nomeDe(f.devolucao.por))+' em '+fDT(f.devolucao.em)+': '+esc(f.devolucao.motivo)+'</div></div>';
  if(L) out+='<div class="banner ok"><div><b>Relatório travado.</b> Aprovado por '+esc(nomeDe(f.aprovadoPor))+' em '+fDT(f.t.aprovado)+'. As quantidades e valores abaixo estão congelados.</div></div>';
  if(c.naoMapeados.length){
    const itens=ct.itens||[];
    out+='<div class="card" style="border-color:var(--warn)"><h3>Setores do Pega Plantão sem vínculo com o contrato</h3><p class="muted">Escolha a especialidade e tipo do contrato para cada setor, ou marque “Não faturar”. O vínculo fica salvo no contrato para os próximos meses.</p><div class="tbl"><table><thead><tr><th>Local | Setor no Pega Plantão</th><th class="n">Plantões</th><th>Item do contrato</th></tr></thead><tbody>'+
      c.naoMapeados.map((m,i)=>'<tr><td>'+esc(m.s)+'</td><td class="n">'+m.n+'</td><td><select id="mp'+i+'" data-chg="mapFech" data-s="'+esc(m.s)+'"'+((can('conferir')||can('contratos'))&&!L?'':' disabled')+'><option value="">Escolha…</option>'+itens.map(it=>'<option value="'+it.id+'"'+(sugerirItem(m.s,itens)===it.id?' data-sug="1"':'')+'>'+esc(it.especialidade+' — '+it.tipo)+'</option>').join('')+'<option value="__ignorar">Não faturar (ignorar)</option></select></td></tr>').join('')+
      '</tbody></table></div>'+(itens.length?'':'<p class="muted">O contrato ainda não tem itens. Cadastre especialidades e tipos em Contratos.</p>')+'</div>';
  }
  if(!L){ const usados=new Set(c.linhas.map(l=>l.itemId)); const semV=(ct.itens||[]).filter(i=>usados.has(i.id)&&(!num(i.valorFaturar)||(!num(i.valorPagar)&&i.fontePag!=='pega')));
    if(semV.length) out+='<div class="banner warn"><div class="grow"><b>'+semV.length+' item(ns) do contrato sem valor cadastrado.</b> '+semV.slice(0,4).map(i=>esc(i.especialidade+' · '+i.tipo)+' ('+[!num(i.valorPagar)&&i.fontePag!=='pega'?'a pagar':'',!num(i.valorFaturar)?'a faturar':''].filter(Boolean).join(' e ')+')').join('; ')+(semV.length>4?' e mais '+(semV.length-4):'')+'. Sem valor a pagar, o sistema usa o valor/hora configurado no Pega Plantão (marcado PP).</div>'+(can('contratos')?'<button class="btn sm" data-act="editCt" data-id="'+esc(ct.id)+'">Abrir contrato</button>':'')+'</div>'; }
  const q=normTxt(S.conf.q);
  const linhas=c.linhas.filter(l=>!q||normTxt(l.nome+' '+l.crm+' '+l.esp+' '+l.tipo).includes(q));
  out+='<div class="row"><div class="tabs" style="border:0"><button data-act="confModo" data-m="medico" aria-selected="'+(S.conf.modo==='medico')+'">Por médico</button><button data-act="confModo" data-m="item" aria-selected="'+(S.conf.modo==='item')+'">Por especialidade e tipo</button></div><span class="grow"></span>'+
    (S.conf.modo==='medico'?'<input type="search" id="confQ" placeholder="Buscar médico, CRM ou especialidade" data-inp="confQ" style="max-width:300px">':'')+
    (ed&&can('importar')?'<label class="btn sm" for="fRe">Reimportar relatório</label><input type="file" id="fRe" accept=".xlsx,.xls" hidden data-chg="reimport">':'')+
    (ed?'<button class="btn sm" data-act="confTodos">Marcar todos como conferidos</button>':'')+'</div>';
  if(S.conf.modo==='item'){
    out+='<div class="tbl fix" data-keep="ti"><table><thead><tr><th>Especialidade</th><th>Tipo / local</th><th class="n">Médicos</th><th class="n">Contratado/mês</th><th class="n">Planejadas</th><th class="n">Realizadas</th><th class="n">Apuradas</th><th class="n">Qtd pagar</th><th class="n">Qtd faturar</th><th class="n">Pagamento</th><th class="n">Faturamento</th></tr></thead><tbody>'+
      c.porItem.map(p=>'<tr><td>'+esc(p.esp)+'</td><td>'+esc(p.tipo)+'</td><td class="n">'+p.medicos+'</td><td class="n">'+fH(p.contratado)+'</td><td class="n">'+fH(p.plan)+'</td><td class="n">'+fH(p.real)+'</td><td class="n">'+fH(p.apur)+'</td><td class="n">'+fH(p.qPag)+' <span class="muted">'+UNIDADES[p.uPag]+'</span></td><td class="n">'+fH(p.qFat)+' <span class="muted">'+UNIDADES[p.uFat]+'</span></td><td class="n">'+brl(p.totPag)+'</td><td class="n">'+brl(p.totFat)+'</td></tr>').join('')+
      '</tbody><tfoot><tr><td colspan="4">Total</td><td class="n">'+fH(c.totais.plan)+'</td><td class="n">'+fH(c.totais.real)+'</td><td class="n">'+fH(c.totais.apur)+'</td><td></td><td></td><td class="n">'+brl(c.totais.totPag)+'</td><td class="n">'+brl(c.totais.totFat)+'</td></tr></tfoot></table></div>';
  } else {
    out+='<p class="muted" style="margin:0">Quantidade base = horas apuradas (tolerância) do Pega Plantão para itens por hora; nº de plantões apurados para itens por plantão; consultas e procedimentos são informados aqui. Alterações exigem justificativa e ficam no log.</p>';
    const podeExcl=ed&&can('excluir');
    out+='<div class="tbl fix" data-keep="tm"><table><thead><tr><th></th><th>Médico</th><th>CRM</th><th>Especialidade · tipo</th><th class="n">Plant.</th><th class="n">Planejadas</th><th class="n">Realizadas</th><th class="n">Apuradas</th><th class="n">Qtd pagar</th><th class="n">Valor pagar</th><th class="n">Pagamento</th><th class="n">Qtd faturar</th><th class="n">Valor faturar</th><th class="n">Faturamento</th><th>Justificativa</th><th>Conferido</th></tr></thead><tbody>'+
      linhas.map((l,i)=>{ const id=safeKey(l.key);
        const row='<tr class="'+(l.ajustado?'adj':'')+'"><td style="white-space:nowrap">'+(podeExcl?'<button class="btn ghost sm del" data-act="excluirLinha" data-key="'+esc(l.key)+'" title="Excluir esta linha do fechamento" aria-label="Excluir linha de '+esc(l.nome)+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg></button>':'')+'<button class="btn ghost sm" data-act="expand" data-key="'+esc(l.key)+'" aria-label="Ver plantões">'+(S.conf.open[l.key]?'▾':'▸')+'</button></td><td>'+esc(l.nome)+'</td><td class="mono">'+esc(l.crm)+'</td><td>'+esc(l.esp)+' <span class="muted">· '+esc(l.tipo)+'</span></td><td class="n">'+l.n+'</td><td class="n">'+fH(l.plan)+'</td><td class="n">'+fH(l.real)+'</td><td class="n"><b>'+fH(l.apur)+'</b></td>'+
          '<td class="n">'+(ed?'<input type="text" inputmode="decimal" autocomplete="off" id="qp_'+id+'" value="'+dec(l.qPag)+'" data-chg="aj" data-key="'+esc(l.key)+'" data-f="qPag" data-base="'+l.qPagBase+'">':fH(l.qPag))+' <span class="muted">'+UNIDADES[l.uPag]+'</span></td>'+
          '<td class="n">'+brl(l.vPag)+(l.difer?' <span class="tag">dif.</span>':'')+(l.pagPP?' <span class="tag" title="Valor/hora configurado no Pega Plantão">PP</span>':'')+(!l.vPag?' <span class="tag bad">sem valor</span>':'')+'</td><td class="n">'+brl(l.totPag)+'</td>'+
          '<td class="n">'+(ed?'<input type="text" inputmode="decimal" autocomplete="off" id="qf_'+id+'" value="'+dec(l.qFat)+'" data-chg="aj" data-key="'+esc(l.key)+'" data-f="qFat" data-base="'+l.qFatBase+'">':fH(l.qFat))+' <span class="muted">'+UNIDADES[l.uFat]+'</span></td><td class="n">'+brl(l.vFat)+(!l.vFat?' <span class="tag bad">sem valor</span>':'')+'</td><td class="n">'+brl(l.totFat)+'</td>'+
          '<td>'+(ed&&l.ajustado?'<input type="text" id="js_'+id+'" value="'+esc(l.just)+'" placeholder="Motivo do ajuste" data-chg="ajJust" data-key="'+esc(l.key)+'">':esc(l.just))+(l.ajustado&&!l.just?' <span class="tag bad">sem justificativa</span>':'')+'</td>'+
          '<td><input type="checkbox" id="cf_'+id+'" data-chg="conf" data-key="'+esc(l.key)+'"'+(l.conferido?' checked':'')+(ed?'':' disabled')+' aria-label="Conferido"></td></tr>';
        return row+(S.conf.open[l.key]?shiftsRows(f,ct,l):'');
      }).join('')+
      '</tbody><tfoot><tr><td colspan="5">Total ('+linhas.length+' linhas)</td><td class="n">'+fH(c.totais.plan)+'</td><td class="n">'+fH(c.totais.real)+'</td><td class="n">'+fH(c.totais.apur)+'</td><td></td><td></td><td class="n">'+brl(c.totais.totPag)+'</td><td></td><td></td><td class="n">'+brl(c.totais.totFat)+'</td><td colspan="2"></td></tr></tfoot></table></div>';
    const exc=Object.entries(f.excluidos||{}).filter(([k,v])=>v);
    if(exc.length&&!lock(f)) out+='<div class="card"><h3>Linhas excluídas deste fechamento ('+exc.length+')</h3><div class="tbl"><table><thead><tr><th>Médico</th><th>Especialidade · tipo</th><th class="n">Apuradas</th><th class="n">Pagamento</th><th class="n">Faturamento</th><th>Excluída por</th><th>Motivo</th><th></th></tr></thead><tbody>'+
      exc.map(([k,v])=>'<tr><td>'+esc(v.nome||k)+'</td><td>'+esc((v.esp||'')+' · '+(v.tipo||''))+'</td><td class="n">'+fH(v.apur)+'</td><td class="n">'+brl(v.totPag)+'</td><td class="n">'+brl(v.totFat)+'</td><td>'+esc(nomeDe(v.por))+' · '+fDT(v.em)+'</td><td style="white-space:normal;min-width:200px">'+esc(v.motivo||'')+'</td><td>'+(podeExcl?'<button class="btn sm" data-act="restaurarLinha" data-key="'+esc(k)+'">Restaurar</button>':'')+'</td></tr>').join('')+'</tbody></table></div></div>';
  }
  // ações de fluxo
  const pend=c.totais.linhas-c.totais.conferidos; const semJust=c.linhas.filter(l=>l.ajustado&&!l.just).length;
  if(st==='conferencia'&&can('conferir')){
    const bloqueio = c.naoMapeados.length? 'Há setores sem vínculo com o contrato.' : pend? pend+' linha(s) ainda não conferida(s).' : semJust? semJust+' ajuste(s) sem justificativa.' : (ct.itens||[]).some(i=>!num(i.valorFaturar))? 'Há itens do contrato com valor a faturar zerado.' : '';
    out+='<div class="card row"><div class="grow"><b>Enviar para aprovação</b><div class="muted">'+(bloqueio?esc(bloqueio):'Tudo conferido. O aprovador recebe o relatório para travar.')+'</div></div><button class="btn pri" data-act="enviarAprov"'+(c.naoMapeados.length||pend||semJust?' disabled':'')+'>Enviar para aprovação</button></div>';
  }
  if(st==='aguardando'){
    out+='<div class="card"><div class="row"><div class="grow"><b>Aguardando aprovação</b><div class="muted">Enviado por '+esc(nomeDe(f.enviadoPor))+' em '+fDT(f.t.enviado)+'. Ao aprovar, o relatório é travado e o resumo de faturamento e pagamento é emitido.</div></div>'+
      (can('aprovar')?'<button class="btn pri" data-act="aprovar">Aprovar e travar</button>':'')+'</div>'+
      (can('aprovar')?'<div class="sep"></div><label class="f">Motivo da devolução<textarea id="devMot" data-inp="devolver" placeholder="Explique o que precisa ser corrigido">'+esc(S.devolver)+'</textarea></label><div class="row"><button class="btn warn" data-act="devolver">Devolver para conferência</button></div>':'')+'</div>';
  }
  return out;
}
function shiftsRows(f,ct,l){
  const all=S.shifts[f.id];
  if(!all) return '<tr class="sub"><td></td><td colspan="14">Carregando plantões…</td></tr>';
  const map=Object.fromEntries((ct.mapeamento||[]).map(m=>[m.s,m.item]));
  const rs=all.filter(r=>r[0]===l.k&&map[r[3]]===l.itemId);
  if(!rs.length) return '<tr class="sub"><td></td><td colspan="14">Sem plantões detalhados.</td></tr>';
  return rs.map(r=>'<tr class="sub"><td></td><td colspan="3">'+esc(r[1])+' · '+esc(r[2])+' · '+esc(r[8])+' → '+esc(r[9])+' <span class="muted">'+esc(r[3])+'</span></td><td class="n">'+esc(r[7])+'</td><td class="n">'+fH(r[4])+'</td><td class="n">'+fH(r[5])+'</td><td class="n">'+fH(r[6])+'</td><td colspan="7"></td></tr>').join('');
}

function tabResumo(f,ct,c){
  const L=lock(f);
  let out=L? '<div class="banner ok"><div><b>Resumo emitido na aprovação</b> em '+fDT(f.t.aprovado)+' por '+esc(nomeDe(f.aprovadoPor))+'.</div></div>' : '<div class="banner info"><div><b>Prévia.</b> Os valores podem mudar até a aprovação.</div></div>';
  const T=c.totais;
  out+='<div class="kpis"><div class="kpi fat"><span class="eyebrow">Faturamento</span><span class="v">'+brl(T.totFat)+'</span><span class="s">'+fH(T.qFat)+' unidades faturadas</span></div><div class="kpi pag"><span class="eyebrow">Pagamento</span><span class="v">'+brl(T.totPag)+'</span><span class="s">'+fH(T.qPag)+' unidades pagas</span></div><div class="kpi"><span class="eyebrow">Margem operacional</span><span class="v">'+brl(T.margem)+'</span><span class="s">'+fPct(T.totFat?T.margem/T.totFat:null)+' do faturamento</span></div><div class="kpi"><span class="eyebrow">% pagamento / faturamento</span><span class="v">'+fPct(T.pctPag)+'</span><span class="s">'+fH(T.apur)+' h apuradas de '+fH(T.plan)+' planejadas</span></div></div>';
  out+='<div class="card"><div class="row"><h3 class="grow">Por especialidade e tipo</h3><button class="btn sm" data-act="baixarResumo">Baixar resumo (.xlsx)</button></div><div class="tbl"><table><thead><tr><th>Especialidade</th><th>Tipo / local</th><th class="n">Contratado</th><th class="n">Planejadas</th><th class="n">Realizadas</th><th class="n">Apuradas</th><th class="n">Qtd faturada</th><th class="n">Faturamento</th><th class="n">Pagamento</th><th class="n">Margem</th><th class="n">Margem %</th></tr></thead><tbody>'+
    c.porItem.map(p=>'<tr><td>'+esc(p.esp)+'</td><td>'+esc(p.tipo)+'</td><td class="n">'+fH(p.contratado)+'</td><td class="n">'+fH(p.plan)+'</td><td class="n">'+fH(p.real)+'</td><td class="n">'+fH(p.apur)+'</td><td class="n">'+fH(p.qFat)+'</td><td class="n">'+brl(p.totFat)+'</td><td class="n">'+brl(p.totPag)+'</td><td class="n">'+brl(p.totFat-p.totPag)+'</td><td class="n">'+fPct(p.totFat?(p.totFat-p.totPag)/p.totFat:null)+'</td></tr>').join('')+
    '</tbody><tfoot><tr><td colspan="3">Total</td><td class="n">'+fH(T.plan)+'</td><td class="n">'+fH(T.real)+'</td><td class="n">'+fH(T.apur)+'</td><td class="n">'+fH(T.qFat)+'</td><td class="n">'+brl(T.totFat)+'</td><td class="n">'+brl(T.totPag)+'</td><td class="n">'+brl(T.margem)+'</td><td class="n">'+fPct(T.totFat?T.margem/T.totFat:null)+'</td></tr></tfoot></table></div></div>';
  const pm={}; c.linhas.forEach(l=>{const m=pm[l.k]||(pm[l.k]={nome:l.nome,crm:l.crm,esp:new Set(),plan:0,real:0,apur:0,pag:0,fat:0}); m.esp.add(l.esp+' · '+l.tipo); m.plan+=l.plan;m.real+=l.real;m.apur+=l.apur;m.pag+=l.totPag;m.fat+=l.totFat;});
  out+='<div class="card"><h3>Por médico</h3><div class="tbl fix"><table><thead><tr><th>Médico</th><th>CRM</th><th>Especialidade · tipo</th><th class="n">Planejadas</th><th class="n">Realizadas</th><th class="n">Apuradas</th><th class="n">Pagamento</th><th class="n">Faturamento</th></tr></thead><tbody>'+
    Object.values(pm).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')).map(m=>'<tr><td>'+esc(m.nome)+'</td><td class="mono">'+esc(m.crm)+'</td><td>'+esc([...m.esp].join('; '))+'</td><td class="n">'+fH(m.plan)+'</td><td class="n">'+fH(m.real)+'</td><td class="n">'+fH(m.apur)+'</td><td class="n">'+brl(m.pag)+'</td><td class="n">'+brl(m.fat)+'</td></tr>').join('')+'</tbody></table></div></div>';
  return out;
}

function penfDados(f,ct,c){
  const emp=(S.config&&S.config.empresas||[]).find(e=>normTxt(e.sigla)===normTxt(ct.empresa));
  const def={empresa:ct.empresa||'',data:nowISO().slice(0,10),tomador:ct.tomador||'',cnpj:ct.cnpj||'',endereco:ct.endereco||'',municipio:ct.municipio||'',
    descricao:descricaoNF(ct.descricaoNF,c,f.competencia,ct,f.periodo),empenho:ct.empenho||'Não possui',parceiro:ct.parceiro||'',empresas:ct.codEmpresaFat||(emp?emp.cod:''),
    cidadeISS:ct.cidadeISS||'',tipoOperacao:ct.tipoOperacao||'',centroResultado:ct.centroResultado||'',produtoServico:ct.produtoServico||'',
    quantidade:r4(c.porItem.reduce((s,p)=>s+p.qFat,0)),valor:c.totais.totFat};
  if(f.penf&&f.penf.emitidaEm) return f.penf;
  return Object.assign(def,(f.penfRasc||{}),{quantidade:def.quantidade,valor:def.valor});
}
function tabNF(f,ct,c){
  if(!lock(f)) return '<div class="banner info"><div><b>Disponível após a aprovação.</b> O pedido de NF usa os valores travados do fechamento.</div></div>';
  const P=penfDados(f,ct,c); const emit=!!(f.penf&&f.penf.emitidaEm); const ed=!emit&&can('emitir_nf');
  const fld=(k,l,cls,type)=>'<label class="f '+(cls||'')+'">'+l+(type==='ta'?'<textarea id="pn_'+k+'" data-chg="penf" data-f="'+k+'"'+(ed?'':' disabled')+' style="min-height:220px">'+esc(P[k])+'</textarea>':'<input type="'+(type||'text')+'" id="pn_'+k+'" value="'+esc(P[k])+'" data-chg="penf" data-f="'+k+'"'+(ed?'':' disabled')+'>')+'</label>';
  let out=emit? '<div class="banner ok"><div><b>Pedido de NF emitido</b> em '+fDT(f.penf.emitidaEm)+' por '+esc(nomeDe(f.penf.emitidaPor))+'.</div></div>' : '';
  out+='<div class="penf"><div class="doc"><h2>PEDIDO DE EMISSÃO DE NOTA FISCAL</h2>'+
    '<div class="ln"><span>Empresa</span><b>'+esc(P.empresa)+'</b><span style="margin-left:auto;min-width:0">Data</span><b>'+fD(P.data)+'</b></div>'+
    '<div class="ln"><span>Tomador</span>'+esc(P.tomador)+'</div><div class="ln"><span>CNPJ</span>'+esc(P.cnpj)+'</div><div class="ln"><span>Endereço</span>'+esc(P.endereco)+'</div><div class="ln"><span>Município</span>'+esc(P.municipio)+'</div>'+
    '<div class="eyebrow">Descrição dos serviços</div><div class="desc">'+esc(P.descricao)+'</div><div class="ln"><span>Empenho</span>'+esc(P.empenho)+'</div>'+
    '<div class="total"><span>VALOR TOTAL DA NOTA</span><span>'+brl(P.valor)+'</span></div></div>'+
    '<aside><div><span>Parceiro</span><b>'+esc(P.parceiro||'—')+'</b></div><div><span>Empresas</span><b>'+esc(P.empresas||'—')+'</b></div><div><span>Cidade ISS</span><b>'+esc(P.cidadeISS||'—')+'</b></div><div><span>Tipo operação</span><b>'+esc(P.tipoOperacao||'—')+'</b></div><div><span>Centro de resultado</span><b>'+esc(P.centroResultado||'—')+'</b></div><div><span>Produto / serviço</span><b>'+esc(P.produtoServico||'—')+'</b></div><div><span>Quantidade</span><b>'+qtdTxt(P.quantidade)+'</b></div><div><span>Valor</span><b>'+fN(P.valor)+'</b></div></aside></div>';
  out+='<div class="card"><h3>Dados do pedido</h3><div class="fields">'+fld('empresa','Empresa')+fld('data','Data','','date')+fld('tomador','Tomador','w2')+fld('cnpj','CNPJ')+fld('endereco','Endereço','w2')+fld('municipio','Município')+fld('empenho','Empenho')+
    fld('parceiro','Parceiro')+fld('empresas','Empresas (cód.)')+fld('cidadeISS','Cidade ISS')+fld('tipoOperacao','Tipo operação')+fld('centroResultado','Centro de resultado')+fld('produtoServico','Produto / serviço')+fld('descricao','Descrição dos serviços','wfull','ta')+'</div>'+
    (ed?'<p class="muted">A descrição é montada a partir do modelo do contrato. Ajustes aqui valem só para este pedido.</p>':'')+
    '<div class="row" style="margin-top:12px">'+(ed?'<button class="btn" data-act="penfReset">Recarregar do contrato</button><span class="grow"></span><button class="btn pri" data-act="emitirNF">Emitir pedido de NF</button>':'<span class="grow"></span>')+'<button class="btn" data-act="baixarPENF">Baixar PENF (.xlsx)</button></div></div>';
  return out;
}

function folhaAtual(f,ct,c){
  if(f.folha&&f.folha.geradaEm) return f.folha;
  const fp=f.folhaParams||{};
  const r=calcFolha(c,ct,S.medicos[ct.id]||{},fp,S.config);
  return {rows:r.rows,tot:r.tot,dataVcto:fp.dataVcto||ultimoDiaMesSeguinte(f.competencia),responsavel:fp.responsavel||ct.responsavel||'',numeroDoc:numeroDocumento(ct,f.competencia),codReduzido:codReduzido(ct,f.competencia)};
}
function tabFolha(f,ct,c){
  if(!lock(f)) return '<div class="banner info"><div><b>Disponível após a aprovação.</b> A folha usa os pagamentos travados por médico.</div></div>';
  if(f.folha&&f.folha.geradaEm&&!f.folha.rows) return emptyState('Carregando a folha gerada…','');
  const F=folhaAtual(f,ct,c); const ger=!!(f.folha&&f.folha.geradaEm); const ed=!ger&&can('gerar_folha');
  const alertas=F.rows.filter(r=>r.alertas.some(a=>a.c==='bad')).length;
  let out=ger? '<div class="banner ok"><div><b>Folha gerada</b> em '+fDT(f.folha.geradaEm)+' por '+esc(nomeDe(f.folha.geradaPor))+'. Arquivo no layout da planilha de importação (FOLHA MÉDICA, Consolidada e Importação Sankhya).</div></div>' : '';
  if(!ger&&alertas) out+='<div class="banner warn"><div><b>'+alertas+' médico(s) com pendência de cadastro.</b> Complete CPF/CNPJ da conta e empresa pagadora em Médicos antes de gerar.</div><button class="btn sm" data-act="nav" data-v="med" data-ct="'+ct.id+'">Abrir cadastro de médicos</button></div>';
  out+='<div class="card"><div class="fields"><label class="f">Contrato<input type="text" value="'+esc((ct.numero||'')+(ct.ano||'')+' '+(ct.sigla||''))+'" readonly></label><label class="f">Empresa<input type="text" value="'+esc(ct.empresa||'')+'" readonly></label><label class="f">Período de ref.<input type="text" value="'+mmYY(f.competencia).mm+'/'+mmYY(f.competencia).yy+'" readonly></label>'+
    '<label class="f">Responsável<input type="text" id="flResp" value="'+esc(F.responsavel)+'" data-chg="folhaP" data-f="responsavel"'+(ed?'':' disabled')+'></label><label class="f">Número documento<input type="text" value="'+esc(F.numeroDoc)+'" readonly class="mono"></label><label class="f">Centro de resultados<input type="text" value="'+esc(ct.centroResultado||'')+'" readonly></label><label class="f">Cód. reduzido contrato<input type="text" value="'+esc(F.codReduzido)+'" readonly></label>'+
    '<label class="f">Data de vencimento<input type="date" id="flVcto" value="'+esc(F.dataVcto)+'" data-chg="folhaP" data-f="dataVcto"'+(ed?'':' disabled')+'></label></div></div>';
  out+='<div class="tbl fix" data-keep="tf"><table><thead><tr><th>CRM</th><th>Nome</th><th class="n">Horas</th><th class="n">Total realizado</th><th class="n">Desconto PN</th><th class="n">A receber</th><th class="n">Retenções</th><th class="n">Taxa sócio</th><th class="n">Líquido</th><th>Vínculo</th><th>Tipo pgto.</th><th>Empresa pagadora</th><th>Cód.</th><th>CPF/CNPJ conta</th><th>Empresa PJ</th><th>Alertas</th></tr></thead><tbody>'+
    F.rows.map(r=>{const id=safeKey(r.k); return '<tr><td class="mono">'+esc(r.crm)+'</td><td>'+esc(r.nome)+'</td><td class="n">'+fH(r.horas)+'</td><td class="n">'+fN(r.total)+'</td>'+
      '<td class="n">'+(ed?'<input type="text" inputmode="decimal" autocomplete="off" id="fpn_'+id+'" value="'+dec((r.pn||''))+'" placeholder="0,00" data-chg="folhaV" data-k="'+esc(r.k)+'" data-f="pn">':fN(r.pn))+'</td><td class="n">'+fN(r.aReceber)+'</td>'+
      '<td class="n">'+(ed?'<input type="text" inputmode="decimal" autocomplete="off" id="frt_'+id+'" value="'+dec((r.ret||''))+'" placeholder="0,00" data-chg="folhaV" data-k="'+esc(r.k)+'" data-f="ret">':fN(r.ret))+'</td><td class="n">'+fN(r.taxa)+'</td><td class="n"><b>'+fN(r.liq)+'</b></td>'+
      '<td>'+esc(r.vinculo)+'</td><td>'+esc(r.tipoPag)+' <span class="muted mono">'+esc(r.natureza)+'</span></td><td>'+esc(r.empresa)+'</td><td class="mono">'+esc(r.codEmpresa)+'</td><td class="mono">'+esc(r.cpfConta)+'</td><td>'+esc(r.empresaPJ)+'</td><td>'+r.alertas.map(a=>'<span class="tag '+a.c+'">'+esc(a.t)+'</span>').join(' ')+'</td></tr>';}).join('')+
    '</tbody><tfoot><tr><td colspan="2">Total ('+F.rows.length+' médicos)</td><td class="n">'+fH(F.tot.horas)+'</td><td class="n">'+fN(F.tot.total)+'</td><td class="n">'+fN(F.tot.pn)+'</td><td class="n">'+fN(F.tot.aReceber)+'</td><td class="n">'+fN(F.tot.ret)+'</td><td class="n">'+fN(F.tot.taxa)+'</td><td class="n">'+fN(F.tot.liq)+'</td><td colspan="7"></td></tr></tfoot></table></div>';
  const prova=r2(F.tot.total-c.totais.totPag);
  out+='<div class="card row"><div class="grow"><b>Prova real</b><div class="muted">Total da folha − pagamento aprovado = '+fN(prova)+(prova===0?' ✓':' — revise')+' · Taxa de sócio: R$ '+fN(ct.taxaSocio==null?150:ct.taxaSocio)+' para vínculo SÓCIO acima de '+(ct.taxaSocioMinHoras==null?24:ct.taxaSocioMinHoras)+' h</div></div>'+
    (ed?'<button class="btn pri" data-act="gerarFolha">Gerar folha de pagamento</button>':'<button class="btn" data-act="baixarFolha">Baixar planilha de importação (.xlsx)</button>')+'</div>';
  return out;
}

function tabObs(f){
  const o=f.obs||{}; const hist=(o.historico||[]).slice().reverse(); const ed=can('observacoes');
  const draft = S.obsDraft[f.id]!=null? S.obsDraft[f.id] : (o.texto||'');
  let out='<div class="card"><h3>Observações do fechamento do mês</h3><label class="f" for="obsTx">Texto atual'+(o.em?' — última edição por '+esc(nomeDe(o.por))+' em '+fDT(o.em):'')+'</label><textarea id="obsTx" data-inp="obs" style="min-height:140px"'+(ed?'':' disabled')+' placeholder="Ex.: plantões de 12/10 cobertos por troca; aguardando declaração de não retirada de pró-labore…">'+esc(draft)+'</textarea>'+
    (ed?'<div class="row" style="margin-top:10px"><span class="grow muted">Cada gravação fica registrada com autor, data e hora.</span><button class="btn pri" data-act="salvarObs"'+(draft===(o.texto||'')?' disabled':'')+'>Salvar observação</button></div>':'')+'</div>';
  out+='<div class="grid g2"><div class="card"><h3>Histórico de observações</h3><div class="log">'+(hist.length?hist.map(h=>'<div class="it"><div class="t">'+fDT(h.em)+'<br><b>'+esc(nomeDe(h.por))+'</b></div><div class="x">'+esc(h.texto)+'</div></div>').join(''):'<p class="muted">Nenhuma observação registrada.</p>')+'</div></div>'+
    '<div class="card"><h3>Log do fechamento</h3><div class="log">'+((f.eventos||[]).slice().reverse().map(e=>'<div class="it"><div class="t">'+fDT(e.em)+'<br><b>'+esc(nomeDe(e.por))+'</b></div><div class="x">'+esc(e.texto)+'</div></div>').join('')||'<p class="muted">Sem eventos.</p>')+'</div></div></div>';
  return out;
}

/* ================= CONTRATOS ================= */
function viewContratos(){
  const cs=S.contratos||[];
  const head='<div class="head"><div><div class="eyebrow">Cadastros</div><h1>Contratos</h1><p>Valores a pagar e a faturar por especialidade e tipo/local, unidade de medida e dados para NF e ERP.</p></div>'+(can('contratos')?'<button class="btn pri" data-act="novoCt">Novo contrato</button>':'')+'</div>';
  if(!cs.length) return head+emptyState('Nenhum contrato cadastrado','Cadastre o contrato com seus itens (especialidade, tipo/local, unidade, valores) antes de importar o primeiro relatório.');
  return head+'<div class="tbl"><table><thead><tr><th>CR</th><th>Contrato</th><th>Nº</th><th>Empresa</th><th class="n">Itens</th><th class="n">Contratado/mês</th><th class="n">Valor global</th><th>Vigência</th><th>Pendências</th><th></th></tr></thead><tbody>'+
    cs.map(c=>{const it=c.itens||[]; const pend=[]; if(it.some(i=>!num(i.valorFaturar))) pend.push('valor a faturar'); if(it.some(i=>!num(i.valorPagar)&&i.fontePag!=='pega')) pend.push('valor a pagar'); if(!c.tomador) pend.push('dados NF');
      return '<tr><td class="mono"><b>'+esc(c.sigla)+'</b></td><td>'+esc(c.nome)+(c.ativo===false?' <span class="tag">inativo</span>':'')+'</td><td class="mono">'+esc((c.numero||'')+(c.ano||''))+'</td><td>'+esc(c.empresa)+'</td><td class="n">'+it.length+'</td><td class="n">'+fH(it.reduce((s,i)=>s+num(i.qtdMes),0))+'</td><td class="n">'+(num(c.valorGlobal)?brl(num(c.valorGlobal)):'—')+'</td><td>'+(c.vigIni?fD(c.vigIni)+' a '+fD(c.vigFim):'—')+'</td><td>'+(pend.length?pend.map(p=>'<span class="tag warn">'+p+'</span>').join(' '):'<span class="tag">ok</span>')+'</td><td><button class="btn sm" data-act="editCt" data-id="'+c.id+'">'+(can('contratos')?'Editar':'Ver')+'</button></td></tr>';}).join('')+'</tbody></table></div>';
}
function novoContrato(){ return {id:'',sigla:'',nome:'',numero:'',ano:'',centroResultado:'',empresa:'',codEmpresaPagadora:'',codEmpresaFat:'',responsavel:'',vigIni:'',vigFim:'',valorGlobal:0,qtdGlobal:0,ativo:true,ufCrm:'',
  tomador:'',cnpj:'',endereco:'',municipio:'',cidadeISS:'',parceiro:'',tipoOperacao:'',produtoServico:'',empenho:'Não possui',descricaoNF:'REFERENTE A PRESTAÇÃO DE SERVIÇOS MÉDICOS NA ESPECIALIDADE DE {ESPECIALIDADES} - PERIODO {PERIODO} - QUANTIDADE DE {UNIDADE} EXECUTADAS {QTD_TOTAL}, VALOR UNITÁRIO {VALOR_UNITARIO}, TOTALIZANDO {VALOR_TOTAL}.',
  vinculoPadrao:'SOCIO',taxaSocio:150,taxaSocioMinHoras:24,alertaValor:20000,itens:[],diferenciados:[],mapeamento:[]}; }
function viewContratoEd(){
  const d=S.draft; if(!d) return emptyState('Nada em edição','','<button class="btn" data-act="nav" data-v="ct">Voltar</button>');
  const ed=can('contratos'); const dis=ed?'':' disabled';
  const fld=(k,l,cls,type,extra)=>'<label class="f '+(cls||'')+'">'+l+(type==='ta'?'<textarea id="ct_'+k+'" data-chg="ct" data-f="'+k+'"'+dis+'>'+esc(d[k])+'</textarea>':(type==='number'?'<input type="text" inputmode="decimal" autocomplete="off" data-num="1" id="ct_'+k+'" value="'+esc(dec(d[k]))+'" data-chg="ct" data-f="'+k+'"'+dis+(extra||'')+'>':'<input type="'+(type||'text')+'" id="ct_'+k+'" value="'+esc(d[k]==null?'':d[k])+'" data-chg="ct" data-f="'+k+'"'+dis+(extra||'')+'>'))+'</label>';
  const empOpts=(S.config&&S.config.empresas||[]);
  let out='<div class="head"><div><button class="btn ghost sm" data-act="nav" data-v="ct">← Contratos</button><h1 style="margin-top:6px">'+(d.id?esc(d.sigla+' — '+d.nome):'Novo contrato')+'</h1></div>'+(ed?'<div class="row"><button class="btn" data-act="nav" data-v="ct">Cancelar</button><button class="btn pri" data-act="salvarCt">Salvar contrato</button></div>':'')+'</div>';
  const crs=(S.config&&S.config.centros)||[];
  out+='<div class="card"><h2>Identificação</h2><div class="fields">'+fld('sigla','Sigla do CR (ex.: PAP)','','text',' list="crList"')+'<datalist id="crList">'+crs.map(c=>'<option value="'+esc(c.sigla)+'">'+esc(c.descricao+' · '+c.codigo)+'</option>').join('')+'</datalist>'+fld('nome','Nome do contrato','w2')+fld('numero','Nº do contrato')+fld('ano','Ano (ex.: /2025)')+fld('centroResultado','Centro de resultado')+
    '<label class="f">Empresa contratada / pagadora<input list="empList" type="text" id="ct_empresa" value="'+esc(d.empresa)+'" data-chg="ct" data-f="empresa"'+dis+'><datalist id="empList">'+empOpts.map(e=>'<option value="'+esc(e.sigla)+'">'+esc(e.razao+' ('+e.cod+')')+'</option>').join('')+'</datalist></label>'+
    fld('responsavel','Responsável pelo fechamento')+fld('vigIni','Início da vigência','','date')+fld('vigFim','Fim da vigência','','date')+fld('valorGlobal','Valor global do contrato (R$)','','number')+fld('qtdGlobal','Quantidade global (h/unid.)','','number')+fld('ufCrm','UF padrão do CRM')+
    '<label class="f chk"><input type="checkbox" id="ct_ativo" data-chg="ctChk" data-f="ativo"'+(d.ativo!==false?' checked':'')+dis+'> Contrato ativo</label></div></div>';
  out+='<div class="card"><div class="row"><h2 class="grow">Especialidades, tipos e valores</h2>'+(ed?'<button class="btn sm" data-act="addItem">Adicionar item</button>':'')+'</div><p class="muted">Cada item é uma especialidade + tipo/local com sua unidade de medida para pagamento e faturamento. Fonte “Pega Plantão” usa o valor/hora configurado no relatório para o pagamento.</p>'+
    '<div class="tbl" data-keep="cti"><table><thead><tr><th>Especialidade</th><th>Tipo / local</th><th>Unid. pagamento</th><th>Unid. faturamento</th><th class="n">Qtd contratada/mês</th><th class="n">Valor a faturar</th><th class="n">Valor a pagar</th><th>Fonte pagamento</th><th></th></tr></thead><tbody>'+
    (d.itens.length?d.itens.map((it,i)=>{const sel=(f,opts)=>'<select id="it'+i+f+'" data-chg="it" data-i="'+i+'" data-f="'+f+'"'+dis+'>'+opts.map(o=>'<option value="'+o[0]+'"'+(it[f]===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select>'; const U=Object.entries(UNIDADES);
      return '<tr><td><input type="text" id="it'+i+'esp" value="'+esc(it.especialidade)+'" data-chg="it" data-i="'+i+'" data-f="especialidade"'+dis+'></td><td><input type="text" id="it'+i+'tp" value="'+esc(it.tipo)+'" data-chg="it" data-i="'+i+'" data-f="tipo"'+dis+'></td><td>'+sel('unidadePag',U)+'</td><td>'+sel('unidadeFat',U)+'</td>'+
        '<td class="n"><input type="text" inputmode="decimal" autocomplete="off" id="it'+i+'q" value="'+dec((it.qtdMes||0))+'" data-chg="it" data-i="'+i+'" data-f="qtdMes"'+dis+'></td><td class="n"><input type="text" inputmode="decimal" autocomplete="off" id="it'+i+'vf" value="'+dec((it.valorFaturar||0))+'" data-chg="it" data-i="'+i+'" data-f="valorFaturar"'+dis+(num(it.valorFaturar)?'':' style="border-color:var(--warn)"')+'></td><td class="n"><input type="text" inputmode="decimal" autocomplete="off" id="it'+i+'vp" value="'+dec((it.valorPagar||0))+'" data-chg="it" data-i="'+i+'" data-f="valorPagar"'+dis+'></td>'+
        '<td>'+sel('fontePag',[['cadastro','Cadastro'],['pega','Pega Plantão']])+'</td><td>'+(ed?'<button class="btn ghost sm" data-act="rmItem" data-i="'+i+'" aria-label="Remover item">✕</button>':'')+'</td></tr>';}).join(''):'<tr><td colspan="9" class="muted">Nenhum item. Adicione as especialidades e tipos do contrato.</td></tr>')+'</tbody></table></div></div>';
  const itOpts=sel=>'<option value="">Escolha…</option>'+d.itens.map(it=>'<option value="'+it.id+'"'+(sel===it.id?' selected':'')+'>'+esc(it.especialidade+' — '+it.tipo)+'</option>').join('');
  out+='<div class="card"><div class="row"><h2 class="grow">Vínculo com setores do Pega Plantão</h2></div><p class="muted">Define qual item do contrato recebe as horas de cada “Local | Setor” do relatório. É preenchido automaticamente na conferência.</p><div class="tbl"><table><thead><tr><th>Local | Setor</th><th>Item do contrato</th><th></th></tr></thead><tbody>'+
    (d.mapeamento.length?d.mapeamento.map((m,i)=>'<tr><td>'+esc(m.s)+'</td><td><select id="mpc'+i+'" data-chg="ctMap" data-i="'+i+'"'+dis+'>'+itOpts(m.item)+'<option value="__ignorar"'+(m.item==='__ignorar'?' selected':'')+'>Não faturar (ignorar)</option></select></td><td>'+(ed?'<button class="btn ghost sm" data-act="rmMap" data-i="'+i+'" aria-label="Remover vínculo">✕</button>':'')+'</td></tr>').join(''):'<tr><td colspan="3" class="muted">Sem vínculos ainda.</td></tr>')+'</tbody></table></div></div>';
  out+='<div class="card"><div class="row"><h2 class="grow">Valores diferenciados por médico</h2>'+(ed?'<button class="btn sm" data-act="addDif">Adicionar</button>':'')+'</div><p class="muted">Substitui o valor a pagar do item para o médico indicado.</p><div class="tbl"><table><thead><tr><th>CRM</th><th>Médico</th><th>Item</th><th class="n">Valor a pagar</th><th></th></tr></thead><tbody>'+
    (d.diferenciados.length?d.diferenciados.map((x,i)=>'<tr><td><input type="text" id="df'+i+'c" value="'+esc(x.crm)+'" data-chg="dif" data-i="'+i+'" data-f="crm"'+dis+' style="min-width:90px"></td><td><input type="text" id="df'+i+'n" value="'+esc(x.nome||'')+'" data-chg="dif" data-i="'+i+'" data-f="nome"'+dis+'></td><td><select id="df'+i+'i" data-chg="dif" data-i="'+i+'" data-f="item"'+dis+'>'+itOpts(x.item)+'</select></td><td class="n"><input type="text" inputmode="decimal" autocomplete="off" id="df'+i+'v" value="'+dec((x.valorPagar||0))+'" data-chg="dif" data-i="'+i+'" data-f="valorPagar"'+dis+'></td><td>'+(ed?'<button class="btn ghost sm" data-act="rmDif" data-i="'+i+'" aria-label="Remover">✕</button>':'')+'</td></tr>').join(''):'<tr><td colspan="5" class="muted">Nenhum valor diferenciado.</td></tr>')+'</tbody></table></div></div>';
  out+='<div class="card"><h2>Pedido de NF (PENF)</h2><div class="fields">'+fld('tomador','Tomador','w2')+fld('cnpj','CNPJ do tomador')+fld('endereco','Endereço','w2')+fld('municipio','Município')+fld('empenho','Empenho')+fld('parceiro','Parceiro (cód.)')+fld('codEmpresaFat','Empresas (cód. faturamento)')+fld('cidadeISS','Cidade ISS (cód.)')+fld('tipoOperacao','Tipo operação')+fld('produtoServico','Produto / serviço (cód.)')+
    fld('descricaoNF','Modelo da descrição dos serviços','wfull','ta')+'</div><p class="muted">Campos automáticos: {ESPECIALIDADES} {PERIODO} {COMPETENCIA} {QTD_TOTAL} {UNIDADE} {VALOR_UNITARIO} {VALOR_TOTAL} {ITENS} {CONTRATO}</p></div>';
  out+='<div class="card"><h2>Folha de pagamento / ERP</h2><div class="fields">'+fld('codEmpresaPagadora','Cód. empresa pagadora (padrão)')+
    '<label class="f">Vínculo padrão<select id="ct_vinculoPadrao" data-chg="ct" data-f="vinculoPadrao"'+dis+'>'+VINCULOS.map(v=>'<option'+(d.vinculoPadrao===v?' selected':'')+'>'+v+'</option>').join('')+'</select></label>'+
    fld('taxaSocio','Taxa de sócio (R$)','','number')+fld('taxaSocioMinHoras','Cobrar taxa acima de (h)','','number')+fld('alertaValor','Alerta de valor acima de (R$)','','number')+'</div><p class="muted">Nº documento = nº do contrato + MM + AA. Cód. reduzido = sigla do CR + MM + AA. Vencimento padrão: último dia do mês seguinte à competência.</p></div>';
  if(ed&&d.id) out+='<div class="row"><span class="grow"></span><button class="btn pri" data-act="salvarCt">Salvar contrato</button></div>';
  return out;
}

/* ================= MÉDICOS ================= */
function viewMedicos(){
  const cs=S.contratos||[]; if(!S.medCt&&cs.length) S.medCt=cs[0].id;
  const ct=ctById(S.medCt); const lista=S.medicos[S.medCt]||{}; const ed=can('medicos');
  const head='<div class="head"><div><div class="eyebrow">Cadastros</div><h1>Médicos</h1><p>Dados usados na folha: vínculo, empresa pagadora, CPF/CNPJ da conta e empresa PJ. Novos médicos entram automaticamente ao importar o Pega Plantão.</p></div>'+
    '<div class="row"><label class="f">Contrato<select id="mCt" data-chg="medCt">'+cs.map(c=>'<option value="'+c.id+'"'+(c.id===S.medCt?' selected':'')+'>'+esc(c.sigla+' — '+c.nome)+'</option>').join('')+'</select></label>'+
    (ed&&ct?'<label class="btn" for="fBase">Importar base de médicos (.xlsx)</label><input type="file" id="fBase" accept=".xlsx,.xls,.xlsm" hidden data-chg="importBase">':'')+'</div></div>';
  if(!ct) return head+emptyState('Cadastre um contrato primeiro','');
  const q=normTxt(S.medQ);
  const ks=Object.keys(lista).filter(k=>!q||normTxt(lista[k].nome+' '+k+' '+(lista[k].cpfConta||'')).includes(q)).sort((a,b)=>(lista[a].nome||'').localeCompare(lista[b].nome||'','pt-BR'));
  if(!Object.keys(lista).length) return head+emptyState('Nenhum médico neste contrato','Importe um relatório do Pega Plantão ou a planilha “Base Médicos” do fechamento (colunas CRM, Nome Completo, CPF/CNPJ titular conta, Vínculo, Empresa pagadora…).');
  const dis=ed?'':' disabled';
  const inp=(k,f,w)=>'<input type="text" id="md_'+safeKey(k)+'_'+f+'" value="'+esc(lista[k][f]||'')+'" data-chg="med" data-k="'+esc(k)+'" data-f="'+f+'"'+dis+(w?' style="min-width:'+w+'px"':'')+'>';
  return head+'<div class="row"><input type="search" id="medQ" placeholder="Buscar por nome, CRM ou CPF" data-inp="medQ" style="max-width:320px"><span class="muted">'+ks.length+' médico(s)</span></div><div class="tbl" data-keep="tmed"><table><thead><tr><th>CRM</th><th>Nome</th><th>Vínculo</th><th>Empresa pagadora</th><th>CPF/CNPJ titular conta</th><th>Empresa PJ</th><th>Formalização</th><th>E-mail NF</th><th>Contato</th><th>Observações</th><th>Ativo</th></tr></thead><tbody>'+
    ks.map(k=>{const m=lista[k]; const incompleto=!m.cpfConta&&!m.cpf; return '<tr><td class="mono">'+esc(m.crm||k)+'</td><td>'+esc(m.nome)+(incompleto?' <span class="tag bad">sem CPF/CNPJ</span>':'')+'</td>'+
      '<td><select id="md_'+safeKey(k)+'_v" data-chg="med" data-k="'+esc(k)+'" data-f="vinculo"'+dis+' style="min-width:110px"><option value="">'+esc('(padrão: '+(ct.vinculoPadrao||'SOCIO')+')')+'</option>'+VINCULOS.map(v=>'<option'+(m.vinculo===v?' selected':'')+'>'+v+'</option>').join('')+'</select></td>'+
      '<td>'+inp(k,'empresaPagadora',110)+'</td><td>'+inp(k,'cpfConta',150)+'</td><td>'+inp(k,'empresaPJ')+'</td><td>'+inp(k,'formalizacao',100)+'</td><td>'+inp(k,'email',180)+'</td><td>'+inp(k,'contato',120)+'</td><td>'+inp(k,'observacoes')+'</td>'+
      '<td><input type="checkbox" id="md_'+safeKey(k)+'_a" data-chg="medChk" data-k="'+esc(k)+'" data-f="ativo"'+(m.ativo!==false?' checked':'')+dis+'></td></tr>';}).join('')+'</tbody></table></div>';
}

/* ================= ADMIN ================= */
function viewAdmin(){
  let out='<div class="head"><div><div class="eyebrow">Administração</div><h1>Usuários e permissões</h1><p>Quem pode importar, conferir, aprovar, emitir NF e gerar a folha. Administradores gerais (tabela app_admins) têm acesso total.</p></div></div>';
  if(window.__contas) out+='<div class="card"><h2>Criar conta de acesso</h2><p class="muted">O sistema gera uma senha temporária para você repassar à pessoa. No primeiro acesso ela define a própria senha.</p><form class="fields" id="fConta" data-sub="criarConta" novalidate><label class="f">Nome completo<input type="text" id="ncNome" autocomplete="off"></label><label class="f">E-mail<input type="email" id="ncEmail" autocomplete="off"></label><label class="f">Perfil<select id="ncPerfil">'+Object.entries(PERFIS).map(([k,v])=>'<option value="'+k+'"'+(k==='consulta'?' selected':'')+'>'+v.label+'</option>').join('')+'</select></label><div class="f" style="justify-content:flex-end"><button class="btn pri" type="submit"'+(S.busy?' disabled':'')+'>'+(S.busy?'Criando…':'Criar conta')+'</button></div></form></div>';
  out+='<div class="card"><h2>'+(window.__contas?'Incluir conta já existente':'Adicionar usuário')+'</h2><div class="dd" style="max-width:460px"><input type="search" id="uSearch" placeholder="Digite o nome ou e-mail de um colega" data-inp="uSearch" autocomplete="off">'+
    (S.userHits.length?'<ul>'+S.userHits.map(h=>'<li><button data-act="addUser" data-id="'+esc(h.id)+'"><img class="av" src="'+esc(h.avatarUrl)+'" alt=""><span>'+esc(h.name)+(h.email?' <span class="muted">'+esc(h.email)+'</span>':'')+'</span></button></li>').join('')+'</ul>':'')+'</div><p class="muted">'+(window.__contas?'Para quem já tem conta e foi removido da lista abaixo.':'A pessoa precisa criar a conta na tela de login antes; depois disso ela aparece nesta busca.')+'</p></div>';
  const us=S.usuarios.slice().sort((a,b)=>nomeDe(a.id).localeCompare(nomeDe(b.id),'pt-BR'));
  out+='<div class="card"><h2>Usuários ('+us.length+')</h2>'+(us.length?'':'<p class="muted">Nenhum usuário além do proprietário.</p>')+us.map(u=>{ const p=S.prof[u.id]||{};
    return '<div style="border-top:1px solid var(--line);padding:14px 0;display:flex;flex-direction:column;gap:10px"><div class="row"><img class="av" src="'+esc(p.avatarUrl||'')+'" alt=""><div class="grow"><b>'+esc(p.name||'Usuário')+'</b>'+(p.email?' <span class="muted">'+esc(p.email)+'</span>':'')+'<div class="muted" style="font-size:.8rem">Incluído em '+fDT(u.criadoEm)+' por '+esc(nomeDe(u.criadoPor))+'</div></div>'+
      '<label class="f">Perfil<select id="up_'+safeKey(u.id)+'" data-chg="uPerfil" data-id="'+esc(u.id)+'">'+Object.entries(PERFIS).map(([k,v])=>'<option value="'+k+'"'+(u.perfil===k?' selected':'')+'>'+v.label+'</option>').join('')+'<option value="custom"'+(u.perfil==='custom'?' selected':'')+'>Personalizado</option></select></label>'+
      '<label class="f chk"><input type="checkbox" id="ua_'+safeKey(u.id)+'" data-chg="uAtivo" data-id="'+esc(u.id)+'"'+(u.ativo!==false?' checked':'')+'> Ativo</label>'+(window.__contas&&u.id!==S.uid?'<button class="btn ghost sm" data-act="resetSenha" data-id="'+esc(u.id)+'">Redefinir senha</button>':'')+'<button class="btn ghost sm" data-act="rmUser" data-id="'+esc(u.id)+'">Remover</button></div>'+
      '<div class="perm">'+PERMS.map(([k,l])=>'<label class="f chk"><input type="checkbox" id="pm_'+safeKey(u.id)+'_'+k+'" data-chg="uPerm" data-id="'+esc(u.id)+'" data-p="'+k+'"'+(u.perms&&u.perms[k]?' checked':'')+'> '+l+'</label>').join('')+'</div></div>';}).join('')+'</div>';
  const emp=(S.config&&S.config.empresas)||[]; const nat=Object.assign({},NATUREZAS_PADRAO,(S.config&&S.config.naturezas)||{});
  out+='<div class="grid g2"><div class="card"><div class="row"><h2 class="grow">Empresas pagadoras</h2><button class="btn sm" data-act="addEmp">Adicionar</button></div><p class="muted">Tabela usada para o “Cod Empresa Pagadora” da importação no Sankhya.</p><div class="tbl" style="max-height:420px;overflow:auto"><table><thead><tr><th>Sigla</th><th>Razão abreviada</th><th class="n">Código</th><th></th></tr></thead><tbody>'+
    emp.map((e,i)=>'<tr><td><input type="text" id="em'+i+'s" value="'+esc(e.sigla)+'" data-chg="emp" data-i="'+i+'" data-f="sigla" style="min-width:90px"></td><td><input type="text" id="em'+i+'r" value="'+esc(e.razao)+'" data-chg="emp" data-i="'+i+'" data-f="razao"></td><td class="n"><input type="number" id="em'+i+'c" value="'+esc(e.cod)+'" data-chg="emp" data-i="'+i+'" data-f="cod"></td><td><button class="btn ghost sm" data-act="rmEmp" data-i="'+i+'" aria-label="Remover">✕</button></td></tr>').join('')+'</tbody></table></div></div>'+
    '<div class="card"><h2>Naturezas (tipo de pagamento)</h2><div class="fields">'+Object.keys(NATUREZAS_PADRAO).map(k=>'<label class="f">'+k+'<input type="number" id="nt_'+safeKey(k)+'" value="'+esc(nat[k])+'" data-chg="nat" data-f="'+esc(k)+'"></label>').join('')+'</div><p class="muted">SÓCIO → Honorários · RPA → RPA · PJ → PJ · PRÓ-LABORE → Pró-Labore.</p></div></div>';
  return out;
}

/* ================= MODAIS ================= */
function viewModal(){
  const m=S.modal;
  if(m.type==='novo'){
    const p=m.parsed;
    let out='<h2>Importar relatório do Pega Plantão</h2><p class="muted" style="margin:0">Use o relatório Financeiro (.xlsx). A quantidade apurada é a coluna “Duração (Tolerância)”.</p>'+
      '<label class="btn" for="fNovo" style="align-self:flex-start">'+(p?'Trocar arquivo':'Escolher arquivo')+'</label><input type="file" id="fNovo" accept=".xlsx,.xls" hidden data-chg="fileNovo">';
    if(m.erro) out+='<div class="banner bad">'+esc(m.erro)+'</div>';
    if(p){
      const locais=[...new Set(p.rows.map(r=>r.local))];
      const h=p.rows.reduce((t,r)=>{t.p+=r.plan;t.r+=r.real;t.a+=r.apur;return t;},{p:0,r:0,a:0});
      out+='<div class="card" style="background:var(--sunken)"><div class="fields"><div><div class="eyebrow">Arquivo</div><b>'+esc(m.nome)+'</b></div><div><div class="eyebrow">Período</div><b>'+esc(p.periodo||'—')+'</b></div><div><div class="eyebrow">Plantões</div><b>'+p.rows.length+'</b></div><div><div class="eyebrow">Horas plan. / real. / apur.</div><b>'+fH(h.p)+' / '+fH(h.r)+' / '+fH(h.a)+'</b></div><div class="wfull"><div class="eyebrow">Local</div>'+esc(locais.join(', '))+'</div></div></div>';
      out+='<div class="fields"><label class="f w2">Contrato<select id="nCt" data-chg="novo" data-f="ct"><option value="">Escolha…</option>'+(S.contratos||[]).filter(c=>c.ativo!==false).map(c=>'<option value="'+c.id+'"'+(m.ct===c.id?' selected':'')+'>'+esc(c.sigla+' — '+c.nome)+'</option>').join('')+'</select></label>'+
        '<label class="f">Competência<input type="month" id="nComp" value="'+esc(m.comp||'')+'" data-chg="novo" data-f="comp"></label></div>';
      const ex=m.ct&&m.comp&&fechById(m.ct+'_'+m.comp.replace('-',''));
      if(ex) out+= lock(ex)? '<div class="banner bad">Já existe um fechamento aprovado para este contrato e competência. Reabra-o antes de reimportar.</div>' : '<div class="banner warn">Já existe um fechamento em andamento para este contrato e competência. Importar substitui o relatório e mantém ajustes, conferências e observações.</div>';
      if(m.comp&&p.periodo&&!periodoMeses(p.periodo).includes(m.comp)) out+='<div class="banner warn">O período do relatório ('+esc(p.periodo)+') não inclui a competência escolhida. Confira o arquivo ou a competência.</div>';
      else if(m.comp&&p.periodo&&new Set(periodoMeses(p.periodo)).size>1) out+='<div class="banner info">Período de corte '+esc(p.periodo)+' lançado na competência '+compTxt(m.comp)+'. O pedido de NF usa este período.</div>';
    }
    const ok=p&&m.ct&&m.comp&&!(m.ct&&m.comp&&fechById(m.ct+'_'+m.comp.replace('-',''))&&lock(fechById(m.ct+'_'+m.comp.replace('-',''))));
    out+='<div class="row"><span class="grow"></span><button class="btn" data-act="modalClose">Cancelar</button><button class="btn pri" data-act="criarFech"'+(ok&&!S.busy?'':' disabled')+'>'+(S.busy?'Importando…':'Importar e iniciar fechamento')+'</button></div>';
    return out;
  }
  if(m.type==='senha'){
    return '<h2>'+esc(m.title)+'</h2><p>Repasse estes dados para <b>'+esc(m.nome)+'</b> por um canal seguro. A senha não será mostrada de novo; no primeiro acesso a pessoa define a própria senha.</p><div class="card" style="background:var(--sunken)"><div class="fields"><div><div class="eyebrow">E-mail</div><b>'+esc(m.email)+'</b></div><div><div class="eyebrow">Senha temporária</div><b class="mono" style="font-size:1.1rem">'+esc(m.senha)+'</b></div><div class="wfull"><div class="eyebrow">Endereço</div><span class="mono">'+esc(location.origin)+'</span></div></div></div><div class="row"><button class="btn" data-act="copiarSenha">Copiar dados</button><span class="grow"></span><button class="btn pri" data-act="modalClose">Pronto</button></div>';
  }
  if(m.type==='confirm'){
    return '<h2>'+esc(m.title)+'</h2><p>'+esc(m.text)+'</p>'+(m.motivo?'<label class="f">Motivo (obrigatório)<textarea id="cfMot" style="min-height:80px" placeholder="Explique por que está excluindo">'+esc(m.motivoTxt||'')+'</textarea></label>':'')+'<div class="row"><span class="grow"></span><button class="btn" data-act="modalClose">Cancelar</button><button class="btn '+(m.danger?'bad':'pri')+'" data-act="confirmOk">'+esc(m.ok)+'</button></div>';
  }
  return '';
}

/* ================= IMPORTAÇÃO ================= */
async function lerXlsx(file){
  if(!window.XLSX) throw new Error('A biblioteca de planilhas não carregou. Recarregue a página.');
  const buf=await file.arrayBuffer(); return XLSX.read(buf,{type:'array',cellDates:true});
}
function aoaDe(wb,pref){ const n=(pref&&pref.find(p=>wb.SheetNames.includes(p)))||wb.SheetNames[0]; return XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:null}); }
async function parseArquivoPega(file){ const wb=await lerXlsx(file); return parsePega(aoaDe(wb,['Financeiro'])); }

async function importarPara(ct,comp,parsed,nomeArq){
  const id=ct.id+'_'+comp.replace('-','');
  const ag=agregar(parsed.rows);
  const ex=fechById(id);
  // vínculos de setor: auto-sugestão para setores novos
  const mapa=(ct.mapeamento||[]).slice(); const conhecidos=new Set(mapa.map(m=>m.s)); let novos=0;
  Object.keys(ag.setores).forEach(s=>{ if(!conhecidos.has(s)){ const sug=sugerirItem(s,ct.itens||[]); if(sug){ mapa.push({s,item:sug}); novos++; } } });
  if(novos) await wr('contratos/'+ct.id,()=>S.db.doc('contratos/'+ct.id).update({mapeamento:mapa}));
  // plantões detalhados em blocos
  const tup=parsed.rows.map(r=>[r.k,r.data,r.tipo,setorKey(r),r4(r.plan),r4(r.real),r4(r.apur),r.sit,r.ini,r.fim]);
  const CH=700, nCh=Math.ceil(tup.length/CH);
  for(let i=0;i<nCh;i++){ const p='plantoes/'+id+'_'+i; await wr(p,()=>S.db.doc(p).set({fechId:id,n:i,rows:tup.slice(i*CH,(i+1)*CH).map(t=>JSON.stringify(t))})); }
  if(ex&&ex.chunks>nCh){ for(let i=nCh;i<ex.chunks;i++){ const p='plantoes/'+id+'_'+i; await wr(p,()=>S.db.doc(p).delete()); } }
  const txt='Relatório importado: '+nomeArq+' ('+parsed.rows.length+' plantões'+(parsed.periodo?', período '+parsed.periodo:'')+')';
  const docBase={contratoId:ct.id,competencia:comp,arquivo:nomeArq,periodo:parsed.periodo||'',geradoEm:parsed.geradoEm||'',base:ag.base,medicos:ag.medicos,chunks:nCh,qtdPlantoes:parsed.rows.length};
  if(ex){ await wr('fechamentos/'+id,()=>fechRef(id).update({...docBase,status:'conferencia',t:{...(ex.t||{}),importado:nowISO()},eventos:evento(ex,'import','Reimportação. '+txt)})); }
  else { await wr('fechamentos/'+id,()=>fechRef(id).set({...docBase,status:'conferencia',ajustes:{},conferidos:{},t:{inicio:nowISO(),importado:nowISO()},criadoPor:S.uid,eventos:[{tipo:'import',texto:'Fechamento iniciado. '+txt,por:S.uid,em:nowISO()}],obs:{texto:'',historico:[]}})); }
  // médicos novos no cadastro do contrato
  const reg=S.medicos[ct.id]; const add={};
  Object.entries(ag.medicos).forEach(([k,m])=>{ if(!reg||!reg[k]) add[k]={crm:m.crm,nome:m.nome,cpf:m.cpf,email:m.email,cpfConta:m.cpf||'',vinculo:'',empresaPagadora:'',ativo:true}; else if(!reg[k].cpf&&m.cpf) add[k]={cpf:m.cpf}; });
  if(Object.keys(add).length){ const p='medicos/'+ct.id; await wr(p,()=> reg? S.db.doc(p).update({lista:add}) : S.db.doc(p).set({lista:add})); }
  delete S.shifts[id];
  return id;
}
async function carregarPlantoes(f){
  if(S.shifts[f.id]) return; S.shifts[f.id]=null;
  const all=[]; for(let i=0;i<(f.chunks||0);i++){ const s=await S.db.doc('plantoes/'+f.id+'_'+i).get(); if(s.exists) (s.data().rows||[]).forEach(r=>{try{all.push(JSON.parse(r));}catch(e){}}); }
  S.shifts[f.id]=all; render();
}

async function importarBaseMedicos(file,ct){
  const wb=await lerXlsx(file);
  let aoa=null,hi=-1;
  for(const n of ['Base Médicos','Consolidada',...wb.SheetNames]){ if(!wb.Sheets[n]) continue; const a=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:null});
    for(let i=0;i<Math.min(a.length,20);i++){ const r=(a[i]||[]).map(normTxt); if(r.includes('crm')&&(r.includes('nome completo')||r.includes('nome'))){aoa=a;hi=i;break;} } if(aoa) break; }
  if(!aoa) throw new Error('Não encontrei uma aba com as colunas CRM e Nome.');
  const H=aoa[hi].map(normTxt); const col=(...c)=>{for(const x of c){const i=H.findIndex(h=>h.startsWith(normTxt(x))); if(i>=0) return i;} return -1;};
  const C={crm:col('crm'),nome:col('nome completo','nome'),cpf:col('cpf / cnpj titular','cpf/cpnj conta','cpf/cnpj conta','cpf'),vinc:col('vinculo'),emp:col('empresa pagadora','empresa pagagora'),pj:col('empresa profissional pj','empresa pj'),form:col('formalizacao do vinculo','formalizacao'),obs:col('observacoes'),email:col('e-mail envio nf','e-mails para pedido nota','email'),cont:col('contato'),ativo:col('ativo')};
  const reg=S.medicos[ct.id]||{}; const porDig={}; Object.keys(reg).forEach(k=>porDig[crmDigits(k)]=k);
  const up={}; let n=0;
  for(let i=hi+1;i<aoa.length;i++){ const r=aoa[i]; if(!r) continue; const crm=cellStr(r[C.crm]); const nome=cellStr(C.nome>=0?r[C.nome]:''); if(!crm||!/\d/.test(crm)||!nome) continue;
    let k=crmKey(crm); if(!k.includes('-')){ k=porDig[k]|| (ct.ufCrm? k+'-'+String(ct.ufCrm).toUpperCase() : k); }
    const g=c=>c>=0? cellStr(r[c]) : '';
    const v=g(C.vinc).toUpperCase().replace('Ó','O');
    const rec={crm:reg[k]&&reg[k].crm||crm,nome:reg[k]&&reg[k].nome||nome,cpfConta:g(C.cpf),vinculo:VINCULOS.includes(v)?v:(v.includes('PRO')?'PRO-LABORE':''),empresaPagadora:g(C.emp),empresaPJ:g(C.pj)==='0'?'':g(C.pj),formalizacao:g(C.form),observacoes:g(C.obs),email:g(C.email),contato:g(C.cont)};
    if(C.ativo>=0&&g(C.ativo)) rec.ativo=normTxt(g(C.ativo))!=='nao';
    Object.keys(rec).forEach(x=>{ if(rec[x]===''&&reg[k]&&reg[k][x]) delete rec[x]; });
    up[k]=rec; n++; }
  if(!n) throw new Error('Nenhum médico encontrado na planilha.');
  const p='medicos/'+ct.id; await wr(p,()=> S.medicos[ct.id]? S.db.doc(p).update({lista:up}) : S.db.doc(p).set({lista:up}));
  return n;
}

/* ================= EXPORTAÇÃO ================= */
async function salvarArquivo(nome,wb){
  if(!S.DL){ toast('Download indisponível neste navegador.','bad'); return; }
  const data=XLSX.write(wb,{type:'array',bookType:'xlsx'});
  try{ await S.DL.save({filename:nome,data:new Blob([data])}); }catch(e){ if(e&&e.code!=='declined') toast('Não foi possível baixar o arquivo ('+(e.code||'erro')+').','bad'); }
}
// data como número de série do Excel (evita o desvio de fuso/segundos de objetos Date)
const dateCell=iso=>{ if(!iso) return null; const [y,m,d]=iso.slice(0,10).split('-'); return {t:'n',v:(Date.UTC(+y,+m-1,+d)-Date.UTC(1899,11,30))/864e5,z:'dd/mm/yyyy'}; };
function wbPENF(P,ct,f){
  const wb=XLSX.utils.book_new();
  const a=[[null,null,null,null,null,null,null,null,'Parceiro',P.parceiro],[null,null,'PEDIDO DE EMISSÃO DE NOTA FISCAL',null,null,null,null,null,'Empresas ',P.empresas],[null,null,null,null,null,null,null,null,'Cidade ISS',P.cidadeISS],
    [null,null,'Empresa: '+P.empresa,null,'Data:',dateCell(P.data),null,null,'Tipo Operação',P.tipoOperacao],[null,null,null,null,null,null,null,null,'Centro de Resultado',P.centroResultado],
    [null,null,'Tomador: '+P.tomador,null,null,null,null,null,'Produto/ Serviço',P.produtoServico],[null,null,'CNPJ: '+P.cnpj],[null,null,'Endereço: '+P.endereco],[null,null,'Município: '+P.municipio,null,null,null,null,null,P.quantidade],
    [null,null,null,null,null,null,null,null,P.valor],[null,null,'DESCRIÇAO DOS SERVIÇOS:'],[null,null,P.descricao],[null,null,'Empenho: '+P.empenho],[null,null,'VALOR TOTAL DA NOTA: ',null,P.valor,null,null,null,null,P.quantidade,null,P.valor]];
  const ws=XLSX.utils.aoa_to_sheet(a,{cellDates:true}); ws['!cols']=[{wch:2},{wch:2},{wch:60},{wch:4},{wch:16},{wch:12},{wch:2},{wch:2},{wch:20},{wch:14},{wch:2},{wch:14}];
  ws['!merges']=[{s:{r:11,c:2},e:{r:11,c:6}}];
  XLSX.utils.book_append_sheet(wb,ws,'PENF'); return wb;
}
function wbResumo(f,ct,c){
  const wb=XLSX.utils.book_new();
  const a=[['Contrato',(ct.numero||'')+(ct.ano||'')+' '+(ct.sigla||'')+' - '+(ct.nome||'')],['Competência',compTxt(f.competencia)],['Status',(STATUS[statusDe(f)]||[''])[0]],['Aprovado em',f.t&&f.t.aprovado?fDT(f.t.aprovado):''],[],
    ['Especialidade','Tipo/Local','Contratado','Planejadas','Realizadas','Apuradas','Qtd faturada','Faturamento','Pagamento','Margem','Margem %']];
  c.porItem.forEach(p=>a.push([p.esp,p.tipo,p.contratado,p.plan,p.real,p.apur,p.qFat,p.totFat,p.totPag,r2(p.totFat-p.totPag),p.totFat?r4((p.totFat-p.totPag)/p.totFat):null]));
  a.push(['TOTAL','',null,c.totais.plan,c.totais.real,c.totais.apur,c.totais.qFat,c.totais.totFat,c.totais.totPag,c.totais.margem,c.totais.totFat?r4(c.totais.margem/c.totais.totFat):null]);
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(a),'Resumo');
  const b=[['CRM','Médico','Especialidade','Tipo/Local','Plantões','Planejadas','Realizadas','Apuradas','Qtd pagar','Unid. pag.','Valor pagar','Pagamento','Qtd faturar','Unid. fat.','Valor faturar','Faturamento','Ajustado','Justificativa']];
  c.linhas.forEach(l=>b.push([l.crm,l.nome,l.esp,l.tipo,l.n,l.plan,l.real,l.apur,l.qPag,UNIDADES[l.uPag],l.vPag,l.totPag,l.qFat,UNIDADES[l.uFat],l.vFat,l.totFat,l.ajustado?'Sim':'',l.just]));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(b),'Por médico');
  return wb;
}
function wbFolha(F,ct,f){
  const wb=XLSX.utils.book_new(); const {mm,yy}=mmYY(f.competencia);
  const head=[['CONTRATO',ct.numero||'',ct.ano||'',(ct.sigla||'')+' - '+(ct.nome||'')],['EMPRESA',ct.empresa||''],['PERIODO DE REF',mm,yy],['RESPONSAVEL',F.responsavel||''],[],['Número documento',F.numeroDoc],['Centro de Resultados',num(ct.centroResultado)||ct.centroResultado||''],['Cód Reduzido Contrato ',F.codReduzido],['CR',ct.sigla||''],['Data Vcto',dateCell(F.dataVcto)],[],[],
    [null,null,null,null,null,F.tot.aReceber,F.tot.taxa,r2(F.tot.ret),F.tot.liq],
    ['COD EMPRESA PAGADORA','NOME EMPRESA PAGADORA','CNPJ/CPF','PRESTADOR','TIPO DE PAGAMENTO/ NATUREZA','VALOR COM DESCONTO PN - A RECEBER','TAXA DE SOCIOS','OUTROS DESCONTOS\n RETENÇÕES E PN ','VALOR LIQUIDO','EMPRESA RECEBEDORA','OBS','VINCULO','CRM','Prova real\nDEVE SER 0']];
  F.rows.forEach(r=>head.push([num(r.codEmpresa)||r.codEmpresa,r.empresa,r.cpfConta,r.nome,r.tipoPag,r.aReceber,r.taxa,r.ret,r.liq,r.empresaPJ||0,r.obs,r.vinculo,num(r.crm)||r.crm,r2(r.aReceber-r.taxa-r.ret-r.liq)]));
  const ws1=XLSX.utils.aoa_to_sheet(head,{cellDates:true}); ws1['!cols']=[{wch:14},{wch:18},{wch:16},{wch:38},{wch:16},{wch:16},{wch:12},{wch:14},{wch:14},{wch:18},{wch:14},{wch:12},{wch:10},{wch:10}];
  XLSX.utils.book_append_sheet(wb,ws1,'FOLHA MEDICA');
  const cons=[['CRM','NOME','TOTAL DE HORAS','TOTAL REALIZADO','VALOR DE PN REALIZADO','VALOR COM DESCONTO PN - A RECEBER','RETENÇÕES','TAXA SÓCIO','VALOR LÍQUIDO','VINCULO','EMPRESA PAGAGORA','CPF/CPNJ CONTA','EMPRESA PJ','NF/RPA','STATUS','FOLHA','ACIONAMENTO','FORMALIZAÇÃO DO VÍNCULO APTO OU INAPTO','OBSERVAÇÕES','E-MAILS PARA PEDIDO NOTA','CONTATO MÉDICO','COD. EMP','TIPO DO PAGAMENTO','EMPRESA PAGADORA']];
  F.rows.forEach(r=>cons.push([num(r.crm)||r.crm,r.nome,r.horas,r.total,r.pn,r.aReceber,r.ret||null,r.taxa,r.liq,r.vinculo,r.empresa,r.cpfConta,r.empresaPJ||0,null,null,1,'Acionar',r.formalizacao,r.obs,r.email,r.contato,num(r.codEmpresa)||r.codEmpresa,r.tipoPag,r.razaoEmpresa]));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(cons),'Consolidada');
  const sk=[['Cod Empresa Pagadora','CPF/CNPJ','Tipo Pagamento/Natureza','VLR. LCTO','TAXA SOCIO','VALOR LIQUIDO','C.Resultado','Dt. Vcto','Cód Reduzido Contrato ','Número Documento']];
  F.rows.forEach(r=>sk.push([num(r.codEmpresa)||r.codEmpresa,r.cpfConta,num(r.natureza)||r.natureza,r.liq,0,r.liq,num(ct.centroResultado)||ct.centroResultado,dateCell(F.dataVcto),F.codReduzido,F.numeroDoc]));
  const ws3=XLSX.utils.aoa_to_sheet(sk,{cellDates:true}); ws3['!cols']=[{wch:12},{wch:18},{wch:12},{wch:14},{wch:10},{wch:14},{wch:12},{wch:12},{wch:14},{wch:14}];
  XLSX.utils.book_append_sheet(wb,ws3,'Exemplo para importação Sankhya');
  return wb;
}

/* ================= AÇÕES ================= */
async function excluirFechamento(f,motivo){
  const ct=ctById(f.contratoId)||{}; const c=calcular(f,ct); const em=nowISO();
  // registro permanente da exclusão (gravado antes de apagar)
  const reg={tipo:'exclusao_fechamento',fechamentoId:f.id,contratoId:f.contratoId,contrato:(ct.sigla||'')+' — '+(ct.nome||''),competencia:f.competencia,status:(STATUS[statusDe(f)]||[''])[0],
    arquivo:f.arquivo||'',faturamento:c.totais.totFat,pagamento:c.totais.totPag,horasApuradas:c.totais.apur,nfEmitida:!!(f.penf&&f.penf.emitidaEm),folhaGerada:!!(f.folha&&f.folha.geradaEm),motivo,por:S.uid,em};
  const aid=em.replace(/[^0-9]/g,'')+'_'+Math.random().toString(36).slice(2,8);
  await wr('auditoria/'+aid,()=>S.db.doc('auditoria/'+aid).set(reg));
  for(let i=0;i<(f.chunks||0);i++){ const p='plantoes/'+f.id+'_'+i; await wr(p,()=>S.db.doc(p).delete()); }
  if(f.aprovadoEm||f.status==='aprovado'||f.status==='concluido'){ await wr('congelados/'+f.id,()=>S.db.doc('congelados/'+f.id).delete()); await wr('folhas/'+f.id,()=>S.db.doc('folhas/'+f.id).delete()); }
  await wr('fechamentos/'+f.id,()=>fechRef(f.id).delete());
  if(S.fid===f.id){ S.v='fech'; S.fid=null; }
  toast('Fechamento excluído e registrado.'); render();
}
function pedirExclusao(f){
  if(!f) return; const ct=ctById(f.contratoId)||{}; const c=calcular(f,ct); const L=lock(f);
  confirmar('Excluir o fechamento '+(ct.sigla||'')+' — '+compTxt(f.competencia)+'?',
    'Remove a importação, conferência, ajustes e observações desta competência ('+fH(c.totais.apur)+' h apuradas, faturamento '+brl(c.totais.totFat)+').'+(L?' Este fechamento já foi aprovado'+((f.penf&&f.penf.emitidaEm)?', com pedido de NF emitido':'')+((f.folha&&f.folha.geradaEm)?' e folha gerada':'')+'.':'')+' A exclusão não pode ser desfeita e fica no registro de exclusões.',
    'Excluir fechamento',mot=>excluirFechamento(f,mot).catch(e=>toast(errMsg(e),'bad')),true,true);
}
function confirmar(title,text,ok,fn,danger,motivo){ S.modal={type:'confirm',title,text,ok,fn,danger,motivo}; render(); if(motivo) setTimeout(()=>{ const el=$('#cfMot'); if(el) el.focus(); },0); }
const ACT={
  async logout(){ if(window.__logout) await window.__logout(); },
  trocarSenha(){ if(window.__trocarSenha) window.__trocarSenha(); },
  copiarSenha(){ const m=S.modal; const t='Sistema de Faturamento Médico\nEndereço: '+location.origin+'\nE-mail: '+m.email+'\nSenha temporária: '+m.senha; try{ navigator.clipboard.writeText(t).then(()=>toast('Dados copiados.'),()=>toast('Não foi possível copiar; selecione o texto.','bad')); }catch(e){ toast('Não foi possível copiar; selecione o texto.','bad'); } },
  resetSenha(el){ const id=el.dataset.id; const p=S.prof[id]||{}; confirmar('Redefinir a senha de '+(p.name||'este usuário')+'?','Uma nova senha temporária será gerada e a senha atual deixa de funcionar.','Redefinir',async()=>{ try{ const r=await window.__contas.redefinir(id); S.modal={type:'senha',title:'Senha redefinida',nome:p.name||'',email:p.email||'',senha:r.senha}; render(); }catch(e){ toast(e.message,'bad'); } }); },
  nav(el){ S.v=el.dataset.v; if(el.dataset.ct) S.medCt=el.dataset.ct; S.modal=null; window.scrollTo(0,0); render(); },
  ovl(el,e){ if(e.target===el){ S.modal=null; render(); } },
  modalClose(){ S.modal=null; render(); },
  confirmOk(){ const m=S.modal; if(!m) return; let mot='';
    if(m.motivo){ const el=$('#cfMot'); mot=(el&&el.value||'').trim(); if(mot.length<5){ toast('Escreva o motivo (pelo menos 5 caracteres).','bad'); m.motivoTxt=mot; return; } }
    const fn=m.fn; S.modal=null; render(); fn&&fn(mot); },
  openFech(el){ S.fid=el.dataset.id; S.v='fechDet'; S.tab='conf'; S.conf.open={}; S.devolver=''; window.scrollTo(0,0); render(); },
  novoFech(){ S.modal={type:'novo'}; render(); },
  async criarFech(){ const m=S.modal; const ct=ctById(m.ct); if(!ct||!m.parsed||!m.comp) return; S.busy=true; render();
    try{ const id=await importarPara(ct,m.comp,m.parsed,m.nome); S.modal=null; S.fid=id; S.v='fechDet'; S.tab='conf'; toast('Relatório importado. Confira as linhas.'); }
    catch(e){ m.erro=errMsg(e); } S.busy=false; render(); },
  tab(el){ S.tab=el.dataset.tab; render(); },
  confModo(el){ S.conf.modo=el.dataset.m; render(); },
  expand(el){ const k=el.dataset.key; S.conf.open[k]=!S.conf.open[k]; const f=fechById(S.fid); if(S.conf.open[k]&&f) carregarPlantoes(f); render(); },
  confTodos(){ const f=fechById(S.fid); const ct=ctById(f.contratoId); const c=calcular(f,ct); const conf={}; c.linhas.forEach(l=>conf[l.key]=true);
    updFech(f.id,{conferidos:conf,eventos:evento(f,'conf','Todas as '+c.linhas.length+' linhas marcadas como conferidas')}); },
  enviarAprov(){ const f=fechById(S.fid); updFech(f.id,{status:'aguardando',enviadoPor:S.uid,devolucao:null,t:{...f.t,enviado:nowISO()},eventos:evento(f,'envio','Enviado para aprovação')}); toast('Enviado para aprovação.'); },
  aprovar(){ const f=fechById(S.fid); const ct=ctById(f.contratoId);
    confirmar('Aprovar e travar o fechamento?','O relatório fica travado e o resumo de faturamento e pagamento é emitido com os valores atuais. Depois disso, só quem tem permissão de reabrir pode alterar.','Aprovar e travar',()=>{
      const calc=calcular({...f,congelado:null},ct); const em=nowISO();
      wr('congelados/'+f.id,()=>S.db.doc('congelados/'+f.id).set({calc,itens:ct.itens||[],em}));
      updFech(f.id,{status:'aprovado',aprovadoPor:S.uid,aprovadoEm:em,t:{...f.t,aprovado:em},eventos:evento(f,'aprov','Aprovado e travado. Faturamento '+brl(calc.totais.totFat)+' · Pagamento '+brl(calc.totais.totPag)+' · Margem '+brl(calc.totais.margem))});
      S.tab='resumo'; toast('Fechamento aprovado e travado.'); }); },
  devolver(){ const f=fechById(S.fid); const mot=(S.devolver||'').trim(); if(!mot){ toast('Escreva o motivo da devolução.','bad'); return; }
    updFech(f.id,{status:'conferencia',devolucao:{motivo:mot,por:S.uid,em:nowISO()},eventos:evento(f,'dev','Devolvido para conferência: '+mot)}); S.devolver=''; toast('Devolvido para conferência.'); },
  reabrir(){ const f=fechById(S.fid); confirmar('Reabrir o fechamento?','O relatório volta para conferência. O pedido de NF e a folha já emitidos são descartados e precisarão ser gerados de novo.','Reabrir',()=>{
      wr('congelados/'+f.id,()=>S.db.doc('congelados/'+f.id).delete()); wr('folhas/'+f.id,()=>S.db.doc('folhas/'+f.id).delete());
      updFech(f.id,{status:'conferencia',aprovadoEm:null,penf:null,folhaInfo:null,t:{...f.t,enviado:null,aprovado:null,nf:null,folha:null},eventos:evento(f,'reab','Fechamento reaberto (aprovação, NF e folha anteriores descartadas)')}); S.tab='conf'; },true); },
  excluirFech(){ pedirExclusao(fechById(S.fid)); },
  excluirFechLista(el){ pedirExclusao(fechById(el.dataset.id)); },
  excluirLinha(el){ const f=fechById(S.fid); const ct=ctById(f.contratoId); const l=calcular(f,ct).linhas.find(x=>x.key===el.dataset.key); if(!l) return;
    confirmar('Excluir esta linha do fechamento?',l.nome+' — '+l.esp+' · '+l.tipo+': '+fH(l.apur)+' h apuradas, pagamento '+brl(l.totPag)+', faturamento '+brl(l.totFat)+'. A linha sai dos totais, da NF e da folha deste mês e pode ser restaurada enquanto o fechamento não for aprovado.','Excluir linha',mot=>{
      const reg={nome:l.nome,crm:l.crm,esp:l.esp,tipo:l.tipo,apur:l.apur,totPag:l.totPag,totFat:l.totFat,motivo:mot,por:S.uid,em:nowISO()};
      updFech(f.id,{excluidos:{[l.key]:reg},eventos:evento(f,'excl','Linha excluída: '+l.nome+' ('+l.esp+' · '+l.tipo+', '+fH(l.apur)+' h, '+brl(l.totPag)+'). Motivo: '+mot)}); toast('Linha excluída.'); },true,true); },
  restaurarLinha(el){ const f=fechById(S.fid); const k=el.dataset.key; const v=(f.excluidos||{})[k]||{};
    updFech(f.id,{excluidos:{[k]:null},eventos:evento(f,'rest','Linha restaurada: '+(v.nome||k)+' ('+(v.esp||'')+' · '+(v.tipo||'')+')')}); toast('Linha restaurada.'); },
  penfReset(){ const f=fechById(S.fid); updFech(f.id,{penfRasc:null}); },
  emitirNF(){ const f=fechById(S.fid); const ct=ctById(f.contratoId); const c=calcular(f,ct); const P=penfDados(f,ct,c);
    confirmar('Emitir o pedido de NF?','Valor total '+brl(P.valor)+'. O pedido fica registrado e a planilha PENF é oferecida para download.','Emitir pedido',async()=>{
      const penf={...P,emitidaEm:nowISO(),emitidaPor:S.uid};
      const t={...f.t,nf:penf.emitidaEm}; const patch={penf,t,eventos:evento(f,'nf','Pedido de NF emitido: '+brl(P.valor))};
      if(f.folha&&f.folha.geradaEm) patch.status='concluido';
      await updFech(f.id,patch); salvarArquivo('PENF_'+(ct.sigla||'')+'_'+f.competencia.replace('-','')+'.xlsx',wbPENF(penf,ct,f)); }); },
  baixarPENF(){ const f=fechById(S.fid); const ct=ctById(f.contratoId); const c=calcular(f,ct); salvarArquivo('PENF_'+(ct.sigla||'')+'_'+f.competencia.replace('-','')+'.xlsx',wbPENF(penfDados(f,ct,c),ct,f)); },
  baixarResumo(){ const f=fechById(S.fid); const ct=ctById(f.contratoId); salvarArquivo('Resumo_'+(ct.sigla||'')+'_'+f.competencia.replace('-','')+'.xlsx',wbResumo(f,ct,calcular(f,ct))); },
  gerarFolha(){ const f=fechById(S.fid); const ct=ctById(f.contratoId); const c=calcular(f,ct); const F=folhaAtual(f,ct,c);
    const bad=F.rows.filter(r=>r.alertas.some(a=>a.c==='bad')).length;
    confirmar('Gerar a folha de pagamento?',(bad?bad+' médico(s) com pendência de cadastro. ':'')+F.rows.length+' médicos · líquido total '+brl(F.tot.liq)+'. A folha fica registrada e a planilha de importação do ERP é oferecida para download.','Gerar folha',async()=>{
      const folha={rows:F.rows,tot:F.tot,dataVcto:F.dataVcto,responsavel:F.responsavel,numeroDoc:F.numeroDoc,codReduzido:F.codReduzido,geradaEm:nowISO(),geradaPor:S.uid};
      await wr('folhas/'+f.id,()=>S.db.doc('folhas/'+f.id).set(folha));
      const patch={folhaInfo:{geradaEm:folha.geradaEm,geradaPor:folha.geradaPor},t:{...f.t,folha:folha.geradaEm},eventos:evento(f,'folha','Folha gerada: '+F.rows.length+' médicos, líquido '+brl(F.tot.liq))};
      if(f.penf&&f.penf.emitidaEm) patch.status='concluido';
      await updFech(f.id,patch); salvarArquivo('Folha_Importacao_'+(ct.sigla||'')+'_'+f.competencia.replace('-','')+'.xlsx',wbFolha(folha,ct,f)); }); },
  baixarFolha(){ const f=fechById(S.fid); if(f.folha&&f.folha.geradaEm&&!f.folha.rows) return; const ct=ctById(f.contratoId); const F=folhaAtual(f,ct,calcular(f,ct)); salvarArquivo('Folha_Importacao_'+(ct.sigla||'')+'_'+f.competencia.replace('-','')+'.xlsx',wbFolha(F,ct,f)); },
  salvarObs(){ const f=fechById(S.fid); const tx=S.obsDraft[f.id]; if(tx==null) return; const o=f.obs||{}; const h=(o.historico||[]).slice(-199); const em=nowISO(); h.push({texto:tx,por:S.uid,em});
    updFech(f.id,{obs:{texto:tx,por:S.uid,em,historico:h},eventos:evento(f,'obs','Observação registrada')}).then(()=>{ delete S.obsDraft[f.id]; render(); }); toast('Observação salva.'); },
  novoCt(){ S.draft=novoContrato(); S.v='ctEd'; render(); },
  editCt(el){ S.draft=JSON.parse(JSON.stringify(ctById(el.dataset.id))); ['itens','diferenciados','mapeamento'].forEach(k=>S.draft[k]=S.draft[k]||[]); S.v='ctEd'; render(); },
  addItem(){ S.draft.itens.push({id:uidGen('i'),especialidade:'',tipo:'',unidadePag:'hora',unidadeFat:'hora',qtdMes:0,valorFaturar:0,valorPagar:0,fontePag:'cadastro'}); render(); },
  rmItem(el){ S.draft.itens.splice(+el.dataset.i,1); render(); },
  addDif(){ S.draft.diferenciados.push({crm:'',nome:'',item:'',valorPagar:0}); render(); },
  rmDif(el){ S.draft.diferenciados.splice(+el.dataset.i,1); render(); },
  rmMap(el){ S.draft.mapeamento.splice(+el.dataset.i,1); render(); },
  async salvarCt(){ const d=S.draft; if(!d.sigla||!d.nome){ toast('Preencha a sigla do CR e o nome do contrato.','bad'); return; }
    const id=d.id||safeKey(d.sigla+'_'+(d.numero||uidGen())).toUpperCase(); const body={...d}; delete body.id; body.atualizadoEm=nowISO(); body.atualizadoPor=S.uid;
    await wr('contratos/'+id,()=>S.db.doc('contratos/'+id).set(body)); S.draft={...d,id}; toast('Contrato salvo.'); S.v='ct'; render(); },
  async addUser(el){ const id=el.dataset.id; if(S.usuarios.some(u=>u.id===id)){ toast('Este usuário já está cadastrado.'); return; }
    await wr('usuarios/'+id,()=>S.db.doc('usuarios/'+id).set({perfil:'consulta',perms:{...PERFIS.consulta.perms},ativo:true,criadoEm:nowISO(),criadoPor:S.uid})); S.userHits=[]; const i=$('#uSearch'); if(i) i.value=''; render(); toast('Usuário incluído com perfil Consulta.'); },
  rmUser(el){ const id=el.dataset.id; confirmar('Remover este usuário?','Ele deixa de acessar as telas do sistema.','Remover',()=>wr('usuarios/'+id,()=>S.db.doc('usuarios/'+id).delete()),true); },
  addEmp(){ const e=((S.config&&S.config.empresas)||[]).slice(); e.unshift({sigla:'',razao:'',cod:''}); saveConfig({empresas:e}); },
  rmEmp(el){ const e=((S.config&&S.config.empresas)||[]).slice(); e.splice(+el.dataset.i,1); saveConfig({empresas:e}); }
};
function saveConfig(patch){ return wr('config/geral',()=> S.config&&Object.keys(S.config).length? S.db.doc('config/geral').update(patch) : S.db.doc('config/geral').set(patch)); }

const CHG={
  dash(el){ const f=el.dataset.f; S.dash[f]= el.type==='checkbox'? el.checked : el.value; if(f==='ct') S.dash.comp=''; render(); },
  async fileNovo(el){ const file=el.files[0]; if(!file) return; const m=S.modal; m.erro=''; m.nome=file.name;
    try{ m.parsed=await parseArquivoPega(file); m.comp=compDoPeriodo(m.parsed.periodo)||m.comp||'';
      if(!m.ct){ const locais=new Set(m.parsed.rows.map(r=>setorKey(r))); const hit=(S.contratos||[]).find(c=>(c.mapeamento||[]).some(x=>locais.has(x.s))); if(hit) m.ct=hit.id; } }
    catch(e){ m.parsed=null; m.erro=e.message; } render(); },
  novo(el){ S.modal[el.dataset.f]=el.value; render(); },
  async reimport(el){ const file=el.files[0]; if(!file) return; const f=fechById(S.fid); const ct=ctById(f.contratoId);
    try{ const p=await parseArquivoPega(file); if(p.periodo&&!periodoMeses(p.periodo).includes(f.competencia)) toast('Atenção: o período do relatório ('+p.periodo+') difere da competência.','bad');
      await importarPara(ct,f.competencia,p,file.name); toast('Relatório reimportado.'); }catch(e){ toast(e.message||errMsg(e),'bad'); } },
  mapFech(el){ const f=fechById(S.fid); const ct=ctById(f.contratoId); if(!el.value) return; const mp=(ct.mapeamento||[]).filter(m=>m.s!==el.dataset.s); mp.push({s:el.dataset.s,item:el.value});
    wr('contratos/'+ct.id,()=>S.db.doc('contratos/'+ct.id).update({mapeamento:mp})); updFech(f.id,{eventos:evento(f,'map','Setor "'+el.dataset.s+'" vinculado a '+(el.value==='__ignorar'?'Não faturar':((ct.itens||[]).find(i=>i.id===el.value)||{}).especialidade))}); },
  aj(el){ const f=fechById(S.fid); const k=el.dataset.key, fl=el.dataset.f; const base=num(el.dataset.base); const v=el.value===''?null:num(el.value);
    const cur=(f.ajustes||{})[k]||{}; const novo={...cur,[fl]: (v==null||v===base)? null : v, por:S.uid, em:nowISO()};
    updFech(f.id,{ajustes:{[k]:novo},eventos:evento(f,'aj',(fl==='qPag'?'Qtd a pagar':'Qtd a faturar')+' de '+((f.medicos||{})[k.split('|')[0]]||{}).nome+': '+(v==null||v===base?'volta ao apurado ('+fH(base)+')':fH(base)+' → '+fH(v)))}); },
  ajJust(el){ const f=fechById(S.fid); const k=el.dataset.key; updFech(f.id,{ajustes:{[k]:{just:el.value}}}); },
  conf(el){ const f=fechById(S.fid); updFech(f.id,{conferidos:{[el.dataset.key]:el.checked}}); },
  penf(el){ const f=fechById(S.fid); updFech(f.id,{penfRasc:{[el.dataset.f]:el.value}}); },
  folhaP(el){ const f=fechById(S.fid); updFech(f.id,{folhaParams:{[el.dataset.f]:el.value}}); },
  folhaV(el){ const f=fechById(S.fid); updFech(f.id,{folhaParams:{[el.dataset.f]:{[el.dataset.k]:num(el.value)}}}); },
  ct(el){ const f=el.dataset.f; S.draft[f]= el.dataset.num? num(el.value) : el.value;
    if(f==='sigla'){ const c=((S.config&&S.config.centros)||[]).find(x=>normTxt(x.sigla)===normTxt(el.value)); const d=S.draft;
      if(c){ if(!d.centroResultado) d.centroResultado=String(c.codigo); if(!d.nome) d.nome=c.descricao; if(!d.numero&&c.contrato) d.numero=String(c.contrato); if(!d.ano&&c.ano) d.ano=String(c.ano).startsWith('/')?String(c.ano):'/'+c.ano; if(!d.empresa&&c.empresa){ d.empresa=c.empresa; const e=((S.config&&S.config.empresas)||[]).find(x=>normTxt(x.sigla)===normTxt(c.empresa)); if(e&&!d.codEmpresaPagadora) d.codEmpresaPagadora=e.cod; } } }
    if(f==='empresa'){ const e=((S.config&&S.config.empresas)||[]).find(x=>normTxt(x.sigla)===normTxt(el.value)); if(e&&!S.draft.codEmpresaPagadora) S.draft.codEmpresaPagadora=e.cod; } render(); },
  ctChk(el){ S.draft[el.dataset.f]=el.checked; },
  it(el){ const it=S.draft.itens[+el.dataset.i]; const f=el.dataset.f; it[f]= ['qtdMes','valorFaturar','valorPagar'].includes(f)? num(el.value) : el.value; render(); },
  dif(el){ const x=S.draft.diferenciados[+el.dataset.i]; const f=el.dataset.f; x[f]= f==='valorPagar'? num(el.value) : el.value; },
  ctMap(el){ S.draft.mapeamento[+el.dataset.i].item=el.value; },
  medCt(el){ S.medCt=el.value; render(); },
  med(el){ const ct=S.medCt; const k=el.dataset.k; wr('medicos/'+ct,()=>S.db.doc('medicos/'+ct).update({lista:{[k]:{[el.dataset.f]:el.value.trim()}}})); },
  medChk(el){ const ct=S.medCt; const k=el.dataset.k; wr('medicos/'+ct,()=>S.db.doc('medicos/'+ct).update({lista:{[k]:{ativo:el.checked}}})); },
  async importBase(el){ const file=el.files[0]; if(!file) return; const ct=ctById(S.medCt); try{ const n=await importarBaseMedicos(file,ct); toast(n+' médico(s) atualizados a partir da planilha.'); }catch(e){ toast(e.message||errMsg(e),'bad'); } },
  uPerfil(el){ const id=el.dataset.id; const p=el.value; const patch={perfil:p}; if(PERFIS[p]){ const perms={}; PERMS.forEach(([k])=>perms[k]=!!PERFIS[p].perms[k]); patch.perms=perms; } wr('usuarios/'+id,()=>S.db.doc('usuarios/'+id).update(patch)); },
  uPerm(el){ const id=el.dataset.id; wr('usuarios/'+id,()=>S.db.doc('usuarios/'+id).update({perfil:'custom',perms:{[el.dataset.p]:el.checked}})); },
  uAtivo(el){ const id=el.dataset.id; wr('usuarios/'+id,()=>S.db.doc('usuarios/'+id).update({ativo:el.checked})); },
  emp(el){ const e=((S.config&&S.config.empresas)||[]).map(x=>({...x})); const f=el.dataset.f; e[+el.dataset.i][f]= f==='cod'? num(el.value) : el.value; saveConfig({empresas:e}); },
  nat(el){ saveConfig({naturezas:{[el.dataset.f]:num(el.value)}}); }
};
let searchT;
const INP={
  confQ(el){ S.conf.q=el.value; render(); },
  medQ(el){ S.medQ=el.value; render(); },
  devolver(el){ S.devolver=el.value; },
  obs(el){ S.obsDraft[S.fid]=el.value; const b=document.querySelector('[data-act="salvarObs"]'); if(b){ const f=fechById(S.fid); b.disabled= el.value===((f.obs&&f.obs.texto)||''); } },
  uSearch(el){ if(!S.U) return; const q=el.value; S.U.search(q).then(h=>{ S.userHits=q? h.filter(x=>!S.usuarios.some(u=>u.id===x.id)) : []; render(); }); }
};
document.addEventListener('click',e=>{ const el=e.target.closest('[data-act]'); if(!el||el.disabled) return; const fn=ACT[el.dataset.act]; if(fn) fn(el,e); });
document.addEventListener('change',e=>{ const el=e.target.closest('[data-chg]'); if(!el) return; const fn=CHG[el.dataset.chg]; if(fn) fn(el,e); });
document.addEventListener('input',e=>{ const el=e.target.closest('[data-inp]'); if(!el) return; const fn=INP[el.dataset.inp]; if(fn) fn(el,e); });
document.addEventListener('submit',async e=>{ const f=e.target.closest('form[data-sub="criarConta"]'); if(!f) return; e.preventDefault(); if(S.busy) return;
  const nome=$('#ncNome').value.trim(), email=$('#ncEmail').value.trim(), perfil=$('#ncPerfil').value;
  if(!nome||!/^\S+@\S+\.\S+$/.test(email)){ toast('Informe nome e e-mail válidos.','bad'); return; }
  S.busy=true; render();
  try{ const r=await window.__contas.criar({nome,email}); const perms={}; PERMS.forEach(([k])=>perms[k]=!!PERFIS[perfil].perms[k]);
    await wr('usuarios/'+r.id,()=>S.db.doc('usuarios/'+r.id).set({perfil,perms,ativo:true,criadoEm:nowISO(),criadoPor:S.uid}));
    S.prof[r.id]={id:r.id,name:r.name,email:r.email,avatarUrl:''}; S.modal={type:'senha',title:'Conta criada',nome:r.name,email:r.email,senha:r.senha};
    $('#ncNome').value=''; $('#ncEmail').value=''; }
  catch(err){ toast(err.message||errMsg(err),'bad'); }
  S.busy=false; render(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&S.modal){ S.modal=null; render(); } });
setInterval(()=>{ if(S.v==='fechDet'||S.v==='fech'){ const a=document.activeElement; if(!a||a===document.body) render(); } },60000);
boot();
