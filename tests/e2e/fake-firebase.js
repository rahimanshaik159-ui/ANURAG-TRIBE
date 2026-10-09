// TEST-ONLY in-memory stand-in for the Firebase SDK (NOT part of the product).
// Lets Playwright render pages and exercise UI flows without network access. It does NOT validate security rules.
(function () {
  const store = new Map(); const listeners = new Set(); let idc = 1;
  class Ts { constructor(ms) { this.ms = ms; } toMillis() { return this.ms; } toDate() { return new Date(this.ms); } }
  const Timestamp = { now: () => new Ts(Date.now()), fromMillis: (m) => new Ts(m), fromDate: (d) => new Ts(d.getTime()) };
  const SERVER = { __server: true };
  const clone = (o) => { if (o instanceof Ts) return new Ts(o.ms); if (Array.isArray(o)) return o.map(clone); if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, clone(v)])); return o; };
  const seg = (a) => a.flatMap((x) => String(x).split('/')).filter(Boolean);
  const mkDoc = (p) => { const parts = p.split('/'); const colPath = parts.slice(0, -1).join('/');
    // mirrors real Firestore: docRef.parent (CollectionReference) .parent (parent DocumentReference | null)
    return { path: p, id: parts.pop(), __doc: true, parent: { path: colPath, id: colPath.split('/').pop(), get parent() { const pp = colPath.split('/').slice(0, -1).join('/'); return pp ? mkDoc(pp) : null; } } }; };
  const mkCol = (p) => ({ path: p, __col: true });
  const get = (o, f) => f.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
  const val = (v) => (v instanceof Ts ? v.ms : v);
  function apply(old, patch, merge) {
    const out = merge ? clone(old || {}) : {};
    for (const [k, v] of Object.entries(patch)) {
      if (v && v.__server) out[k] = Timestamp.now();
      else if (v && v.__inc !== undefined) out[k] = (out[k] || 0) + v.__inc;
      else if (v && v.__union) out[k] = [...new Set([...(out[k] || []), ...v.__union])];
      else if (v && v.__remove) out[k] = (out[k] || []).filter((x) => !v.__remove.includes(x));
      else out[k] = clone(v);
    }
    return out;
  }
  function docsIn(q) {
    const prefix = q.__group ? null : q.path + '/';
    return [...store.entries()].filter(([p]) => { const s = p.split('/'); return q.__group ? s.length % 2 === 0 && s[s.length - 2] === q.path : p.startsWith(prefix) && s.length === prefix.split('/').length; }).map(([p, d]) => ({ p, d }));
  }
  const snapOf = (p, d) => ({ id: p.split('/').pop(), ref: mkDoc(p), exists: () => d !== undefined, data: () => (d === undefined ? undefined : clone(d)), metadata: { hasPendingWrites: false } });
  function run(qq) {
    const base = qq.__q ? qq.src : qq; const cons = qq.__q ? qq.cons : [];
    let rows = docsIn(base);
    for (const c of cons.filter((c) => c.t === 'where')) rows = rows.filter(({ d }) => {
      const a = val(get(d, c.f)); const b = val(c.v);
      switch (c.op) { case '==': return a === b || (b === null && a == null); case '!=': return a !== b; case '<': return a < b; case '<=': return a <= b; case '>': return a > b; case '>=': return a >= b;
        case 'in': return c.v.includes(get(d, c.f)); case 'array-contains': return (get(d, c.f) || []).includes(c.v); case 'array-contains-any': return (get(d, c.f) || []).some((x) => c.v.includes(x)); default: return true; } });
    const ob = cons.filter((c) => c.t === 'orderBy');
    rows.sort((x, y) => { for (const o of ob) { const a = val(get(x.d, o.f)); const b = val(get(y.d, o.f)); if (a === b) continue; const r = a > b ? 1 : -1; return o.dir === 'desc' ? -r : r; } return x.p.localeCompare(y.p); });
    const sa = cons.find((c) => c.t === 'startAfter'); if (sa) { const i = rows.findIndex((r) => r.p === sa.snap.ref.path); if (i >= 0) rows = rows.slice(i + 1); }
    const lim = cons.find((c) => c.t === 'limit'); if (lim) rows = rows.slice(0, lim.n);
    const docs = rows.map(({ p, d }) => snapOf(p, d));
    return { docs, size: docs.length, empty: !docs.length, docChanges: () => docs.map((doc) => ({ type: 'added', doc })) };
  }
  const notify = () => listeners.forEach((f) => f());
  const FB = {
    getDoc: async (ref) => snapOf(ref.path, store.get(ref.path)), getDocs: async (q) => run(q),
    setDoc: async (ref, data, o) => { store.set(ref.path, apply(store.get(ref.path), data, o && o.merge)); notify(); },
    updateDoc: async (ref, data) => { if (!store.has(ref.path)) throw Object.assign(new Error('not found'), { code: 'not-found' }); store.set(ref.path, apply(store.get(ref.path), data, true)); notify(); },
    deleteDoc: async (ref) => { store.delete(ref.path); notify(); },
    addDoc: async (col, data) => { const p = `${col.path}/auto${idc++}`; store.set(p, apply(undefined, data, false)); notify(); return mkDoc(p); },
    onSnapshot: (target, ...rest) => { const next = rest.find((x) => typeof x === 'function'); const seen = new Set();
      const emit = () => { if (target.__doc) return next(snapOf(target.path, store.get(target.path)));
        const res = run(target); const fresh = res.docs.filter((d) => !seen.has(d.ref.path)); seen.clear(); res.docs.forEach((d) => seen.add(d.ref.path));
        res.docChanges = () => fresh.map((doc) => ({ type: 'added', doc })); next(res); };
      setTimeout(emit, 0); listeners.add(emit); return () => listeners.delete(emit); },
    writeBatch: () => { const ops = []; return { set: (r, d, o) => ops.push(() => store.set(r.path, apply(store.get(r.path), d, o && o.merge))), update: (r, d) => ops.push(() => store.set(r.path, apply(store.get(r.path), d, true))), delete: (r) => ops.push(() => store.delete(r.path)), commit: async () => { ops.forEach((f) => f()); notify(); } }; },
    runTransaction: async (_db, fn) => fn({ get: async (r) => snapOf(r.path, store.get(r.path)), set: (r, d) => store.set(r.path, apply(undefined, d)), update: (r, d) => store.set(r.path, apply(store.get(r.path), d, true)) }),
    getCountFromServer: async (q) => ({ data: () => ({ count: run(q).size }) }),
  };
  const seedUsers = {};
  window.__FB = {
    store, seed(obj) { for (const [p, d] of Object.entries(obj)) store.set(p, apply(undefined, JSON.parse(JSON.stringify(d), (k, v) => (v && v.__ms ? new Ts(v.__ms) : v)), false)); },
    auth: { uid: 'u1', role: 'user', mode: 'user' }, fn: {},
  };
  window.__FB.mods = {
    app: { initializeApp: () => ({}) },
    auth: {
      getAuth: () => ({ get currentUser() { return window.__FB.user(); } }), setPersistence: async () => {}, browserLocalPersistence: {},
      onAuthStateChanged: (_a, cb) => { setTimeout(() => cb(window.__FB.user()), 5); return () => {}; },
      signOut: async () => { window.__FB.auth.mode = 'none'; }, signInWithEmailAndPassword: async () => ({ user: window.__FB.user() }), createUserWithEmailAndPassword: async () => { throw new Error('stub'); },
      sendEmailVerification: async () => {}, sendPasswordResetEmail: async () => {}, updateProfile: async () => {},
    },
    fs: {
      getFirestore: () => ({}), collection: (_d, ...p) => mkCol(seg(p).join('/')), collectionGroup: (_d, id) => ({ path: id, __col: true, __group: true }), doc: (_d, ...p) => mkDoc(seg(p).join('/')),
      query: (src, ...cons) => ({ __q: true, src, cons }), where: (f, op, v) => ({ t: 'where', f, op, v }), orderBy: (f, dir = 'asc') => ({ t: 'orderBy', f, dir }), limit: (n) => ({ t: 'limit', n }), startAfter: (snap) => ({ t: 'startAfter', snap }),
      serverTimestamp: () => SERVER, increment: (n) => ({ __inc: n }), arrayUnion: (...v) => ({ __union: v }), arrayRemove: (...v) => ({ __remove: v }), Timestamp, ...FB,
    },
    fns: {
      getFunctions: () => ({}), httpsCallable: (_f, name) => async (data) => { const h = window.__FB.fn[name]; if (h) return { data: await h(data) };
        if (name === 'syncMyClaims') return { data: { role: window.__FB.auth.role, needsTokenRefresh: false } }; if (name === 'getIceServers') return { data: { iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }], turn: false, ttl: 3600 } };
        throw Object.assign(new Error(`stub: ${name} not implemented`), { code: 'functions/unimplemented' }); },
    },
    check: { initializeAppCheck: () => ({}), ReCaptchaV3Provider: function () {} },
  };
  window.__FB.user = () => (window.__FB.auth.mode === 'none' ? null : { uid: window.__FB.auth.uid, email: 'me@example.com', emailVerified: true, displayName: 'Me',
    getIdTokenResult: async () => ({ claims: { role: window.__FB.auth.role } }), getIdToken: async () => 't', reload: async () => {} });
})();
