/**
 * Camada de dados do navegador: conversa com /api (Vercel Functions ou servidor Node).
 * Expõe a mesma interface usada pelo app (db / user / downloads) e verifica a cada
 * poucos segundos o que outras pessoas alteraram.
 */
export async function chamar(rota, corpo, metodo = 'POST') {
  const r = await fetch('/api/' + rota, {
    method: metodo,
    credentials: 'same-origin',
    headers: metodo === 'POST' ? { 'Content-Type': 'application/json' } : {},
    body: metodo === 'POST' ? JSON.stringify(corpo || {}) : undefined,
  });
  let dados = null;
  try { dados = await r.json(); } catch { /* resposta vazia */ }
  if (!r.ok) {
    const e = new Error((dados && dados.erro) || `Erro ${r.status} no servidor`);
    e.code = (dados && dados.code) || (r.status === 401 ? 'unauthenticated' : r.status === 403 ? 'invalid_argument' : 'unavailable');
    e.status = r.status;
    if (r.status === 401 && criarPlataforma.aoExpirar) criarPlataforma.aoExpirar();
    throw e;
  }
  return dados;
}

export function criarPlataforma({ intervalo = 45000 } = {}) {
  const cache = new Map();      // path -> data
  const docL = new Map();       // path -> Set<fn>
  const colL = new Map();       // collection -> Set<fn>
  const colLoaded = new Map();  // collection -> Promise
  let seq = 0;
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const colOf = (p) => p.split('/').slice(0, -1).join('/');
  const meta = { fromCache: false, hasPendingWrites: false };
  const snapDoc = (p) => { const d = cache.get(p); return { id: p.split('/').pop(), exists: d !== undefined, data: () => clone(d), metadata: meta }; };
  const snapCol = (c) => { const docs = [...cache.keys()].filter((p) => colOf(p) === c).sort().map(snapDoc); return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: meta }; };
  function emit(p) {
    (docL.get(p) || []).forEach((f) => f(snapDoc(p)));
    const c = colOf(p);
    if (colLoaded.has(c)) (colL.get(c) || []).forEach((f) => f(snapCol(c)));
  }
  function apply(p, data) { if (data === undefined || data === null) cache.delete(p); else cache.set(p, data); emit(p); }
  function checkPath(p, par) {
    const seg = String(p).split('/');
    if (seg.some((s) => !s || !/^[A-Za-z0-9_\-.~:@+]+$/.test(s))) throw new TypeError('Caminho inválido: ' + p);
    if ((seg.length % 2 === 0) !== par) throw new TypeError('Caminho com número de segmentos errado: ' + p);
  }

  async function carregar(cols) {
    let cursor = null;
    do {
      const r = await chamar('db', { op: 'loadCollections', collections: cols, cursor });
      for (const [p, d] of Object.entries(r.docs)) cache.set(p, d);
      if (!seq || r.seq < seq) seq = r.seq;
      cursor = r.cursor;
    } while (cursor != null);
  }
  function loadCol(c) {
    if (!colLoaded.has(c)) colLoaded.set(c, carregar([c]).catch((e) => { colLoaded.delete(c); throw e; }));
    return colLoaded.get(c);
  }
  async function fetchDoc(p) {
    const r = await chamar('db', { op: 'get', path: p });
    if (r.docs[p]) cache.set(p, r.docs[p]); else cache.delete(p);
  }

  /* --------- verificação de mudanças de outras pessoas --------- */
  let timer = null, rodando = false, ultimoUso = Date.now();
  ['pointerdown', 'keydown', 'wheel'].forEach((ev) => window.addEventListener(ev, () => { const parado = Date.now() - ultimoUso > 600000; ultimoUso = Date.now(); if (parado) verificar(); }, { passive: true }));
  async function verificar() {
    // pausa quando a aba está escondida ou sem uso há mais de 10 minutos (economiza leituras)
    if (rodando || document.hidden || Date.now() - ultimoUso > 600000) return;
    rodando = true;
    try {
      const r = await chamar('db?since=' + seq, null, 'GET');
      if (r.reset) {
        const cols = [...colLoaded.keys()];
        if (cols.length) await carregar(cols);
        seq = r.seq;
        cols.forEach((c) => (colL.get(c) || []).forEach((f) => f(snapCol(c))));
        [...docL.keys()].forEach(emit);
      } else if (r.paths && r.paths.length) {
        const interesse = r.paths.filter((p) => colLoaded.has(colOf(p)) || docL.has(p) || cache.has(p));
        if (interesse.length) {
          const g = await chamar('db', { op: 'getMany', paths: interesse });
          for (const p of interesse) apply(p, g.docs[p] === null ? undefined : g.docs[p]);
        }
        seq = r.seq;
      } else seq = r.seq;
    } catch (e) { /* tenta de novo no próximo ciclo */ }
    rodando = false;
  }
  function ligar() {
    if (timer) return;
    timer = setInterval(verificar, intervalo);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) verificar(); });
    window.addEventListener('focus', verificar);
  }

  /* ------------------------------ db ------------------------------ */
  function docRef(p) {
    checkPath(p, true);
    return {
      id: p.split('/').pop(), path: p,
      async get() { await fetchDoc(p); return snapDoc(p); },
      async set(data) { await chamar('db', { op: 'set', path: p, data }); apply(p, clone(data)); },
      async update(patch) { const r = await chamar('db', { op: 'update', path: p, patch }); apply(p, r.data); },
      async delete() { await chamar('db', { op: 'delete', path: p }); apply(p, undefined); },
      onSnapshot(next, onError) {
        ligar();
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
        ligar();
        if (!colL.has(c)) colL.set(c, new Set());
        colL.get(c).add(next);
        loadCol(c).then(() => next(snapCol(c))).catch((e) => onError && onError(e));
        return () => colL.get(c) && colL.get(c).delete(next);
      },
    };
  }
  const db = { doc: docRef, collection: colRef };

  /* ------------------------------ user ------------------------------ */
  function avatar(nome, cor) {
    const ini = String(nome || '?').trim().split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase().replace(/[<&>"]/g, '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="20" fill="${cor}"/><text x="20" y="25" font-family="Arial" font-size="15" font-weight="700" text-anchor="middle" fill="#fff">${ini}</text></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function cor(id) { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return `hsl(${h % 360} 45% 38%)`; }
  let meCache = null, dirCache = null;
  const perfil = (r) => ({ id: r.id, name: r.name || '', email: r.email || null, avatarUrl: avatar(r.name || r.email, cor(r.id)), color: cor(r.id), isMe: !!meCache && r.id === meCache.id, guest: false });
  async function diretorio(forcar) {
    if (!dirCache || forcar) {
      try { dirCache = (await chamar('auth', { action: 'diretorio' })).pessoas; }
      catch { dirCache = dirCache || []; }
    }
    return dirCache;
  }
  const user = {
    async me() {
      if (meCache) return meCache;
      const r = await chamar('auth', { action: 'me' });
      meCache = { id: r.id, name: r.name, email: r.email, avatarUrl: avatar(r.name, cor(r.id)), color: cor(r.id), isOwner: !!r.isOwner, canEdit: !!r.isOwner };
      return meCache;
    },
    async id() { return (await this.me()).id; },
    async isOwner() { return (await this.me()).isOwner; },
    async canEdit() { return (await this.me()).canEdit; },
    async can() { return null; },
    async name() { return (await this.me()).name; },
    async profiles(ids) {
      const lista = [...new Set([].concat(ids || []))];
      let d = await diretorio();
      if (lista.some((i) => !d.find((p) => p.id === i))) d = await diretorio(true);
      return Object.fromEntries(lista.map((i) => { const p = d.find((x) => x.id === i); return [i, p ? perfil(p) : { id: i, name: '', email: null, avatarUrl: avatar('?', '#888'), color: '#888', isMe: false, guest: false }]; }));
    },
    async search(q) {
      q = String(q || '').trim().toLowerCase();
      if (!q) return [];
      const d = await diretorio(true);
      return d.filter((p) => (p.name + ' ' + p.email).toLowerCase().includes(q)).slice(0, 8).map(perfil);
    },
  };

  /* ------------------------------ downloads ------------------------------ */
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

  /* ---------------------- contas (Administração) ---------------------- */
  const contas = {
    async criar({ nome, email }) { const r = await chamar('auth', { action: 'criarConta', nome, email }); dirCache = null; return r; },
    async redefinir(id) { return chamar('auth', { action: 'redefinirSenha', id }); },
  };

  /* ---------------------- e-mail (SMTP no servidor) ---------------------- */
  const email = { async enviar({ to, subject, text }) { return chamar('db', { op: 'email', to, subject, text }); } };

  return { db, user, downloads, contas, email };
}
