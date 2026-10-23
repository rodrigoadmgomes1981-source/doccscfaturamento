/**
 * Servidor Node para desenvolvimento local e para hospedagem própria (Docker, VPS).
 *   npm run dev    → Vite com recarga automática + API, dados em ./.data
 *   npm start      → serve dist/ + API (rode `npm run build` antes)
 * Na Vercel este arquivo não é usado: lá a API roda em /api (Functions) e os dados no Vercel Blob.
 */
import http from 'node:http';
import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// lê o arquivo .env, se existir (ADMIN_EMAILS, DATA_DIR, PORT…)
try { process.loadEnvFile?.(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env')); } catch { /* sem .env */ }
const { handle } = await import('./api.js');

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dev = process.argv.includes('--dev');
const PORT = Number(process.env.PORT || (dev ? 5173 : 3000));
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

async function paraRequest(req) {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const url = `${proto}://${req.headers.host}${req.url}`;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  return new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
}
async function enviar(res, resp) {
  res.statusCode = resp.status;
  resp.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(Buffer.from(await resp.arrayBuffer()));
}

let vite = null;
if (dev) {
  const { createServer } = await import('vite');
  vite = await createServer({ root: raiz, server: { middlewareMode: true }, appType: 'spa' });
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/api/auth' || u.pathname === '/api/db') {
      return enviar(res, await handle(await paraRequest(req), u.pathname.slice(5)));
    }
    if (vite) return vite.middlewares(req, res);
    // produção: arquivos estáticos de dist/, com retorno ao index.html
    const dist = path.join(raiz, 'dist');
    let arq = path.join(dist, decodeURIComponent(u.pathname));
    if (!arq.startsWith(dist)) { res.statusCode = 400; return res.end(); }
    let st = await fs.stat(arq).catch(() => null);
    if (!st || st.isDirectory()) { arq = path.join(dist, 'index.html'); st = await fs.stat(arq).catch(() => null); }
    if (!st) { res.statusCode = 500; return res.end('Rode "npm run build" antes de "npm start".'); }
    res.setHeader('Content-Type', TIPOS[path.extname(arq)] || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', arq.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
    createReadStream(arq).pipe(res);
  } catch (e) {
    console.error(e); res.statusCode = 500; res.end('Erro interno');
  }
});
server.listen(PORT, () => console.log(`Faturamento Médico em http://localhost:${PORT} (${dev ? 'desenvolvimento' : 'produção'}, dados em ${process.env.DATA_DIR || '.data'})`));
