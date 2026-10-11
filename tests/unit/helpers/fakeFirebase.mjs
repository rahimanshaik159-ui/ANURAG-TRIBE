// Minimal in-memory Firestore used ONLY by unit tests of the service layer.
// It records writes; it does NOT evaluate security rules (those need the emulator: npm run test:rules).
export const SERVER_TS = { __serverTimestamp: true };
export const store = new Map();          // path -> data
export const log = [];                   // [{op, path, data}] in commit order
let autoId = 0;
export const reset = () => { store.clear(); log.length = 0; autoId = 0; };
export const seed = (path, data) => store.set(path, data);
const snap = (path) => ({ id: path.split('/').pop(), ref: { path }, exists: () => store.has(path), data: () => (store.has(path) ? JSON.parse(JSON.stringify(store.get(path))) : undefined) });
const apply = (old, patch, merge) => ({ ...(merge ? old || {} : {}), ...patch });
const ref = (path) => ({ path, id: path.split('/').pop() });

export const auth = { currentUser: { uid: 'me', emailVerified: true } };
export const db = {};
export const F = {
  doc: (a, ...segs) => (a && a.path !== undefined && !segs.length ? ref(`${a.path}/auto${++autoId}`) : ref(segs.join('/'))),
  collection: (_db, ...segs) => ({ path: segs.join('/') }),
  serverTimestamp: () => SERVER_TS,
  getDoc: async (r) => snap(r.path),
  updateDoc: async (r, d) => { if (!store.has(r.path)) throw new Error('no doc ' + r.path); log.push({ op: 'update', path: r.path, data: d }); store.set(r.path, apply(store.get(r.path), d, true)); },
  runTransaction: async (_db, fn) => {
    const writes = [];
    const tx = { get: async (r) => snap(r.path), set: (r, d) => writes.push({ op: 'set', path: r.path, data: d }), update: (r, d) => { writes.push({ op: 'update', path: r.path, data: d }); } };
    await fn(tx);
    for (const w of writes) { if (w.op === 'update' && !store.has(w.path)) throw new Error('update of missing doc ' + w.path); store.set(w.path, apply(store.get(w.path), w.data, w.op === 'update')); log.push(w); }
  },
  writeBatch: () => { const w = []; return { set: (r, d) => w.push({ op: 'set', path: r.path, data: d }), commit: async () => { for (const x of w) { store.set(x.path, apply(undefined, x.data)); log.push(x); } } }; },
};
