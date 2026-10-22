/**
 * Camada de dados sobre o Supabase.
 *
 * Expõe a mesma interface usada pelo app (db / user / downloads):
 *   db.doc('colecao/id').get|set|update|delete|onSnapshot
 *   db.collection('colecao').doc(id)|onSnapshot
 * Cada documento é uma linha da tabela public.docs (path, collection, data jsonb).
 * Alterações de outros usuários chegam em tempo real (Supabase Realtime).
 */
export function criarPlataforma(sb) {
/* ---------------- cache + ouvintes ---------------- */
const cache = new Map();          // path -> data
const docL = new Map();           // path -> Set<fn>
const colL = new Map();           // collection -> Set<fn>
const colLoaded = new Map();      // collection -> Promise
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const colOf = (p) => p.split('/').slice(0, -1).join('/');
const meta = { fromCache: false, hasPendingWrites: false };

function snapDoc(p) {
  const d = cache.get(p);
  return { id: p.split('/').pop(), exists: d !== undefined, data: () => clone(d), metadata: meta };
}
function snapCol(c) {
  const docs = [...cache.keys()].filter((p) => colOf(p) === c).sort().map(snapDoc);
  return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: meta };
}
function emit(p) {
  (docL.get(p) || []).forEach((f) => f(snapDoc(p)));
  const c = colOf(p);
  if (colLoaded.has(c)) (colL.get(c) || []).forEach((f) => f(snapCol(c)));
}
function apply(p, data) {
  if (data === undefined || data === null) cache.delete(p); else cache.set(p, data);
  emit(p);
}
function erro(e) {
  const m = (e && (e.message || e.details)) || 'Erro no banco de dados';
  const perm = (e && e.code === '42501') || /row-level security|permission denied|not allowed/i.test(m);
  const nf = /not_found|não encontrado/i.test(m);
  return { code: perm || nf ? 'invalid_argument' : 'unavailable', message: m };
}
function checkPath(p, even) {
  const seg = String(p).split('/');
  if (seg.some((s) => !s || !/^[A-Za-z0-9_\-.~:@+]+$/.test(s))) throw new TypeError('Caminho inválido: ' + p);
  if ((seg.length % 2 === 0) !== even) throw new TypeError('Caminho com número de segmentos errado: ' + p);
}

async function fetchDoc(p) {
  const { data, error } = await sb.from('docs').select('data').eq('path', p).maybeSingle();
  if (error) throw erro(error);
  if (data) cache.set(p, data.data); else cache.delete(p);
}
function loadCol(c) {
  if (!colLoaded.has(c)) {
    colLoaded.set(c, (async () => {
      const page = 1000;
      for (let from = 0; ; from += page) {
        const { data, error } = await sb.from('docs').select('path,data').eq('collection', c).order('path').range(from, from + page - 1);
        if (error) { colLoaded.delete(c); throw erro(error); }
        data.forEach((r) => cache.set(r.path, r.data));
        if (data.length < page) break;
      }
    })());
  }
  return colLoaded.get(c);
}

/* ---------------- tempo real ---------------- */
let canal = null;
function ligarRealtime() {
  if (canal) return;
  canal = sb.channel('docs-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, (pl) => {
      if (pl.eventType === 'DELETE') { const p = pl.old && pl.old.path; if (p) apply(p, undefined); }
      else if (pl.new && pl.new.path) apply(pl.new.path, pl.new.data);
    })
    .subscribe((status) => {
      // Se a conexão cair e voltar, recarrega o que está em tela.
      if (status === 'SUBSCRIBED') {
        [...colLoaded.keys()].forEach((c) => { colLoaded.delete(c); loadCol(c).then(() => (colL.get(c) || []).forEach((f) => f(snapCol(c)))).catch(() => {}); });
      }
    });
}

/* ---------------- db ---------------- */
function docRef(p) {
  checkPath(p, true);
  return {
    id: p.split('/').pop(),
    path: p,
    async get() { await fetchDoc(p); return snapDoc(p); },
    async set(data) {
      const { error } = await sb.from('docs').upsert({ path: p, collection: colOf(p), data });
      if (error) throw erro(error);
      apply(p, clone(data));
    },
    async update(patch) {
      const { data, error } = await sb.rpc('doc_update', { p_path: p, p_patch: patch });
      if (error) throw erro(error);
      apply(p, data);
    },
    async delete() {
      const { error } = await sb.from('docs').delete().eq('path', p);
      if (error) throw erro(error);
      apply(p, undefined);
    },
    onSnapshot(next, onError) {
      ligarRealtime();
      if (!docL.has(p)) docL.set(p, new Set());
      docL.get(p).add(next);
      (cache.has(p) ? Promise.resolve() : fetchDoc(p)).then(() => next(snapDoc(p))).catch((e) => onError && onError(e));
      return () => docL.get(p) && docL.get(p).delete(next);
    },
    collection(sub) { return colRef(p + '/' + sub); },
  };
}
function colRef(c) {
  checkPath(c, false);
  return {
    path: c,
    doc(id) { return docRef(c + '/' + (id || Math.random().toString(36).slice(2, 12))); },
    async add(data) { const r = this.doc(); await r.set(data); return r; },
    async get() { await loadCol(c); return snapCol(c); },
    onSnapshot(next, onError) {
      ligarRealtime();
      if (!colL.has(c)) colL.set(c, new Set());
      colL.get(c).add(next);
      loadCol(c).then(() => next(snapCol(c))).catch((e) => onError && onError(e));
      return () => colL.get(c) && colL.get(c).delete(next);
    },
  };
}
const db = { doc: docRef, collection: colRef };

/* ---------------- user ---------------- */
function avatar(nome, cor) {
  const ini = String(nome || '?').trim().split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="20" fill="${cor}"/><text x="20" y="25" font-family="Arial" font-size="15" font-weight="700" text-anchor="middle" fill="#fff">${ini.replace(/[<&>"]/g, '')}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
function cor(id) {
  let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 45% 38%)`;
}
const perfilCache = {};
function perfil(r, myId) {
  const name = r.name || (r.email ? r.email.split('@')[0] : '');
  return { id: r.id, name, email: r.email || null, avatarUrl: avatar(name, cor(r.id)), color: cor(r.id), isMe: r.id === myId, guest: false };
}
let meCache = null;
const user = {
  async me() {
    if (meCache) return meCache;
    const { data: { user: u } } = await sb.auth.getUser();
    if (!u) return { id: null, name: '', email: null, avatarUrl: avatar('?', '#888'), color: '#888', isOwner: false, canEdit: false };
    const [{ data: prof }, { data: admin }] = await Promise.all([
      sb.from('profiles').select('id,name,email').eq('id', u.id).maybeSingle(),
      sb.rpc('is_admin'),
    ]);
    const p = perfil(prof || { id: u.id, email: u.email, name: (u.user_metadata || {}).name }, u.id);
    meCache = { id: u.id, name: p.name, email: u.email, avatarUrl: p.avatarUrl, color: p.color, isOwner: !!admin, canEdit: !!admin };
    return meCache;
  },
  async id() { return (await this.me()).id; },
  async isOwner() { return (await this.me()).isOwner; },
  async canEdit() { return (await this.me()).canEdit; },
  async can() { return null; },
  async name() { return (await this.me()).name; },
  async profiles(ids) {
    const lista = [...new Set([].concat(ids || []))];
    const falta = lista.filter((i) => !perfilCache[i]);
    const myId = meCache && meCache.id;
    if (falta.length) {
      const { data } = await sb.from('profiles').select('id,name,email').in('id', falta);
      (data || []).forEach((r) => { perfilCache[r.id] = perfil(r, myId); });
    }
    return Object.fromEntries(lista.map((i) => [i, perfilCache[i] || { id: i, name: '', email: null, avatarUrl: avatar('?', '#888'), color: '#888', isMe: i === myId, guest: false }]));
  },
  async search(q) {
    q = String(q || '').trim().replace(/[%,()]/g, ' ');
    if (!q) return [];
    const { data } = await sb.from('profiles').select('id,name,email').or(`name.ilike.%${q}%,email.ilike.%${q}%`).limit(8);
    const myId = meCache && meCache.id;
    return (data || []).map((r) => (perfilCache[r.id] = perfil(r, myId)));
  },
};

/* ---------------- downloads ---------------- */
const downloads = {
  async save({ filename, data }) {
    const blob = data instanceof Blob ? data : new Blob([data]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { status: 'saved' };
  },
};
return { db, user, downloads };
}
