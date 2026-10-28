/**
 * API do sistema (usada pelas Vercel Functions em /api e pelo servidor local).
 *
 *  POST /api/auth  { action: 'status' | 'setup' | 'login' | 'logout' | 'me' | 'senha' | 'diretorio' | 'criarConta' | 'redefinirSenha' }
 *  POST /api/db    { op: 'get' | 'getMany' | 'loadCollections' | 'set' | 'update' | 'delete' }
 *  GET  /api/db?since=<seq>   → mudanças desde a sequência informada
 *
 * Regras de acesso (iguais às do banco anterior):
 *  • só lê/grava quem é administrador geral ou está ativo em Administração › Usuários;
 *  • usuários e parâmetros (coleções "usuarios" e "config") só por quem administra.
 */
import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHmac, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { storage, Conflito } from './storage.js';
import SEED from './seed.js';

const scrypt = promisify(_scrypt);
const COOKIE = 'fm_sessao';
const SESSAO_DIAS = 7;
const PATH_OK = /^[A-Za-z0-9_\-.~:@+]+(\/[A-Za-z0-9_\-.~:@+]+)*$/;
const ADMIN_EMAILS = () => String(process.env.ADMIN_EMAILS || '').toLowerCase().split(/[,;\s]+/).filter(Boolean);

/* ---------------------------- utilidades ---------------------------- */
class HttpErro extends Error { constructor(status, msg, code) { super(msg); this.status = status; this.code = code || 'erro'; } }
const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', ...headers },
});
const b64 = (b) => Buffer.from(b).toString('base64url');
const emailNorm = (e) => String(e || '').trim().toLowerCase();
const emailKey = (e) => 'sys/emails/' + createHash('sha256').update(emailNorm(e)).digest('hex') + '.json';
const userKey = (id) => 'sys/users/' + id + '.json';
const docKey = (p) => 'db/' + p + '.json';
const colOf = (p) => p.split('/').slice(0, -1).join('/');
function checkPath(p, par) {
  if (typeof p !== 'string' || !PATH_OK.test(p) || p.split('/').length % 2 !== (par ? 0 : 1)) throw new HttpErro(400, 'Caminho inválido: ' + p, 'invalid_argument');
}
function deepMerge(a, b) {
  if (!a || typeof a !== 'object' || Array.isArray(a) || !b || typeof b !== 'object' || Array.isArray(b)) return b;
  const r = { ...a };
  for (const k of Object.keys(b)) r[k] = deepMerge(r[k], b[k]);
  return r;
}
async function comRetentativa(fn, n = 6) {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) { if (!(e instanceof Conflito) || i >= n) throw e; await new Promise((r) => setTimeout(r, 40 + Math.random() * 120 * (i + 1))); }
  }
}
async function pool(itens, n, fn) {
  const out = new Array(itens.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, async () => { while (i < itens.length) { const k = i++; out[k] = await fn(itens[k], k); } }));
  return out;
}

/* ------------------------------ senhas ------------------------------ */
async function hashSenha(senha, salt = randomBytes(16)) {
  const h = await scrypt(String(senha), salt, 64, { N: 16384, r: 8, p: 1 });
  return { salt: b64(salt), hash: b64(h) };
}
async function confere(senha, u) {
  const h = await scrypt(String(senha), Buffer.from(u.salt, 'base64url'), 64, { N: 16384, r: 8, p: 1 });
  const ref = Buffer.from(u.hash, 'base64url');
  return ref.length === h.length && timingSafeEqual(ref, h);
}
function senhaTemporaria() {
  const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = randomBytes(12); let s = '';
  for (const x of b) s += a[x % a.length];
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12);
}
function validaSenha(s) {
  if (typeof s !== 'string' || s.length < 8) throw new HttpErro(400, 'A senha precisa ter pelo menos 8 caracteres.', 'invalid_argument');
}

/* ------------------------------ sessões ------------------------------ */
let segredo = null;
async function getSegredo(st) {
  if (segredo) return segredo;
  if (process.env.SESSION_SECRET) return (segredo = process.env.SESSION_SECRET);
  const r = await st.get('sys/secret.json');
  if (r) return (segredo = r.data.v);
  const v = b64(randomBytes(32));
  try { await st.put('sys/secret.json', { v }, { onlyIfAbsent: true }); return (segredo = v); }
  catch (e) { if (e instanceof Conflito) { const r2 = await st.get('sys/secret.json'); return (segredo = r2.data.v); } throw e; }
}
async function assinar(st, payload) {
  const s = await getSegredo(st);
  const p = b64(JSON.stringify(payload));
  return p + '.' + b64(createHmac('sha256', s).update(p).digest());
}
async function verificar(st, token) {
  if (!token || !token.includes('.')) return null;
  const [p, sig] = token.split('.');
  const s = await getSegredo(st);
  const esperado = b64(createHmac('sha256', s).update(p).digest());
  if (sig.length !== esperado.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(esperado))) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.exp > Date.now() ? o : null; } catch { return null; }
}
function lerCookie(req, nome) {
  const c = req.headers.get('cookie') || '';
  const m = c.split(/;\s*/).find((x) => x.startsWith(nome + '='));
  return m ? decodeURIComponent(m.slice(nome.length + 1)) : null;
}
function cookieSessao(req, valor, maxAge) {
  const seguro = new URL(req.url).protocol === 'https:';
  return `${COOKIE}=${encodeURIComponent(valor)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${seguro ? '; Secure' : ''}`;
}

/* --------------------- usuário logado e permissões --------------------- */
const cacheUser = new Map();   // id -> {u, at}
const cacheAcesso = new Map(); // id -> {doc, at}
async function lerUsuario(st, id, fresh) {
  const c = cacheUser.get(id);
  if (!fresh && c && Date.now() - c.at < 15000) return c.u;
  const r = await st.get(userKey(id));
  const u = r ? r.data : null;
  cacheUser.set(id, { u, at: Date.now() });
  return u;
}
async function contexto(st, req) {
  const s = await verificar(st, lerCookie(req, COOKIE));
  if (!s) return null;
  const u = await lerUsuario(st, s.u);
  if (!u || u.versao !== s.v || u.desativado) return null;
  let ac = cacheAcesso.get(u.id);
  if (!ac || Date.now() - ac.at > 15000) {
    const r = await st.get(docKey('usuarios/' + u.id));
    ac = { doc: r ? r.data : null, at: Date.now() };
    cacheAcesso.set(u.id, ac);
  }
  const admin = !!u.admin || ADMIN_EMAILS().includes(u.email);
  const ativo = !!(ac.doc && ac.doc.ativo !== false);
  return {
    u, admin,
    acesso: admin || ativo,
    podeAdministrar: admin || !!(ativo && ac.doc.perms && ac.doc.perms.admin),
  };
}
function exigeLogin(ctx) { if (!ctx) throw new HttpErro(401, 'Sessão expirada. Entre novamente.', 'unauthenticated'); }
function exigeAcesso(ctx) { exigeLogin(ctx); if (!ctx.acesso) throw new HttpErro(403, 'Seu acesso ainda não foi liberado.', 'invalid_argument'); }
function podeLer(ctx, p) { return ctx.acesso || p === 'usuarios/' + ctx.u.id; }
function exigeEscrita(ctx, p) {
  exigeAcesso(ctx);
  const col = p.split('/')[0];
  if ((col === 'usuarios' || col === 'config') && !ctx.podeAdministrar) throw new HttpErro(403, 'Somente administradores alteram usuários e parâmetros.', 'invalid_argument');
}
// registro de exclusões: só pode ser criado, nunca alterado ou apagado
function exigeAuditoriaNova(op, p) {
  if (p.split('/')[0] === 'auditoria' && op !== 'set') throw new HttpErro(403, 'O registro de exclusões não pode ser alterado nem apagado.', 'invalid_argument');
}
const perfilPublico = (u) => ({ id: u.id, name: u.nome || u.email.split('@')[0], email: u.email });

/* ------------------------ registro de mudanças ------------------------ */
// sys/journal.json = { seq, itens:[{s, p, at}] } — os últimos 1500 registros alterados.
const JOURNAL = 'sys/journal.json';
async function anotar(st, paths) {
  // O registro de mudanças só serve para avisar as outras telas; se falhar, o dado já foi gravado.
  try { await anotarJournal(st, paths); } catch (e) { console.error('Falha ao registrar mudança (dados gravados normalmente):', e); }
}
async function anotarJournal(st, paths) {
  await comRetentativa(async () => {
    const r = await st.get(JOURNAL, { forUpdate: true });
    const j = r ? r.data : { seq: 0, itens: [] };
    const at = new Date().toISOString();
    for (const p of paths) j.itens.push({ s: ++j.seq, p, at });
    if (j.itens.length > 1500) j.itens = j.itens.slice(-1500);
    await st.put(JOURNAL, j, r ? { ifMatch: r.etag } : { onlyIfAbsent: true });
  });
}

/* ------------------------------ carga inicial ------------------------------ */
async function carregarSeed(st) {
  const docs = { 'config/geral': SEED.config };
  for (const [k, v] of Object.entries(SEED.contratos)) docs['contratos/' + k] = v;
  const criados = [];
  for (const [p, d] of Object.entries(docs)) {
    try { await st.put(docKey(p), d, { onlyIfAbsent: true }); criados.push(p); } catch (e) { if (!(e instanceof Conflito)) throw e; }
  }
  if (criados.length) await anotar(st, criados);
}

/* ================================ AUTH ================================ */
async function auth(req, st) {
  const body = await req.json().catch(() => ({}));
  const a = body.action;

  if (a === 'status') {
    const users = await st.list('sys/users/');
    const ctx = await contexto(st, req);
    return json({ temUsuarios: users.length > 0, logado: !!ctx, armazenamento: st.tipo, adminPorEmail: ADMIN_EMAILS().length > 0, email: emailConfigurado() });
  }

  if (a === 'setup') {
    const users = await st.list('sys/users/');
    if (users.length) throw new HttpErro(409, 'O administrador já foi criado. Entre com seu e-mail e senha.', 'exists');
    const email = emailNorm(body.email); const nome = String(body.nome || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpErro(400, 'Informe um e-mail válido.');
    if (!nome) throw new HttpErro(400, 'Informe seu nome.');
    const lista = ADMIN_EMAILS();
    if (lista.length && !lista.includes(email)) throw new HttpErro(403, 'Este e-mail não está na lista de administradores (ADMIN_EMAILS) do projeto.');
    validaSenha(body.senha);
    const u = await criarUsuario(st, { email, nome, senha: body.senha, admin: true, trocarSenha: false });
    await carregarSeed(st);
    const token = await assinar(st, { u: u.id, v: u.versao, exp: Date.now() + SESSAO_DIAS * 864e5 });
    return json({ ok: true }, 200, { 'Set-Cookie': cookieSessao(req, token, SESSAO_DIAS * 86400) });
  }

  if (a === 'login') {
    const email = emailNorm(body.email);
    await new Promise((r) => setTimeout(r, 250 + Math.random() * 250)); // atrasa tentativas em massa
    const idx = await st.get(emailKey(email));
    const u = idx && (await lerUsuario(st, idx.data.id, true));
    if (!u || u.desativado || !(await confere(body.senha || '', u))) throw new HttpErro(401, 'E-mail ou senha incorretos.', 'login');
    const token = await assinar(st, { u: u.id, v: u.versao, exp: Date.now() + SESSAO_DIAS * 864e5 });
    return json({ ok: true, trocarSenha: !!u.trocarSenha }, 200, { 'Set-Cookie': cookieSessao(req, token, SESSAO_DIAS * 86400) });
  }

  if (a === 'logout') return json({ ok: true }, 200, { 'Set-Cookie': cookieSessao(req, '', 0) });

  const ctx = await contexto(st, req);

  if (a === 'me') {
    exigeLogin(ctx);
    return json({ ...perfilPublico(ctx.u), isOwner: ctx.admin, trocarSenha: !!ctx.u.trocarSenha });
  }

  if (a === 'senha') {
    exigeLogin(ctx);
    if (!(await confere(body.atual || '', ctx.u))) throw new HttpErro(400, 'A senha atual não confere.');
    validaSenha(body.nova);
    const u = await atualizarUsuario(st, ctx.u.id, async (u) => ({ ...u, ...(await hashSenha(body.nova)), trocarSenha: false, versao: u.versao + 1 }));
    const token = await assinar(st, { u: u.id, v: u.versao, exp: Date.now() + SESSAO_DIAS * 864e5 });
    return json({ ok: true }, 200, { 'Set-Cookie': cookieSessao(req, token, SESSAO_DIAS * 86400) });
  }

  if (a === 'diretorio') {
    exigeAcesso(ctx);
    const keys = await st.list('sys/users/');
    const us = (await pool(keys, 12, (k) => st.get(k.key, { fresh: false }))).filter(Boolean).map((r) => r.data);
    return json({ pessoas: us.filter((u) => !u.desativado).map(perfilPublico) });
  }

  if (a === 'criarConta') {
    exigeAcesso(ctx);
    if (!ctx.podeAdministrar) throw new HttpErro(403, 'Somente administradores criam contas.');
    const email = emailNorm(body.email); const nome = String(body.nome || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpErro(400, 'Informe um e-mail válido.');
    if (!nome) throw new HttpErro(400, 'Informe o nome.');
    const senha = senhaTemporaria();
    const u = await criarUsuario(st, { email, nome, senha, admin: false, trocarSenha: true });
    return json({ id: u.id, senha, ...perfilPublico(u) });
  }

  if (a === 'redefinirSenha') {
    exigeAcesso(ctx);
    if (!ctx.podeAdministrar) throw new HttpErro(403, 'Somente administradores redefinem senhas.');
    const senha = senhaTemporaria();
    await atualizarUsuario(st, String(body.id), async (u) => ({ ...u, ...(await hashSenha(senha)), trocarSenha: true, versao: u.versao + 1 }));
    return json({ senha });
  }

  throw new HttpErro(400, 'Ação desconhecida.');
}
async function criarUsuario(st, { email, nome, senha, admin, trocarSenha }) {
  const id = 'u' + randomBytes(9).toString('hex');
  try { await st.put(emailKey(email), { id }, { onlyIfAbsent: true }); }
  catch (e) { if (e instanceof Conflito) throw new HttpErro(409, 'Já existe uma conta com este e-mail.', 'exists'); throw e; }
  const u = { id, email, nome, admin: !!admin, trocarSenha: !!trocarSenha, versao: 1, criadoEm: new Date().toISOString(), ...(await hashSenha(senha)) };
  await st.put(userKey(id), u, { onlyIfAbsent: true });
  return u;
}
async function atualizarUsuario(st, id, fn) {
  return comRetentativa(async () => {
    const r = await st.get(userKey(id), { forUpdate: true });
    if (!r) throw new HttpErro(404, 'Usuário não encontrado.');
    const u = await fn(r.data);
    await st.put(userKey(id), u, { ifMatch: r.etag });
    cacheUser.set(id, { u, at: Date.now() });
    return u;
  });
}

/* =============================== E-MAIL ===============================
 * Dois jeitos de enviar (o primeiro configurado é usado):
 *
 * 1) Microsoft 365 pela API Microsoft Graph (recomendado; não depende do SMTP AUTH,
 *    que a Microsoft está desligando). Variáveis:
 *      MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET  → app registrado no Entra ID com
 *                                                       permissão de aplicativo Mail.Send
 *      MS_SENDER                                    → caixa que envia (ex.: faturamento@empresa.com.br)
 *
 * 2) SMTP (Gmail, outros provedores, ou Microsoft 365 com SMTP AUTH habilitado):
 *      SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE ("true" na porta 465)
 */
const env = (k) => String(process.env[k] || '').trim();
const graphConfigurado = () => !!(env('MS_TENANT_ID') && env('MS_CLIENT_ID') && env('MS_CLIENT_SECRET') && env('MS_SENDER'));
// aceita também SMPT_HOST (erro de digitação comum ao cadastrar a variável)
const smtpHost = () => env('SMTP_HOST') || env('SMPT_HOST');
const smtpConfigurado = () => !!(smtpHost() && env('SMTP_FROM'));
const emailConfigurado = () => graphConfigurado() || smtpConfigurado();

let tokenGraph = null; // { valor, expira }
async function obterTokenGraph() {
  if (tokenGraph && tokenGraph.expira > Date.now() + 60000) return tokenGraph.valor;
  const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(env('MS_TENANT_ID'))}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('MS_CLIENT_ID'), client_secret: env('MS_CLIENT_SECRET'), scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    const d = j.error_description ? String(j.error_description).split('\r\n')[0] : r.status;
    throw new HttpErro(502, 'Microsoft 365 recusou o acesso do aplicativo (confira MS_TENANT_ID, MS_CLIENT_ID e MS_CLIENT_SECRET): ' + d, 'unavailable');
  }
  tokenGraph = { valor: j.access_token, expira: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return tokenGraph.valor;
}
async function enviarPorGraph({ to, subject, text, replyTo }) {
  const token = await obterTokenGraph();
  const message = {
    subject,
    body: { contentType: 'Text', content: text },
    toRecipients: [{ emailAddress: { address: to } }],
    ...(replyTo ? { replyTo: [{ emailAddress: { address: replyTo } }] } : {}),
  };
  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env('MS_SENDER'))}/sendMail`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });
  if (r.status === 202 || r.ok) return;
  const j = await r.json().catch(() => ({}));
  const msg = (j.error && j.error.message) || ('HTTP ' + r.status);
  if (r.status === 401 || r.status === 403) tokenGraph = null;
  const dica = r.status === 403 || /access is denied|Authorization_RequestDenied/i.test(msg)
    ? ' Verifique se o app tem a permissão de aplicativo Mail.Send com consentimento do administrador.'
    : r.status === 404 || /ResourceNotFound|MailboxNotEnabled/i.test(msg) ? ' Confira se MS_SENDER é uma caixa existente com licença do Exchange.' : '';
  throw new HttpErro(502, 'Microsoft 365 recusou o envio: ' + msg + dica, 'unavailable');
}

let transporte = null;
async function enviarPorSmtp({ to, subject, text, replyTo }) {
  if (!transporte) {
    const nm = (await import('nodemailer')).default;
    const port = Number(env('SMTP_PORT') || 587);
    transporte = nm.createTransport({
      host: smtpHost(), port,
      secure: String(env('SMTP_SECURE') || (port === 465)).toLowerCase() === 'true',
      auth: env('SMTP_USER') ? { user: env('SMTP_USER'), pass: process.env.SMTP_PASS } : undefined,
    });
  }
  try { return await transporte.sendMail({ from: env('SMTP_FROM'), to, subject, text, replyTo }); }
  catch (e) {
    const m = String((e && e.message) || e);
    if (/SmtpClientAuthentication is disabled/i.test(m)) throw new HttpErro(502, 'O Microsoft 365 da empresa está com o envio por SMTP desligado. Configure o envio pela API do Microsoft 365 (variáveis MS_*, veja o README) ou peça ao administrador para habilitar o SMTP autenticado.', 'unavailable');
    throw new HttpErro(502, 'O servidor de e-mail recusou o envio: ' + m, 'unavailable');
  }
}

async function enviarEmail(msg) {
  if (graphConfigurado()) return enviarPorGraph(msg);
  if (smtpConfigurado()) return enviarPorSmtp(msg);
  throw new HttpErro(503, 'Envio de e-mail não configurado no servidor (variáveis MS_* ou SMTP_*).', 'no_email');
}
export const _emailInterno = { obterTokenGraph, enviarPorGraph, reset() { tokenGraph = null; transporte = null; } };

/* ================================= DB ================================= */
const LIMITE_RESPOSTA = 3_000_000; // ~3 MB por resposta (limite das Functions é 4,5 MB)

async function db(req, st) {
  const ctx = await contexto(st, req);

  if (req.method === 'GET') {
    exigeLogin(ctx);
    const since = Number(new URL(req.url).searchParams.get('since') || 0);
    const r = await st.get(JOURNAL);
    const j = r ? r.data : { seq: 0, itens: [] };
    const primeiro = j.itens.length ? j.itens[0].s : j.seq + 1;
    if (since && since < primeiro - 1) return json({ seq: j.seq, reset: true });
    const novos = j.itens.filter((x) => x.s > since);
    return json({ seq: j.seq, paths: [...new Set(novos.map((x) => x.p))] });
  }

  const body = await req.json().catch(() => ({}));
  const op = body.op;

  if (op === 'email') {
    exigeAcesso(ctx);
    const to = String(body.to || '').trim(); const subject = String(body.subject || '').slice(0, 300); const text = String(body.text || '').slice(0, 20000);
    if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to)) throw new HttpErro(400, 'E-mail do destinatário inválido.', 'invalid_argument');
    if (!subject || !text) throw new HttpErro(400, 'Assunto e mensagem são obrigatórios.', 'invalid_argument');
    try { await enviarEmail({ to, subject, text, replyTo: ctx.u.email }); }
    catch (e) { if (e instanceof HttpErro) throw e; console.error(e); throw new HttpErro(502, 'O servidor de e-mail recusou o envio: ' + (e.message || e), 'unavailable'); }
    return json({ ok: true });
  }

  if (op === 'get' || op === 'getMany') {
    exigeLogin(ctx);
    const paths = op === 'get' ? [body.path] : (body.paths || []).slice(0, 400);
    paths.forEach((p) => checkPath(p, true));
    const res = await pool(paths, 12, async (p) => (podeLer(ctx, p) ? st.get(docKey(p)) : null));
    return json({ docs: Object.fromEntries(paths.map((p, i) => [p, res[i] ? res[i].data : null])) });
  }

  if (op === 'loadCollections') {
    exigeLogin(ctx);
    const cols = (body.collections || []).slice(0, 20);
    cols.forEach((c) => checkPath(c, false));
    const jr = await st.get(JOURNAL);
    const seq = jr ? jr.data.seq : 0;
    // alterados nos últimos 2 minutos: lê sem cache (o cache de leitura dura até 60 s)
    const recentes = new Set(jr ? jr.data.itens.filter((x) => Date.now() - new Date(x.at) < 120000).map((x) => x.p) : []);
    let chaves = [];
    for (const c of cols) {
      if (!ctx.acesso && c !== 'usuarios') continue;
      const ls = await st.list('db/' + c + '/');
      chaves.push(...ls.map((x) => x.key).filter((k) => k.split('/').length === c.split('/').length + 2));
    }
    chaves.sort();
    const inicio = Number(body.cursor || 0);
    const docs = {}; let tamanho = 0; let i = inicio;
    while (i < chaves.length && tamanho < LIMITE_RESPOSTA) {
      const lote = chaves.slice(i, i + 24);
      const rs = await pool(lote, 12, async (k) => {
        const p = k.slice(3, -5);
        if (!podeLer(ctx, p)) return null;
        return [p, await st.get(k, { fresh: recentes.has(p) })];
      });
      for (const x of rs) { if (x && x[1]) { docs[x[0]] = x[1].data; tamanho += JSON.stringify(x[1].data).length; } }
      i += lote.length;
    }
    return json({ docs, seq, cursor: i < chaves.length ? i : null });
  }

  if (op === 'set') {
    checkPath(body.path, true); exigeEscrita(ctx, body.path);
    if (body.path.startsWith('auditoria/')) {
      try { await st.put(docKey(body.path), body.data, { onlyIfAbsent: true }); } catch (e) { if (e instanceof Conflito) throw new HttpErro(403, 'O registro de exclusões não pode ser alterado.', 'invalid_argument'); throw e; }
      await anotar(st, [body.path]);
      return json({ ok: true, data: body.data });
    }
    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) throw new HttpErro(400, 'Documento inválido.', 'invalid_argument');
    await st.put(docKey(body.path), body.data);
    await anotar(st, [body.path]);
    if (body.path.startsWith('usuarios/')) cacheAcesso.delete(body.path.split('/')[1]);
    return json({ ok: true, data: body.data });
  }

  if (op === 'update') {
    checkPath(body.path, true); exigeEscrita(ctx, body.path); exigeAuditoriaNova(op, body.path);
    const data = await comRetentativa(async () => {
      const r = await st.get(docKey(body.path), { forUpdate: true });
      if (!r) throw new HttpErro(404, 'not_found: ' + body.path, 'invalid_argument');
      const novo = deepMerge(r.data, body.patch || {});
      await st.put(docKey(body.path), novo, { ifMatch: r.etag });
      return novo;
    });
    await anotar(st, [body.path]);
    if (body.path.startsWith('usuarios/')) cacheAcesso.delete(body.path.split('/')[1]);
    return json({ ok: true, data });
  }

  if (op === 'delete') {
    checkPath(body.path, true); exigeEscrita(ctx, body.path); exigeAuditoriaNova(op, body.path);
    await st.del(docKey(body.path));
    await anotar(st, [body.path]);
    if (body.path.startsWith('usuarios/')) cacheAcesso.delete(body.path.split('/')[1]);
    return json({ ok: true });
  }

  throw new HttpErro(400, 'Operação desconhecida.');
}

/* ============================== roteador ============================== */
export async function handle(req, rota) {
  try {
    const st = await storage();
    if (req.method === 'POST' && !/application\/json/.test(req.headers.get('content-type') || '')) throw new HttpErro(415, 'Envie JSON.');
    // proteção simples contra requisições de outros sites (CSRF)
    const origem = req.headers.get('origin');
    if (req.method === 'POST' && origem && new URL(origem).host !== new URL(req.url).host) throw new HttpErro(403, 'Origem não permitida.');
    if (rota === 'auth') return await auth(req, st);
    if (rota === 'db') return await db(req, st);
    throw new HttpErro(404, 'Rota inexistente.');
  } catch (e) {
    if (e instanceof HttpErro) return json({ erro: e.message, code: e.code }, e.status);
    if (e instanceof Conflito) return json({ erro: 'Muitas alterações simultâneas. Tente de novo.', code: 'resource_exhausted' }, 409);
    if (e && e.code === 'no_storage') return json({ erro: e.message, code: 'no_storage' }, 503);
    console.error(e);
    return json({ erro: 'Erro no servidor: ' + ((e && e.message) || e), code: 'unavailable' }, 500);
  }
}
