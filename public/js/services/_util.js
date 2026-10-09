// Shared Firestore helpers.
import { F, db } from '../core/firebase.js';

export const withId = (d) => ({ id: d.id, ...d.data() });
/** Run a query and return {items, cursor, hasMore} for "Load more" pagination. */
export async function page(q, size) {
  const snap = await F.getDocs(q);
  const items = snap.docs.map(withId);
  return { items, cursor: snap.docs[snap.docs.length - 1] || null, hasMore: snap.docs.length >= size };
}
export const col = (...p) => F.collection(db, ...p);
export const docRef = (...p) => F.doc(db, ...p);
export async function getOne(...path) {
  const s = await F.getDoc(F.doc(db, ...path));
  return s.exists() ? withId(s) : null;
}
export const now = () => F.serverTimestamp();
