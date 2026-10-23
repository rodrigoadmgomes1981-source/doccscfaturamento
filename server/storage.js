/**
 * Armazenamento de documentos JSON.
 *
 *  • Vercel Blob (privado) quando o projeto tem um Blob store conectado
 *    (variáveis BLOB_STORE_ID + OIDC, ou BLOB_READ_WRITE_TOKEN).
 *  • Pasta local (DATA_DIR, padrão ./.data) em desenvolvimento, Docker ou servidor próprio.
 *
 * Interface comum:
 *   get(key, {fresh, forUpdate}) -> { data, etag } | null   (forUpdate: etag válida para ifMatch)
 *   put(key, data, {ifMatch, onlyIfAbsent}) -> { etag }   (lança Conflito se a versão mudou)
 *   del(key)
 *   list(prefix)                 -> [{ key, etag, uploadedAt }]
 *   tipo                          'blob' | 'pasta'
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export class Conflito extends Error {
  constructor(key) { super('Registro alterado por outra pessoa: ' + key); this.code = 'conflict'; }
}

const KEY_OK = /^[A-Za-z0-9_\-.~:@+/]+$/;
function checkKey(k) {
  if (!KEY_OK.test(k) || k.includes('..') || k.startsWith('/')) throw new Error('Chave inválida: ' + k);
}

/* ------------------------- Vercel Blob ------------------------- */
export function blobStorage(sdk) {
  const opts = { access: 'private' };
  const isPrecondition = (e) => e && (e.name === 'BlobPreconditionFailedError' || e instanceof sdk.BlobPreconditionFailedError);
  return {
    tipo: 'blob',
    /**
     * forUpdate: a versão (ETag) vem do head(), no mesmo formato que o put() aceita em ifMatch.
     * A ETag do get() vem do cabeçalho HTTP do CDN (pode vir com aspas ou W/) e não serve para ifMatch.
     * Ordem head → get → put(ifMatch): se alguém gravar no meio, o put é recusado e a operação é refeita.
     */
    async get(key, { fresh = true, forUpdate = false } = {}) {
      checkKey(key);
      const naoExiste = (e) => e && (e.name === 'BlobNotFoundError' || e instanceof sdk.BlobNotFoundError);
      let etag = null;
      if (forUpdate) {
        try { const h = await sdk.head(key, { ...opts }); etag = h && h.etag; }
        catch (e) { if (naoExiste(e)) return null; throw e; }
        if (!etag) return null;
      }
      let r;
      try { r = await sdk.get(key, { ...opts, useCache: forUpdate ? false : !fresh }); }
      catch (e) { if (naoExiste(e)) return null; throw e; }
      if (!r || r.statusCode !== 200 || !r.stream) return null;
      const text = await new Response(r.stream).text();
      return { data: JSON.parse(text), etag: forUpdate ? etag : r.blob.etag };
    },
    async put(key, data, { ifMatch, onlyIfAbsent } = {}) {
      checkKey(key);
      const o = { ...opts, contentType: 'application/json', addRandomSuffix: false, allowOverwrite: !onlyIfAbsent, cacheControlMaxAge: 60 };
      if (ifMatch) o.ifMatch = ifMatch;
      try {
        const r = await sdk.put(key, JSON.stringify(data), o);
        return { etag: r.etag };
      } catch (e) {
        if (isPrecondition(e)) throw new Conflito(key);
        if (onlyIfAbsent && /already exists|overwrite/i.test(String(e && e.message))) throw new Conflito(key);
        throw e;
      }
    },
    async del(key) { checkKey(key); await sdk.del(key, { ...opts }); },
    async list(prefix) {
      const out = []; let cursor;
      do {
        const r = await sdk.list({ prefix, cursor, limit: 1000 });
        r.blobs.forEach((b) => out.push({ key: b.pathname, etag: b.etag, uploadedAt: new Date(b.uploadedAt).toISOString() }));
        cursor = r.hasMore ? r.cursor : undefined;
      } while (cursor);
      return out;
    },
  };
}

/* ------------------------- Pasta local ------------------------- */
export function fsStorage(dir) {
  const root = path.resolve(dir);
  const file = (k) => path.join(root, ...k.split('/'));
  const etagOf = (t) => '"' + createHash('sha1').update(t).digest('hex') + '"';
  let fila = Promise.resolve();
  const exclusivo = (fn) => { const p = fila.then(fn); fila = p.catch(() => {}); return p; };
  async function ler(k) {
    try { const t = await fs.readFile(file(k), 'utf8'); return { data: JSON.parse(t), etag: etagOf(t) }; }
    catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  }
  return {
    tipo: 'pasta',
    async get(key) { checkKey(key); return ler(key); },
    put(key, data, { ifMatch, onlyIfAbsent } = {}) {
      checkKey(key);
      return exclusivo(async () => {
        const atual = await ler(key);
        if (onlyIfAbsent && atual) throw new Conflito(key);
        if (ifMatch && (!atual || atual.etag !== ifMatch)) throw new Conflito(key);
        const t = JSON.stringify(data);
        await fs.mkdir(path.dirname(file(key)), { recursive: true });
        const tmp = file(key) + '.' + process.pid + '.tmp';
        await fs.writeFile(tmp, t);
        await fs.rename(tmp, file(key));
        return { etag: etagOf(t) };
      });
    },
    del(key) { checkKey(key); return exclusivo(() => fs.rm(file(key), { force: true })); },
    async list(prefix) {
      const out = [];
      async function walk(d) {
        let ents; try { ents = await fs.readdir(d, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) await walk(p);
          else if (e.name.endsWith('.json')) {
            const key = path.relative(root, p).split(path.sep).join('/');
            if (key.startsWith(prefix)) { const st = await fs.stat(p); out.push({ key, etag: null, uploadedAt: st.mtime.toISOString() }); }
          }
        }
      }
      await walk(root);
      return out.sort((a, b) => a.key.localeCompare(b.key));
    },
  };
}

/* ------------------------- escolha automática ------------------------- */
let instancia = null;
export async function storage() {
  if (instancia) return instancia;
  const env = process.env;
  const temBlob = !!(env.BLOB_READ_WRITE_TOKEN || (env.BLOB_STORE_ID && (env.VERCEL_OIDC_TOKEN || env.VERCEL)));
  if (temBlob && env.STORAGE !== 'pasta') {
    const sdk = await import('@vercel/blob');
    instancia = blobStorage(sdk);
  } else if (env.VERCEL && env.STORAGE !== 'pasta') {
    const e = new Error('Nenhum Blob store conectado ao projeto. Na Vercel: Storage › Create › Blob (Private) › Connect.');
    e.code = 'no_storage';
    throw e;
  } else {
    instancia = fsStorage(env.DATA_DIR || '.data');
  }
  return instancia;
}
export function _setStorage(s) { instancia = s; }
