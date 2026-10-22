// Supabase simulado em memória (usado nos testes).
function merge(a, b) {
  if (!a || typeof a !== 'object' || Array.isArray(a) || !b || typeof b !== 'object' || Array.isArray(b)) return b;
  const r = { ...a };
  for (const k of Object.keys(b)) r[k] = merge(r[k], b[k]);
  return r;
}
export function fakeSupabase() {
  const rows = new Map(); let rt = null;
  const profiles = [{ id: 'u1', name: 'Rodrigo Gomes', email: 'r@x.com' }, { id: 'u2', name: 'Ana Souza', email: 'ana@x.com' }];
  const from = (table) => {
    const st = { table, filt: [], op: 'select' };
    const run = () => {
      let list = table === 'docs' ? [...rows.values()] : profiles.slice();
      for (const [k, v, t] of st.filt) list = list.filter((r) => (t === 'in' ? v.includes(r[k]) : r[k] === v));
      if (st.or) { const q = st.or.toLowerCase(); list = list.filter((r) => (r.name + r.email).toLowerCase().includes(q)); }
      list.sort((a, b) => String(a.path || a.id).localeCompare(b.path || b.id));
      if (st.range) list = list.slice(st.range[0], st.range[1] + 1);
      return list;
    };
    const b = {
      select() { return b; }, eq(k, v) { st.filt.push([k, v]); return b; }, in(k, v) { st.filt.push([k, v, 'in']); return b; },
      or(s) { st.or = s.match(/%(.*?)%/)[1]; return b; }, order() { return b; }, limit() { return b; }, range(a, z) { st.range = [a, z]; return b; },
      async maybeSingle() { const l = run(); return { data: l[0] || null, error: null }; },
      upsert(row) { rows.set(row.path, { ...row }); setTimeout(() => rt && rt({ eventType: 'UPDATE', new: row }), 0); return Promise.resolve({ error: null }); },
      delete() { st.op = 'delete'; return b; },
      then(res, rej) {
        if (st.op === 'delete') { run().forEach((r) => rows.delete(r.path)); return Promise.resolve({ error: null }).then(res, rej); }
        return Promise.resolve({ data: run(), error: null }).then(res, rej);
      },
    };
    return b;
  };
  return {
    rows, emitirRemoto: (ev) => rt(ev),
    from,
    async rpc(fn, args) {
      if (fn === 'is_admin') return { data: true, error: null };
      if (fn === 'doc_update') {
        const r = rows.get(args.p_path);
        if (!r) return { data: null, error: { message: 'not_found: ' + args.p_path } };
        r.data = merge(r.data, args.p_patch); return { data: r.data, error: null };
      }
    },
    channel() { const c = { on(_e, _f, fn) { rt = fn; return c; }, subscribe() { return c; } }; return c; },
    auth: { async getUser() { return { data: { user: { id: 'u1', email: 'r@x.com', user_metadata: {} } } }; } },
  };
}

