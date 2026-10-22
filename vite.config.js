import { defineConfig, loadEnv } from 'vite';

// Aceita os nomes de variável usados pela Vercel, pela integração Supabase e pelo .env local.
const NOMES_URL = ['VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'];
const NOMES_KEY = [
  'VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY',
  'VITE_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEY',
];

const limpar = (v) => String(v || '').trim().replace(/^['"]|['"]$/g, '').trim();
function primeiro(env, nomes) {
  for (const n of nomes) { const v = limpar(env[n]); if (v) return { nome: n, valor: v }; }
  return { nome: null, valor: '' };
}
// Nunca embutir a chave secreta (service_role) no site.
function ehChaveSecreta(k) {
  if (k.startsWith('sb_secret_')) return true;
  const partes = k.split('.');
  if (partes.length === 3) {
    try { return JSON.parse(Buffer.from(partes[1], 'base64url').toString()).role === 'service_role'; } catch { return false; }
  }
  return false;
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const url = primeiro(env, NOMES_URL);
  const key = primeiro(env, NOMES_KEY);
  let erroKey = '';
  if (key.valor && ehChaveSecreta(key.valor)) { erroKey = 'secreta'; key.valor = ''; }
  let erroUrl = '';
  if (url.valor && !/^https:\/\/[^/\s]+/.test(url.valor) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(url.valor)) { erroUrl = 'formato'; }
  const urlFinal = erroUrl ? '' : url.valor.replace(/\/+$/, '').replace(/\/rest\/v1$/, '');

  // Aparece no log de build da Vercel/Netlify.
  console.log('\n[faturamento] Supabase URL: ' + (urlFinal ? `ok (${url.nome})` : erroUrl ? `INVÁLIDA em ${url.nome}: "${url.valor}"` : 'NÃO ENCONTRADA'));
  console.log('[faturamento] Supabase key: ' + (key.valor ? `ok (${key.nome})` : erroKey ? 'RECUSADA: é a chave secreta (service_role); use a anon/publishable' : 'NÃO ENCONTRADA') + '\n');

  return {
    define: {
      __SB_URL__: JSON.stringify(urlFinal),
      __SB_KEY__: JSON.stringify(key.valor),
      __SB_DIAG__: JSON.stringify({
        url: urlFinal ? 'ok' : erroUrl ? 'invalida' : 'ausente',
        key: key.valor ? 'ok' : erroKey ? 'secreta' : 'ausente',
        vercelEnv: env.VERCEL_ENV || '',
        build: new Date().toISOString(),
      }),
    },
    build: { target: 'es2020', chunkSizeWarningLimit: 1500 },
  };
});
