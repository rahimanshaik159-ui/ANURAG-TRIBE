// Direct file transfer: SESSION METADATA ONLY (who, which file names/sizes, status).
// File bytes never touch Firestore or any storage service; see transferSender/Receiver.
import { F, db } from '../core/firebase.js';
import { col, withId, getOne } from '../services/_util.js';
import { validateFileSelection, SESSION_TTL_MS, TERMINAL } from '../lib/transferRules.js';
import { Signaling } from './signaling.js';

export const getSession = (id) => getOne('transferSessions', id);
export const signalingColl = (id) => col('transferSessions', id, 'signaling');
export const makeSignaling = (id, uid, attempt) => new Signaling(signalingColl(id), uid, { attempt });

/** Sender creates a PENDING session. Files stay in the sender's browser. */
export async function createSession({ senderUid, recipientUid, contextType, contextId, files }) {
  const v = validateFileSelection(files);
  if (!v.ok) throw new Error(v.errors[0]);
  const now = F.serverTimestamp();
  const ref = await F.addDoc(col('transferSessions'), {
    senderUid, recipientUid, contextType, contextId,
    files: Array.from(files).map((f) => ({ name: f.name.slice(0, 200), size: f.size, type: (f.type || '').slice(0, 100) })),
    totalBytes: v.total, status: 'pending', attempt: 1, createdAt: now, updatedAt: now,
    expiresAt: F.Timestamp.fromMillis(Date.now() + SESSION_TTL_MS),
  });
  return ref.id;
}
export function watchSession(id, cb, onError) {
  return F.onSnapshot(F.doc(db, 'transferSessions', id), (s) => cb(s.exists() ? withId(s) : null), onError);
}
export async function listMySessions(uid) {
  const [a, b] = await Promise.all([
    F.getDocs(F.query(col('transferSessions'), F.where('senderUid', '==', uid), F.orderBy('createdAt', 'desc'), F.limit(25))),
    F.getDocs(F.query(col('transferSessions'), F.where('recipientUid', '==', uid), F.orderBy('createdAt', 'desc'), F.limit(25))),
  ]);
  const m = new Map(); [...a.docs, ...b.docs].forEach((d) => m.set(d.id, withId(d)));
  return [...m.values()].sort((x, y) => (y.createdAt?.toMillis?.() || 0) - (x.createdAt?.toMillis?.() || 0));
}
const upd = (id, f) => F.updateDoc(F.doc(db, 'transferSessions', id), { ...f, updatedAt: F.serverTimestamp() });
export const acceptSession = (id) => upd(id, { status: 'accepted', respondedAt: F.serverTimestamp() });
export const rejectSession = (id) => upd(id, { status: 'rejected', respondedAt: F.serverTimestamp() });
export const setStatus = (id, status, failureReason = '') => upd(id, failureReason ? { status, failureReason: failureReason.slice(0, 200) } : (status === 'completed' ? { status, completedAt: F.serverTimestamp() } : { status }));
export const cancelSession = (id) => upd(id, { status: 'cancelled' });
/** Sender retries after a failed connection: new attempt number, back to 'accepted'. */
export const retrySession = (id, attempt) => upd(id, { status: 'accepted', attempt, failureReason: '' });
export const deleteSession = (id) => F.deleteDoc(F.doc(db, 'transferSessions', id));
export const isTerminal = (s) => TERMINAL.includes(s.status);
