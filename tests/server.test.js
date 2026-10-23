// Testes da API (login, permissões, dados, mudanças) e das duas formas de armazenamento.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fsStorage, blobStorage, Conflito, _setStorage } from '../server/storage.js';
import { handle } from '../server/api.js';

/* ---------- Vercel Blob simulado (etag, ifMatch, allowOverwrite, list) ---------- */
function fakeBlobSdk() {
  const m = new Map(); let n = 0;
  class BlobPreconditionFailedError extends Error { constructor() { super('precondition'); this.name = 'BlobPreconditionFailedError'; } }
  class BlobNotFoundError extends Error { constructor() { super('not found'); this.name = 'BlobNotFoundError'; } }
  return {
    m, BlobPreconditionFailedError, BlobNotFoundError,
    async put(k, body, o) {
      assert.equal(o.access, 'private');
      const cur = m.get(k);
      if (o.ifMatch && (!cur || cur.etag !== o.ifMatch)) throw new BlobPreconditionFailedError();
      if (cur && !o.allowOverwrite) throw new Error('This blob already exists, use `allowOverwrite: true`');
      const etag = '"e' + ++n + '"';
      m.set(k, { body, etag, uploadedAt: new Date() });
      return { pathname: k, etag };
    },
    async get(k, o) {
      assert.equal(o.access, 'private');
      const cur = m.get(k); if (!cur) return null;
      return { statusCode: 200, stream: new Blob([cur.body]).stream(), blob: { etag: cur.etag } };
    },
    async del(k) { m.delete(k); },
    async list({ prefix }) { return { blobs: [...m.entries()].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => ({ pathname: k, etag: v.etag, uploadedAt: v.uploadedAt })), hasMore: false }; },
  };
}

for (const [nome, criar] of [['pasta', () => fsStorage(mkdtempSync(path.join(os.tmpdir(), 'fm-')))], ['blob', () => blobStorage(fakeBlobSdk())]]) {
  test(`armazenamento (${nome}): versão, conflito e listagem`, async () => {
    const st = criar();
    const a = await st.put('db/contratos/A.json', { x: 1 });
    await assert.rejects(st.put('db/contratos/A.json', { x: 2 }, { onlyIfAbsent: true }), Conflito);
    const b = await st.put('db/contratos/A.json', { x: 3 }, { ifMatch: a.etag });
    await assert.rejects(st.put('db/contratos/A.json', { x: 4 }, { ifMatch: a.etag }), Conflito);
    const r = await st.get('db/contratos/A.json');
    assert.deepEqual(r.data, { x: 3 }); assert.equal(r.etag, b.etag);
    await st.put('db/fechamentos/F.json', {});
    assert.deepEqual((await st.list('db/contratos/')).map((x) => x.key), ['db/contratos/A.json']);
    await st.del('db/contratos/A.json');
    assert.equal(await st.get('db/contratos/A.json'), null);
  });
}

/* ------------------------------ API ponta a ponta ------------------------------ */
const BASE = 'http://localhost:5173';
function cliente() {
  let cookie = '';
  return async (rota, corpo, metodo = 'POST') => {
    const req = new Request(BASE + '/api/' + rota, {
      method: metodo,
      headers: { 'content-type': 'application/json', cookie, origin: BASE },
      body: metodo === 'POST' ? JSON.stringify(corpo) : undefined,
    });
    const res = await handle(req, rota.split('?')[0]);
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: res.status, body: await res.json() };
  };
}

test('API: primeiro administrador, contas, permissões e dados', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'fm-api-'));
  _setStorage(fsStorage(dir));
  process.env.ADMIN_EMAILS = 'chefe@empresa.com';
  const admin = cliente(), fat = cliente(), estranho = cliente();
  try {
    assert.equal((await admin('auth', { action: 'status' })).body.temUsuarios, false);
    assert.equal((await estranho('auth', { action: 'setup', nome: 'X', email: 'x@y.com', senha: '12345678' })).status, 403, 'e-mail fora de ADMIN_EMAILS');
    assert.equal((await admin('auth', { action: 'setup', nome: 'Chefe', email: 'Chefe@Empresa.com', senha: 'senha-forte-1' })).status, 200);
    assert.equal((await estranho('auth', { action: 'setup', nome: 'X', email: 'chefe@empresa.com', senha: '12345678' })).status, 409, 'setup só uma vez');

    // carga inicial gravada
    const cols = (await admin('db', { op: 'loadCollections', collections: ['contratos', 'config'] })).body;
    assert.ok(cols.docs['contratos/PAP_98687'] && cols.docs['config/geral']);
    assert.equal(cols.docs['contratos/PAP_98687'].itens[0].valorFaturar, 189.38);

    // admin cria conta (senha temporária) e libera o perfil
    const conta = (await admin('auth', { action: 'criarConta', nome: 'Fátima', email: 'fat@empresa.com' })).body;
    assert.match(conta.senha, /^\w{4}-\w{4}-\w{4}$/);
    assert.equal((await admin('auth', { action: 'criarConta', nome: 'Dup', email: 'FAT@empresa.com' })).status, 409);

    // login errado / certo; sem liberação não lê nada
    assert.equal((await fat('auth', { action: 'login', email: 'fat@empresa.com', senha: 'errada' })).status, 401);
    const lg = await fat('auth', { action: 'login', email: 'fat@empresa.com', senha: conta.senha });
    assert.equal(lg.body.trocarSenha, true);
    assert.equal(Object.keys((await fat('db', { op: 'loadCollections', collections: ['contratos'] })).body.docs).length, 0);
    assert.equal((await fat('db', { op: 'set', path: 'contratos/X', data: {} })).status, 403);

    await admin('db', { op: 'set', path: 'usuarios/' + conta.id, data: { perfil: 'faturamento', ativo: true, perms: { conferir: true } } });
    // cache de permissão do servidor dura 15 s; a gravação de "usuarios" limpa o cache
    assert.ok(Object.keys((await fat('db', { op: 'loadCollections', collections: ['contratos'] })).body.docs).length >= 2);

    // troca de senha obrigatória
    assert.equal((await fat('auth', { action: 'senha', atual: 'errada', nova: 'nova-senha-1' })).status, 400);
    assert.equal((await fat('auth', { action: 'senha', atual: conta.senha, nova: 'nova-senha-1' })).status, 200);
    assert.equal((await fat('auth', { action: 'me' })).body.trocarSenha, false);

    // faturamento não mexe em usuários nem parâmetros
    assert.equal((await fat('db', { op: 'update', path: 'usuarios/' + conta.id, patch: { perfil: 'admin' } })).status, 403);
    assert.equal((await fat('db', { op: 'update', path: 'config/geral', patch: { x: 1 } })).status, 403);

    // dados: set, update com merge profundo, registro de mudanças
    const s0 = (await admin('db?since=0', null, 'GET')).body.seq;
    await fat('db', { op: 'set', path: 'fechamentos/T_202610', data: { t: { inicio: 'i' }, lista: [1, 2], ajustes: {} } });
    const up = (await fat('db', { op: 'update', path: 'fechamentos/T_202610', patch: { t: { aprovado: 'a' }, lista: [9], ajustes: { 'k|i': { qPag: 6 } } } })).body.data;
    assert.deepEqual(up, { t: { inicio: 'i', aprovado: 'a' }, lista: [9], ajustes: { 'k|i': { qPag: 6 } } });
    const mud = (await admin('db?since=' + s0, null, 'GET')).body;
    assert.deepEqual(mud.paths, ['fechamentos/T_202610']);
    assert.equal(mud.seq, s0 + 2);
    assert.equal((await fat('db', { op: 'update', path: 'fechamentos/NAO', patch: {} })).status, 404);

    // atualizações simultâneas no mesmo registro não se perdem
    await Promise.all(Array.from({ length: 8 }, (_, i) => fat('db', { op: 'update', path: 'fechamentos/T_202610', patch: { conferidos: { ['l' + i]: true } } })));
    const fim = (await fat('db', { op: 'get', path: 'fechamentos/T_202610' })).body.docs['fechamentos/T_202610'];
    assert.equal(Object.keys(fim.conferidos).length, 8);

    // redefinir senha derruba a sessão antiga
    const nova = (await admin('auth', { action: 'redefinirSenha', id: conta.id })).body.senha;
    assert.equal((await fat('auth', { action: 'me' })).status, 401);
    assert.equal((await fat('auth', { action: 'login', email: 'fat@empresa.com', senha: nova })).status, 200);

    // usuário removido perde o acesso
    await admin('db', { op: 'delete', path: 'usuarios/' + conta.id });
    assert.equal(Object.keys((await fat('db', { op: 'loadCollections', collections: ['contratos'] })).body.docs).length, 0);

    // pedido de outro site é recusado
    const outro = await handle(new Request(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://malicioso.com' }, body: '{}' }), 'db');
    assert.equal(outro.status, 403);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
