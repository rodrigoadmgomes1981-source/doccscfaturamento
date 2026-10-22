import './styles.css';
import * as XLSX from 'xlsx';
import Chart from 'chart.js/auto';
import { sb, configurado, platform } from './platform/client.js';

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
    app.innerHTML = '<div class="login"><div class="login-card"><h1>Configuração pendente</h1><p>Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (arquivo <code>.env</code> local ou variáveis de ambiente na Vercel) e publique novamente.</p></div></div>';
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
