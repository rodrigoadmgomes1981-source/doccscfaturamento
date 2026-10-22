// Testa a camada de dados com um Supabase simulado em memória.
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarPlataforma } from '../src/platform/supabase.js';
import { fakeSupabase } from './fake-supabase.js';

const tick = () => new Promise((r) => setTimeout(r, 5));

test('set, update com merge profundo, get e delete', async () => {
  const sb = fakeSupabase(); const { db } = criarPlataforma(sb);
  await db.doc('fechamentos/A_202607').set({ t: { inicio: 'i' }, lista: [1, 2], ajustes: {} });
  await db.doc('fechamentos/A_202607').update({ t: { aprovado: 'x' }, lista: [9], ajustes: { 'k|i': { qPag: 6 } } });
  const s = await db.doc('fechamentos/A_202607').get();
  assert.deepEqual(s.data(), { t: { inicio: 'i', aprovado: 'x' }, lista: [9], ajustes: { 'k|i': { qPag: 6 } } });
  assert.equal(sb.rows.get('fechamentos/A_202607').collection, 'fechamentos');
  await db.doc('fechamentos/A_202607').delete();
  assert.equal((await db.doc('fechamentos/A_202607').get()).exists, false);
});

test('update em documento inexistente rejeita com invalid_argument', async () => {
  const { db } = criarPlataforma(fakeSupabase());
  await assert.rejects(db.doc('contratos/X').update({ a: 1 }), (e) => e.code === 'invalid_argument');
});

test('onSnapshot da coleção recebe gravações locais e remotas', async () => {
  const sb = fakeSupabase(); const { db } = criarPlataforma(sb);
  await db.doc('contratos/A').set({ sigla: 'A' });
  const vistos = [];
  db.collection('contratos').onSnapshot((snap) => vistos.push(snap.docs.map((d) => d.id).join(',')));
  await tick();
  await db.doc('contratos/B').set({ sigla: 'B' });
  sb.emitirRemoto({ eventType: 'INSERT', new: { path: 'contratos/C', data: { sigla: 'C' } } });
  sb.emitirRemoto({ eventType: 'DELETE', old: { path: 'contratos/A' } });
  sb.emitirRemoto({ eventType: 'INSERT', new: { path: 'fechamentos/Z', data: {} } });
  await tick();
  assert.equal(vistos[0], 'A');
  assert.ok(vistos.includes('A,B'));
  assert.equal(vistos.at(-1), 'B,C');
});

test('caminhos inválidos são recusados', () => {
  const { db } = criarPlataforma(fakeSupabase());
  assert.throws(() => db.doc('contratos'), TypeError);
  assert.throws(() => db.collection('a/b'), TypeError);
  assert.throws(() => db.doc('contratos/a b'), TypeError);
});

test('usuário: me, profiles e busca', async () => {
  const { user } = criarPlataforma(fakeSupabase());
  const me = await user.me();
  assert.equal(me.id, 'u1'); assert.equal(me.isOwner, true); assert.equal(me.name, 'Rodrigo Gomes');
  const ps = await user.profiles(['u2', 'zz']);
  assert.equal(ps.u2.name, 'Ana Souza'); assert.equal(ps.zz.name, '');
  assert.deepEqual((await user.search('ana')).map((p) => p.id), ['u2']);
  assert.deepEqual(await user.search(''), []);
});
