import './styles.css';
import * as XLSX from 'xlsx';
import Chart from 'chart.js/auto';
import { chamar, criarPlataforma } from './platform/api.js';

window.XLSX = XLSX;
window.Chart = Chart;

const app = document.getElementById('app');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Telas: setup (primeiro administrador), entrar, trocar (senha temporária). */
function tela(modo, estado = {}) {
  const t = {
    setup: ['Primeiro acesso', 'Crie a conta do administrador. Ela terá acesso total e poderá cadastrar a equipe.', 'Criar administrador'],
    entrar: ['Entrar', 'Fechamento mensal de serviços médicos.', 'Entrar'],
    trocar: ['Defina sua senha', 'Por segurança, troque a senha temporária que você recebeu.', 'Salvar senha e continuar'],
  }[modo];
  const campo = (id, rot, tipo, ac, v) => `<label class="f">${rot}<input type="${tipo}" id="${id}" autocomplete="${ac}" value="${esc(v || '')}" required></label>`;
  app.innerHTML = `<div class="login"><form class="login-card" id="fLogin" novalidate>
    <div><div class="eyebrow">Faturamento Médico</div><h1>${t[0]}</h1><p class="muted">${t[1]}</p></div>
    ${modo === 'setup' ? campo('lgNome', 'Nome completo', 'text', 'name', estado.nome) : ''}
    ${modo !== 'trocar' ? campo('lgEmail', 'E-mail', 'email', 'email', estado.email) : ''}
    ${modo === 'trocar' ? campo('lgAtual', 'Senha temporária', 'password', 'current-password') : ''}
    ${campo('lgSenha', modo === 'entrar' ? 'Senha' : 'Nova senha (mínimo 8 caracteres)', 'password', modo === 'entrar' ? 'current-password' : 'new-password')}
    ${modo !== 'entrar' ? campo('lgSenha2', 'Repita a senha', 'password', 'new-password') : ''}
    ${estado.erro ? `<div class="banner bad">${esc(estado.erro)}</div>` : ''}
    ${estado.aviso ? `<div class="banner info">${esc(estado.aviso)}</div>` : ''}
    <button class="btn pri" type="submit" ${estado.busy ? 'disabled' : ''}>${estado.busy ? 'Aguarde…' : t[2]}</button>
    ${modo === 'entrar' ? '<p class="muted" style="font-size:.82rem;margin:0">Esqueceu a senha? Peça a um administrador para redefinir em Administração › Usuários.</p>' : ''}
  </form></div>`;
  const f = app.querySelector('#fLogin');
  (f.querySelector('input') || {}).focus?.();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = (id) => (document.getElementById(id) || {}).value || '';
    const dados = { nome: v('lgNome').trim(), email: v('lgEmail').trim(), senha: v('lgSenha'), senha2: v('lgSenha2'), atual: v('lgAtual') };
    const erro = (m) => tela(modo, { ...dados, erro: m });
    if (modo !== 'trocar' && !/^\S+@\S+\.\S+$/.test(dados.email)) return erro('Informe um e-mail válido.');
    if (modo === 'setup' && !dados.nome) return erro('Informe seu nome.');
    if (modo !== 'entrar' && dados.senha.length < 8) return erro('A senha precisa ter pelo menos 8 caracteres.');
    if (modo !== 'entrar' && dados.senha !== dados.senha2) return erro('As senhas não conferem.');
    tela(modo, { ...dados, busy: true });
    try {
      if (modo === 'setup') await chamar('auth', { action: 'setup', nome: dados.nome, email: dados.email, senha: dados.senha });
      else if (modo === 'entrar') {
        const r = await chamar('auth', { action: 'login', email: dados.email, senha: dados.senha });
        if (r.trocarSenha) return tela('trocar');
      } else await chamar('auth', { action: 'senha', atual: dados.atual, nova: dados.senha });
      iniciar();
    } catch (err) { erro(err.message); }
  });
}

/* Troca de senha a partir do menu lateral. */
function trocarSenhaDialogo() {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<form class="modal" role="dialog" aria-modal="true" id="fSenha"><h2>Trocar senha</h2>
    <label class="f">Senha atual<input type="password" id="tsAtual" autocomplete="current-password"></label>
    <label class="f">Nova senha (mínimo 8 caracteres)<input type="password" id="tsNova" autocomplete="new-password"></label>
    <label class="f">Repita a nova senha<input type="password" id="tsNova2" autocomplete="new-password"></label>
    <div id="tsMsg"></div>
    <div class="row"><span class="grow"></span><button type="button" class="btn" id="tsCancel">Cancelar</button><button class="btn pri" type="submit">Salvar</button></div></form>`;
  document.body.appendChild(ov);
  const msg = (t, c) => { ov.querySelector('#tsMsg').innerHTML = `<div class="banner ${c}">${esc(t)}</div>`; };
  ov.querySelector('#tsCancel').onclick = () => ov.remove();
  ov.querySelector('#tsAtual').focus();
  ov.querySelector('#fSenha').onsubmit = async (e) => {
    e.preventDefault();
    const a = ov.querySelector('#tsAtual').value, n = ov.querySelector('#tsNova').value, n2 = ov.querySelector('#tsNova2').value;
    if (n.length < 8) return msg('A nova senha precisa ter pelo menos 8 caracteres.', 'bad');
    if (n !== n2) return msg('As senhas não conferem.', 'bad');
    try { await chamar('auth', { action: 'senha', atual: a, nova: n }); msg('Senha alterada.', 'ok'); setTimeout(() => ov.remove(), 900); }
    catch (err) { msg(err.message, 'bad'); }
  };
}

let iniciado = false;
async function iniciar() {
  if (iniciado) return;
  iniciado = true;
  const plataforma = criarPlataforma();
  window.__platform = { use: async (n) => plataforma[n] || null };
  window.__contas = plataforma.contas;
  try { const st = await chamar('auth', { action: 'status' }); if (st.email) window.__email = plataforma.email; } catch { /* sem envio direto */ }
  window.__trocarSenha = trocarSenhaDialogo;
  window.__logout = async () => { try { await chamar('auth', { action: 'logout' }); } catch { /* segue */ } location.reload(); };
  app.innerHTML = '';
  await import('./app.js');
}
criarPlataforma.aoExpirar = () => { if (iniciado) location.reload(); };

async function start() {
  try {
    const s = await chamar('auth', { action: 'status' });
    if (!s.temUsuarios) return tela('setup', { aviso: s.armazenamento === 'pasta' ? 'Os dados ficam na pasta .data deste servidor.' : '' });
    if (!s.logado) return tela('entrar');
    const me = await chamar('auth', { action: 'me' });
    if (me.trocarSenha) return tela('trocar');
    iniciar();
  } catch (e) {
    app.innerHTML = `<div class="login"><div class="login-card"><div class="eyebrow">Faturamento Médico</div><h1>${e.code === 'no_storage' ? 'Armazenamento não conectado' : 'Servidor indisponível'}</h1>
      <p>${esc(e.message)}</p>
      ${e.code === 'no_storage' ? '<ol style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px"><li>Na Vercel, abra o projeto › <b>Storage</b> › <b>Create</b> › <b>Blob</b>.</li><li>Escolha o acesso <b>Private</b> e conecte ao projeto (todos os ambientes).</li><li>Em <b>Deployments</b>, clique em <b>⋯</b> › <b>Redeploy</b>.</li></ol>' : '<button class="btn" onclick="location.reload()">Tentar de novo</button>'}
    </div></div>`;
  }
}
start();
