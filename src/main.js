import './styles.css';
import * as XLSX from 'xlsx';
import Chart from 'chart.js/auto';
import { sb, configurado, platform, diagnostico } from './platform/client.js';

window.XLSX = XLSX;
window.Chart = Chart;

const app = document.getElementById('app');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function telaLogin(estado = {}) {
  const modo = estado.modo || 'entrar';
  const titulo = { entrar: 'Entrar', criar: 'Criar conta', link: 'Receber link de acesso', nova: 'Definir nova senha' }[modo];
  app.innerHTML = `
  <div class="login">
    <form class="login-card" id="fLogin" novalidate>
      <div><div class="eyebrow">Faturamento Médico</div><h1>${titulo}</h1>
      <p class="muted">${modo === 'criar' ? 'Depois de criar a conta, peça a um administrador para liberar seu acesso.' : modo === 'link' ? 'Enviamos um link para entrar sem senha.' : modo === 'nova' ? 'Escolha a nova senha da sua conta.' : 'Fechamento mensal de serviços médicos.'}</p></div>
      ${modo === 'criar' ? `<label class="f">Nome completo<input type="text" id="lgNome" autocomplete="name" required value="${esc(estado.nome)}"></label>` : ''}
      ${modo !== 'nova' ? `<label class="f">E-mail<input type="email" id="lgEmail" autocomplete="email" required value="${esc(estado.email)}"></label>` : ''}
      ${modo === 'entrar' || modo === 'criar' || modo === 'nova' ? `<label class="f">Senha<input type="password" id="lgSenha" autocomplete="${modo === 'entrar' ? 'current-password' : 'new-password'}" required minlength="8"></label>` : ''}
      ${estado.erro ? `<div class="banner bad">${esc(estado.erro)}</div>` : ''}
      ${estado.ok ? `<div class="banner ok">${esc(estado.ok)}</div>` : ''}
      <button class="btn pri" type="submit" ${estado.busy ? 'disabled' : ''}>${estado.busy ? 'Aguarde…' : titulo}</button>
      <div class="row login-links">
        ${modo !== 'entrar' ? '<button type="button" class="btn ghost sm" data-modo="entrar">Já tenho conta</button>' : ''}
        ${modo !== 'criar' && modo !== 'nova' ? '<button type="button" class="btn ghost sm" data-modo="criar">Criar conta</button>' : ''}
        ${modo === 'entrar' ? '<button type="button" class="btn ghost sm" data-modo="link">Esqueci a senha</button>' : ''}
      </div>
    </form>
  </div>`;
  app.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => telaLogin({ modo: b.dataset.modo })));
  app.querySelector('#fLogin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = (id) => (document.getElementById(id) || {}).value || '';
    const email = v('lgEmail').trim(), senha = v('lgSenha'), nome = v('lgNome').trim();
    const tela = (o) => telaLogin({ modo, email, nome, ...o });
    if (modo !== 'nova' && !/^\S+@\S+\.\S+$/.test(email)) return tela({ erro: 'Informe um e-mail válido.' });
    if ((modo === 'criar' || modo === 'nova') && senha.length < 8) return tela({ erro: 'A senha precisa ter pelo menos 8 caracteres.' });
    if (modo === 'criar' && !nome) return tela({ erro: 'Informe seu nome.' });
    tela({ busy: true });
    let r;
    if (modo === 'entrar') r = await sb.auth.signInWithPassword({ email, password: senha });
    else if (modo === 'criar') r = await sb.auth.signUp({ email, password: senha, options: { data: { name: nome }, emailRedirectTo: location.origin } });
    else if (modo === 'link') r = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: location.origin } });
    else r = await sb.auth.updateUser({ password: senha });
    if (r.error) {
      const m = r.error.message || '';
      const pt = /invalid login/i.test(m) ? 'E-mail ou senha incorretos.' : /not confirmed/i.test(m) ? 'Confirme seu e-mail pelo link que enviamos antes de entrar.' : /already registered/i.test(m) ? 'Este e-mail já tem conta. Use “Já tenho conta”.' : /rate limit/i.test(m) ? 'Muitas tentativas. Aguarde alguns minutos.' : m;
      return tela({ erro: pt });
    }
    if (modo === 'criar' && !r.data.session) return telaLogin({ modo: 'entrar', email, ok: 'Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.' });
    if (modo === 'link') return tela({ ok: 'Link enviado. Abra seu e-mail e clique para entrar.' });
    if (modo === 'nova') { location.hash = ''; }
    iniciar();
  });
}

let iniciado = false;
async function iniciar() {
  if (iniciado) return;
  iniciado = true;
  window.__platform = { use: async (n) => platform[n] || null };
  window.__logout = async () => { await sb.auth.signOut(); location.reload(); };
  await import('./app.js');
}

async function start() {
  if (!configurado) {
    const d = diagnostico || {};
    const st = (v) => v === 'ok' ? '<span class="tag">ok</span>' : v === 'secreta' ? '<span class="tag bad">chave secreta recusada</span>' : v === 'invalida' ? '<span class="tag bad">formato inválido</span>' : '<span class="tag bad">não encontrada</span>';
    app.innerHTML = `<div class="login"><div class="login-card" style="max-width:560px">
      <div><div class="eyebrow">Faturamento Médico</div><h1>Configuração pendente</h1>
      <p class="muted">Este site foi publicado sem os dados de conexão com o Supabase. Eles são gravados no momento do build, então é preciso cadastrá-los e publicar de novo.</p></div>
      <div class="tbl"><table><tbody>
        <tr><td>URL do projeto</td><td>${st(d.url)}</td><td class="mono">VITE_SUPABASE_URL</td></tr>
        <tr><td>Chave pública (anon)</td><td>${st(d.key)}</td><td class="mono">VITE_SUPABASE_ANON_KEY</td></tr>
      </tbody></table></div>
      <ol style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px">
        <li>No Supabase, abra <b>Project Settings › API</b> e copie a <b>Project URL</b> e a chave <b>anon public</b>. Não use a <i>service_role</i>.</li>
        <li>Na Vercel, abra o projeto › <b>Settings › Environment Variables</b> e crie as duas variáveis acima, marcando <b>Production</b>, <b>Preview</b> e <b>Development</b>.</li>
        <li>Vá em <b>Deployments</b>, clique em <b>⋯</b> no último deploy › <b>Redeploy</b>. Variáveis novas só valem em um deploy novo.</li>
      </ol>
      <p class="muted" style="font-size:.8rem">Também são aceitos os nomes criados pela integração Supabase da Vercel (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_ANON_KEY). Build: ${esc(d.build || '—')}${d.vercelEnv ? ' · ambiente ' + esc(d.vercelEnv) : ''}.</p>
    </div></div>`;
    return;
  }
  sb.auth.onAuthStateChange((ev) => {
    if (ev === 'PASSWORD_RECOVERY') telaLogin({ modo: 'nova' });
    else if (ev === 'SIGNED_IN' && !iniciado && !/type=recovery/.test(location.hash)) iniciar();
  });
  const { data: { session } } = await sb.auth.getSession();
  if (/type=recovery/.test(location.hash)) return telaLogin({ modo: 'nova' });
  if (session) iniciar(); else telaLogin();
}
start();
