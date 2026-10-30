import {UNIDADES, VINCULOS, TIPO_PAG, NATUREZAS_PADRAO, normTxt, num, r2, r4, crmKey, crmDigits, safeKey, cellStr, parsePega, periodoMeses, compDoPeriodo, setorKey, agregar, sugerirItem, baseQtd, tabelasDoContrato, tabelaVigente, itensVigentes, itensUniao, diffValores, calcular, mmYY, ultimoDiaMesSeguinte, numeroDocumento, codReduzido, calcFolha, IMPOSTOS_FAT, aliquotasContrato, impostosFat, retencoesNF, RETENCOES_PADRAO, brl, qtdTxt, periodoTxt, descricaoNF, classeDia, cobreClasse, rotuloSetor, separaSetor, BASES_ESCALA, BASES_FAT, VINC_NF, VINC_FOLHA, fimMes, normVig, refData, datasPeriodo, refFech, inicioFech, diffTabela, empresaPrincipal, aliqDe, fiscalContrato, aliqPara, impostosCalc, FOLHA_VINC, vinculoDaLinha, vinculosNaFolha} from './core.js';

/* ============================================================
   APP
   ============================================================ */
const PERMS=[
  ['dashboard','Ver dashboard gerencial (faturamento, pagamento, margem e glosas)','Dashboard'],
  ['fechamentos','Ver fechamentos','Fechamentos'],['importar','Importar e reimportar o relatório do Pega Plantão','Fechamentos'],['baixar_detalhe','Baixar o detalhamento do Pega Plantão (.xlsx)','Fechamentos'],
  ['vincular_setor','Vincular setores do Pega Plantão aos itens do contrato','Fechamentos'],['meta','Escolher a meta do fechamento','Fechamentos'],['ajustar','Ajustar quantidades a pagar e a faturar','Fechamentos'],
  ['conferir','Conferir linhas (individual e em lote)','Fechamentos'],['excluir_linha','Excluir e restaurar linhas de médico','Fechamentos'],['enviar_aprov','Enviar para aprovação','Fechamentos'],
  ['aprovar','Aprovar e travar o fechamento','Fechamentos'],['devolver','Devolver o fechamento para conferência','Fechamentos'],['reabrir','Reabrir fechamento aprovado','Fechamentos'],
  ['excluir','Excluir fechamento inteiro','Fechamentos'],['baixar_resumo','Baixar o resumo de faturamento e pagamento (.xlsx)','Fechamentos'],['observacoes','Registrar observações','Fechamentos'],
  ['glosa','Registrar glosas','Pedido de NF'],['emitir_nf','Emitir pedido de NF','Pedido de NF'],['baixar_penf','Baixar a planilha PENF (.xlsx)','Pedido de NF'],
  ['folha_editar','Ajustar a folha (incluir, editar e excluir médico; desconto PN e retenções)','Folha de pagamento'],['aprovar_prolabore','Aprovar pró-labore (Departamento Pessoal)','Folha de pagamento'],
  ['gerar_folha','Gerar a folha de pagamento','Folha de pagamento'],['baixar_folha','Baixar a planilha de importação do ERP (.xlsx)','Folha de pagamento'],['emails','Enviar e-mails aos médicos (demonstrativo e solicitação de NF)','Folha de pagamento'],
  ['contratos','Cadastrar contratos e editar dados gerais, vínculos e setores','Contratos'],['valores','Alterar valores, metas, tabelas (reajuste/aditivo) e valores diferenciados','Contratos'],['fiscal','Editar dados de NF (PENF), empresas de faturamento e impostos','Contratos'],
  ['medicos','Incluir e editar médicos','Médicos'],['medicos_excluir','Excluir médicos da base','Médicos'],['medicos_importar','Importar a planilha da base de médicos','Médicos'],
  ['admin','Administrar usuários, permissões e parâmetros','Administração']];
const GRUPOS_PERM=[...new Set(PERMS.map(p=>p[2]))];
/** Permissões novas herdam a permissão antiga de onde saíram (usuários já cadastrados não perdem acesso). */
const PERM_PAI={ajustar:'conferir',vincular_setor:'conferir',meta:'conferir',enviar_aprov:'conferir',excluir_linha:'excluir',devolver:'aprovar',
  baixar_detalhe:'fechamentos',baixar_resumo:'fechamentos',baixar_penf:'fechamentos',baixar_folha:'fechamentos',glosa:'emitir_nf',folha_editar:'gerar_folha',
  valores:'contratos',medicos_excluir:'medicos',medicos_importar:'medicos'};
function permDe(perms,p){ perms=perms||{}; if(perms[p]!==undefined&&perms[p]!==null) return !!perms[p]; const pai=PERM_PAI[p]; return pai? !!perms[pai] : false; }
const expPerm=o=>{ const r={}; PERMS.forEach(([k])=>{ if(permDe(o,k)) r[k]=1; }); return r; };
const ALL=Object.fromEntries(PERMS.map(p=>[p[0],true]));
const PERFIS={
  admin:{label:'Administrador',perms:ALL},
  faturamento:{label:'Faturamento',perms:expPerm({dashboard:1,fechamentos:1,importar:1,conferir:1,emitir_nf:1,observacoes:1,contratos:1,medicos:1,excluir:1,emails:1})},
  aprovador:{label:'Aprovador',perms:expPerm({dashboard:1,fechamentos:1,aprovar:1,observacoes:1})},
  folha:{label:'Folha / Financeiro',perms:expPerm({dashboard:1,fechamentos:1,gerar_folha:1,medicos:1,observacoes:1,emails:1})},
  fiscal:{label:'Fiscal',perms:expPerm({dashboard:1,fechamentos:1,fiscal:1,observacoes:1})},
  dp:{label:'Departamento Pessoal',perms:expPerm({dashboard:1,fechamentos:1,aprovar_prolabore:1,medicos:1,observacoes:1})},
  consulta:{label:'Consulta',perms:expPerm({dashboard:1,fechamentos:1})}
};
const STATUS={conferencia:['Em conferência','p-info'],aguardando:['Aguardando aprovação','p-warn'],aprovado:['Aprovado · travado','p-acc'],concluido:['Concluído','p-ok']};
const AREAS_RESP=['Gestão de Escala','Faturamento','Fiscal','Departamento Pessoal','Financeiro'];
const pk=sg=>sg||'_';
const vincFolha=d=>Array.isArray(d.vinculosFolha)&&d.vinculosFolha.length? d.vinculosFolha : VINC_FOLHA.map(x=>x[0]);
const MESES=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

const S={boot:'loading',db:null,U:null,DL:null,me:null,owner:false,uid:null,
  contratos:null,auditoria:[],metaOpen:{},fechs:null,fechsRaw:null,cong:{},folhas:{},usuarios:[],config:null,medicos:{},prof:{},
  v:'dash',fid:null,tab:'conf',modal:null,toast:null,draft:null,
  dash:{ct:'',comp:'',andamento:false},conf:{modo:'medico',q:'',open:{},sel:{}},medCt:'',medQ:'',shifts:{},userHits:[],busy:false,obsDraft:{},devolver:''};

const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fN=(n,d=2)=>(n==null||isNaN(n))?'—':Number(n).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const fH=n=>(n==null||isNaN(n))?'—':Number(n).toLocaleString('pt-BR',{maximumFractionDigits:2});
const dec=v=>(v==null||v==='')?'':String(v).replace('.',',');
const fPct=n=>(n==null||isNaN(n)||!isFinite(n))?'—':(n*100).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
const fDT=iso=>{ if(!iso) return '—'; const d=new Date(iso); return d.toLocaleDateString('pt-BR')+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); };
const fD=iso=>{ if(!iso) return '—'; const [y,m,d]=String(iso).slice(0,10).split('-'); return d+'/'+m+'/'+y; };
const compTxt=c=>{ if(!c) return '—'; if(/^\d{4}-\d{2}-\d{2}/.test(c)) return fD(c); const [y,m]=c.split('-'); return MESES[+m-1]+'/'+y; };
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
function can(p){ if(S.owner) return true; const u=meuUsuario(); return !!(u&&u.ativo!==false&&permDe(u.perms,p)); }
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
function aliqDoFech(f,ct){ return (f.congelado&&f.congelado.impostos)||fiscalContrato(ct); }
function dashData(){
  const d=S.dash; const fs=(S.fechs||[]).filter(f=>(!d.ct||f.contratoId===d.ct)&&(!d.comp||f.competencia===d.comp)&&(d.andamento||lock(f)));
  const multi=new Set(fs.map(f=>f.contratoId)).size>1;
  const rows={}; const tot={fat:0,pag:0,plan:0,real:0,apur:0,contr:0,imp:0}; const porComp={};
  for(const f of fs){
    const ct=ctById(f.contratoId); if(!ct) continue;
    const c=calcular(f,ct); const aliq=aliqDoFech(f,ct);
    for(const p of c.porItem){
      const key=f.contratoId+'|'+p.itemId;
      const r=rows[key]||(rows[key]={label:(multi?(ct.sigla||'')+' · ':'')+p.esp+' — '+p.tipo,sigla:ct.sigla,esp:p.esp,tipo:p.tipo,contr:0,plan:0,real:0,apur:0,fat:0,pag:0,imp:0});
      r.contr+=p.contratado; r.plan+=p.plan; r.real+=p.real; r.apur+=p.apur; r.fat+=p.totFat; r.pag+=p.totPag; r.imp+=impostosFat(p.totFat,aliqPara(aliq,p.empresaFat)).total;
    }
    tot.fat+=c.totais.totFat; tot.imp+=impostosCalc(c,aliq).total; tot.pag+=c.totais.totPag; tot.plan+=c.totais.plan; tot.real+=c.totais.real; tot.apur+=c.totais.apur;
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
  const kpis='<div class="kpis k4">'+
    '<div class="kpi fat"><span class="eyebrow">Faturamento total</span><span class="v">'+brl(D.tot.fat)+'</span><span class="s">'+D.fs.length+' fechamento(s)</span></div>'+
    '<div class="kpi fat"><span class="eyebrow">Faturamento líquido</span><span class="v">'+brl(D.tot.fat-D.tot.imp)+'</span><span class="s">'+(D.tot.imp?'Impostos '+brl(D.tot.imp)+' ('+fPct(D.tot.fat?D.tot.imp/D.tot.fat:null)+' do bruto)':'Sem impostos cadastrados nos contratos')+'</span></div>'+
    '<div class="kpi pag"><span class="eyebrow">Pagamento total</span><span class="v">'+brl(D.tot.pag)+'</span><span class="s">Repasse aos médicos</span></div>'+
    '<div class="kpi"><span class="eyebrow">% pagamento / faturamento</span><span class="v">'+fPct(pct)+'</span><span class="s">Margem operacional '+brl(D.tot.fat-D.tot.pag)+'</span></div>'+
    '<div class="kpi"><span class="eyebrow">Saldo remanescente</span><span class="v">'+(D.global?brl(D.saldo):'—')+'</span><span class="s">'+(D.global?'de '+brl(D.global)+' do valor global'+(D.hGlobal?' · '+fH(D.hSaldo)+' h de '+fH(D.hGlobal):''):'Cadastre o valor global no contrato')+'</span></div>'+
    '<div class="kpi"><span class="eyebrow">Horas (plan. / real. / apur.)</span><span class="v">'+fH(D.tot.apur)+' h</span><span class="s">'+fH(D.tot.plan)+' planejadas · '+fH(D.tot.real)+' realizadas</span></div>'+
    '<div class="kpi"><span class="eyebrow">Tempo de fechamento</span><span class="v">'+tempoTxt+'</span><span class="s">'+tempoSub+'</span></div></div>';
  const h1=Math.max(160,D.lista.length*34+50);
  const charts='<div class="grid g2"><div class="card"><h3>Faturamento × pagamento por especialidade e tipo/local</h3><div class="leg"><span><i class="sw" style="background:var(--accent)"></i>Faturamento</span><span><i class="sw" style="background:var(--pay)"></i>Pagamento</span></div><div class="chart" style="height:'+h1+'px"><canvas id="cFat" role="img" aria-label="Faturamento e pagamento por especialidade e tipo"></canvas></div></div>'+
    '<div class="card"><h3>Horas planejadas, realizadas e apuradas</h3><div class="leg"><span><i class="sw" style="background:var(--plan)"></i>Planejadas</span><span><i class="sw" style="background:var(--real)"></i>Realizadas</span><span><i class="sw" style="background:var(--accent)"></i>Apuradas</span></div><div class="chart" style="height:'+h1+'px"><canvas id="cHor" role="img" aria-label="Horas por especialidade e tipo"></canvas></div></div></div>';
  const trend=Object.keys(D.porComp).length>1? '<div class="card"><h3>Evolução por competência</h3><div class="leg"><span><i class="sw" style="background:var(--accent)"></i>Faturamento</span><span><i class="sw" style="background:var(--pay)"></i>Pagamento</span><span><i class="sw" style="background:var(--fg)"></i>% pagamento/faturamento</span></div><div class="chart" style="height:260px"><canvas id="cTr" role="img" aria-label="Evolução mensal"></canvas></div></div>':'';
  const tbl='<div class="card"><h3>Detalhe por especialidade e tipo/local</h3><div class="tbl" data-keep="dtbl"><table><thead><tr><th>Especialidade</th><th>Tipo / local</th><th class="n">Contratado</th><th class="n">Planejadas</th><th class="n">Realizadas</th><th class="n">Apuradas</th><th class="n">Faturamento</th><th class="n">Impostos</th><th class="n">Fat. líquido</th><th class="n">Pagamento</th><th class="n">% pag/fat</th><th class="n">Margem</th></tr></thead><tbody>'+
    D.lista.map(r=>'<tr><td>'+esc((D.multi?r.sigla+' · ':'')+r.esp)+'</td><td>'+esc(r.tipo)+'</td><td class="n">'+fH(r.contr)+'</td><td class="n">'+fH(r.plan)+'</td><td class="n">'+fH(r.real)+'</td><td class="n">'+fH(r.apur)+'</td><td class="n">'+brl(r.fat)+'</td><td class="n">'+brl(r.imp)+'</td><td class="n">'+brl(r.fat-r.imp)+'</td><td class="n">'+brl(r.pag)+'</td><td class="n">'+fPct(r.fat?r.pag/r.fat:null)+'</td><td class="n">'+brl(r.fat-r.pag)+'</td></tr>').join('')+
    '</tbody><tfoot><tr><td colspan="2">Total</td><td class="n">'+fH(D.tot.contr)+'</td><td class="n">'+fH(D.tot.plan)+'</td><td class="n">'+fH(D.tot.real)+'</td><td class="n">'+fH(D.tot.apur)+'</td><td class="n">'+brl(D.tot.fat)+'</td><td class="n">'+brl(D.tot.imp)+'</td><td class="n">'+brl(D.tot.fat-D.tot.imp)+'</td><td class="n">'+brl(D.tot.pag)+'</td><td class="n">'+fPct(pct)+'</td><td class="n">'+brl(D.tot.fat-D.tot.pag)+'</td></tr></tfoot></table></div></div>';
  const lst='<div class="card"><h3>Fechamentos no filtro</h3><div class="tbl"><table><thead><tr><th>Contrato</th><th>Competência</th><th>Status</th><th class="n">Faturamento</th><th class="n">Pagamento</th><th class="n">Tempo de fechamento</th></tr></thead><tbody>'+
    D.fs.sort((a,b)=>b.competencia.localeCompare(a.competencia)).map(f=>{const ct=ctById(f.contratoId)||{}; const c=calcular(f,ct); const t=tempoFech(f); return '<tr><td><button class="btn ghost sm" data-act="openFech" data-id="'+f.id+'">'+esc(ct.sigla||'?')+' — '+esc(ct.nome||'')+'</button></td><td>'+compTxt(f.competencia)+'</td><td>'+pill(statusDe(f))+'</td><td class="n">'+brl(c.totais.totFat)+'</td><td class="n">'+brl(c.totais.totPag)+'</td><td class="n">'+(t?fDur(t.ms)+(t.fim?'':' …'):'—')+'</td></tr>';}).join('')+'</tbody></table></div></div>';
  const GL={}; D.fs.forEach(f=>{ const ct=ctById(f.contratoId)||{}; glosaItens(f).forEach(x=>{ const cr=(x.cr||ct.sigla||'—').trim(); const r=GL[cr]||(GL[cr]={cr,n:0,horas:0,valor:0,pago:0,fechs:new Set()}); r.n++; r.horas+=num(x.horas); r.valor+=num(x.valor); if(x.pagoMedico==='sim') r.pago+=num(x.valor); r.fechs.add(f.id); }); });
  const glR=Object.values(GL).sort((a,b)=>b.valor-a.valor); const glT=glR.reduce((t,r)=>{t.n+=r.n;t.horas+=r.horas;t.valor+=r.valor;t.pago+=r.pago;return t;},{n:0,horas:0,valor:0,pago:0});
  const glos='<div class="card"><h3>Glosas por CR</h3>'+(glR.length?'<div class="tbl"><table><thead><tr><th>CR</th><th class="n">Fechamentos</th><th class="n">Glosas</th><th class="n">Horas glosadas</th><th class="n">Valor glosado</th><th class="n">Glosado com pagamento ao médico</th><th class="n">% do faturamento</th></tr></thead><tbody>'+
    glR.map(r=>'<tr><td class="mono"><b>'+esc(r.cr)+'</b></td><td class="n">'+r.fechs.size+'</td><td class="n">'+r.n+'</td><td class="n">'+fH(r.horas)+'</td><td class="n">'+brl(r.valor)+'</td><td class="n">'+brl(r.pago)+'</td><td class="n">'+fPct(D.tot.fat?r.valor/D.tot.fat:null)+'</td></tr>').join('')+
    '</tbody><tfoot><tr><td colspan="2">Total</td><td class="n">'+glT.n+'</td><td class="n">'+fH(glT.horas)+'</td><td class="n">'+brl(glT.valor)+'</td><td class="n">'+brl(glT.pago)+'</td><td class="n">'+fPct(D.tot.fat?glT.valor/D.tot.fat:null)+'</td></tr></tfoot></table></div><p class="muted" style="font-size:.82rem;margin:8px 0 0">“Glosado com pagamento ao médico” = glosas em que o médico foi pago mesmo assim (perda para a operação).</p>':'<p class="muted" style="margin:0">Nenhuma glosa registrada nos pedidos de NF deste filtro.</p>')+'</div>';
  return head+kpis+charts+trend+tbl+glos+lst;
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
  const L=lock(f), st=statusDe(f); const ed=!L&&can('conferir')&&st==='conferencia'; const emConf=!L&&st==='conferencia'; const edQ=emConf&&can('ajustar');
  let out='';
  if(f.devolucao&&st==='conferencia') out+='<div class="banner warn"><div><b>Devolvido para ajuste</b> por '+esc(nomeDe(f.devolucao.por))+' em '+fDT(f.devolucao.em)+': '+esc(f.devolucao.motivo)+'</div></div>';
  if(L) out+='<div class="banner ok"><div><b>Relatório travado.</b> Aprovado por '+esc(nomeDe(f.aprovadoPor))+' em '+fDT(f.t.aprovado)+'. As quantidades e valores abaixo estão congelados.</div></div>';
  if((f.semCadastro||[]).length&&!L){ const sc=f.semCadastro;
    out+='<div class="card" style="border-color:var(--warn);background:var(--warn-soft)"><b style="color:var(--warn)">'+sc.length+' médico(s) do relatório sem cadastro na base médica — ficaram fora do fechamento</b><div class="muted" style="font-size:.86rem">'+sc.reduce((t,x)=>t+x.n,0)+' plantão(ões), '+fH(sc.reduce((t,x)=>t+x.horas,0))+' h apuradas. Cadastre em Médicos e reimporte o relatório para incluí-los.</div>'+
      '<div class="tbl mc1" style="margin-top:10px;max-height:260px"><table><thead><tr><th>Médico</th><th>CRM</th><th class="n">Plantões</th><th class="n">Horas apuradas</th><th></th></tr></thead><tbody>'+sc.map(x=>'<tr><td>'+esc(x.nome)+'</td><td class="mono">'+esc(x.crm||'sem CRM')+'</td><td class="n">'+x.n+'</td><td class="n">'+fH(x.horas)+'</td><td>'+(can('medicos')&&/\d/.test(x.crm||'')?'<button class="btn sm" data-act="novoMedico" data-ct="'+esc(ct.id)+'" data-crm="'+esc(x.crm)+'" data-nome="'+esc(x.nome)+'">Cadastrar</button>':'')+'</td></tr>').join('')+'</tbody></table></div></div>'; }
  if(c.naoMapeados.length){
    const itens=itensUniao(ct);
    out+='<div class="card" style="border-color:var(--warn)"><h3>Setores do Pega Plantão sem vínculo com o contrato</h3><p class="muted">Escolha a especialidade e tipo do contrato para cada setor, ou marque “Não faturar”. O vínculo fica salvo no contrato para os próximos meses.</p><div class="tbl"><table><thead><tr><th>Local | Setor no Pega Plantão</th><th class="n">Plantões</th><th>Item do contrato</th></tr></thead><tbody>'+
      c.naoMapeados.map((m,i)=>'<tr><td>'+esc(rotuloSetor(m.s))+'</td><td class="n">'+m.n+'</td><td><select id="mp'+i+'" data-chg="mapFech" data-s="'+esc(m.s)+'"'+(can('vincular_setor')&&!L?'':' disabled')+'><option value="">Escolha…</option>'+itens.map(it=>'<option value="'+it.id+'"'+(sugerirItem(separaSetor(m.s)[0],itens,separaSetor(m.s)[1])===it.id?' data-sug="1"':'')+'>'+esc(it.especialidade+' — '+it.tipo)+'</option>').join('')+'<option value="__ignorar">Não faturar (ignorar)</option></select></td></tr>').join('')+
      '</tbody></table></div>'+(itens.length?'':'<p class="muted">O contrato ainda não tem itens. Cadastre especialidades e tipos em Contratos.</p>')+'</div>';
  }
  if(!L){
    // itens com linhas sem valor a pagar ou a faturar (considera o valor que de fato ficou na linha)
    const semIds=new Set(c.linhas.filter(l=>!l.vPag||!l.vFat).map(l=>l.itemId));
    const semV=itensVigentes(ct,refFech(f)).filter(i=>semIds.has(i.id));
    if(semV.length){ const edCt=can('valores');
      out+='<div class="card" style="border-color:var(--warn);background:var(--warn-soft)"><div class="row"><div class="grow"><b style="color:var(--warn)">'+semV.length+' item(ns) do contrato sem valor a pagar ou a faturar</b><div class="muted" style="font-size:.86rem">'+(edCt?'Informe os valores abaixo: eles são gravados no contrato e o fechamento é recalculado na hora.':'Peça a quem cadastra contratos para informar os valores.')+' O relatório do Pega Plantão não trouxe valor/hora para estas linhas.</div></div>'+(edCt?'<button class="btn sm" data-act="editCt" data-id="'+esc(ct.id)+'">Abrir contrato completo</button>':'')+'</div>'+
        '<div class="tbl" style="margin-top:10px"><table><thead><tr><th>Especialidade · tipo/local</th><th>Unidade</th><th class="n">Valor a pagar (R$)</th><th class="n">Valor a faturar (R$)</th></tr></thead><tbody>'+
        semV.map(i=>'<tr><td>'+esc(i.especialidade+' · '+i.tipo)+'</td><td>'+esc(UNIDADES[i.unidadePag||'hora'])+' / '+esc(UNIDADES[i.unidadeFat||'hora'])+'</td>'+
          '<td class="n">'+(edCt?'<input type="text" inputmode="decimal" autocomplete="off" id="iv_p_'+esc(i.id)+'" value="'+dec(num(i.valorPagar)||'')+'" placeholder="0,00" data-chg="itemValor" data-item="'+esc(i.id)+'" data-f="valorPagar">':brl(num(i.valorPagar)))+'</td>'+
          '<td class="n">'+(edCt?'<input type="text" inputmode="decimal" autocomplete="off" id="iv_f_'+esc(i.id)+'" value="'+dec(num(i.valorFaturar)||'')+'" placeholder="0,00" data-chg="itemValor" data-item="'+esc(i.id)+'" data-f="valorFaturar">':brl(num(i.valorFaturar)))+'</td></tr>').join('')+
        '</tbody></table></div></div>'; }
  }
  { const temMetas=itensVigentes(ct,refFech(f)).some(i=>i.metas&&['minima','mediana','maxima'].some(m=>i.metas[m]&&(num(i.metas[m].valorFaturar)||num(i.metas[m].valorPagar))));
    const metaAtual=(L&&f.congelado&&f.congelado.meta!=null)?f.congelado.meta:(f.meta||''); const pode=!L&&can('meta');
    const tbU=(L&&f.congelado&&f.congelado.tabela)||tabelaVigente(ct,refFech(f));
    out+='<div class="card row" style="padding:12px 16px"><div class="grow"><b>Meta do fechamento</b> <span class="tag" title="Tabela de valores do contrato usada nesta competência">Tabela: '+esc(tbU.nome||'original')+(tbU.vigencia?' · desde '+compTxt(tbU.vigencia):'')+'</span>'+(tbU.vigencia&&normVig(tbU.vigencia)>inicioFech(f)?' <span class="tag warn" title="A tabela começa no meio do período do relatório. Toda a competência usa a tabela vigente no último dia do período.">vigência no meio do período</span>':'')+' <span class="tag" title="Base da escala definida na tabela do contrato">Pagamento: '+esc(BASES_ESCALA[tbU.basePag||'apurada']||'Apurada')+' · Faturamento: '+esc(BASES_FAT[tbU.baseFat||'apurada']||'Apurada')+'</span><div class="muted" style="font-size:.84rem">'+(temMetas?'Define quais valores a faturar e a pagar do contrato entram no cálculo.':'Este contrato ainda não tem valores por meta. Cadastre em Contratos › Metas.')+'</div></div><div class="seg" role="group" aria-label="Meta do fechamento">'+
      [['','Valores padrão'],['minima','Mínima'],['mediana','Mediana'],['maxima','Máxima']].map(([m,lab])=>'<button data-act="setMeta" data-m="'+m+'" aria-pressed="'+(metaAtual===m)+'"'+(pode&&(temMetas||!m)?'':' disabled')+'>'+lab+'</button>').join('')+'</div></div>'; }
  const q=normTxt(S.conf.q);
  const linhas=c.linhas.filter(l=>!q||normTxt(l.nome+' '+l.crm+' '+l.esp+' '+l.tipo).includes(q));
  out+='<div class="row"><div class="tabs" style="border:0"><button data-act="confModo" data-m="medico" aria-selected="'+(S.conf.modo==='medico')+'">Por médico</button><button data-act="confModo" data-m="item" aria-selected="'+(S.conf.modo==='item')+'">Por especialidade e tipo</button></div><span class="grow"></span>'+
    (S.conf.modo==='medico'?'<input type="search" id="confQ" placeholder="Buscar médico, CRM ou especialidade" data-inp="confQ" style="max-width:300px">':'')+
    (emConf&&can('importar')?'<label class="btn sm" for="fRe">Reimportar relatório</label><input type="file" id="fRe" accept=".xlsx,.xls" hidden data-chg="reimport">':'')+
    (S.conf.modo==='medico'&&can('baixar_detalhe')?'<button class="btn sm" data-act="baixarDetPP" title="Todos os plantões do relatório, com o item do contrato de cada um">Detalhamento Pega Plantão (.xlsx)</button>':'')+
    (ed?'<button class="btn sm" data-act="confTodos">Conferir todos</button>':'')+'</div>'+
    (ed&&S.conf.modo==='medico'?(()=>{ const n=linhas.filter(l=>S.conf.sel[l.key]).length; return '<div class="row bulk"><span class="muted">'+(n?'<b>'+n+'</b> linha(s) selecionada(s)':'Marque as linhas na primeira coluna para conferir em lote')+'</span><span class="grow"></span><button class="btn sm pri" data-act="confSel"'+(n?'':' disabled')+'>Conferir selecionados'+(n?' ('+n+')':'')+'</button><button class="btn sm" data-act="desconfSel"'+(n?'':' disabled')+'>Desmarcar conferência</button></div>'; })():'');
  if(S.conf.modo==='item'){
    out+='<div class="tbl fix" data-keep="ti"><table><thead><tr><th>Especialidade</th><th>Tipo / local</th><th class="n">Médicos</th><th class="n">Contratado/mês</th><th class="n">Planejadas</th><th class="n">Realizadas</th><th class="n">Apuradas</th><th class="n">Qtd pagar</th><th class="n">Qtd faturar</th><th class="n">Pagamento</th><th class="n">Faturamento</th></tr></thead><tbody>'+
      c.porItem.map(p=>'<tr><td>'+esc(p.esp)+'</td><td>'+esc(p.tipo)+'</td><td class="n">'+p.medicos+'</td><td class="n">'+fH(p.contratado)+'</td><td class="n">'+fH(p.plan)+'</td><td class="n">'+fH(p.real)+'</td><td class="n">'+fH(p.apur)+'</td><td class="n">'+fH(p.qPag)+' <span class="muted">'+UNIDADES[p.uPag]+'</span></td><td class="n">'+fH(p.qFat)+' <span class="muted">'+UNIDADES[p.uFat]+'</span></td><td class="n">'+brl(p.totPag)+'</td><td class="n">'+brl(p.totFat)+'</td></tr>').join('')+
      '</tbody><tfoot><tr><td colspan="4">Total</td><td class="n">'+fH(c.totais.plan)+'</td><td class="n">'+fH(c.totais.real)+'</td><td class="n">'+fH(c.totais.apur)+'</td><td></td><td></td><td class="n">'+brl(c.totais.totPag)+'</td><td class="n">'+brl(c.totais.totFat)+'</td></tr></tfoot></table></div>';
  } else {
    out+='<p class="muted" style="margin:0">Quantidade base = horas apuradas (tolerância) do Pega Plantão para itens por hora; nº de plantões apurados para itens por plantão; consultas e procedimentos são informados aqui. Alterações exigem justificativa e ficam no log.</p>';
    const podeExcl=emConf&&can('excluir_linha');
    const selN=linhas.filter(l=>S.conf.sel[l.key]).length; const todosSel=linhas.length&&selN===linhas.length;
    out+='<div class="tbl fix mc2" data-keep="tm"><table><thead><tr><th class="sel"><input type="checkbox" id="selAll" data-chg="selAll" aria-label="Selecionar todas as linhas"'+(todosSel?' checked':'')+(ed?'':' disabled')+'></th><th>Médico</th><th>CRM</th><th>Especialidade · tipo</th><th class="n">Plant.</th><th class="n">Planejadas</th><th class="n">Realizadas</th><th class="n">Apuradas</th><th class="n">Qtd pagar</th><th class="n">Valor pagar</th><th class="n">Pagamento</th><th class="n">Qtd faturar</th><th class="n">Valor faturar</th><th class="n">Faturamento</th><th>Justificativa</th><th>Conferido</th><th></th></tr></thead><tbody>'+
      linhas.map((l,i)=>{ const id=safeKey(l.key);
        const row='<tr class="'+(l.ajustado?'adj':'')+'"><td class="sel"><input type="checkbox" id="sl_'+id+'" data-chg="selLin" data-key="'+esc(l.key)+'"'+(S.conf.sel[l.key]?' checked':'')+(ed?'':' disabled')+' aria-label="Selecionar '+esc(l.nome)+'"></td>'+
          '<td style="white-space:nowrap"><button class="btn ghost sm" data-act="expand" data-key="'+esc(l.key)+'" aria-label="Ver plantões">'+(S.conf.open[l.key]?'▾':'▸')+'</button> '+esc(l.nome)+'</td><td class="mono">'+esc(l.crm)+'</td><td>'+esc(l.esp)+' <span class="muted">· '+esc(l.tipo)+'</span></td><td class="n">'+l.n+'</td><td class="n">'+fH(l.plan)+'</td><td class="n">'+fH(l.real)+'</td><td class="n"><b>'+fH(l.apur)+'</b></td>'+
          '<td class="n">'+(edQ?'<input type="text" inputmode="decimal" autocomplete="off" id="qp_'+id+'" value="'+dec(l.qPag)+'" data-chg="aj" data-key="'+esc(l.key)+'" data-f="qPag" data-base="'+l.qPagBase+'">':fH(l.qPag))+' <span class="muted">'+UNIDADES[l.uPag]+'</span></td>'+
          '<td class="n">'+brl(l.vPag)+(l.difer?' <span class="tag">dif.</span>':'')+(l.pagPP?' <span class="tag" title="Valor/hora configurado no Pega Plantão">PP</span>':'')+(!l.vPag?' <span class="tag bad" title="Contrato sem valor a pagar e relatório do Pega Plantão sem valor/hora">sem valor</span>':'')+'</td><td class="n">'+brl(l.totPag)+'</td>'+
          '<td class="n">'+(edQ?'<input type="text" inputmode="decimal" autocomplete="off" id="qf_'+id+'" value="'+dec(l.qFat)+'" data-chg="aj" data-key="'+esc(l.key)+'" data-f="qFat" data-base="'+l.qFatBase+'">':fH(l.qFat))+' <span class="muted">'+UNIDADES[l.uFat]+'</span></td><td class="n">'+brl(l.vFat)+(!l.vFat?' <span class="tag bad">sem valor</span>':'')+'</td><td class="n">'+brl(l.totFat)+'</td>'+
          '<td>'+(edQ&&l.ajustado?'<input type="text" id="js_'+id+'" value="'+esc(l.just)+'" placeholder="Motivo do ajuste" data-chg="ajJust" data-key="'+esc(l.key)+'">':esc(l.just))+(l.ajustado&&!l.just?' <span class="tag bad">sem justificativa</span>':'')+'</td>'+
          '<td><input type="checkbox" id="cf_'+id+'" data-chg="conf" data-key="'+esc(l.key)+'"'+(l.conferido?' checked':'')+(ed?'':' disabled')+' aria-label="Conferido"></td>'+
          '<td style="white-space:nowrap">'+(i===0||linhas[i-1].k!==l.k?botoesEmail(f,ct,l.k):'')+(podeExcl?'<button class="btn ghost sm del" data-act="excluirLinha" data-key="'+esc(l.key)+'" title="Excluir esta linha do fechamento" aria-label="Excluir linha de '+esc(l.nome)+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg></button>':'')+'</td></tr>';
        return row+(S.conf.open[l.key]?shiftsRows(f,ct,l):'');
      }).join('')+
      '</tbody><tfoot><tr><td colspan="5">Total ('+linhas.length+' linhas)</td><td class="n">'+fH(c.totais.plan)+'</td><td class="n">'+fH(c.totais.real)+'</td><td class="n">'+fH(c.totais.apur)+'</td><td></td><td></td><td class="n">'+brl(c.totais.totPag)+'</td><td></td><td></td><td class="n">'+brl(c.totais.totFat)+'</td><td colspan="3"></td></tr></tfoot></table></div>';
    const exc=Object.entries(f.excluidos||{}).filter(([k,v])=>v);
    if(exc.length&&!lock(f)) out+='<div class="card"><h3>Linhas excluídas deste fechamento ('+exc.length+')</h3><div class="tbl mc1"><table><thead><tr><th>Médico</th><th>Especialidade · tipo</th><th class="n">Apuradas</th><th class="n">Pagamento</th><th class="n">Faturamento</th><th>Excluída por</th><th>Motivo</th><th></th></tr></thead><tbody>'+
      exc.map(([k,v])=>'<tr><td>'+esc(v.nome||k)+'</td><td>'+esc((v.esp||'')+' · '+(v.tipo||''))+'</td><td class="n">'+fH(v.apur)+'</td><td class="n">'+brl(v.totPag)+'</td><td class="n">'+brl(v.totFat)+'</td><td>'+esc(nomeDe(v.por))+' · '+fDT(v.em)+'</td><td style="white-space:normal;min-width:200px">'+esc(v.motivo||'')+'</td><td>'+(podeExcl?'<button class="btn sm" data-act="restaurarLinha" data-key="'+esc(k)+'">Restaurar</button>':'')+'</td></tr>').join('')+'</tbody></table></div></div>';
  }
  // ações de fluxo
  const pend=c.totais.linhas-c.totais.conferidos; const semJust=c.linhas.filter(l=>l.ajustado&&!l.just).length;
  if(st==='conferencia'&&can('enviar_aprov')){
    const bloqueio = c.naoMapeados.length? 'Há setores sem vínculo com o contrato.' : pend? pend+' linha(s) ainda não conferida(s).' : semJust? semJust+' ajuste(s) sem justificativa.' : itensVigentes(ct,refFech(f)).some(i=>!num(i.valorFaturar))? 'Há itens do contrato com valor a faturar zerado.' : '';
    out+='<div class="card row"><div class="grow"><b>Enviar para aprovação</b><div class="muted">'+(bloqueio?esc(bloqueio):'Tudo conferido. O aprovador recebe o relatório para travar.')+'</div></div><button class="btn pri" data-act="enviarAprov"'+(c.naoMapeados.length||pend||semJust?' disabled':'')+'>Enviar para aprovação</button></div>';
  }
  if(st==='aguardando'){
    out+='<div class="card"><div class="row"><div class="grow"><b>Aguardando aprovação</b><div class="muted">Enviado por '+esc(nomeDe(f.enviadoPor))+' em '+fDT(f.t.enviado)+'. Ao aprovar, o relatório é travado e o resumo de faturamento e pagamento é emitido.</div></div>'+
      (can('aprovar')?'<button class="btn pri" data-act="aprovar">Aprovar e travar</button>':'')+'</div>'+
      (can('devolver')?'<div class="sep"></div><label class="f">Motivo da devolução<textarea id="devMot" data-inp="devolver" placeholder="Explique o que precisa ser corrigido">'+esc(S.devolver)+'</textarea></label><div class="row"><button class="btn warn" data-act="devolver">Devolver para conferência</button></div>':'')+'</div>';
  }
  return out;
}
function shiftsRows(f,ct,l){
  const all=S.shifts[f.id];
  if(!all) return '<tr class="sub"><td></td><td colspan="16">Carregando plantões…</td></tr>';
  const map=Object.fromEntries((ct.mapeamento||[]).map(m=>[m.s,m.item]));
  const rs=all.filter(r=>{ if(r[0]!==l.k) return false; const c=r[10]||''; const it=(c&&map[r[3]+'#'+c])||map[r[3]]; return it===l.itemId; });
  if(!rs.length) return '<tr class="sub"><td></td><td colspan="16">Sem plantões detalhados.</td></tr>';
  return rs.map(r=>'<tr class="sub"><td></td><td colspan="3">'+esc(r[1])+' · '+esc(r[2])+' · '+esc(r[8])+' → '+esc(r[9])+' <span class="muted">'+esc(r[3])+'</span>'+(r[10]==='FDS'?' <span class="tag">FDS</span>':'')+'</td><td class="n">'+esc(r[7])+'</td><td class="n">'+fH(r[4])+'</td><td class="n">'+fH(r[5])+'</td><td class="n">'+fH(r[6])+'</td><td colspan="9"></td></tr>').join('');
}

function tabResumo(f,ct,c){
  const L=lock(f);
  let out=L? '<div class="banner ok"><div><b>Resumo emitido na aprovação</b> em '+fDT(f.t.aprovado)+' por '+esc(nomeDe(f.aprovadoPor))+'.</div></div>' : '<div class="banner info"><div><b>Prévia.</b> Os valores podem mudar até a aprovação.</div></div>';
  const T=c.totais;
  const IMP=impostosCalc(c,aliqDoFech(f,ct));
  out+='<div class="kpis"><div class="kpi fat"><span class="eyebrow">Faturamento</span><span class="v">'+brl(T.totFat)+'</span><span class="s">'+fH(T.qFat)+' unidades faturadas</span></div><div class="kpi fat"><span class="eyebrow">Faturamento líquido</span><span class="v">'+brl(IMP.liquido)+'</span><span class="s">'+(IMP.total?'Impostos '+brl(IMP.total)+': '+IMP.itens.filter(i=>i.valor).map(i=>i.nome+' '+fH(i.pct)+'%').join(' · ')+(IMP.porEmpresa.length>1?' — '+IMP.porEmpresa.map(e=>esc(e.empresa||'sem empresa')+' '+brl(e.total)).join(' / '):''):'Sem impostos cadastrados no contrato')+'</span></div><div class="kpi pag"><span class="eyebrow">Pagamento</span><span class="v">'+brl(T.totPag)+'</span><span class="s">'+fH(T.qPag)+' unidades pagas</span></div><div class="kpi"><span class="eyebrow">Margem operacional</span><span class="v">'+brl(T.margem)+'</span><span class="s">'+fPct(T.totFat?T.margem/T.totFat:null)+' do faturamento</span></div><div class="kpi"><span class="eyebrow">% pagamento / faturamento</span><span class="v">'+fPct(T.pctPag)+'</span><span class="s">'+fH(T.apur)+' h apuradas de '+fH(T.plan)+' planejadas</span></div></div>';
  out+='<div class="card"><div class="row"><h3 class="grow">Por especialidade e tipo</h3>'+(can('baixar_resumo')?'<button class="btn sm" data-act="baixarResumo">Baixar resumo (.xlsx)</button>':'')+'</div><div class="tbl"><table><thead><tr><th>Especialidade</th><th>Tipo / local</th><th class="n">Contratado</th><th class="n">Planejadas</th><th class="n">Realizadas</th><th class="n">Apuradas</th><th class="n">Qtd faturada</th><th class="n">Faturamento</th><th class="n">Pagamento</th><th class="n">Margem</th><th class="n">Margem %</th></tr></thead><tbody>'+
    c.porItem.map(p=>'<tr><td>'+esc(p.esp)+'</td><td>'+esc(p.tipo)+'</td><td class="n">'+fH(p.contratado)+'</td><td class="n">'+fH(p.plan)+'</td><td class="n">'+fH(p.real)+'</td><td class="n">'+fH(p.apur)+'</td><td class="n">'+fH(p.qFat)+'</td><td class="n">'+brl(p.totFat)+'</td><td class="n">'+brl(p.totPag)+'</td><td class="n">'+brl(p.totFat-p.totPag)+'</td><td class="n">'+fPct(p.totFat?(p.totFat-p.totPag)/p.totFat:null)+'</td></tr>').join('')+
    '</tbody><tfoot><tr><td colspan="3">Total</td><td class="n">'+fH(T.plan)+'</td><td class="n">'+fH(T.real)+'</td><td class="n">'+fH(T.apur)+'</td><td class="n">'+fH(T.qFat)+'</td><td class="n">'+brl(T.totFat)+'</td><td class="n">'+brl(T.totPag)+'</td><td class="n">'+brl(T.margem)+'</td><td class="n">'+fPct(T.totFat?T.margem/T.totFat:null)+'</td></tr></tfoot></table></div></div>';
  const pm={}; c.linhas.forEach(l=>{const m=pm[l.k]||(pm[l.k]={nome:l.nome,crm:l.crm,esp:new Set(),plan:0,real:0,apur:0,pag:0,fat:0}); m.esp.add(l.esp+' · '+l.tipo); m.plan+=l.plan;m.real+=l.real;m.apur+=l.apur;m.pag+=l.totPag;m.fat+=l.totFat;});
  out+='<div class="card"><h3>Por médico</h3><div class="tbl fix mc1"><table><thead><tr><th>Médico</th><th>CRM</th><th>Especialidade · tipo</th><th class="n">Planejadas</th><th class="n">Realizadas</th><th class="n">Apuradas</th><th class="n">Pagamento</th><th class="n">Faturamento</th></tr></thead><tbody>'+
    Object.values(pm).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')).map(m=>'<tr><td>'+esc(m.nome)+'</td><td class="mono">'+esc(m.crm)+'</td><td>'+esc([...m.esp].join('; '))+'</td><td class="n">'+fH(m.plan)+'</td><td class="n">'+fH(m.real)+'</td><td class="n">'+fH(m.apur)+'</td><td class="n">'+brl(m.pag)+'</td><td class="n">'+brl(m.fat)+'</td></tr>').join('')+'</tbody></table></div></div>';
  return out;
}

/** Empresas de faturamento que têm valor no fechamento (cada uma emite seu pedido de NF). */
/* ---------- glosas (perguntadas no pedido de NF) ---------- */
function glosaItens(f){ const g=(f&&f.glosa)||{}; return g.houve? Object.entries(g.itens||{}).filter(([id,x])=>x).map(([id,x])=>({id,...x})) : []; }
function glosaPendente(f){
  const g=f.glosa||{};
  if(g.houve==null) return 'Responda se houve glosa antes de emitir o pedido de NF.';
  if(!g.houve) return '';
  const it=glosaItens(f);
  if(!it.length) return 'Inclua as glosas ou marque que não houve glosa.';
  if(it.some(x=>!x.itemId||!num(x.valor))) return 'Preencha o local/tipo e o valor de todas as glosas.';
  if(it.some(x=>!x.pagoMedico)) return 'Responda, em cada glosa, se houve pagamento ao médico.';
  return '';
}
function nfAlgumaEmitida(f){ return !!((f.penf&&f.penf.emitidaEm)||Object.values(f.penfs||{}).some(x=>x&&x.emitidaEm)); }
function cardGlosa(f,ct,c){
  const g=f.glosa||{}; const ed=!nfAlgumaEmitida(f)&&can('glosa'); const dis=ed?'':' disabled';
  let out='<div class="card"><div class="row"><div class="grow"><h3 style="margin:0">Houve glosa?</h3><div class="muted" style="font-size:.84rem">Valor glosado pelo tomador. É descontado do pedido de NF da empresa que fatura o item e vai para o dashboard em “Glosas por CR”.</div></div>'+
    '<div class="seg" role="group" aria-label="Houve glosa?"><button data-act="glosaHouve" data-v="1" aria-pressed="'+(g.houve===true)+'"'+dis+'>Sim</button><button data-act="glosaHouve" data-v="0" aria-pressed="'+(g.houve===false)+'"'+dis+'>Não</button></div></div>';
  if(g.houve){
    const its=glosaItens(f); const itens=itensUniao(ct).filter(i=>c.porItem.some(p=>p.itemId===i.id));
    const meds=[]; const vistos=new Set(); c.linhas.forEach(l=>{ if(!vistos.has(l.k)){ vistos.add(l.k); meds.push(l); } });
    const tot=its.reduce((t,x)=>{ t.h+=num(x.horas); t.v+=num(x.valor); return t; },{h:0,v:0});
    out+='<div class="tbl mc1" style="margin-top:10px"><table><thead><tr><th>Médico</th><th>CR</th><th>Local / tipo</th><th>Especialidade</th><th class="n">Qtde horas</th><th class="n">Valor (R$)</th><th>Apesar da glosa, houve pagamento ao médico?</th><th></th></tr></thead><tbody>'+
      (its.length? its.map(x=>{ const gid=esc(x.id); const lm=meds.filter(l=>!x.itemId||c.linhas.some(y=>y.k===l.k&&y.itemId===x.itemId));
        return '<tr><td><select id="gl_'+gid+'_k" data-chg="glosaCampo" data-id="'+gid+'" data-f="k"'+dis+' style="min-width:200px"><option value="">Escolha…</option>'+lm.map(l=>'<option value="'+esc(l.k)+'"'+(x.k===l.k?' selected':'')+'>'+esc(l.nome)+'</option>').join('')+(x.k&&!lm.some(l=>l.k===x.k)?'<option value="'+esc(x.k)+'" selected>'+esc(x.medico||x.k)+'</option>':'')+'</select></td>'+
          '<td><input type="text" id="gl_'+gid+'_cr" value="'+esc(x.cr||'')+'" data-chg="glosaCampo" data-id="'+gid+'" data-f="cr"'+dis+' style="width:90px"></td>'+
          '<td><select id="gl_'+gid+'_it" data-chg="glosaCampo" data-id="'+gid+'" data-f="itemId"'+dis+' style="min-width:180px"><option value="">Escolha…</option>'+itens.map(i=>'<option value="'+esc(i.id)+'"'+(x.itemId===i.id?' selected':'')+'>'+esc(i.tipo+' ('+i.especialidade+')')+'</option>').join('')+'</select></td>'+
          '<td>'+esc(x.esp||'—')+'</td>'+
          '<td class="n"><input type="text" inputmode="decimal" autocomplete="off" id="gl_'+gid+'_h" value="'+dec(x.horas||'')+'" placeholder="0" data-chg="glosaCampo" data-id="'+gid+'" data-f="horas"'+dis+' style="width:80px"></td>'+
          '<td class="n"><input type="text" inputmode="decimal" autocomplete="off" id="gl_'+gid+'_v" value="'+dec(x.valor||'')+'" placeholder="0,00" data-chg="glosaCampo" data-id="'+gid+'" data-f="valor"'+dis+' style="width:110px"></td>'+
          '<td><select id="gl_'+gid+'_p" data-chg="glosaCampo" data-id="'+gid+'" data-f="pagoMedico"'+dis+'><option value="">Escolha…</option><option value="sim"'+(x.pagoMedico==='sim'?' selected':'')+'>Sim, o médico foi pago</option><option value="nao"'+(x.pagoMedico==='nao'?' selected':'')+'>Não</option></select></td>'+
          '<td>'+(ed?'<button class="btn ghost sm" data-act="glosaRm" data-id="'+gid+'" aria-label="Remover glosa">✕</button>':'')+'</td></tr>'; }).join('')
        : '<tr><td colspan="8" class="muted">Nenhuma glosa incluída.</td></tr>')+
      '</tbody><tfoot><tr><td colspan="4">Total ('+its.length+')</td><td class="n">'+fH(tot.h)+'</td><td class="n">'+brl(tot.v)+'</td><td colspan="2"></td></tr></tfoot></table></div>'+
      (ed?'<div class="row" style="margin-top:8px"><button class="btn sm" data-act="glosaAdd">Incluir glosa</button></div>':'');
  }
  if(g.por) out+='<p class="muted" style="font-size:.8rem;margin:8px 0 0">Última alteração: '+esc(nomeDe(g.por))+' em '+fDT(g.em)+'</p>';
  const pend=glosaPendente(f); if(pend&&ed) out+='<p style="margin:8px 0 0;color:var(--warn);font-size:.86rem"><b>'+esc(pend)+'</b></p>';
  return out+'</div>';
}
/** Empresas de faturamento que têm valor no fechamento (cada uma emite seu pedido de NF). */
function empresasNF(ct,c){ const ss=[...new Set(c.porItem.filter(p=>p.totFat||p.qFat).map(p=>p.empresaFat||''))]; return ss.length? ss : [empresaPrincipal(ct)]; }
function penfDados(f,ct,c,sig){
  const EMP=empresasNF(ct,c); const multi=EMP.length>1;
  if(sig==null) sig= multi&&S.penfEmp!=null&&EMP.includes(S.penfEmp)? S.penfEmp : EMP[0];
  const ef=(ct.empresasFat||[]).find(e=>e.sigla===sig)||null;
  const emp=(S.config&&S.config.empresas||[]).find(e=>normTxt(e.sigla)===normTxt(sig||ct.empresa));
  const pis0= multi? c.porItem.filter(p=>(p.empresaFat||'')===sig) : c.porItem;
  // glosas dos itens desta empresa: descontadas da quantidade e do valor do pedido
  const gl=glosaItens(f).filter(x=>pis0.some(p=>p.itemId===x.itemId)||(!c.porItem.some(p=>p.itemId===x.itemId)&&sig===EMP[0]));
  const vGl=r2(gl.reduce((t,x)=>t+num(x.valor),0)), hGl=r4(gl.reduce((t,x)=>t+num(x.horas),0));
  const pis=pis0.map(p=>{ const gi=gl.filter(x=>x.itemId===p.itemId); return gi.length? {...p,qFat:r4(p.qFat-gi.reduce((t,x)=>t+num(x.horas),0)),totFat:r2(p.totFat-gi.reduce((t,x)=>t+num(x.valor),0))} : p; });
  const sub={...c,porItem:pis,totais:{...c.totais,totFat:r2(pis.reduce((t,p)=>t+p.totFat,0)-gl.filter(x=>!pis0.some(p=>p.itemId===x.itemId)).reduce((t,x)=>t+num(x.valor),0))}};
  const vincs=((ef&&ef.vinculos)||[]).map(v=>(VINC_NF.find(x=>x[0]===v)||[v,v])[1].toUpperCase()).join(', ');
  const def={empresa:sig||ct.empresa||'',data:nowISO().slice(0,10),tomador:ct.tomador||'',cnpj:ct.cnpj||'',endereco:ct.endereco||'',municipio:ct.municipio||'',
    descricao:descricaoNF(ct.descricaoNF,sub,f.competencia,ct,f.periodo,{VINCULOS:vincs,GLOSA:brl(vGl)}),empenho:ct.empenho||'Não possui',parceiro:ct.parceiro||'',
    empresas:(ef&&ef.cod)||(sig===empresaPrincipal(ct)&&ct.codEmpresaFat)||(emp?emp.cod:''),vinculos:vincs,
    cidadeISS:ct.cidadeISS||'',tipoOperacao:ct.tipoOperacao||'',centroResultado:ct.centroResultado||'',produtoServico:ct.produtoServico||'',
    quantidade:r4(pis.reduce((t,p)=>t+p.qFat,0)),valor:sub.totais.totFat,glosa:vGl,glosaHoras:hGl,valorBruto:r2(pis0.reduce((t,p)=>t+p.totFat,0))};
  const emit= multi? (f.penfs||{})[pk(sig)] : f.penf;
  if(emit&&emit.emitidaEm) return {...emit,sigla:sig,multi};
  const rasc= multi? ((f.penfRascs||{})[pk(sig)]||{}) : (f.penfRasc||{});
  return Object.assign(def,rasc,{quantidade:def.quantidade,valor:def.valor,glosa:def.glosa,glosaHoras:def.glosaHoras,valorBruto:def.valorBruto,sigla:sig,multi});
}
function tabNF(f,ct,c){
  if(!lock(f)) return '<div class="banner info"><div><b>Disponível após a aprovação.</b> O pedido de NF usa os valores travados do fechamento.</div></div>';
  const EMP=empresasNF(ct,c); const P=penfDados(f,ct,c); const emit=!!P.emitidaEm; const ed=!emit&&can('emitir_nf');
  const fld=(k,l,cls,type)=>'<label class="f '+(cls||'')+'">'+l+(type==='ta'?'<textarea id="pn_'+k+'" data-chg="penf" data-f="'+k+'"'+(ed?'':' disabled')+' style="min-height:220px">'+esc(P[k])+'</textarea>':'<input type="'+(type||'text')+'" id="pn_'+k+'" value="'+esc(P[k])+'" data-chg="penf" data-f="'+k+'"'+(ed?'':' disabled')+'>')+'</label>';
  let out=P.multi? '<div class="card row" style="padding:10px 14px"><div class="grow"><b>Um pedido de NF por empresa de faturamento</b><div class="muted" style="font-size:.84rem">Os itens do contrato indicam a empresa que fatura cada especialidade.</div></div><div class="seg" role="group" aria-label="Empresa do pedido de NF">'+EMP.map(sg=>{ const Q=penfDados(f,ct,c,sg); return '<button data-act="penfEmp" data-s="'+esc(sg)+'" aria-pressed="'+(sg===P.sigla)+'">'+esc((sg||'Sem empresa')+' · '+brl(Q.valor))+(Q.emitidaEm?' ✓':'')+'</button>'; }).join('')+'</div></div>' : '';
  out+=emit? '<div class="banner ok"><div><b>Pedido de NF emitido'+(P.multi?' ('+esc(P.sigla||'sem empresa')+')':'')+'</b> em '+fDT(P.emitidaEm)+' por '+esc(nomeDe(P.emitidaPor))+'.</div></div>' : '';
  out+=cardGlosa(f,ct,c);
  out+='<div class="penf"><div class="doc"><h2>PEDIDO DE EMISSÃO DE NOTA FISCAL</h2>'+
    '<div class="ln"><span>Empresa</span><b>'+esc(P.empresa)+'</b><span style="margin-left:auto;min-width:0">Data</span><b>'+fD(P.data)+'</b></div>'+
    '<div class="ln"><span>Tomador</span>'+esc(P.tomador)+'</div><div class="ln"><span>CNPJ</span>'+esc(P.cnpj)+'</div><div class="ln"><span>Endereço</span>'+esc(P.endereco)+'</div><div class="ln"><span>Município</span>'+esc(P.municipio)+'</div>'+(P.vinculos?'<div class="ln"><span>Vínculos</span>'+esc(P.vinculos)+'</div>':'')+
    '<div class="eyebrow">Descrição dos serviços</div><div class="desc">'+esc(P.descricao)+'</div><div class="ln"><span>Empenho</span>'+esc(P.empenho)+'</div>'+
    (P.glosa?'<div class="ln"><span>Glosa</span>− '+brl(P.glosa)+(P.glosaHoras?' ('+fH(P.glosaHoras)+' h)':'')+' <span class="muted">· valor antes da glosa '+brl(P.valorBruto)+'</span></div>':'')+'<div class="total"><span>VALOR TOTAL DA NOTA</span><span>'+brl(P.valor)+'</span></div></div>'+
    '<aside><div><span>Parceiro</span><b>'+esc(P.parceiro||'—')+'</b></div><div><span>Empresas</span><b>'+esc(P.empresas||'—')+'</b></div><div><span>Cidade ISS</span><b>'+esc(P.cidadeISS||'—')+'</b></div><div><span>Tipo operação</span><b>'+esc(P.tipoOperacao||'—')+'</b></div><div><span>Centro de resultado</span><b>'+esc(P.centroResultado||'—')+'</b></div><div><span>Produto / serviço</span><b>'+esc(P.produtoServico||'—')+'</b></div><div><span>Quantidade</span><b>'+qtdTxt(P.quantidade)+'</b></div><div><span>Valor</span><b>'+fN(P.valor)+'</b></div></aside></div>';
  out+='<div class="card"><h3>Dados do pedido</h3><div class="fields">'+fld('empresa','Empresa')+fld('data','Data','','date')+fld('tomador','Tomador','w2')+fld('cnpj','CNPJ')+fld('endereco','Endereço','w2')+fld('municipio','Município')+fld('empenho','Empenho')+
    fld('parceiro','Parceiro')+fld('empresas','Empresas (cód.)')+fld('cidadeISS','Cidade ISS')+fld('tipoOperacao','Tipo operação')+fld('centroResultado','Centro de resultado')+fld('produtoServico','Produto / serviço')+fld('descricao','Descrição dos serviços','wfull','ta')+'</div>'+
    (ed?'<p class="muted">A descrição é montada a partir do modelo do contrato. Ajustes aqui valem só para este pedido.</p>':'')+
    '<div class="row" style="margin-top:12px">'+(ed?'<button class="btn" data-act="penfReset">Recarregar do contrato</button><span class="grow"></span><button class="btn pri" data-act="emitirNF"'+(glosaPendente(f)?' disabled title="'+esc(glosaPendente(f))+'"':'')+'>Emitir pedido de NF</button>':'<span class="grow"></span>')+(can('baixar_penf')?'<button class="btn" data-act="baixarPENF">Baixar PENF (.xlsx)</button>':'')+'</div></div>';
  return out;
}

function folhaAtual(f,ct,c){
  if(f.folha&&f.folha.geradaEm) return {fora:{rows:[],tot:{total:0,horas:0}},removidas:[],ajuste:0,...f.folha};
  const fp=f.folhaParams||{};
  const r=calcFolha(c,ct,S.medicos[ct.id]||{},{...fp,manual:f.folhaAjustes||{}},S.config);
  return {rows:r.rows,tot:r.tot,fora:r.fora,removidas:r.removidas,ajuste:r.ajuste,dataVcto:fp.dataVcto||ultimoDiaMesSeguinte(f.competencia),responsavel:fp.responsavel||ct.responsavel||'',numeroDoc:numeroDocumento(ct,f.competencia),codReduzido:codReduzido(ct,f.competencia)};
}
function tabFolha(f,ct,c){
  if(!lock(f)) return '<div class="banner info"><div><b>Disponível após a aprovação.</b> A folha usa os pagamentos travados por médico.</div></div>';
  if(f.folha&&f.folha.geradaEm&&!f.folha.rows) return emptyState('Carregando a folha gerada…','');
  const F=folhaAtual(f,ct,c); const ger=!!(f.folha&&f.folha.geradaEm); const ed=!ger&&can('gerar_folha'); const edA=!ger&&can('folha_editar');
  const alertas=F.rows.filter(r=>r.alertas.some(a=>a.c==='bad')).length;
  const plPend=ger?0:F.rows.filter(r=>precisaPL(ct,r)&&!(f.prolabore||{})[safeKey(r.id)]).length;
  let out=ger? '<div class="banner ok"><div><b>Folha gerada</b> em '+fDT(f.folha.geradaEm)+' por '+esc(nomeDe(f.folha.geradaPor))+'. Arquivo no layout da planilha de importação (FOLHA MÉDICA, Consolidada e Importação Sankhya).</div></div>' : '';
  if(plPend) out+='<div class="banner warn"><div><b>'+plPend+' pagamento(s) com pró-labore aguardando aprovação do Departamento Pessoal.</b> A folha só pode ser gerada depois da aprovação.</div></div>';
  if(!ger&&alertas) out+='<div class="banner warn"><div><b>'+alertas+' médico(s) com pendência de cadastro.</b> Complete CPF/CNPJ da conta e empresa pagadora em Médicos antes de gerar.</div><button class="btn sm" data-act="nav" data-v="med" data-ct="'+ct.id+'">Abrir cadastro de médicos</button></div>';
  out+='<div class="card"><div class="fields"><label class="f">Contrato<input type="text" value="'+esc((ct.numero||'')+(ct.ano||'')+' '+(ct.sigla||''))+'" readonly></label><label class="f">Empresa<input type="text" value="'+esc(ct.empresa||'')+'" readonly></label><label class="f">Período de ref.<input type="text" value="'+mmYY(f.competencia).mm+'/'+mmYY(f.competencia).yy+'" readonly></label>'+
    '<label class="f">Responsável<input type="text" id="flResp" value="'+esc(F.responsavel)+'" data-chg="folhaP" data-f="responsavel"'+(edA?'':' disabled')+'></label><label class="f">Número documento<input type="text" value="'+esc(F.numeroDoc)+'" readonly class="mono"></label><label class="f">Centro de resultados<input type="text" value="'+esc(ct.centroResultado||'')+'" readonly></label><label class="f">Cód. reduzido contrato<input type="text" value="'+esc(F.codReduzido)+'" readonly></label>'+
    '<label class="f">Data de vencimento<input type="date" id="flVcto" value="'+esc(F.dataVcto)+'" data-chg="folhaP" data-f="dataVcto"'+(edA?'':' disabled')+'></label></div></div>';
  out+='<div class="row"><span class="grow muted" style="font-size:.86rem">Vão para o ERP só os vínculos <b>'+vinculosNaFolha(ct).join(', ')+'</b>. Incluir, alterar ou excluir um médico pede justificativa e fica no log do fechamento.</span>'+(edA?'<button class="btn sm" data-act="folhaAdd">Incluir médico na folha</button>':'')+'</div>';
  const trash='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg>';
  out+='<div class="tbl fix mc1" data-keep="tf"><table><thead><tr><th>Nome</th><th>CRM</th><th class="n">Horas</th><th class="n">Total realizado</th><th class="n">Desconto PN</th><th class="n">A receber</th><th class="n">Retenções</th><th class="n">Taxa sócio</th><th class="n">Líquido</th><th>Vínculo</th><th>Tipo pgto.</th><th>Empresa pagadora</th><th>Cód.</th><th>CPF/CNPJ conta</th><th>Empresa PJ</th><th>Alertas</th><th></th></tr></thead><tbody>'+
    F.rows.map(r=>{const id=safeKey(r.id); return '<tr class="'+(r.manual||r.editado?'adj':'')+'"><td>'+esc(r.nome)+(r.manual?' <span class="tag info" title="'+esc('Incluído manualmente: '+r.just)+'">incluído</span>':'')+(r.editado?' <span class="tag warn" title="'+esc('Alterado (calculado: '+brl(r.orig&&r.orig.total)+'). '+r.just)+'">alterado</span>':'')+(r.slot===2?' <span class="tag">2º vínculo</span>':'')+'</td><td class="mono">'+esc(r.crm)+'</td><td class="n">'+fH(r.horas)+'</td><td class="n">'+fN(r.total)+'</td>'+
      '<td class="n">'+(edA?'<input type="text" inputmode="decimal" autocomplete="off" id="fpn_'+id+'" value="'+dec((r.pn||''))+'" placeholder="0,00" data-chg="folhaV" data-k="'+esc(r.id)+'" data-f="pn">':fN(r.pn))+'</td><td class="n">'+fN(r.aReceber)+'</td>'+
      '<td class="n">'+(edA?'<input type="text" inputmode="decimal" autocomplete="off" id="frt_'+id+'" value="'+(r.retManual?dec(r.ret):'')+'" placeholder="'+(r.retAuto?fN(r.retAuto.total):'0,00')+'" title="'+(r.retAuto?'Automático (PJ não optante do Simples): PIS, COFINS, CSLL e IR. Digite para substituir.':'')+'" data-chg="folhaV" data-k="'+esc(r.id)+'" data-f="ret">':fN(r.ret))+(r.retAuto&&!r.retManual?' <span class="tag" title="PIS+COFINS+CSLL+IR">auto</span>':'')+'</td><td class="n">'+fN(r.taxa)+'</td><td class="n"><b>'+fN(r.liq)+'</b></td>'+
      '<td style="white-space:nowrap">'+esc(r.vinculo)+plTag(f,r,ger)+'</td><td>'+esc(r.tipoPag)+' <span class="muted mono">'+esc(r.natureza)+'</span></td><td>'+esc(r.empresa)+(r.multiEmpresa?' <span class="tag" title="O médico recebe por mais de uma empresa ou vínculo">+1</span>':'')+'</td><td class="mono">'+esc(r.codEmpresa)+'</td><td class="mono">'+esc(r.cpfConta)+'</td><td>'+esc(r.empresaPJ)+'</td><td>'+r.alertas.map(a=>'<span class="tag '+a.c+'">'+esc(a.t)+'</span>').join(' ')+'</td>'+
      '<td style="white-space:nowrap">'+(r.manual?'':botoesEmail(f,ct,r.k))+(edA?'<button class="btn ghost sm" data-act="folhaEdit" data-id="'+esc(r.id)+'">Editar</button><button class="btn ghost sm del" data-act="folhaDel" data-id="'+esc(r.id)+'" title="Excluir da folha" aria-label="Excluir '+esc(r.nome)+' da folha">'+trash+'</button>':'')+'</td></tr>';}).join('')+
    '</tbody><tfoot><tr><td colspan="2">Total ('+F.rows.length+' médicos)</td><td class="n">'+fH(F.tot.horas)+'</td><td class="n">'+fN(F.tot.total)+'</td><td class="n">'+fN(F.tot.pn)+'</td><td class="n">'+fN(F.tot.aReceber)+'</td><td class="n">'+fN(F.tot.ret)+'</td><td class="n">'+fN(F.tot.taxa)+'</td><td class="n">'+fN(F.tot.liq)+'</td><td colspan="8"></td></tr></tfoot></table></div>';
  const fora=(F.fora&&F.fora.rows)||[];
  if(fora.length) out+='<div class="card"><h3>Fora da folha do ERP ('+fora.length+')</h3><p class="muted" style="margin-top:0">Vínculos que não entram na planilha de importação (ex.: concursado, cooperado). Total realizado: <b>'+brl(F.fora.tot.total)+'</b>.</p><div class="tbl mc1"><table><thead><tr><th>Nome</th><th>CRM</th><th>Vínculo</th><th class="n">Horas</th><th class="n">Total realizado</th><th>Empresa</th></tr></thead><tbody>'+
    fora.map(r=>'<tr><td>'+esc(r.nome)+(r.slot===2?' <span class="tag">2º vínculo</span>':'')+'</td><td class="mono">'+esc(r.crm)+'</td><td>'+esc(r.vinculo)+'</td><td class="n">'+fH(r.horas)+'</td><td class="n">'+fN(r.total)+'</td><td>'+esc(r.empresa)+'</td></tr>').join('')+'</tbody></table></div></div>';
  const rem=F.removidas||[];
  if(rem.length) out+='<div class="card"><h3>Excluídos da folha ('+rem.length+')</h3><div class="tbl mc1"><table><thead><tr><th>Nome</th><th>CRM</th><th class="n">Total</th><th>Excluído por</th><th>Justificativa</th><th></th></tr></thead><tbody>'+
    rem.map(r=>'<tr><td>'+esc(r.nome)+'</td><td class="mono">'+esc(crmDigits(r.k))+'</td><td class="n">'+fN(r.total)+'</td><td>'+esc(nomeDe(r.por))+' · '+fDT(r.em)+'</td><td style="white-space:normal;min-width:220px">'+esc(r.just)+'</td><td>'+(edA?'<button class="btn sm" data-act="folhaRest" data-id="'+esc(r.id)+'">Restaurar</button>':'')+'</td></tr>').join('')+'</tbody></table></div></div>';
  const totFora=(F.fora&&F.fora.tot&&F.fora.tot.total)||0, aj=F.ajuste||0;
  const prova=r2(F.tot.total+totFora-aj-c.totais.totPag);
  out+='<div class="card row"><div class="grow"><b>Prova real</b><div class="muted">Folha '+fN(F.tot.total)+(totFora?' + fora da folha '+fN(totFora):'')+(aj?(aj>0?' − ':' + ')+'ajustes manuais '+fN(Math.abs(aj)):'')+' − pagamento aprovado '+fN(c.totais.totPag)+' = '+fN(prova)+(prova===0?' ✓':' — revise')+' · Taxa de sócio: R$ '+fN(ct.taxaSocio==null?150:ct.taxaSocio)+' para vínculo SÓCIO acima de '+(ct.taxaSocioMinHoras==null?24:ct.taxaSocioMinHoras)+' h</div></div>'+
    (ed?'<button class="btn pri" data-act="gerarFolha"'+(plPend?' disabled title="Aguardando aprovação do pró-labore pelo Departamento Pessoal"':'')+'>Gerar folha de pagamento</button>':(can('baixar_folha')?'<button class="btn" data-act="baixarFolha">Baixar planilha de importação (.xlsx)</button>':''))+'</div>';
  return out;
}
/** Pró-labore precisa de aprovação do DP: vínculo pró-labore, ou sócio em contrato que recolhe pró-labore. */
function precisaPL(ct,r){ return r.vinculo==='PRO-LABORE' || (!!(ct&&ct.recolheProLabore) && r.vinculo==='SOCIO'); }
function plTag(f,r,ger){
  if(!precisaPL(ctById(f.contratoId)||{},r)) return '';
  const a=(f.prolabore||{})[safeKey(r.id)];
  if(a) return ' <span class="tag ok" title="Aprovado por '+esc(nomeDe(a.por))+' em '+fDT(a.em)+'">aprovado DP</span>';
  return !ger&&can('aprovar_prolabore')? ' <button class="btn sm" data-act="aprovarPL" data-id="'+esc(r.id)+'">Aprovar pró-labore</button>' : (ger?'':' <span class="tag warn">aguarda DP</span>');
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
  return head+'<div class="tbl"><table><thead><tr><th>CR</th><th>Contrato</th><th>Nº</th><th>Empresa</th><th>Tabela vigente</th><th class="n">Itens</th><th class="n">Contratado/mês</th><th class="n">Valor global</th><th>Vigência</th><th>Pendências</th></tr></thead><tbody>'+
    cs.map(c=>{const it=c.itens||[]; const pend=[]; if(it.some(i=>!num(i.valorFaturar))) pend.push('valor a faturar'); if(it.some(i=>!num(i.valorPagar)&&i.fontePag!=='pega')) pend.push('valor a pagar'); if(!c.tomador) pend.push('dados NF');
      const tv=tabelaVigente(c,mesAtual());
      return '<tr><td class="mono" style="white-space:nowrap"><b>'+esc(c.sigla)+'</b> <button class="btn sm" data-act="editCt" data-id="'+c.id+'" style="margin-left:6px">'+(can('contratos')||can('valores')||can('fiscal')?'Editar':'Ver')+'</button></td><td>'+esc(c.nome)+(c.ativo===false?' <span class="tag">inativo</span>':'')+(c.recolheProLabore?' <span class="tag info" title="Recolhe pró-labore">pró-labore</span>':'')+'</td><td class="mono">'+esc((c.numero||'')+(c.ano||''))+'</td><td>'+esc(c.empresa)+'</td><td>'+esc(tv.nome||'Tabela original')+(tv.vigencia?' <span class="muted">· desde '+compTxt(tv.vigencia)+'</span>':'')+(tabelasDoContrato(c).length>1?' <span class="tag">'+tabelasDoContrato(c).length+' tabelas</span>':'')+'</td><td class="n">'+it.length+'</td><td class="n">'+fH(it.reduce((s,i)=>s+num(i.qtdMes),0))+'</td><td class="n">'+(num(c.valorGlobal)?brl(num(c.valorGlobal)):'—')+'</td><td>'+(c.vigIni?fD(c.vigIni)+' a '+fD(c.vigFim):'—')+'</td><td>'+(pend.length?pend.map(p=>'<span class="tag warn">'+p+'</span>').join(' '):'<span class="tag">ok</span>')+'</td></tr>';}).join('')+'</tbody></table></div>';
}
function novoContrato(){ return {id:'',sigla:'',nome:'',numero:'',ano:'',centroResultado:'',empresa:'',codEmpresaPagadora:'',codEmpresaFat:'',responsavel:'',vigIni:'',vigFim:'',valorGlobal:0,qtdGlobal:0,ativo:true,ufCrm:'',
  tomador:'',cnpj:'',endereco:'',municipio:'',cidadeISS:'',parceiro:'',tipoOperacao:'',produtoServico:'',empenho:'Não possui',descricaoNF:'REFERENTE A PRESTAÇÃO DE SERVIÇOS MÉDICOS NA ESPECIALIDADE DE {ESPECIALIDADES} - PERIODO {PERIODO} - QUANTIDADE DE {UNIDADE} EXECUTADAS {QTD_TOTAL}, VALOR UNITÁRIO {VALOR_UNITARIO}, TOTALIZANDO {VALOR_TOTAL}.',
  vinculoPadrao:'SOCIO',vinculosFolha:['SOCIO','PJ','RPA'],taxaSocio:150,taxaSocioMinHoras:24,alertaValor:20000,itens:[],diferenciados:[],mapeamento:[],empresasFat:[],respEscala:'',recolheProLabore:null,
  tabelas:[{id:'t_original',nome:'Tabela original do contrato',tipo:'original',vigencia:'',basePag:'apurada',baseFat:'apurada',valorFixoMensal:0,itens:[]}],historico:[]}; }
function viewContratoEd(){
  const d=S.draft; if(!d) return emptyState('Nada em edição','','<button class="btn" data-act="nav" data-v="ct">Voltar</button>');
  const ed=can('contratos'); const dis=ed?'':' disabled';
  // perfil Fiscal: edita só dados de NF (PENF) e impostos
  const edF=ed||can('fiscal'); const disF=edF?'':' disabled';
  const edV=can('valores'); const disV=edV?'':' disabled';
  const FISC=new Set(['tomador','cnpj','endereco','municipio','empenho','parceiro','codEmpresaFat','cidadeISS','tipoOperacao','produtoServico','descricaoNF']);
  const fld=(k,l,cls,type,extra)=>'<label class="f '+(cls||'')+'">'+l+(type==='ta'?'<textarea id="ct_'+k+'" data-chg="ct" data-f="'+k+'"'+(FISC.has(k)?disF:dis)+'>'+esc(d[k])+'</textarea>':(type==='number'?'<input type="text" inputmode="decimal" autocomplete="off" data-num="1" id="ct_'+k+'" value="'+esc(dec(d[k]))+'" data-chg="ct" data-f="'+k+'"'+(FISC.has(k)?disF:dis)+(extra||'')+'>':'<input type="'+(type||'text')+'" id="ct_'+k+'" value="'+esc(d[k]==null?'':d[k])+'" data-chg="ct" data-f="'+k+'"'+(FISC.has(k)?disF:dis)+(extra||'')+'>'))+'</label>';
  const empOpts=(S.config&&S.config.empresas||[]);
  let out='<div class="head"><div><button class="btn ghost sm" data-act="nav" data-v="ct">← Contratos</button><h1 style="margin-top:6px">'+(d.id?esc(d.sigla+' — '+d.nome):'Novo contrato')+'</h1></div>'+((edF||edV)?'<div class="row"><button class="btn" data-act="nav" data-v="ct">Cancelar</button><button class="btn pri" data-act="salvarCt">Salvar contrato</button></div>':'')+'</div>';
  const crs=(S.config&&S.config.centros)||[];
  out+='<div class="card"><h2>Identificação</h2><div class="fields">'+fld('sigla','Sigla do CR (ex.: PAP)','','text',' list="crList"')+'<datalist id="crList">'+crs.map(c=>'<option value="'+esc(c.sigla)+'">'+esc(c.descricao+' · '+c.codigo)+'</option>').join('')+'</datalist>'+fld('nome','Nome do contrato','w2')+fld('numero','Nº do contrato')+fld('ano','Ano (ex.: /2025)')+fld('centroResultado','Centro de resultado')+
    '<label class="f">Empresa contratada / pagadora<input list="empList" type="text" id="ct_empresa" value="'+esc(d.empresa)+'" data-chg="ct" data-f="empresa"'+dis+'><datalist id="empList">'+empOpts.map(e=>'<option value="'+esc(e.sigla)+'">'+esc(e.razao+' ('+e.cod+')')+'</option>').join('')+'</datalist></label>'+
    fld('responsavel','Responsável pelo fechamento')+'<label class="f">Responsável — Gestão de Escala<select id="ct_respEscala" data-chg="ct" data-f="respEscala"'+dis+'><option value="">—</option>'+((S.config&&S.config.responsaveis)||[]).filter(r=>r.nome).slice().sort((a,b)=>(a.area==='Gestão de Escala'?0:1)-(b.area==='Gestão de Escala'?0:1)||a.nome.localeCompare(b.nome,'pt-BR')).map(r=>'<option value="'+esc(r.id)+'"'+(d.respEscala===r.id?' selected':'')+'>'+esc(r.nome+(r.area&&r.area!=='Gestão de Escala'?' ('+r.area+')':''))+'</option>').join('')+'</select></label>'+fld('vigIni','Início da vigência','','date')+fld('vigFim','Fim da vigência','','date')+fld('valorGlobal','Valor global do contrato (R$)','','number')+fld('qtdGlobal','Quantidade global (h/unid.)','','number')+fld('ufCrm','UF padrão do CRM')+
    '<div class="f"><span>Recolhe pró-labore?'+(d.recolheProLabore==null?' <b style="color:var(--bad)">*</b>':'')+'</span><div class="seg" role="group" aria-label="Recolhe pró-labore?"><button data-act="ctPL" data-v="1" aria-pressed="'+(d.recolheProLabore===true)+'"'+dis+'>Sim</button><button data-act="ctPL" data-v="0" aria-pressed="'+(d.recolheProLabore===false)+'"'+dis+'>Não</button></div><small class="muted" style="font-weight:400">'+(d.recolheProLabore?'Pagamento dos sócios na folha precisa de aprovação do Departamento Pessoal.':'Obrigatório.')+'</small></div>'+
    '<label class="f chk"><input type="checkbox" id="ct_ativo" data-chg="ctChk" data-f="ativo"'+(d.ativo!==false?' checked':'')+dis+'> Contrato ativo</label></div></div>';
  const tabs=d.tabelas||[]; const tSel=tabs.find(t=>t.id===d.tabSel)||tabs[0]||{}; const salvo=d.id&&ctById(d.id); const tSalva=salvo&&tabelasDoContrato(salvo).find(t=>t.id===tSel.id);
  const vigTxt=v=>v?compTxt(v):'início do contrato'; const TIPOS_TAB={original:'Original',reajuste:'Reajuste',aditivo:'Aditivo'};
  const tAtual=tabelaVigente(d,mesAtual());
  const EF=[['','Principal'+(empresaPrincipal(d)?' ('+empresaPrincipal(d)+')':'')]].concat((d.empresasFat||[]).filter(e=>e.sigla).map(e=>[e.sigla,e.sigla]));
  const EP=[['','Padrão (médico/contrato)']].concat(empOpts.filter(e=>e.sigla).map(e=>[e.sigla,e.sigla]));
  out+='<div class="card"><div class="row"><h2 class="grow">Especialidades, tipos e valores</h2>'+(edV&&d.id?'<button class="btn sm" data-act="novaTabela" data-tipo="reajuste">Novo reajuste</button><button class="btn sm" data-act="novaTabela" data-tipo="aditivo">Novo aditivo</button>':'')+(edV?'<button class="btn sm" data-act="addItem">Adicionar item</button>':'')+'</div>'+
    '<div class="fields" style="margin:4px 0 12px"><label class="f">Tabela em edição<select id="tabSel" data-chg="tabSel">'+tabs.slice().sort((a,b)=>String(a.vigencia||'').localeCompare(String(b.vigencia||''))).map(t=>'<option value="'+esc(t.id)+'"'+(t.id===tSel.id?' selected':'')+'>'+esc((t.nome||'Sem nome')+' — '+(TIPOS_TAB[t.tipo]||'')+' — a partir de '+vigTxt(t.vigencia))+(t.id===tAtual.id?' (vigente)':'')+'</option>').join('')+'</select></label>'+
    '<label class="f w2">Nome da tabela<input type="text" id="tabNome" value="'+esc(tSel.nome||'')+'" data-chg="tabCampo" data-f="nome" placeholder="Ex.: Tabela original do contrato · Reajuste IPCA 2026 · 1º Termo aditivo"'+disV+'></label>'+
    '<label class="f">Tipo<select id="tabTipo" data-chg="tabCampo" data-f="tipo"'+disV+'>'+Object.entries(TIPOS_TAB).map(([k,v])=>'<option value="'+k+'"'+(tSel.tipo===k?' selected':'')+'>'+v+'</option>').join('')+'</select></label>'+
    '<label class="f">Pagamento pela escala<select id="tabBasePag" data-chg="tabCampo" data-f="basePag"'+disV+'>'+Object.entries(BASES_ESCALA).map(([k,v])=>'<option value="'+k+'"'+((tSel.basePag||'apurada')===k?' selected':'')+'>'+v+'</option>').join('')+'</select></label>'+
    '<label class="f">Faturamento pela escala<select id="tabBaseFat" data-chg="tabCampo" data-f="baseFat"'+disV+'>'+Object.entries(BASES_FAT).map(([k,v])=>'<option value="'+k+'"'+((tSel.baseFat||'apurada')===k?' selected':'')+'>'+v+'</option>').join('')+'</select></label>'+
    (tSel.baseFat==='fixo'?'<label class="f">Valor fixo mensal (R$)<input type="text" inputmode="decimal" autocomplete="off" id="tabFixo" data-num="1" value="'+esc(dec(tSel.valorFixoMensal||''))+'" placeholder="0,00" data-chg="tabCampo" data-f="valorFixoMensal"'+disV+'></label>':'')+
    (tSalva||d.id? '<div class="f"><span>Vigente a partir de</span><b style="color:var(--fg);padding-top:6px">'+vigTxt(tSel.vigencia)+'</b></div>' : '<label class="f">Vigente a partir de<input type="date" id="tabVig" value="'+esc(tSel.vigencia||'')+'" data-chg="tabCampo" data-f="vigencia"'+disV+'></label>')+'</div>'+
    '<p class="muted" style="margin-top:0">Ao alterar valores a pagar, a faturar ou metas de uma tabela já salva, o sistema pergunta a partir de quando valem: cria um reajuste/aditivo ou corrige a tabela. Alterações retroativas exigem justificativa e ficam no histórico.</p>'+
    '<p class="muted">Cada item é uma especialidade + tipo/local com sua unidade de medida para pagamento e faturamento. Fonte “Pega Plantão” usa o valor/hora configurado no relatório para o pagamento. <b>DS</b> / <b>FDS</b>: o item vale para plantões que começam em dia de semana, no fim de semana (sábado e domingo) ou ambos. Empresa de faturamento e de pagamento: em branco usa a principal do contrato e a do cadastro do médico. A base da escala (planejada, realizada, apurada ou valor fixo) vale para a tabela inteira.</p>'+
    '<div class="tbl" data-keep="cti"><table><thead><tr><th>Especialidade</th><th>Metas</th><th>Tipo / local</th><th class="c" title="Dia de semana (segunda a sexta)">DS</th><th class="c" title="Final de semana (sábado e domingo)">FDS</th><th>Unid. pagamento</th><th>Unid. faturamento</th><th class="n">Qtd contratada/mês</th><th class="n">Valor a faturar</th><th class="n">Valor a pagar</th><th>Fonte pagamento</th><th>Empresa faturamento</th><th>Empresa pagamento</th><th></th></tr></thead><tbody>'+
    (d.itens.length?d.itens.map((it,i)=>{const sel=(f,opts)=>'<select id="it'+i+f+'" data-chg="it" data-i="'+i+'" data-f="'+f+'"'+disV+'>'+opts.map(o=>'<option value="'+o[0]+'"'+(it[f]===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select>'; const U=Object.entries(UNIDADES);
      return '<tr><td><input type="text" id="it'+i+'esp" value="'+esc(it.especialidade)+'" data-chg="it" data-i="'+i+'" data-f="especialidade"'+disV+'></td><td>'+(()=>{const n=['minima','mediana','maxima'].filter(m=>it.metas&&it.metas[m]&&(num(it.metas[m].valorFaturar)||num(it.metas[m].valorPagar))).length; return '<button class="btn sm" data-act="toggleMetas" data-i="'+i+'" aria-expanded="'+!!S.metaOpen[i]+'">'+(n?n+' meta'+(n>1?'s':''):'Definir')+' '+(S.metaOpen[i]?'▾':'▸')+'</button>';})()+'</td><td><input type="text" id="it'+i+'tp" value="'+esc(it.tipo)+'" data-chg="it" data-i="'+i+'" data-f="tipo"'+disV+'></td><td class="c"><input type="checkbox" id="it'+i+'ds" data-chg="itChk" data-i="'+i+'" data-f="ds"'+(it.ds!==false?' checked':'')+disV+' aria-label="Vale em dia de semana"></td><td class="c"><input type="checkbox" id="it'+i+'fds" data-chg="itChk" data-i="'+i+'" data-f="fds"'+(it.fds!==false?' checked':'')+disV+' aria-label="Vale no fim de semana"></td><td>'+sel('unidadePag',U)+'</td><td>'+sel('unidadeFat',U)+'</td>'+
        '<td class="n"><input type="text" inputmode="decimal" autocomplete="off" id="it'+i+'q" value="'+dec((it.qtdMes||0))+'" data-chg="it" data-i="'+i+'" data-f="qtdMes"'+disV+'></td><td class="n"><input type="text" inputmode="decimal" autocomplete="off" id="it'+i+'vf" value="'+dec((it.valorFaturar||0))+'" data-chg="it" data-i="'+i+'" data-f="valorFaturar"'+disV+(num(it.valorFaturar)?'':' style="border-color:var(--warn)"')+'></td><td class="n"><input type="text" inputmode="decimal" autocomplete="off" id="it'+i+'vp" value="'+dec((it.valorPagar||0))+'" data-chg="it" data-i="'+i+'" data-f="valorPagar"'+disV+'></td>'+
        '<td>'+sel('fontePag',[['cadastro','Cadastro'],['pega','Pega Plantão']])+'</td><td>'+sel('empresaFat',it.empresaFat&&!EF.some(o=>o[0]===it.empresaFat)?EF.concat([[it.empresaFat,it.empresaFat]]):EF)+'</td><td>'+sel('empresaPag',it.empresaPag&&!EP.some(o=>o[0]===it.empresaPag)?EP.concat([[it.empresaPag,it.empresaPag]]):EP)+'</td><td>'+(edV?'<button class="btn ghost sm" data-act="rmItem" data-i="'+i+'" aria-label="Remover item">✕</button>':'')+'</td></tr>'+
        (S.metaOpen[i]?'<tr class="metas"><td></td><td colspan="13"><div class="fields" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">'+[['minima','Mínima'],['mediana','Mediana'],['maxima','Máxima']].map(([m,lab])=>['valorFaturar','valorPagar'].map(fl=>'<label class="f">'+lab+' — '+(fl==='valorFaturar'?'a faturar':'a pagar')+' (R$)<input type="text" inputmode="decimal" autocomplete="off" id="mt'+i+m+fl+'" value="'+dec((it.metas&&it.metas[m]&&num(it.metas[m][fl]))||'')+'" placeholder="'+dec(num(it[fl])||'')+'" data-chg="itMeta" data-i="'+i+'" data-m="'+m+'" data-f="'+fl+'"'+disV+'></label>').join('')).join('')+'</div><p class="muted" style="margin:6px 0 0;font-size:.8rem">Valores por unidade usados quando o fechamento estiver na meta correspondente. Em branco = usa o valor padrão do item.</p></td></tr>':'');}).join(''):'<tr><td colspan="14" class="muted">Nenhum item. Adicione as especialidades e tipos do contrato.</td></tr>')+'</tbody></table></div></div>';
  const itOpts=sel=>'<option value="">Escolha…</option>'+itensUniao(d).map(it=>'<option value="'+it.id+'"'+(sel===it.id?' selected':'')+'>'+esc(it.especialidade+' — '+it.tipo)+'</option>').join('');
  out+='<div class="card"><div class="row"><h2 class="grow">Vínculo com setores do Pega Plantão</h2></div><p class="muted">Define qual item do contrato recebe as horas de cada “Local | Setor” do relatório. É preenchido automaticamente na conferência.</p><div class="tbl"><table><thead><tr><th>Local | Setor</th><th>Item do contrato</th><th></th></tr></thead><tbody>'+
    (d.mapeamento.length?d.mapeamento.map((m,i)=>'<tr><td>'+esc(rotuloSetor(m.s))+'</td><td><select id="mpc'+i+'" data-chg="ctMap" data-i="'+i+'"'+dis+'>'+itOpts(m.item)+'<option value="__ignorar"'+(m.item==='__ignorar'?' selected':'')+'>Não faturar (ignorar)</option></select></td><td>'+(ed?'<button class="btn ghost sm" data-act="rmMap" data-i="'+i+'" aria-label="Remover vínculo">✕</button>':'')+'</td></tr>').join(''):'<tr><td colspan="3" class="muted">Sem vínculos ainda.</td></tr>')+'</tbody></table></div></div>';
  out+='<div class="card"><div class="row"><h2 class="grow">Valores diferenciados por médico</h2>'+(edV?'<button class="btn sm" data-act="addDif">Adicionar</button>':'')+'</div><p class="muted">Substitui o valor a pagar do item para o médico indicado.</p><div class="tbl"><table><thead><tr><th>CRM</th><th>Médico</th><th>Item</th><th class="n">Valor a pagar</th><th></th></tr></thead><tbody>'+
    (d.diferenciados.length?d.diferenciados.map((x,i)=>'<tr><td><input type="text" id="df'+i+'c" value="'+esc(x.crm)+'" data-chg="dif" data-i="'+i+'" data-f="crm"'+disV+' style="min-width:90px"></td><td><input type="text" id="df'+i+'n" value="'+esc(x.nome||'')+'" data-chg="dif" data-i="'+i+'" data-f="nome"'+disV+'></td><td><select id="df'+i+'i" data-chg="dif" data-i="'+i+'" data-f="item"'+disV+'>'+itOpts(x.item)+'</select></td><td class="n"><input type="text" inputmode="decimal" autocomplete="off" id="df'+i+'v" value="'+dec((x.valorPagar||0))+'" data-chg="dif" data-i="'+i+'" data-f="valorPagar"'+disV+'></td><td>'+(edV?'<button class="btn ghost sm" data-act="rmDif" data-i="'+i+'" aria-label="Remover">✕</button>':'')+'</td></tr>').join(''):'<tr><td colspan="5" class="muted">Nenhum valor diferenciado.</td></tr>')+'</tbody></table></div></div>';
  out+='<div class="card"><h2>Pedido de NF (PENF)</h2><div class="fields">'+fld('tomador','Tomador','w2')+fld('cnpj','CNPJ do tomador')+fld('endereco','Endereço','w2')+fld('municipio','Município')+fld('empenho','Empenho')+fld('parceiro','Parceiro (cód.)')+fld('cidadeISS','Cidade ISS (cód.)')+fld('tipoOperacao','Tipo operação')+fld('produtoServico','Produto / serviço (cód.)')+
    fld('descricaoNF','Modelo da descrição dos serviços','wfull','ta')+'</div><p class="muted">Campos automáticos: {ESPECIALIDADES} {PERIODO} {COMPETENCIA} {QTD_TOTAL} {UNIDADE} {VALOR_UNITARIO} {VALOR_TOTAL} {ITENS} {CONTRATO} {VINCULOS} {GLOSA}</p>'+cardEmpresasFat(d,edF,disF)+'</div>';
  const hist=(d.historico||[]).slice().reverse();
  if(d.id) out+='<div class="card"><h2>Histórico de valores e tabelas</h2>'+(hist.length?'<div class="log">'+hist.slice(0,60).map(h=>'<div class="it"><div class="t">'+fDT(h.em)+'<br><b>'+esc(nomeDe(h.por))+'</b></div><div class="x"><b>'+esc(h.texto||'')+'</b>'+(h.retroativo?' <span class="tag warn">retroativo</span>':'')+(h.justificativa?'<br><span class="muted">Justificativa:</span> '+esc(h.justificativa):'')+((h.mudancas||[]).length?'<br><span class="muted" style="font-size:.82rem">'+h.mudancas.slice(0,8).map(m=>esc(m.item+' — '+m.campo+(m.texto?': '+m.texto:': '+brl(m.de)+' → '+brl(m.para)))).join('<br>')+(h.mudancas.length>8?'<br>e mais '+(h.mudancas.length-8):'')+'</span>':'')+'</div></div>').join('')+'</div>':'<p class="muted">Sem alterações registradas.</p>')+'</div>';
  // impostos agora ficam por empresa de faturamento (bloco do PENF)
  out+='<div class="card"><h2>Solicitação de NF aos médicos PJ</h2><p class="muted" style="margin-top:0">Usado no e-mail “Solicitar NF”. Razão social, CNPJ, endereço e município do tomador vêm do bloco acima.</p><div class="fields">'+fld('cep','CEP do tomador')+fld('localPrestacao','Local e município da prestação','w2')+fld('diaLimiteNF','Dia limite para envio da NF (mês seguinte)','','number')+fld('discriminacaoPJ','Discriminação dos serviços','wfull','ta')+'</div></div>';
  out+='<div class="card"><h2>Folha de pagamento / ERP</h2><div class="fields">'+fld('codEmpresaPagadora','Cód. empresa pagadora (padrão)')+
    '<div class="f wfull"><span>Vínculos aceitos na folha / ERP</span><div class="row" style="gap:16px">'+VINC_FOLHA.map(([v,l])=>'<label class="chk-in"><input type="checkbox" id="ct_vf_'+safeKey(v)+'" data-chg="ctVincFolha" data-v="'+v+'"'+(vincFolha(d).includes(v)?' checked':'')+dis+'> '+l+'</label>').join('')+'</div></div>'+
    '<label class="f">Vínculo padrão<select id="ct_vinculoPadrao" data-chg="ct" data-f="vinculoPadrao"'+dis+'>'+vincFolha(d).map(v=>'<option'+(String(d.vinculoPadrao||'SOCIO').toUpperCase()===v?' selected':'')+'>'+v+'</option>').join('')+'</select></label>'+
    fld('taxaSocio','Taxa de sócio (R$)','','number')+fld('taxaSocioMinHoras','Cobrar taxa acima de (h)','','number')+fld('alertaValor','Alerta de valor acima de (R$)','','number')+'</div><p class="muted">Nº documento = nº do contrato + MM + AA. Cód. reduzido = sigla do CR + MM + AA. Vencimento padrão: último dia do mês seguinte à competência.</p></div>';
  if((edF||edV)&&d.id) out+='<div class="row"><span class="grow"></span><button class="btn pri" data-act="salvarCt">Salvar contrato</button></div>';
  return out;
}

function cardEmpresasFat(d,edF,disF){
  const EFs=d.empresasFat||[];
  return '<h3 style="margin-top:18px">Empresas de faturamento, impostos e vínculos</h3><p class="muted" style="margin-top:0">Cada empresa emite o próprio pedido de NF com os itens marcados para ela (coluna “Empresa faturamento” dos itens; em branco = a primeira da lista). As alíquotas (%) sobre o faturamento bruto geram o faturamento líquido do dashboard e do resumo.</p>'+
    '<div class="tbl"><table><thead><tr><th>Empresa</th><th>Cód. faturamento</th>'+IMPOSTOS_FAT.map(([n])=>'<th class="n">'+n+' %</th>').join('')+'<th class="n">Total</th><th>Vínculos</th><th></th></tr></thead><tbody>'+
    (EFs.length? EFs.map((e,i)=>'<tr><td><input type="text" list="empList" id="ef'+i+'s" value="'+esc(e.sigla||'')+'" data-chg="efCampo" data-i="'+i+'" data-f="sigla"'+disF+' style="min-width:80px;max-width:110px"></td><td><input type="text" id="ef'+i+'c" value="'+esc(e.cod==null?'':e.cod)+'" data-chg="efCampo" data-i="'+i+'" data-f="cod"'+disF+' style="min-width:60px;max-width:90px"></td>'+
      IMPOSTOS_FAT.map(([n,k])=>'<td class="n"><input type="text" inputmode="decimal" autocomplete="off" id="ef'+i+k+'" value="'+esc(dec(e[k]||''))+'" placeholder="0,00" data-chg="efCampo" data-i="'+i+'" data-f="'+k+'" data-num="1"'+disF+' style="width:68px;min-width:56px;max-width:68px"></td>').join('')+
      '<td class="n"><b>'+fH(IMPOSTOS_FAT.reduce((t,[n,k])=>t+num(e[k]),0))+'%</b></td><td style="white-space:nowrap">'+VINC_NF.map(([v,l])=>'<label class="chk-in"><input type="checkbox" id="ef'+i+'v'+safeKey(v)+'" data-chg="efVinc" data-i="'+i+'" data-v="'+v+'"'+((e.vinculos||[]).includes(v)?' checked':'')+disF+'> '+l+'</label>').join(' ')+'</td>'+
      '<td>'+(edF?'<button class="btn ghost sm" data-act="rmEf" data-i="'+i+'" aria-label="Remover empresa">✕</button>':'')+'</td></tr>').join('')
      : '<tr><td colspan="'+(IMPOSTOS_FAT.length+5)+'" class="muted">Nenhuma empresa. Adicione a empresa que fatura este contrato.</td></tr>')+'</tbody></table></div>'+
    (edF?'<div class="row" style="margin-top:8px"><button class="btn sm" data-act="addEf">Adicionar empresa de faturamento</button></div>':'');
}

/* ================= MÉDICOS ================= */
function viewMedicos(){
  const cs=S.contratos||[]; if(!S.medCt&&cs.length) S.medCt=cs[0].id;
  const ct=ctById(S.medCt); const lista=S.medicos[S.medCt]||{}; const ed=can('medicos');
  const head='<div class="head"><div><div class="eyebrow">Cadastros</div><h1>Médicos</h1><p>Base médica interna. O relatório do Pega Plantão não altera este cadastro: só entram no fechamento os CRMs cadastrados aqui.</p></div>'+
    '<div class="row"><label class="f">Contrato<select id="mCt" data-chg="medCt">'+cs.map(c=>'<option value="'+c.id+'"'+(c.id===S.medCt?' selected':'')+'>'+esc(c.sigla+' — '+c.nome)+'</option>').join('')+'</select></label>'+
    (ed&&ct?'<button class="btn pri" data-act="novoMedico">Incluir médico</button>':'')+(can('medicos_importar')&&ct?'<label class="btn" for="fBase">Importar base de médicos (.xlsx)</label><input type="file" id="fBase" accept=".xlsx,.xls,.xlsm" hidden data-chg="importBase">':'')+'</div></div>';
  if(!ct) return head+emptyState('Cadastre um contrato primeiro','');
  const q=normTxt(S.medQ);
  const ks=Object.keys(lista).filter(k=>lista[k]&&(!q||normTxt(lista[k].nome+' '+k+' '+(lista[k].cpfConta||'')).includes(q))).sort((a,b)=>(lista[a].nome||'').localeCompare(lista[b].nome||'','pt-BR'));
  if(!Object.keys(lista).length) return head+emptyState('Nenhum médico na base deste contrato','Inclua os médicos ou importe a planilha “Base Médicos” (colunas CRM, Nome Completo, CPF/CNPJ titular conta, Vínculo, Empresa pagadora…).');
  const its=Object.fromEntries(itensUniao(ct).map(i=>[i.id,i]));
  const trash='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg>';
  return head+'<div class="row"><input type="search" id="medQ" placeholder="Buscar por nome, CRM ou CPF" data-inp="medQ" style="max-width:320px"><span class="muted">'+ks.length+' médico(s)</span></div><div class="tbl fix mc1" data-keep="tmed"><table><thead><tr><th>Nome</th><th>CRM</th><th>Vínculo</th><th>Empresa pagadora</th><th>CPF/CNPJ titular conta</th><th>Empresa PJ</th><th>Simples</th><th>E-mail</th><th>Contato</th><th>Observações</th><th>Ativo</th><th></th></tr></thead><tbody>'+
    ks.map(k=>{const m=lista[k]; const incompleto=!m.cpfConta&&!m.cpf; const v2=m.vinculo2&&m.vinculo2.tipo?m.vinculo2:null;
      return '<tr><td>'+esc(m.nome)+(incompleto?' <span class="tag bad">sem CPF/CNPJ</span>':'')+'</td><td class="mono">'+esc(m.crm||k)+'</td>'+
        '<td style="white-space:nowrap">'+esc(m.vinculo||'(padrão: '+(ct.vinculoPadrao||'SOCIO')+')')+(v2?' <span class="tag info" title="'+esc('2º vínculo em: '+(v2.itens||[]).map(i=>its[i]?its[i].especialidade+' · '+its[i].tipo:i).join('; '))+'">+ '+esc(v2.tipo)+'</span>':'')+'</td>'+
        '<td>'+esc(m.empresaPagadora||'')+(v2&&v2.empresaPagadora?' <span class="muted">/ '+esc(v2.empresaPagadora)+'</span>':'')+'</td><td class="mono">'+esc(m.cpfConta||m.cpf||'')+(v2&&v2.cpfConta?' <span class="muted">/ '+esc(v2.cpfConta)+'</span>':'')+'</td><td>'+esc(m.empresaPJ||'')+'</td><td>'+(m.simples==='SIM'?'Sim':m.simples==='NAO'?'Não':'—')+'</td><td>'+esc(m.email||'')+'</td><td>'+esc(m.contato||'')+'</td><td style="max-width:260px;white-space:normal">'+esc(m.observacoes||'')+'</td>'+
        '<td>'+(m.ativo!==false?'Sim':'<span class="tag">inativo</span>')+'</td><td style="white-space:nowrap">'+(ed?'<button class="btn ghost sm" data-act="editMed" data-k="'+esc(k)+'">Editar</button>':'')+(can('medicos_excluir')?'<button class="btn ghost sm del" data-act="excluirMed" data-k="'+esc(k)+'" title="Excluir da base" aria-label="Excluir '+esc(m.nome)+'">'+trash+'</button>':'')+'</td></tr>';}).join('')+'</tbody></table></div>';
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
      '<div class="perm-grupos">'+GRUPOS_PERM.map(g=>{ const ks=PERMS.filter(x=>x[2]===g); const on=ks.filter(([k])=>permDe(u.perms,k)).length;
        return '<fieldset class="perm-g"><legend><label class="chk-in"><input type="checkbox" id="pg_'+safeKey(u.id)+'_'+safeKey(g)+'" data-chg="uPermGrupo" data-id="'+esc(u.id)+'" data-g="'+esc(g)+'"'+(on===ks.length?' checked':'')+' aria-label="Marcar todas de '+esc(g)+'"> <b>'+esc(g)+'</b> <span class="muted">'+on+'/'+ks.length+'</span></label></legend><div class="perm">'+
          ks.map(([k,l])=>'<label class="f chk"><input type="checkbox" id="pm_'+safeKey(u.id)+'_'+k+'" data-chg="uPerm" data-id="'+esc(u.id)+'" data-p="'+k+'"'+(permDe(u.perms,k)?' checked':'')+'> '+esc(l)+'</label>').join('')+'</div></fieldset>'; }).join('')+'</div></div>';}).join('')+'</div>';
  const emp=(S.config&&S.config.empresas)||[]; const nat=Object.assign({},NATUREZAS_PADRAO,(S.config&&S.config.naturezas)||{});
  out+='<div class="grid g2"><div class="card"><div class="row"><h2 class="grow">Empresas pagadoras</h2><button class="btn sm" data-act="addEmp">Adicionar</button></div><p class="muted">Tabela usada para o “Cod Empresa Pagadora” da importação no Sankhya.</p><div class="tbl" style="max-height:420px;overflow:auto"><table><thead><tr><th>Sigla</th><th>Razão abreviada</th><th class="n">Código</th><th></th></tr></thead><tbody>'+
    emp.map((e,i)=>'<tr><td><input type="text" id="em'+i+'s" value="'+esc(e.sigla)+'" data-chg="emp" data-i="'+i+'" data-f="sigla" style="min-width:90px"></td><td><input type="text" id="em'+i+'r" value="'+esc(e.razao)+'" data-chg="emp" data-i="'+i+'" data-f="razao"></td><td class="n"><input type="number" id="em'+i+'c" value="'+esc(e.cod)+'" data-chg="emp" data-i="'+i+'" data-f="cod"></td><td><button class="btn ghost sm" data-act="rmEmp" data-i="'+i+'" aria-label="Remover">✕</button></td></tr>').join('')+'</tbody></table></div></div>'+
    '<div class="card"><h2>Naturezas (tipo de pagamento)</h2><div class="fields">'+Object.keys(NATUREZAS_PADRAO).map(k=>'<label class="f">'+k+'<input type="number" id="nt_'+safeKey(k)+'" value="'+esc(nat[k])+'" data-chg="nat" data-f="'+esc(k)+'"></label>').join('')+'</div><p class="muted">SÓCIO → Honorários · RPA → RPA · PJ → PJ · PRÓ-LABORE → Pró-Labore.</p></div></div>';
  const ret=Object.assign({},RETENCOES_PADRAO,(S.config&&S.config.retencoes)||{});
  out+='<div class="grid g2"><div class="card"><h2>Retenções da NF de PJ (não optante do Simples)</h2><div class="fields">'+[['pis','PIS'],['cofins','COFINS'],['csll','CSLL'],['ir','IR']].map(([k,l])=>'<label class="f">'+l+' (%)<input type="text" inputmode="decimal" id="rt_'+k+'" value="'+dec(ret[k])+'" data-chg="retCfg" data-f="'+k+'"></label>').join('')+'</div><p class="muted">Aplicadas sobre o valor bruto na folha e na solicitação de NF quando o médico é PJ e não é optante do Simples Nacional (cadastro de Médicos).</p></div>'+
    '<div class="card"><h2>Assinatura dos e-mails</h2><label class="f">Texto da assinatura<textarea id="cfgAssin" data-chg="assinCfg" style="min-height:80px">'+esc((S.config&&S.config.assinaturaEmail)||'Gestão & Relacionamento - DOC CSC')+'</textarea></label></div></div>';
  const resp=(S.config&&S.config.responsaveis)||[];
  out+='<div class="card"><div class="row"><h2 class="grow">Responsáveis</h2><button class="btn sm" data-act="addResp">Adicionar responsável</button></div><p class="muted" style="margin-top:0">Responsáveis por área. O responsável de <b>Gestão de Escala</b> é escolhido em cada contrato.</p><div class="tbl"><table><thead><tr><th>Área</th><th>Nome</th><th>E-mail</th><th>Telefone</th><th></th></tr></thead><tbody>'+
    (resp.length? resp.map((r,i)=>'<tr><td><select id="rs'+i+'a" data-chg="resp" data-i="'+i+'" data-f="area">'+AREAS_RESP.map(a=>'<option'+(r.area===a?' selected':'')+'>'+a+'</option>').join('')+'</select></td><td><input type="text" id="rs'+i+'n" value="'+esc(r.nome||'')+'" data-chg="resp" data-i="'+i+'" data-f="nome" style="min-width:180px"></td><td><input type="email" id="rs'+i+'e" value="'+esc(r.email||'')+'" data-chg="resp" data-i="'+i+'" data-f="email" style="min-width:200px"></td><td><input type="text" id="rs'+i+'t" value="'+esc(r.telefone||'')+'" data-chg="resp" data-i="'+i+'" data-f="telefone"></td><td><button class="btn ghost sm" data-act="rmResp" data-i="'+i+'" aria-label="Remover responsável">✕</button></td></tr>').join('')
      : '<tr><td colspan="5" class="muted">Nenhum responsável cadastrado.</td></tr>')+'</tbody></table></div></div>';
  return out;
}

/* ================= MODAIS ================= */
function viewModal(){
  const m=S.modal;
  if(m.type==='vigencia'){ const V=calcVigencia(m);
    const T=tabelasDoContrato(m.ctBase).find(t=>t.id===m.tabelaId)||{};
    return '<h2>A partir de quando os novos valores valem?</h2><p class="muted" style="margin:0">Tabela <b>'+esc(T.nome||'original')+'</b> (vigente desde '+(T.vigencia?compTxt(T.vigencia):'o início do contrato')+'). '+m.mudancas.length+' alteração(ões):</p>'+
      '<div class="tbl" style="max-height:180px;overflow:auto"><table><tbody>'+m.mudancas.map(x=>'<tr><td style="white-space:normal">'+esc(x.item)+'</td><td>'+esc(x.campo)+'</td><td class="n">'+(x.texto?esc(x.texto):brl(x.de)+' → <b>'+brl(x.para)+'</b>')+'</td></tr>').join('')+'</tbody></table></div>'+
      '<label class="f chk"><input type="radio" name="vgModo" id="vgNova" data-chg="vgCampo" data-f="modo" value="nova"'+(m.modo==='nova'?' checked':'')+'> Valem a partir de uma data (cria nova tabela; as anteriores ficam com os valores atuais)</label>'+
      (m.modo==='nova'?'<div class="fields" style="padding-left:26px"><label class="f">Vigente a partir de<input type="date" id="vgV" value="'+esc(m.V||'')+'" data-chg="vgCampo" data-f="V"></label><label class="f w2">Nome da nova tabela<input type="text" id="vgNome" value="'+esc(m.nome||'')+'" data-inp="vgCampo" data-f="nome"></label><label class="f">Tipo<select id="vgTipo" data-chg="vgCampo" data-f="tipo"><option value="reajuste"'+(m.tipo==='reajuste'?' selected':'')+'>Reajuste</option><option value="aditivo"'+(m.tipo==='aditivo'?' selected':'')+'>Aditivo</option></select></label></div>':'')+
      '<label class="f chk"><input type="radio" name="vgModo" id="vgCorr" data-chg="vgCampo" data-f="modo" value="corrigir"'+(m.modo==='corrigir'?' checked':'')+'> Corrigir a própria tabela (vale desde '+(T.vigencia?compTxt(T.vigencia):'o início do contrato')+')</label>'+
      (V.erro?'<div class="banner bad">'+esc(V.erro)+'</div>':'')+
      (V.retro?'<div class="banner warn"><div><b>Alteração retroativa.</b> Afeta '+V.afetados.length+' fechamento(s) já existente(s): '+V.afetados.map(x=>esc(compTxt(x.competencia))+(lock(x)?' (aprovado — só muda se for reaberto)':' (será recalculado)')).join(', ')+'.</div></div><label class="f">Justificativa (obrigatória)<textarea id="vgJust" data-inp="vgCampo" data-f="just" style="min-height:70px" placeholder="Ex.: reajuste contratual aprovado em ata, retroativo a setembro">'+esc(m.just||'')+'</textarea></label>':
        (V.afetados.length?'<p class="muted" style="margin:0">Fechamentos em andamento a partir dessa competência serão recalculados.</p>':''))+
      '<div class="row"><span class="grow"></span><button class="btn" data-act="modalClose">Cancelar</button><button class="btn pri" data-act="vgConfirmar"'+(V.erro?' disabled':'')+'>Confirmar e salvar</button></div>';
  }
  if(m.type==='novaTabela'){ const retro=!!m.V&&(S.fechs||[]).some(x=>x.contratoId===S.draft.id&&refFech(x)>=normVig(m.V)&&(x.competencia<mesAtual()||lock(x)));
    return '<h2>'+(m.tipo==='aditivo'?'Novo aditivo':'Novo reajuste')+'</h2><p class="muted" style="margin:0">Cria uma nova tabela a partir da tabela <b>'+esc(m.base)+'</b>. Depois altere os valores e salve o contrato.</p>'+
      '<div class="fields"><label class="f w2">Nome da tabela<input type="text" id="ntNome" value="'+esc(m.nome)+'" data-inp="ntCampo" data-f="nome"></label><label class="f">Vigente a partir de<input type="date" id="ntV" value="'+esc(m.V)+'" data-chg="ntCampo" data-f="V"></label></div>'+
      (retro?'<div class="banner warn">Vigência retroativa: já há fechamentos a partir dessa competência.</div><label class="f">Justificativa (obrigatória)<textarea id="ntJust" data-inp="ntCampo" data-f="just" style="min-height:70px">'+esc(m.just||'')+'</textarea></label>':'')+
      '<div class="row"><span class="grow"></span><button class="btn" data-act="modalClose">Cancelar</button><button class="btn pri" data-act="ntConfirmar">Criar tabela</button></div>';
  }
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
  if(m.type==='email'){
    const env=window.__email;
    return '<h2>'+esc(m.titulo)+'</h2>'+
      '<div class="fields"><label class="f w2">Para<input type="text" id="emTo" value="'+esc(m.to)+'" data-inp="emField" data-f="to" placeholder="e-mail do médico"></label>'+(m.tipo==='nf'?'<label class="f">Prazo para envio da NF<input type="date" id="emPrazo" value="'+esc(m.prazo)+'" data-chg="emailPrazo"></label>':'')+
      '<label class="f wfull">Assunto<input type="text" id="emAssunto" value="'+esc(m.subject)+'" data-inp="emField" data-f="subject"></label>'+
      '<label class="f wfull">Mensagem<textarea id="emCorpo" style="min-height:300px;font-size:.84rem" data-inp="emField" data-f="body">'+esc(m.body)+'</textarea></label></div>'+
      (!m.to?'<div class="banner warn">Este médico não tem e-mail no cadastro. Informe acima ou cadastre em Médicos.</div>':'')+
      (env?'':'<p class="muted" style="margin:0;font-size:.82rem">O envio direto pelo sistema não está configurado. Use “Abrir no meu e-mail” ou copie o texto.</p>')+
      '<div class="row"><button class="btn" data-act="emailCopiar">Copiar texto</button><button class="btn" data-act="emailAbrir">Abrir no meu e-mail</button><span class="grow"></span><button class="btn" data-act="modalClose">Cancelar</button>'+(env?'<button class="btn pri" data-act="emailEnviar"'+(S.busy?' disabled':'')+'>'+(S.busy?'Enviando…':'Enviar e-mail')+'</button>':'')+'</div>';
  }
  if(m.type==='folhaMed'){ const d=m.d; const E=(S.config&&S.config.empresas)||[]; const fixo=m.modo==='edit'&&!m.manual;
    const inp=(fl,l,cls,ro,numr)=>'<label class="f '+(cls||'')+'">'+l+'<input type="text" id="fm_'+fl+'" value="'+esc(numr?dec(d[fl]||''):(d[fl]==null?'':d[fl]))+'" data-inp="fmCampo" data-f="'+fl+'"'+(numr?' inputmode="decimal" autocomplete="off"':'')+(ro?' readonly':'')+(fl==='empresa'?' list="empListF"':'')+'></label>';
    return '<h2>'+(m.modo==='add'?'Incluir médico na folha':'Editar médico na folha')+'</h2>'+(fixo?'<p class="muted" style="margin:0">Calculado pelo fechamento: '+brl(m.orig.total)+' · '+fH(m.orig.horas)+' h · '+esc(m.orig.vinculo)+' · '+esc(m.orig.empresa||'sem empresa')+'</p>':'')+
      '<datalist id="empListF">'+E.map(e=>'<option value="'+esc(e.sigla)+'">'+esc(e.razao)+'</option>').join('')+'</datalist>'+
      '<div class="fields">'+inp('nome','Nome','w2',fixo)+inp('crm','CRM','',fixo)+inp('cpfConta','CPF/CNPJ da conta')+
      '<label class="f">Vínculo<select id="fm_vinculo" data-chg="fmCampo" data-f="vinculo">'+FOLHA_VINC.map(v=>'<option'+(d.vinculo===v?' selected':'')+'>'+v+'</option>').join('')+'</select></label>'+
      inp('empresa','Empresa pagadora')+inp('horas','Horas','',false,true)+inp('total','Valor bruto (R$)','',false,true)+'</div>'+
      '<label class="f">Justificativa (obrigatória)<textarea id="fm_just" data-inp="fmCampo" data-f="just" style="min-height:80px" placeholder="Ex.: plantão de cobertura pago fora da escala, autorizado pela coordenação">'+esc(d.just||'')+'</textarea></label>'+
      '<div class="row"><span class="grow"></span><button class="btn" data-act="modalClose">Cancelar</button><button class="btn pri" data-act="folhaSalvar">Salvar</button></div>';
  }
  if(m.type==='medico'){ const d=m.d; const v2=d.vinculo2||{}; const ct=ctById(m.ct)||{}; const its=itensUniao(ct); const E=(S.config&&S.config.empresas)||[];
    const inp=(fl,l,cls,ph)=>{ const val=fl.startsWith('vinculo2.')? v2[fl.slice(9)] : d[fl]; return '<label class="f '+(cls||'')+'">'+l+'<input type="text" id="md_'+fl.replace('.','_')+'" value="'+esc(val==null?'':val)+'" data-inp="mdCampo" data-f="'+fl+'"'+(ph?' placeholder="'+esc(ph)+'"':'')+(/empresaPagadora$/.test(fl)?' list="empListM"':'')+'></label>'; };
    const selV=(fl,val,padrao)=>'<label class="f">Vínculo<select id="md_'+fl.replace('.','_')+'" data-chg="mdCampo" data-f="'+fl+'">'+(padrao?'<option value="">(padrão do contrato: '+esc(ct.vinculoPadrao||'SOCIO')+')</option>':'<option value="">Escolha…</option>')+VINCULOS.concat(val&&!VINCULOS.includes(val)?[val]:[]).map(v=>'<option'+(val===v?' selected':'')+'>'+v+'</option>').join('')+'</select></label>';
    const selS=(fl,val)=>'<label class="f">Simples Nacional<select id="md_'+fl.replace('.','_')+'" data-chg="mdCampo" data-f="'+fl+'"><option value="">—</option><option value="SIM"'+(val==='SIM'?' selected':'')+'>Sim</option><option value="NAO"'+(val==='NAO'?' selected':'')+'>Não</option></select></label>';
    return '<h2>'+(m.k?'Editar médico':'Incluir médico')+'</h2><p class="muted" style="margin:0">Base médica interna do contrato '+esc(ct.sigla||'')+'. Só os CRMs cadastrados aqui entram no fechamento.</p>'+
      '<datalist id="empListM">'+E.map(e=>'<option value="'+esc(e.sigla)+'">'+esc(e.razao)+'</option>').join('')+'</datalist>'+
      '<div class="fields">'+inp('crm','CRM','','Ex.: 12345/PR')+inp('nome','Nome completo','w2')+inp('cpf','CPF')+inp('email','E-mail','w2')+inp('contato','Contato')+inp('formalizacao','Formalização do vínculo')+inp('observacoes','Observações','w2')+
      '<label class="f chk"><input type="checkbox" id="md_ativo" data-chg="mdChk" data-f="ativo"'+(d.ativo!==false?' checked':'')+'> Ativo</label></div>'+
      '<h3 style="margin:4px 0 0">1º vínculo</h3><div class="fields">'+selV('vinculo',d.vinculo,true)+inp('empresaPagadora','Empresa pagadora')+inp('cpfConta','CPF/CNPJ titular da conta')+inp('empresaPJ','Empresa PJ')+selS('simples',d.simples)+'</div>'+
      '<label class="f chk"><input type="checkbox" id="md_tem2" data-chg="mdTem2"'+(d.vinculo2?' checked':'')+'> Possui segundo vínculo neste contrato</label>'+
      (d.vinculo2? '<div class="fields">'+selV('vinculo2.tipo',v2.tipo,false)+inp('vinculo2.empresaPagadora','Empresa pagadora')+inp('vinculo2.cpfConta','CPF/CNPJ titular da conta')+inp('vinculo2.empresaPJ','Empresa PJ')+selS('vinculo2.simples',v2.simples)+'</div>'+
        '<div class="f"><span>O 2º vínculo vale para as especialidades / tipos (os demais usam o 1º vínculo):</span><div class="chk-grid">'+(its.length?its.map(i=>'<label class="chk-in"><input type="checkbox" id="md_v2i_'+esc(i.id)+'" data-chg="mdV2Item" data-id="'+esc(i.id)+'"'+((v2.itens||[]).includes(i.id)?' checked':'')+'> '+esc(i.especialidade+' · '+i.tipo)+'</label>').join(''):'<span class="muted">O contrato não tem itens.</span>')+'</div></div>':'')+
      '<div class="row"><span class="grow"></span><button class="btn" data-act="modalClose">Cancelar</button><button class="btn pri" data-act="mdSalvar">Salvar médico</button></div>';
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
  // só entram médicos da base médica interna do contrato; o relatório não cadastra nem altera médicos
  const reg=S.medicos[ct.id]||{}; const porDig={}; Object.keys(reg).forEach(k=>{ if(reg[k]) porDig[crmDigits(k)]=k; });
  const sem={}; const rowsOk=[];
  for(const r of parsed.rows){ const kk= /^SEMCRM_/.test(r.k)? '' : (reg[r.k]? r.k : porDig[crmDigits(r.k)]);
    if(kk) rowsOk.push(kk===r.k? r : {...r,k:kk});
    else { const x=sem[r.k]||(sem[r.k]={crm:r.crm,nome:r.nome,n:0,horas:0}); x.n++; x.horas=r4(x.horas+r.apur); } }
  if(!rowsOk.length) throw new Error('Nenhum médico do relatório está na base médica do contrato '+(ct.sigla||'')+'. Cadastre os médicos em Médicos (ou importe a planilha da base) e importe de novo.');
  const ag=agregar(rowsOk);
  Object.keys(ag.medicos).forEach(k=>{ const m=reg[k]; if(m) ag.medicos[k]={...ag.medicos[k],nome:m.nome||ag.medicos[k].nome,crm:m.crm||ag.medicos[k].crm}; });
  const semCadastro=Object.values(sem).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')).slice(0,400);
  const ex=fechById(id);
  // vínculos de setor: auto-sugestão para setores novos
  const mapa=(ct.mapeamento||[]).slice(); let novos=0; const its=itensUniao(ct); const itM=Object.fromEntries(its.map(i=>[i.id,i]));
  // um vínculo por setor; se o item não vale para fim de semana (ou dia de semana), sugere um vínculo próprio "setor#FDS"
  Object.keys(ag.setores).forEach(s=>{ ((ag.classes&&ag.classes[s])||['']).forEach(c=>{ const M=Object.fromEntries(mapa.map(m=>[m.s,m.item]));
    if(c&&M[s+'#'+c]) return; const b=M[s]; if(b&&(b==='__ignorar'||!itM[b]||cobreClasse(itM[b],c))) return;
    const sug=sugerirItem(s,its,c); if(!sug) return; mapa.push(b?{s:s+'#'+c,item:sug}:{s,item:sug}); novos++; }); });
  if(novos) await wr('contratos/'+ct.id,()=>S.db.doc('contratos/'+ct.id).update({mapeamento:mapa}));
  // plantões detalhados em blocos
  const tup=rowsOk.map(r=>[r.k,r.data,r.tipo,setorKey(r),r4(r.plan),r4(r.real),r4(r.apur),r.sit,r.ini,r.fim,r.c||'']);
  const CH=700, nCh=Math.ceil(tup.length/CH);
  for(let i=0;i<nCh;i++){ const p='plantoes/'+id+'_'+i; await wr(p,()=>S.db.doc(p).set({fechId:id,n:i,rows:tup.slice(i*CH,(i+1)*CH).map(t=>JSON.stringify(t))})); }
  if(ex&&ex.chunks>nCh){ for(let i=nCh;i<ex.chunks;i++){ const p='plantoes/'+id+'_'+i; await wr(p,()=>S.db.doc(p).delete()); } }
  const txt='Relatório importado: '+nomeArq+' ('+rowsOk.length+' plantões'+(parsed.periodo?', período '+parsed.periodo:'')+')'+(semCadastro.length?'. '+(parsed.rows.length-rowsOk.length)+' plantão(ões) de '+semCadastro.length+' médico(s) sem cadastro ficaram de fora':'');
  const docBase={contratoId:ct.id,competencia:comp,arquivo:nomeArq,periodo:parsed.periodo||'',geradoEm:parsed.geradoEm||'',base:ag.base,medicos:ag.medicos,chunks:nCh,qtdPlantoes:rowsOk.length,semCadastro};
  if(ex){ await wr('fechamentos/'+id,()=>fechRef(id).update({...docBase,status:'conferencia',t:{...(ex.t||{}),importado:nowISO()},eventos:evento(ex,'import','Reimportação. '+txt)})); }
  else { await wr('fechamentos/'+id,()=>fechRef(id).set({...docBase,status:'conferencia',ajustes:{},conferidos:{},t:{inicio:nowISO(),importado:nowISO()},criadoPor:S.uid,eventos:[{tipo:'import',texto:'Fechamento iniciado. '+txt,por:S.uid,em:nowISO()}],obs:{texto:'',historico:[]}})); }
  // o cadastro de médicos não é alterado pela importação (base médica interna)
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
function nomePENF(ct,f,P){ return 'PENF_'+(ct.sigla||'')+'_'+(P&&P.multi?(safeKey(P.sigla)||'sem_empresa').toUpperCase()+'_':'')+f.competencia.replace('-','')+'.xlsx'; }
function wbPENF(P,ct,f){
  const wb=XLSX.utils.book_new();
  const a=[[null,null,null,null,null,null,null,null,'Parceiro',P.parceiro],[null,null,'PEDIDO DE EMISSÃO DE NOTA FISCAL',null,null,null,null,null,'Empresas ',P.empresas],[null,null,null,null,null,null,null,null,'Cidade ISS',P.cidadeISS],
    [null,null,'Empresa: '+P.empresa,null,'Data:',dateCell(P.data),null,null,'Tipo Operação',P.tipoOperacao],[null,null,null,null,null,null,null,null,'Centro de Resultado',P.centroResultado],
    [null,null,'Tomador: '+P.tomador,null,null,null,null,null,'Produto/ Serviço',P.produtoServico],[null,null,'CNPJ: '+P.cnpj],[null,null,'Endereço: '+P.endereco],[null,null,'Município: '+P.municipio,null,null,null,null,null,P.quantidade],
    [null,null,null,null,null,null,null,null,P.valor],[null,null,'DESCRIÇAO DOS SERVIÇOS:'],[null,null,P.descricao],[null,null,'Empenho: '+P.empenho],[null,null,P.vinculos?'Vínculos: '+P.vinculos:null],[null,null,'VALOR TOTAL DA NOTA: ',null,P.valor,null,null,null,null,P.quantidade,null,P.valor]];
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
/* ---------- tabelas de valores: vigência, retroatividade e histórico ---------- */
function mesAtual(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
/** Situação da decisão no modal de vigência: vigência efetiva, se é retroativa e quais fechamentos atinge. */
function calcVigencia(m){
  const ts=tabelasDoContrato(m.ctBase); const T=ts.find(t=>t.id===m.tabelaId)||{};
  let vig, erro='';
  if(m.modo==='nova'){
    vig=normVig(m.V);
    if(!vig) erro='Informe a data a partir da qual os valores valem.';
    else if(T.vigencia&&vig<=normVig(T.vigencia)) erro='A data precisa ser posterior a '+compTxt(normVig(T.vigencia))+' (início da tabela atual). Para valer desde lá, escolha “Corrigir a própria tabela”.';
    else if(ts.some(t=>t.id!==T.id&&normVig(t.vigencia)===vig)) erro='Já existe uma tabela vigente a partir de '+compTxt(vig)+'. Edite essa tabela.';
    else if(m.multi) erro='Mais de uma tabela foi alterada. Corrija as tabelas ou salve uma de cada vez.';
  } else vig=normVig(T.vigencia);
  // até onde a decisão vale: próxima tabela com vigência posterior
  const prox=ts.filter(t=>t.vigencia&&normVig(t.vigencia)>(vig||'')&&t.id!==T.id).map(t=>normVig(t.vigencia)).sort()[0]||'9999-12-31';
  // fechamento atingido = data de referência (fim do período) dentro da vigência
  const afetados=(S.fechs||[]).filter(x=>x.contratoId===m.ctBase.id&&refFech(x)>=(vig||'')&&refFech(x)<prox);
  // retroativa = atinge fechamento de mês passado ou fechamento já aprovado
  const retro=!erro&&afetados.some(x=>x.competencia<mesAtual()||lock(x));
  return {vig,erro,afetados,retro};
}
function pedirVigencia(o){
  const ts=tabelasDoContrato(o.ctBase); const T=ts.find(t=>t.id===o.tabelaId)||ts[0];
  const mud=diffTabela(T,{...T,...(o.novosCampos||{}),itens:o.novosItens});
  if(!mud.length){ if(o.semMudanca) o.semMudanca(); return; }
  const ref=normVig(o.compRef||nowISO().slice(0,10));
  const temAnteriores=(S.fechs||[]).some(x=>x.contratoId===o.ctBase.id&&refFech(x)>=normVig(T.vigencia)&&refFech(x)<ref);
  const modo=(!temAnteriores||(T.vigencia&&normVig(T.vigencia)>=ref))?'corrigir':'nova';
  S.modal={type:'vigencia',...o,tabelaId:T.id,mudancas:mud,modo,V:ref,nome:'Reajuste '+compTxt(ref.slice(0,7)),tipo:'reajuste',just:''};
  render();
}
const camposTab=o=>({basePag:(o&&o.basePag)||'apurada',baseFat:(o&&o.baseFat)||'apurada',valorFixoMensal:num(o&&o.valorFixoMensal)});
/** Aplica a decisão: cria nova tabela ou corrige a existente, registra histórico e avisa os fechamentos atingidos. */
async function aplicarVigencia(){
  const m=S.modal; const V=calcVigencia(m);
  if(V.erro){ toast(V.erro,'bad'); return; }
  if(V.retro&&(m.just||'').trim().length<10){ toast('Alteração retroativa: escreva a justificativa (mínimo 10 caracteres).','bad'); return; }
  const base=JSON.parse(JSON.stringify(m.ctBase));
  const tabs=JSON.parse(JSON.stringify(tabelasDoContrato(base)));
  const T=tabs.find(t=>t.id===m.tabelaId);
  let texto;
  if(m.modo==='nova'){
    const nova={id:uidGen('t'),nome:(m.nome||'').trim()||('Reajuste '+compTxt(V.vig)),tipo:m.tipo||'reajuste',vigencia:V.vig,...camposTab(m.novosCampos||T),itens:JSON.parse(JSON.stringify(m.novosItens)),criadoEm:nowISO(),criadoPor:S.uid};
    tabs.push(nova); texto='Nova tabela “'+nova.nome+'” ('+(nova.tipo==='aditivo'?'aditivo':'reajuste')+') vigente a partir de '+compTxt(V.vig);
    m.novaId=nova.id;
  } else { T.itens=JSON.parse(JSON.stringify(m.novosItens)); if(m.novosCampos) Object.assign(T,camposTab(m.novosCampos)); texto='Correção da tabela “'+(T.nome||'original')+'” (vale desde '+(T.vigencia?compTxt(T.vigencia):'o início do contrato')+')'; }
  const reg={em:nowISO(),por:S.uid,tipo:m.modo==='nova'?'nova_tabela':'correcao',texto,tabela:m.modo==='nova'?m.nome:T.nome,vigencia:V.vig,retroativo:!!V.retro,justificativa:(m.just||'').trim(),mudancas:m.mudancas.slice(0,60),origem:m.origem};
  const doc={...base,...(m.extras||{}),tabelas:tabs,historico:[...(base.historico||[]),...(m.pendentes||[]),reg].slice(-300)};
  doc.itens=tabelaVigente(doc,mesAtual()).itens;
  const id=doc.id; delete doc.id; delete doc.tabSel; doc.atualizadoEm=nowISO(); doc.atualizadoPor=S.uid;
  S.modal=null; render();
  await wr('contratos/'+id,()=>S.db.doc('contratos/'+id).set(doc));
  for(const x of V.afetados){ if(!lock(x)) updFech(x.id,{eventos:evento(x,'valor','Valores do contrato alterados: '+texto+(reg.retroativo?' — retroativo. Justificativa: '+reg.justificativa:''))}); }
  toast('Valores salvos. '+texto+'.');
  if(m.origem==='editor'){ S.draft=null; S.v='ct'; render(); }
}
/* ---------- e-mails aos médicos ---------- */
function vinculoDe(ct,k){ const m=(S.medicos[ct.id]||{})[k]||{}; return String(m.vinculo||ct.vinculoPadrao||'SOCIO').toUpperCase(); }
function temPJ(ct,k){ const m=(S.medicos[ct.id]||{})[k]||{}; return vinculoDe(ct,k)==='PJ'||String((m.vinculo2&&m.vinculo2.tipo)||'').toUpperCase()==='PJ'; }
function botoesEmail(f,ct,k){
  if(!can('emails')) return '';
  const env=(f.envios||{})[k]||{}; const pj=temPJ(ct,k);
  const quando=e=>e?' — '+(e.via==='enviado'?'enviado':'preparado')+' em '+fDT(e.em):'';
  return '<button class="btn ghost sm mail'+(env.demo?' sent':'')+'" data-act="emailDemo" data-k="'+esc(k)+'" title="Enviar demonstrativo de horas e valores'+esc(quando(env.demo))+'" aria-label="Enviar demonstrativo por e-mail"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></button>'+
    (pj?'<button class="btn ghost sm mail'+(env.nf?' sent':'')+'" data-act="emailNF" data-k="'+esc(k)+'" title="Solicitar NF ao médico PJ'+esc(quando(env.nf))+'">NF</button>':'');
}
const mesExtenso=comp=>{ const n=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']; const [y,m]=String(comp).split('-'); return n[+m-1]+'/'+y; };
function prazoPadraoNF(ct,comp){ const [y,m]=comp.split('-').map(Number); const dia=Math.min(28,Math.max(1,num(ct.diaLimiteNF)||17)); const d=new Date(Date.UTC(y,m,dia)); return d.toISOString().slice(0,10); }
function dadosMedico(f,ct,k){
  const c=calcular(f,ct); const F=folhaAtual(f,ct,c);
  const rs=(F.rows||[]).concat((F.fora&&F.fora.rows)||[]).filter(x=>x.k===k);
  const r= rs.length<=1? (rs[0]||{}) : rs.reduce((a,x)=>({...a,total:r2(a.total+x.total),pn:r2(a.pn+x.pn),aReceber:r2(a.aReceber+x.aReceber),ret:r2(a.ret+x.ret),taxa:r2(a.taxa+x.taxa),liq:r2(a.liq+x.liq),horas:r4(a.horas+x.horas),retAuto:a.retAuto||x.retAuto}),{...rs[0],total:0,pn:0,aReceber:0,ret:0,taxa:0,liq:0,horas:0,retAuto:null});
  const reg=(S.medicos[ct.id]||{})[k]||{}; const mf=(f.medicos||{})[k]||{};
  return {c,r,linhas:c.linhas.filter(l=>l.k===k),nome:reg.nome||mf.nome||r.nome||k,email:(reg.email||mf.email||'').trim()};
}
function textoDemonstrativo(f,ct,k){
  const D=dadosMedico(f,ct,k); const r=D.r; const ass=(S.config&&S.config.assinaturaEmail)||'Gestão & Relacionamento - DOC CSC';
  const hT=D.linhas.reduce((s,l)=>s+(l.uPag==='hora'?l.qPag:l.apur),0);
  const L=['Prezado(a) Dr(a) '+D.nome+',','',
    'Segue o demonstrativo dos seus plantões no contrato '+(ct.sigla||'')+' - '+(ct.nome||'')+', competência '+mesExtenso(f.competencia)+(f.periodo?' (período '+f.periodo+')':'')+'.','',
    ...D.linhas.map(l=>'• '+l.esp+' · '+l.tipo+': '+fH(l.qPag)+' '+(UNIDADES[l.uPag]||'').toLowerCase()+(l.qPag===1?'':'s')+' × '+brl(l.vPag)+' = '+brl(l.totPag)),'',
    'Total de horas trabalhadas: '+fH(hT)+' h',
    'Valor bruto: '+brl(r.total)];
  if(r.pn) L.push('(-) Desconto PN: '+brl(r.pn));
  if(r.ret) L.push('(-) Retenções'+(r.retAuto&&!r.retManual?' (PIS, COFINS, CSLL e IR)':'')+': '+brl(r.ret));
  if(r.taxa) L.push('(-) Taxa de sócio: '+brl(r.taxa));
  L.push('Valor total a receber: '+brl(r.liq),'','Em caso de divergência, responda este e-mail.','','Atenciosamente,',ass);
  return {to:D.email,subject:'Demonstrativo de plantões — '+(ct.sigla||'')+' — '+mesExtenso(f.competencia),body:L.join('\n'),nome:D.nome};
}
function textoSolicitaNF(f,ct,k,prazo){
  const D=dadosMedico(f,ct,k); const r=D.r; const ass=(S.config&&S.config.assinaturaEmail)||'Gestão & Relacionamento - DOC CSC';
  const bruto=r.aReceber!=null?r.aReceber:r.total; const simples=!!r.simples; const R=retencoesNF(bruto,S.config&&S.config.retencoes);
  const ref=mesExtenso(f.competencia);
  const L=['Prezado(a) Dr(a) '+D.nome+'.','',
    'Segue solicitação de NF. As notas devem ser emitidas e enviadas até '+fD(prazo)+' para pagamento na data prevista.','',
    'Gentileza retornar o mais breve possível.','',
    'TOMADOR DE SERVIÇOS',
    'Razão Social: '+(ct.tomador||''),'CNPJ: '+(ct.cnpj||''),'Endereço: '+(ct.endereco||''),'CEP: '+(ct.cep||''),'Município: '+(ct.municipio||''),'',
    'VALOR BRUTO PARA EMISSÃO',
    'Valor bruto: '+brl(bruto),'Referência: '+ref,''];
  if(simples) L.push('CÁLCULO DA NF (empresa optante do Simples Nacional)','Base de cálculo: '+brl(bruto),'Total retido: '+brl(0),'Valor da NF líquido: '+brl(bruto),'');
  else L.push('CÁLCULO DA NF (empresa não optante do Simples Nacional)','Base de cálculo: '+brl(bruto),...R.itens.map(i=>i.nome+' (-) '+String(i.pct).replace('.',',')+'%: '+brl(i.valor)),'Total retido: '+brl(R.total),'Valor da NF líquido: '+brl(R.liquido),'');
  L.push('DISCRIMINAÇÃO DOS SERVIÇOS',(ct.discriminacaoPJ||'Conforme padrão da contabilidade'),'',
    'INFORMAÇÕES OBRIGATÓRIAS NA NF (DESCRIÇÃO / DISCRIMINAÇÃO DOS SERVIÇOS)',
    '1. Local e Município da prestação dos serviços.',(ct.localPrestacao||ct.municipio||''),'',
    '2. Instrução Normativa abaixo, na íntegra',
    'O serviço é executado pelo próprio sócio, o que desobriga a contratante da retenção do INSS (IN 2110/2022 ART. 115, INCISO III, §2º E §3º.)','',
    '3. Mês de referência do Serviço;',ref,'',
    '4. Dados bancários para pagamento, conforme modelo.',
    'Nome da empresa','Nome do Sócio que executou os serviços','Banco:','Agência:','Conta:','CNPJ (conta empresarial)','',
    '**ATENÇÃO**','Os pagamentos referentes a médicos Pessoa Jurídica deverão, preferencialmente, ser efetuados em conta corrente Pessoa Jurídica.','',
    'Atenciosamente,',ass);
  return {to:D.email,subject:'Solicitação de NF — '+(ct.sigla||'')+' — '+ref+' — '+D.nome,body:L.join('\n'),nome:D.nome};
}
function abrirEmail(tipo,k){
  const f=fechById(S.fid); const ct=ctById(f.contratoId); if(!f||!ct) return;
  const prazo=(f.folhaParams&&f.folhaParams.prazoNF)||prazoPadraoNF(ct,f.competencia);
  const t= tipo==='nf'? textoSolicitaNF(f,ct,k,prazo) : textoDemonstrativo(f,ct,k);
  S.modal={type:'email',tipo,k,prazo,titulo:(tipo==='nf'?'Solicitar NF — ':'Demonstrativo — ')+t.nome,to:t.to,subject:t.subject,body:t.body};
  render();
}
function registrarEnvio(via){
  const m=S.modal; const f=fechById(S.fid); if(!m||!f) return;
  const campo=m.tipo==='nf'?'nf':'demo';
  const nomes={enviado:'enviado',aberto:'aberto no programa de e-mail',copiado:'copiado'};
  updFech(f.id,{envios:{[m.k]:{[campo]:{via,em:nowISO(),por:S.uid,to:m.to}}},eventos:evento(f,'email',(m.tipo==='nf'?'Solicitação de NF':'Demonstrativo')+' para '+m.titulo.split(' — ').pop()+' ('+(m.to||'sem e-mail')+'): '+nomes[via])});
}
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
  confSel(){ const f=fechById(S.fid); const ct=ctById(f.contratoId); const c=calcular(f,ct); const ks=c.linhas.filter(l=>S.conf.sel[l.key]).map(l=>l.key); if(!ks.length) return;
    const conf={}; ks.forEach(k=>conf[k]=true); S.conf.sel={};
    updFech(f.id,{conferidos:conf,eventos:evento(f,'conf',ks.length+' linha(s) conferidas em lote')}); toast(ks.length+' linha(s) conferidas.'); },
  desconfSel(){ const f=fechById(S.fid); const ct=ctById(f.contratoId); const c=calcular(f,ct); const ks=c.linhas.filter(l=>S.conf.sel[l.key]).map(l=>l.key); if(!ks.length) return;
    const conf={}; ks.forEach(k=>conf[k]=false); S.conf.sel={};
    updFech(f.id,{conferidos:conf,eventos:evento(f,'conf','Conferência desmarcada em '+ks.length+' linha(s)')}); },
  async baixarDetPP(){ const f=fechById(S.fid); const ct=ctById(f.contratoId)||{}; toast('Preparando o detalhamento do Pega Plantão…');
    if(!S.shifts[f.id]){ S.shifts[f.id]=undefined; await carregarPlantoes(f); }
    const all=S.shifts[f.id]||[]; const map=Object.fromEntries((ct.mapeamento||[]).map(m=>[m.s,m.item])); const its=Object.fromEntries(itensUniao(ct).map(i=>[i.id,i])); const meds=f.medicos||{};
    const a=[['CRM','Médico','Data','Dia','Tipo de plantão','Local | Setor','Item do contrato','Horas planejadas','Horas realizadas','Horas apuradas','Situação','Início','Fim']];
    all.forEach(r=>{ const cl=r[10]||''; const it=(cl&&map[r[3]+'#'+cl])||map[r[3]]; const iT= it==='__ignorar'?'Não faturar' : it&&its[it]? its[it].especialidade+' · '+its[it].tipo : 'Sem vínculo'; const m=meds[r[0]]||{};
      a.push([m.crm||r[0],m.nome||r[0],r[1],cl==='FDS'?'Fim de semana':cl==='DS'?'Dia de semana':'',r[2],r[3],iT,r[4],r[5],r[6],r[7],r[8],r[9]]); });
    const wb=XLSX.utils.book_new(); const ws=XLSX.utils.aoa_to_sheet(a); ws['!cols']=[{wch:12},{wch:36},{wch:11},{wch:14},{wch:12},{wch:48},{wch:36},{wch:10},{wch:10},{wch:10},{wch:12},{wch:17},{wch:17}]; ws['!autofilter']={ref:'A1:M'+a.length};
    XLSX.utils.book_append_sheet(wb,ws,'Plantões');
    const sc=f.semCadastro||[]; if(sc.length) XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Médico','CRM','Plantões','Horas apuradas'],...sc.map(x=>[x.nome,x.crm,x.n,x.horas])]),'Sem cadastro (fora)');
    salvarArquivo('Detalhamento_PP_'+(ct.sigla||'')+'_'+f.competencia.replace('-','')+'.xlsx',wb); },
  glosaHouve(el){ const f=fechById(S.fid); const ct=ctById(f.contratoId); const v=el.dataset.v==='1'; const g=f.glosa||{};
    const patch={houve:v,por:S.uid,em:nowISO()}; if(v&&!glosaItens({glosa:{...g,houve:true}}).length) patch.itens={[uidGen('g')]:{cr:ct.sigla||'',itemId:'',local:'',esp:'',k:'',medico:'',horas:0,valor:0,pagoMedico:''}};
    updFech(f.id,{glosa:patch,eventos:evento(f,'glosa','Glosa no pedido de NF: '+(v?'sim':'não'))}); },
  glosaAdd(){ const f=fechById(S.fid); const ct=ctById(f.contratoId); updFech(f.id,{glosa:{houve:true,itens:{[uidGen('g')]:{cr:ct.sigla||'',itemId:'',local:'',esp:'',k:'',medico:'',horas:0,valor:0,pagoMedico:''}},por:S.uid,em:nowISO()}}); },
  glosaRm(el){ const f=fechById(S.fid); updFech(f.id,{glosa:{itens:{[el.dataset.id]:null},por:S.uid,em:nowISO()}}); },
  folhaAdd(){ S.modal={type:'folhaMed',modo:'add',d:{nome:'',crm:'',cpfConta:'',vinculo:'RPA',empresa:'',horas:'',total:'',just:''}}; render(); },
  folhaEdit(el){ const f=fechById(S.fid); const ct=ctById(f.contratoId); const F=folhaAtual(f,ct,calcular(f,ct)); const r=F.rows.find(x=>x.id===el.dataset.id); if(!r) return;
    const o=r.orig||{total:r.total,horas:r.horas,vinculo:r.vinculo,empresa:r.empresa};
    S.modal={type:'folhaMed',modo:'edit',id:r.id,manual:r.manual,orig:o,d:{nome:r.nome,crm:r.crmFull||r.crm,cpfConta:r.cpfConta,vinculo:FOLHA_VINC.includes(r.vinculo)?r.vinculo:'SOCIO',empresa:r.empresa,horas:r.horas,total:r.total,just:''}}; render(); },
  folhaSalvar(){ const m=S.modal; const d=m.d; const f=fechById(S.fid); const just=(d.just||'').trim();
    if(just.length<10){ toast('Escreva a justificativa (mínimo 10 caracteres).','bad'); return; }
    if(!(d.nome||'').trim()){ toast('Informe o nome do médico.','bad'); return; }
    const reg={por:S.uid,em:nowISO(),just}; const total=num(d.total), horas=num(d.horas);
    let patch, txt;
    if(m.modo==='add'||m.manual){ const id=m.modo==='add'? uidGen('m') : m.id;
      patch={add:{[id]:{nome:d.nome.trim(),crm:(d.crm||'').trim(),cpfConta:(d.cpfConta||'').trim(),vinculo:d.vinculo||'RPA',empresa:(d.empresa||'').trim(),horas,total,...reg}}};
      txt=(m.modo==='add'?'Médico incluído na folha: ':'Inclusão manual alterada: ')+d.nome.trim()+' — '+brl(total);
    } else {
      patch={edit:{[m.id]:{total,horas,vinculo:d.vinculo,empresa:(d.empresa||'').trim(),cpfConta:(d.cpfConta||'').trim(),...reg}}};
      txt='Folha alterada: '+d.nome+' — '+brl(m.orig.total)+' → '+brl(total)+(d.vinculo!==m.orig.vinculo?' · vínculo '+m.orig.vinculo+' → '+d.vinculo:'')+((d.empresa||'')!==(m.orig.empresa||'')?' · empresa '+(m.orig.empresa||'—')+' → '+d.empresa:'');
    }
    S.modal=null; render();
    updFech(f.id,{folhaAjustes:patch,eventos:evento(f,'folha_aj',txt+'. Justificativa: '+just)}); toast('Folha atualizada.'); },
  folhaDel(el){ const f=fechById(S.fid); const ct=ctById(f.contratoId); const F=folhaAtual(f,ct,calcular(f,ct)); const r=F.rows.find(x=>x.id===el.dataset.id); if(!r) return;
    confirmar('Excluir '+r.nome+' da folha?','Valor '+brl(r.total)+'. O médico sai da planilha do ERP. A exclusão fica no log e pode ser desfeita.','Excluir da folha',mot=>{
      const patch= r.manual? {add:{[r.id]:null}} : {del:{[r.id]:{just:mot,por:S.uid,em:nowISO()}}};
      updFech(f.id,{folhaAjustes:patch,eventos:evento(f,'folha_aj','Excluído da folha: '+r.nome+' — '+brl(r.total)+'. Justificativa: '+mot)}); },true,true); },
  folhaRest(el){ const f=fechById(S.fid); const id=el.dataset.id; updFech(f.id,{folhaAjustes:{del:{[id]:null}},eventos:evento(f,'folha_aj','Médico restaurado na folha ('+id+')')}); },
  novoMedico(el){ const ctId=(el&&el.dataset.ct)||S.medCt; S.modal={type:'medico',ct:ctId,k:null,d:{crm:(el&&el.dataset.crm)||'',nome:(el&&el.dataset.nome)||'',cpf:'',email:'',contato:'',formalizacao:'',observacoes:'',ativo:true,vinculo:'',empresaPagadora:'',cpfConta:'',empresaPJ:'',simples:'',vinculo2:null}}; render(); },
  editMed(el){ const k=el.dataset.k; const m=(S.medicos[S.medCt]||{})[k]; if(!m) return; const d=JSON.parse(JSON.stringify(m)); d.crm=d.crm||k; S.modal={type:'medico',ct:S.medCt,k,d}; render(); },
  async mdSalvar(){ const m=S.modal; const d=m.d; const ct=ctById(m.ct); if(!ct) return;
    if(!/\d/.test(d.crm||'')){ toast('Informe o CRM.','bad'); return; }
    if(!(d.nome||'').trim()){ toast('Informe o nome do médico.','bad'); return; }
    if(d.vinculo2&&(!d.vinculo2.tipo||!(d.vinculo2.itens||[]).length)){ toast('No 2º vínculo, escolha o tipo e as especialidades em que ele vale.','bad'); return; }
    const lista={...(S.medicos[ct.id]||{})};
    let k=crmKey(d.crm); if(!k.includes('-')){ const porDig=Object.keys(lista).find(x=>crmDigits(x)===k&&x!==m.k); k= porDig || (ct.ufCrm? k+'-'+String(ct.ufCrm).toUpperCase() : k); }
    if(k!==m.k&&lista[k]){ toast('Já existe um médico com este CRM na base ('+(lista[k].nome||k)+').','bad'); return; }
    if(m.k&&m.k!==k) delete lista[m.k];
    const rec={...d,crm:d.crm.trim(),nome:d.nome.trim(),atualizadoEm:nowISO(),atualizadoPor:S.uid}; if(!rec.vinculo2) delete rec.vinculo2;
    lista[k]=rec; S.modal=null; render();
    await wr('medicos/'+ct.id,()=>S.db.doc('medicos/'+ct.id).set({lista})); toast(m.k?'Médico atualizado.':'Médico incluído na base.'); },
  excluirMed(el){ const k=el.dataset.k; const ctId=S.medCt; const m=(S.medicos[ctId]||{})[k]; if(!m) return;
    confirmar('Excluir '+(m.nome||k)+' da base médica?','O médico deixa de entrar nos próximos fechamentos deste contrato. Fechamentos já importados não mudam.','Excluir',async()=>{
      const lista={...(S.medicos[ctId]||{})}; delete lista[k]; await wr('medicos/'+ctId,()=>S.db.doc('medicos/'+ctId).set({lista})); toast('Médico excluído da base.'); },true); },
  confTodos(){ const f=fechById(S.fid); const ct=ctById(f.contratoId); const c=calcular(f,ct); const conf={}; c.linhas.forEach(l=>conf[l.key]=true);
    updFech(f.id,{conferidos:conf,eventos:evento(f,'conf','Todas as '+c.linhas.length+' linhas marcadas como conferidas')}); },
  enviarAprov(){ const f=fechById(S.fid); updFech(f.id,{status:'aguardando',enviadoPor:S.uid,devolucao:null,t:{...f.t,enviado:nowISO()},eventos:evento(f,'envio','Enviado para aprovação')}); toast('Enviado para aprovação.'); },
  aprovar(){ const f=fechById(S.fid); const ct=ctById(f.contratoId);
    confirmar('Aprovar e travar o fechamento?','O relatório fica travado e o resumo de faturamento e pagamento é emitido com os valores atuais. Depois disso, só quem tem permissão de reabrir pode alterar.','Aprovar e travar',()=>{
      const calc=calcular({...f,congelado:null},ct); const em=nowISO();
      wr('congelados/'+f.id,()=>S.db.doc('congelados/'+f.id).set({calc,itens:itensVigentes(ct,refFech(f)),tabela:calc.tabela||null,meta:f.meta||'',impostos:fiscalContrato(ct),em}));
      updFech(f.id,{status:'aprovado',aprovadoPor:S.uid,aprovadoEm:em,t:{...f.t,aprovado:em},eventos:evento(f,'aprov','Aprovado e travado. Faturamento '+brl(calc.totais.totFat)+' · Pagamento '+brl(calc.totais.totPag)+' · Margem '+brl(calc.totais.margem))});
      S.tab='resumo'; toast('Fechamento aprovado e travado.'); }); },
  devolver(){ const f=fechById(S.fid); const mot=(S.devolver||'').trim(); if(!mot){ toast('Escreva o motivo da devolução.','bad'); return; }
    updFech(f.id,{status:'conferencia',devolucao:{motivo:mot,por:S.uid,em:nowISO()},eventos:evento(f,'dev','Devolvido para conferência: '+mot)}); S.devolver=''; toast('Devolvido para conferência.'); },
  reabrir(){ const f=fechById(S.fid); confirmar('Reabrir o fechamento?','O relatório volta para conferência. O pedido de NF e a folha já emitidos são descartados e precisarão ser gerados de novo.','Reabrir',()=>{
      wr('congelados/'+f.id,()=>S.db.doc('congelados/'+f.id).delete()); wr('folhas/'+f.id,()=>S.db.doc('folhas/'+f.id).delete());
      updFech(f.id,{status:'conferencia',aprovadoEm:null,penf:null,penfs:null,penfRascs:null,prolabore:null,folhaAjustes:null,folhaInfo:null,t:{...f.t,enviado:null,aprovado:null,nf:null,folha:null},eventos:evento(f,'reab','Fechamento reaberto (aprovação, NF e folha anteriores descartadas)')}); S.tab='conf'; },true); },
  excluirFech(){ pedirExclusao(fechById(S.fid)); },
  emailDemo(el){ abrirEmail('demo',el.dataset.k); },
  emailNF(el){ abrirEmail('nf',el.dataset.k); },
  emailCopiar(){ const m=S.modal; const t='Para: '+m.to+'\nAssunto: '+m.subject+'\n\n'+m.body; try{ navigator.clipboard.writeText(t).then(()=>{ registrarEnvio('copiado'); toast('Texto copiado.'); },()=>{ const el=$('#emCorpo'); if(el){ el.focus(); el.select(); } toast('Selecione o texto e copie (Ctrl+C).','bad'); }); }catch(e){ toast('Selecione o texto e copie (Ctrl+C).','bad'); } },
  emailAbrir(){ const m=S.modal; if(!m.to){ toast('Informe o e-mail do médico.','bad'); return; } registrarEnvio('aberto'); const a=document.createElement('a'); a.href='mailto:'+encodeURIComponent(m.to)+'?subject='+encodeURIComponent(m.subject)+'&body='+encodeURIComponent(m.body); a.target='_blank'; a.rel='noopener'; document.body.appendChild(a); a.click(); a.remove(); },
  async emailEnviar(){ const m=S.modal; if(!/^\S+@\S+\.\S+$/.test(m.to||'')){ toast('Informe um e-mail válido.','bad'); return; }
    S.busy=true; render();
    try{ await window.__email.enviar({to:m.to,subject:m.subject,text:m.body}); registrarEnvio('enviado'); S.modal=null; toast('E-mail enviado para '+m.to+'.'); }
    catch(e){ toast(e.message||'Não foi possível enviar.','bad'); }
    S.busy=false; render(); },
  setMeta(el){ const f=fechById(S.fid); const m=el.dataset.m; if((f.meta||'')===m) return; const nomes={'':'valores padrão',minima:'meta mínima',mediana:'meta mediana',maxima:'meta máxima'};
    updFech(f.id,{meta:m,eventos:evento(f,'meta','Meta do fechamento alterada para '+nomes[m])}); toast('Cálculo com '+nomes[m]+'.'); },
  toggleMetas(el){ const i=+el.dataset.i; S.metaOpen[i]=!S.metaOpen[i]; render(); },
  excluirFechLista(el){ pedirExclusao(fechById(el.dataset.id)); },
  excluirLinha(el){ const f=fechById(S.fid); const ct=ctById(f.contratoId); const l=calcular(f,ct).linhas.find(x=>x.key===el.dataset.key); if(!l) return;
    confirmar('Excluir esta linha do fechamento?',l.nome+' — '+l.esp+' · '+l.tipo+': '+fH(l.apur)+' h apuradas, pagamento '+brl(l.totPag)+', faturamento '+brl(l.totFat)+'. A linha sai dos totais, da NF e da folha deste mês e pode ser restaurada enquanto o fechamento não for aprovado.','Excluir linha',mot=>{
      const reg={nome:l.nome,crm:l.crm,esp:l.esp,tipo:l.tipo,apur:l.apur,totPag:l.totPag,totFat:l.totFat,motivo:mot,por:S.uid,em:nowISO()};
      updFech(f.id,{excluidos:{[l.key]:reg},eventos:evento(f,'excl','Linha excluída: '+l.nome+' ('+l.esp+' · '+l.tipo+', '+fH(l.apur)+' h, '+brl(l.totPag)+'). Motivo: '+mot)}); toast('Linha excluída.'); },true,true); },
  restaurarLinha(el){ const f=fechById(S.fid); const k=el.dataset.key; const v=(f.excluidos||{})[k]||{};
    updFech(f.id,{excluidos:{[k]:null},eventos:evento(f,'rest','Linha restaurada: '+(v.nome||k)+' ('+(v.esp||'')+' · '+(v.tipo||'')+')')}); toast('Linha restaurada.'); },
  penfReset(){ const f=fechById(S.fid); const ct=ctById(f.contratoId); const P=penfDados(f,ct,calcular(f,ct)); updFech(f.id, P.multi? {penfRascs:{[pk(P.sigla)]:null}} : {penfRasc:null}); },
  penfEmp(el){ S.penfEmp=el.dataset.s; render(); },
  emitirNF(){ const f=fechById(S.fid); const ct=ctById(f.contratoId); const c=calcular(f,ct); const gp=glosaPendente(f); if(gp){ toast(gp,'bad'); return; } const P=penfDados(f,ct,c);
    confirmar('Emitir o pedido de NF?','Valor total '+brl(P.valor)+'. O pedido fica registrado e a planilha PENF é oferecida para download.','Emitir pedido',async()=>{
      const penf={...P,emitidaEm:nowISO(),emitidaPor:S.uid}; let patch;
      if(P.multi){
        // um pedido por empresa: o fechamento só conta como "NF emitida" quando todas as empresas emitirem
        const EMP=empresasNF(ct,c); const ja=f.penfs||{};
        patch={penfs:{[pk(P.sigla)]:penf},eventos:evento(f,'nf','Pedido de NF emitido ('+(P.sigla||'sem empresa')+'): '+brl(P.valor))};
        if(EMP.every(sg=>sg===P.sigla||(ja[pk(sg)]&&ja[pk(sg)].emitidaEm))){
          const tot=r2(EMP.reduce((t,sg)=>t+(sg===P.sigla?P.valor:num(ja[pk(sg)].valor)),0));
          patch.penf={multi:true,emitidaEm:penf.emitidaEm,emitidaPor:S.uid,valor:tot,empresas:EMP}; patch.t={...f.t,nf:penf.emitidaEm};
          if(f.folha&&f.folha.geradaEm) patch.status='concluido';
        }
      } else {
        patch={penf,t:{...f.t,nf:penf.emitidaEm},eventos:evento(f,'nf','Pedido de NF emitido: '+brl(P.valor))};
        if(f.folha&&f.folha.geradaEm) patch.status='concluido';
      }
      await updFech(f.id,patch); salvarArquivo(nomePENF(ct,f,P),wbPENF(penf,ct,f)); }); },
  baixarPENF(){ const f=fechById(S.fid); const ct=ctById(f.contratoId); const c=calcular(f,ct); const P=penfDados(f,ct,c); salvarArquivo(nomePENF(ct,f,P),wbPENF(P,ct,f)); },
  baixarResumo(){ const f=fechById(S.fid); const ct=ctById(f.contratoId); salvarArquivo('Resumo_'+(ct.sigla||'')+'_'+f.competencia.replace('-','')+'.xlsx',wbResumo(f,ct,calcular(f,ct))); },
  gerarFolha(){ const f=fechById(S.fid); const ct=ctById(f.contratoId); const c=calcular(f,ct); const F=folhaAtual(f,ct,c);
    const pl=F.rows.filter(r=>precisaPL(ct,r)&&!(f.prolabore||{})[safeKey(r.id)]).length;
    if(pl){ toast(pl+' pró-labore aguardando aprovação do Departamento Pessoal.','bad'); return; }
    const bad=F.rows.filter(r=>r.alertas.some(a=>a.c==='bad')).length;
    confirmar('Gerar a folha de pagamento?',(bad?bad+' médico(s) com pendência de cadastro. ':'')+F.rows.length+' médicos · líquido total '+brl(F.tot.liq)+'. A folha fica registrada e a planilha de importação do ERP é oferecida para download.','Gerar folha',async()=>{
      const folha={rows:F.rows,tot:F.tot,fora:F.fora,removidas:F.removidas,ajuste:F.ajuste,dataVcto:F.dataVcto,responsavel:F.responsavel,numeroDoc:F.numeroDoc,codReduzido:F.codReduzido,geradaEm:nowISO(),geradaPor:S.uid};
      await wr('folhas/'+f.id,()=>S.db.doc('folhas/'+f.id).set(folha));
      const patch={folhaInfo:{geradaEm:folha.geradaEm,geradaPor:folha.geradaPor},t:{...f.t,folha:folha.geradaEm},eventos:evento(f,'folha','Folha gerada: '+F.rows.length+' médicos, líquido '+brl(F.tot.liq))};
      if(f.penf&&f.penf.emitidaEm) patch.status='concluido';
      await updFech(f.id,patch); salvarArquivo('Folha_Importacao_'+(ct.sigla||'')+'_'+f.competencia.replace('-','')+'.xlsx',wbFolha(folha,ct,f)); }); },
  aprovarPL(el){ const f=fechById(S.fid); const ct=ctById(f.contratoId); const F=folhaAtual(f,ct,calcular(f,ct)); const r=F.rows.find(x=>x.id===el.dataset.id); if(!r) return;
    confirmar('Aprovar o pró-labore de '+r.nome+'?','Valor líquido '+brl(r.liq)+(r.empresa?' pela empresa '+r.empresa:'')+'. A aprovação do Departamento Pessoal fica registrada no log do fechamento.','Aprovar pró-labore',()=>{
      updFech(f.id,{prolabore:{[safeKey(r.id)]:{por:S.uid,em:nowISO(),valor:r.liq}},eventos:evento(f,'prolabore','Pró-labore aprovado pelo DP: '+r.nome+' — '+brl(r.liq))}); toast('Pró-labore aprovado.'); }); },
  addEf(){ const d=S.draft; const n=(d.empresasFat||[]).length; d.empresasFat=[...(d.empresasFat||[]),{sigla:n?'':(d.empresa||''),cod:n?'':(d.codEmpresaFat||''),vinculos:['SOCIO','PJ']}]; render(); },
  rmEf(el){ S.draft.empresasFat.splice(+el.dataset.i,1); render(); },
  addResp(){ const r=((S.config&&S.config.responsaveis)||[]).slice(); r.push({id:uidGen('r'),area:'Gestão de Escala',nome:'',email:'',telefone:''}); saveConfig({responsaveis:r}); },
  rmResp(el){ const r=((S.config&&S.config.responsaveis)||[]).slice(); r.splice(+el.dataset.i,1); saveConfig({responsaveis:r}); },
  baixarFolha(){ const f=fechById(S.fid); if(f.folha&&f.folha.geradaEm&&!f.folha.rows) return; const ct=ctById(f.contratoId); const F=folhaAtual(f,ct,calcular(f,ct)); salvarArquivo('Folha_Importacao_'+(ct.sigla||'')+'_'+f.competencia.replace('-','')+'.xlsx',wbFolha(F,ct,f)); },
  salvarObs(){ const f=fechById(S.fid); const tx=S.obsDraft[f.id]; if(tx==null) return; const o=f.obs||{}; const h=(o.historico||[]).slice(-199); const em=nowISO(); h.push({texto:tx,por:S.uid,em});
    updFech(f.id,{obs:{texto:tx,por:S.uid,em,historico:h},eventos:evento(f,'obs','Observação registrada')}).then(()=>{ delete S.obsDraft[f.id]; render(); }); toast('Observação salva.'); },
  novoCt(){ S.draft=novoContrato(); S.draft.tabSel='t_original'; S.draft.itens=S.draft.tabelas[0].itens; S.v='ctEd'; render(); },
  novaTabela(el){ const d=S.draft; const tipo=el.dataset.tipo; const n=(d.tabelas||[]).filter(t=>t.tipo==='aditivo').length+1;
    const base=(d.tabelas||[]).find(t=>t.id===d.tabSel)||tabelaVigente(d,mesAtual());
    S.modal={type:'novaTabela',tipo,base:base.nome||'original',baseId:base.id,nome:tipo==='aditivo'?n+'º Termo aditivo':'Reajuste '+compTxt(mesAtual()),V:mesAtual()+'-01',just:''}; render(); },
  ntConfirmar(){ const m=S.modal; const d=S.draft;
    if(!m.V){ toast('Informe a data de início.','bad'); return; }
    if((d.tabelas||[]).some(t=>normVig(t.vigencia)===normVig(m.V))){ toast('Já existe uma tabela vigente a partir de '+compTxt(m.V)+'.','bad'); return; }
    const retro=(S.fechs||[]).some(x=>x.contratoId===d.id&&refFech(x)>=normVig(m.V)&&(x.competencia<mesAtual()||lock(x)));
    if(retro&&(m.just||'').trim().length<10){ toast('Vigência retroativa: escreva a justificativa (mínimo 10 caracteres).','bad'); return; }
    const base=(d.tabelas||[]).find(t=>t.id===m.baseId)||{itens:[]};
    const nova={id:uidGen('t'),nome:(m.nome||'').trim()||'Nova tabela',tipo:m.tipo,vigencia:m.V,...camposTab(base),itens:JSON.parse(JSON.stringify(base.itens||[])),criadoEm:nowISO(),criadoPor:S.uid};
    d.tabelas.push(nova); d.tabSel=nova.id; d.itens=nova.itens;
    d._pend=[...(d._pend||[]),{em:nowISO(),por:S.uid,tipo:'nova_tabela',texto:'Nova tabela “'+nova.nome+'” ('+(m.tipo==='aditivo'?'aditivo':'reajuste')+') vigente a partir de '+compTxt(m.V)+', copiada de “'+(base.nome||'original')+'”',tabela:nova.nome,vigencia:m.V,retroativo:retro,justificativa:(m.just||'').trim(),mudancas:[]}];
    S.modal=null; toast('Tabela criada. Altere os valores e clique em Salvar contrato.'); render(); },
  vgConfirmar(){ aplicarVigencia().catch(e=>toast(errMsg(e),'bad')); },
  editCt(el){ const c=ctById(el.dataset.id); S.draft=JSON.parse(JSON.stringify(c)); ['itens','diferenciados','mapeamento','historico'].forEach(k=>S.draft[k]=S.draft[k]||[]);
    S.draft.tabelas=JSON.parse(JSON.stringify(tabelasDoContrato(c))); const tv=tabelaVigente(S.draft,mesAtual()); S.draft.tabSel=tv.id; S.draft.itens=tv.itens;
    // contratos antigos: a empresa e os impostos do contrato viram a primeira empresa de faturamento
    if(!Array.isArray(S.draft.empresasFat)) S.draft.empresasFat=(S.draft.empresa||S.draft.codEmpresaFat||IMPOSTOS_FAT.some(([n,k])=>num(S.draft[k])))?[{sigla:S.draft.empresa||'',cod:S.draft.codEmpresaFat||'',...aliqDe(S.draft),vinculos:['SOCIO','PJ']}]:[];
    S.v='ctEd'; render(); },
  addItem(){ S.draft.itens.push({id:uidGen('i'),especialidade:'',tipo:'',unidadePag:'hora',unidadeFat:'hora',qtdMes:0,valorFaturar:0,valorPagar:0,fontePag:'cadastro'}); render(); },
  rmItem(el){ S.draft.itens.splice(+el.dataset.i,1); render(); },
  addDif(){ S.draft.diferenciados.push({crm:'',nome:'',item:'',valorPagar:0}); render(); },
  rmDif(el){ S.draft.diferenciados.splice(+el.dataset.i,1); render(); },
  rmMap(el){ S.draft.mapeamento.splice(+el.dataset.i,1); render(); },
  ctPL(el){ S.draft.recolheProLabore=el.dataset.v==='1'; render(); },
  async salvarCt(){ const d=S.draft; if(!d.sigla||!d.nome){ toast('Preencha a sigla do CR e o nome do contrato.','bad'); return; }
    if(d.recolheProLabore==null){ toast('Responda se o contrato recolhe pró-labore.','bad'); return; }
    const salvo=d.id&&ctById(d.id);
    const montar=()=>{ const body=JSON.parse(JSON.stringify(d)); const pend=body._pend||[]; delete body._pend; delete body.tabSel; delete body.id;
      body.historico=[...(body.historico||[]),...pend].slice(-300); body.itens=tabelaVigente(body,mesAtual()).itens; body.atualizadoEm=nowISO(); body.atualizadoPor=S.uid; return body; };
    if(salvo){
      // valores alterados em tabela já salva → pergunta a vigência
      const antigas=tabelasDoContrato(salvo);
      const mudadas=(d.tabelas||[]).filter(t=>{ const a=antigas.find(x=>x.id===t.id); return a&&diffTabela(a,t).length; });
      if(mudadas.length){
        const T=mudadas.find(t=>t.id===d.tabSel)||mudadas[0]; const aT=antigas.find(x=>x.id===T.id);
        // base = rascunho com a tabela T ainda nos valores salvos; as demais alterações do rascunho vão junto
        const base=JSON.parse(JSON.stringify({...d,id:d.id})); base.tabelas=base.tabelas.map(t=>t.id===T.id?{...t,itens:JSON.parse(JSON.stringify(aT.itens)),...camposTab(aT)}:t);
        const pend=base._pend||[]; delete base._pend; delete base.tabSel;
        pedirVigencia({origem:'editor',ctBase:base,tabelaId:T.id,novosItens:T.itens,novosCampos:camposTab(T),multi:mudadas.length>1,pendentes:pend});
        return;
      }
    }
    const id=d.id||safeKey(d.sigla+'_'+(d.numero||uidGen())).toUpperCase(); const body=montar();
    if(!salvo) body.historico=[...(body.historico||[]),{em:nowISO(),por:S.uid,tipo:'criacao',texto:'Contrato criado com a tabela “'+((body.tabelas||[])[0]||{}).nome+'”',mudancas:[]}];
    await wr('contratos/'+id,()=>S.db.doc('contratos/'+id).set(body)); S.draft=null; toast('Contrato salvo.'); S.v='ct'; render(); },
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
  penf(el){ const f=fechById(S.fid); const ct=ctById(f.contratoId); const P=penfDados(f,ct,calcular(f,ct)); updFech(f.id, P.multi? {penfRascs:{[pk(P.sigla)]:{[el.dataset.f]:el.value}}} : {penfRasc:{[el.dataset.f]:el.value}}); },
  folhaP(el){ const f=fechById(S.fid); updFech(f.id,{folhaParams:{[el.dataset.f]:el.value}}); },
  folhaV(el){ const f=fechById(S.fid); const v=el.value.trim()===''?null:num(el.value); updFech(f.id,{folhaParams:{[el.dataset.f]:{[el.dataset.k]:v}}}); },
  itemValor(el){ const f=fechById(S.fid); const ct=ctById(f.contratoId); if(!ct) return; const v=num(el.value);
    const T=tabelaVigente(ct,refFech(f));
    const novos=(T.itens||[]).map(i=>i.id!==el.dataset.item? i : {...i,[el.dataset.f]:v,...(el.dataset.f==='valorPagar'&&v>0?{fontePag:'cadastro'}:{})});
    pedirVigencia({origem:'fech',ctBase:ct,tabelaId:T.id,novosItens:novos,fechId:f.id,compRef:inicioFech(f)}); },
  tabSel(el){ const d=S.draft; const t=(d.tabelas||[]).find(x=>x.id===el.value); if(!t) return; d.tabSel=t.id; d.itens=t.itens; S.metaOpen={}; render(); },
  selAll(el){ const f=fechById(S.fid); const ct=ctById(f.contratoId); const c=calcular(f,ct); const q=normTxt(S.conf.q);
    c.linhas.filter(l=>!q||normTxt(l.nome+' '+l.crm+' '+l.esp+' '+l.tipo).includes(q)).forEach(l=>{ if(el.checked) S.conf.sel[l.key]=true; else delete S.conf.sel[l.key]; }); render(); },
  selLin(el){ if(el.checked) S.conf.sel[el.dataset.key]=true; else delete S.conf.sel[el.dataset.key]; render(); },
  glosaCampo(el){ const f=fechById(S.fid); const ct=ctById(f.contratoId); const fl=el.dataset.f; const patch={};
    if(fl==='horas'||fl==='valor') patch[fl]=el.value.trim()===''?0:num(el.value); else patch[fl]=el.value;
    if(fl==='itemId'){ const it=itensUniao(ct).find(i=>i.id===el.value); patch.local=it?it.tipo:''; patch.esp=it?it.especialidade:''; }
    if(fl==='k'){ const l=calcular(f,ct).linhas.find(x=>x.k===el.value); patch.medico=l?l.nome:''; }
    updFech(f.id,{glosa:{itens:{[el.dataset.id]:patch},por:S.uid,em:nowISO()}}); },
  mdCampo(el){ const m=S.modal; if(!m||m.type!=='medico') return; const fl=el.dataset.f; if(fl.startsWith('vinculo2.')){ m.d.vinculo2=m.d.vinculo2||{}; m.d.vinculo2[fl.slice(9)]=el.value; } else m.d[fl]=el.value; },
  mdChk(el){ const m=S.modal; if(m&&m.type==='medico') m.d[el.dataset.f]=el.checked; },
  mdTem2(el){ const m=S.modal; if(!m) return; m.d.vinculo2= el.checked? (m.d.vinculo2||{tipo:'',itens:[]}) : null; render(); },
  mdV2Item(el){ const m=S.modal; if(!m||!m.d.vinculo2) return; const st=new Set(m.d.vinculo2.itens||[]); el.checked? st.add(el.dataset.id) : st.delete(el.dataset.id); m.d.vinculo2.itens=[...st]; },
  fmCampo(el){ const m=S.modal; if(m&&m.type==='folhaMed') m.d[el.dataset.f]=el.value; },
  tabCampo(el){ const d=S.draft; const t=(d.tabelas||[]).find(x=>x.id===d.tabSel); if(!t) return; t[el.dataset.f]= el.dataset.num? num(el.value) : el.value; render(); },
  itChk(el){ S.draft.itens[+el.dataset.i][el.dataset.f]=el.checked; render(); },
  efCampo(el){ const e=S.draft.empresasFat[+el.dataset.i]; const f=el.dataset.f; e[f]= el.dataset.num? num(el.value) : el.value.trim();
    if(f==='sigla'&&!e.cod){ const x=((S.config&&S.config.empresas)||[]).find(y=>normTxt(y.sigla)===normTxt(e.sigla)); if(x) e.cod=String(x.cod==null?'':x.cod); } render(); },
  efVinc(el){ const e=S.draft.empresasFat[+el.dataset.i]; const st=new Set(e.vinculos||[]); el.checked? st.add(el.dataset.v) : st.delete(el.dataset.v); e.vinculos=VINC_NF.map(x=>x[0]).filter(v=>st.has(v)); render(); },
  ctVincFolha(el){ const d=S.draft; const st=new Set(vincFolha(d)); el.checked? st.add(el.dataset.v) : st.delete(el.dataset.v); d.vinculosFolha=VINC_FOLHA.map(x=>x[0]).filter(v=>st.has(v));
    if(d.vinculosFolha.length&&!d.vinculosFolha.includes(String(d.vinculoPadrao||'SOCIO').toUpperCase())) d.vinculoPadrao=d.vinculosFolha[0]; render(); },
  resp(el){ const r=((S.config&&S.config.responsaveis)||[]).map(x=>({...x})); r[+el.dataset.i][el.dataset.f]=el.value.trim(); saveConfig({responsaveis:r}); },
  vgCampo(el){ if(!S.modal) return; S.modal[el.dataset.f]=el.value; render(); },
  ntCampo(el){ if(!S.modal) return; S.modal[el.dataset.f]=el.value; render(); },
  ct(el){ const f=el.dataset.f; S.draft[f]= el.dataset.num? num(el.value) : el.value;
    if(f==='sigla'){ const c=((S.config&&S.config.centros)||[]).find(x=>normTxt(x.sigla)===normTxt(el.value)); const d=S.draft;
      if(c){ if(!d.centroResultado) d.centroResultado=String(c.codigo); if(!d.nome) d.nome=c.descricao; if(!d.numero&&c.contrato) d.numero=String(c.contrato); if(!d.ano&&c.ano) d.ano=String(c.ano).startsWith('/')?String(c.ano):'/'+c.ano; if(!d.empresa&&c.empresa){ d.empresa=c.empresa; const e=((S.config&&S.config.empresas)||[]).find(x=>normTxt(x.sigla)===normTxt(c.empresa)); if(e&&!d.codEmpresaPagadora) d.codEmpresaPagadora=e.cod; } } }
    if(f==='empresa'){ const e=((S.config&&S.config.empresas)||[]).find(x=>normTxt(x.sigla)===normTxt(el.value)); if(e&&!S.draft.codEmpresaPagadora) S.draft.codEmpresaPagadora=e.cod; } render(); },
  ctChk(el){ S.draft[el.dataset.f]=el.checked; },
  itMeta(el){ const it=S.draft.itens[+el.dataset.i]; it.metas=it.metas||{}; it.metas[el.dataset.m]=it.metas[el.dataset.m]||{}; it.metas[el.dataset.m][el.dataset.f]=el.value.trim()===''?0:num(el.value); },
  it(el){ const it=S.draft.itens[+el.dataset.i]; const f=el.dataset.f; it[f]= ['qtdMes','valorFaturar','valorPagar'].includes(f)? num(el.value) : el.value; render(); },
  dif(el){ const x=S.draft.diferenciados[+el.dataset.i]; const f=el.dataset.f; x[f]= f==='valorPagar'? num(el.value) : el.value; },
  ctMap(el){ S.draft.mapeamento[+el.dataset.i].item=el.value; },
  medCt(el){ S.medCt=el.value; render(); },
  emailPrazo(el){ const m=S.modal; const f=fechById(S.fid); const ct=ctById(f.contratoId); m.prazo=el.value; updFech(f.id,{folhaParams:{prazoNF:el.value}}); const t=textoSolicitaNF(f,ct,m.k,el.value); m.body=t.body; render(); },
  med(el){ const ct=S.medCt; const k=el.dataset.k; wr('medicos/'+ct,()=>S.db.doc('medicos/'+ct).update({lista:{[k]:{[el.dataset.f]:el.value.trim()}}})); },
  medChk(el){ const ct=S.medCt; const k=el.dataset.k; wr('medicos/'+ct,()=>S.db.doc('medicos/'+ct).update({lista:{[k]:{ativo:el.checked}}})); },
  async importBase(el){ const file=el.files[0]; if(!file) return; const ct=ctById(S.medCt); try{ const n=await importarBaseMedicos(file,ct); toast(n+' médico(s) atualizados a partir da planilha.'); }catch(e){ toast(e.message||errMsg(e),'bad'); } },
  uPerfil(el){ const id=el.dataset.id; const p=el.value; const patch={perfil:p}; if(PERFIS[p]){ const perms={}; PERMS.forEach(([k])=>perms[k]=!!PERFIS[p].perms[k]); patch.perms=perms; } wr('usuarios/'+id,()=>S.db.doc('usuarios/'+id).update(patch)); },
  uPermGrupo(el){ const id=el.dataset.id; const perms={}; PERMS.filter(x=>x[2]===el.dataset.g).forEach(([k])=>perms[k]=el.checked); wr('usuarios/'+id,()=>S.db.doc('usuarios/'+id).update({perfil:'custom',perms})); },
  uPerm(el){ const id=el.dataset.id; wr('usuarios/'+id,()=>S.db.doc('usuarios/'+id).update({perfil:'custom',perms:{[el.dataset.p]:el.checked}})); },
  uAtivo(el){ const id=el.dataset.id; wr('usuarios/'+id,()=>S.db.doc('usuarios/'+id).update({ativo:el.checked})); },
  emp(el){ const e=((S.config&&S.config.empresas)||[]).map(x=>({...x})); const f=el.dataset.f; e[+el.dataset.i][f]= f==='cod'? num(el.value) : el.value; saveConfig({empresas:e}); },
  nat(el){ saveConfig({naturezas:{[el.dataset.f]:num(el.value)}}); },
  retCfg(el){ saveConfig({retencoes:{[el.dataset.f]:num(el.value)}}); },
  assinCfg(el){ saveConfig({assinaturaEmail:el.value}); }
};
let searchT;
const INP={
  confQ(el){ S.conf.q=el.value; render(); },
  emField(el){ if(S.modal) S.modal[el.dataset.f]=el.value; },
  vgCampo(el){ if(S.modal) S.modal[el.dataset.f]=el.value; },
  mdCampo(el){ const m=S.modal; if(!m||m.type!=='medico') return; const fl=el.dataset.f; if(fl.startsWith('vinculo2.')){ m.d.vinculo2=m.d.vinculo2||{}; m.d.vinculo2[fl.slice(9)]=el.value; } else m.d[fl]=el.value; },
  fmCampo(el){ const m=S.modal; if(m&&m.type==='folhaMed') m.d[el.dataset.f]=el.value; },
  ntCampo(el){ if(S.modal) S.modal[el.dataset.f]=el.value; },
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
