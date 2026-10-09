// "I NEED SOMEONE": help requests between students (+ optional open board).
// Status: open -> accepted | declined -> completed | cancelled.
import { F, db } from '../core/firebase.js';
import { withId, col, getOne } from './_util.js';
import { cleanText } from '../lib/validators.js';

export const getRequest = (id) => getOne('helpRequests', id);

/** Create a request. targetUid = a specific student; null = post to the open board. */
export async function createRequest(uid, { title, description, skillsNeeded = [], targetUid = null, tribeId = null }) {
  const now = F.serverTimestamp();
  const ref = await F.addDoc(col('helpRequests'), {
    requesterUid: uid, targetUid: targetUid || null, helperUid: null,
    title: cleanText(title, 100), description: cleanText(description, 800, { multiline: true }),
    skillsNeeded: skillsNeeded.slice(0, 8), tribeId: tribeId || null,
    isOpen: !targetUid, participants: targetUid ? [uid, targetUid] : [uid], status: 'open', createdAt: now, updatedAt: now,
  });
  return ref.id;
}
export async function myRequests(uid) {
  const s = await F.getDocs(F.query(col('helpRequests'), F.where('participants', 'array-contains', uid), F.orderBy('updatedAt', 'desc'), F.limit(50)));
  return s.docs.map(withId);
}
export async function openBoard(skillIds = [], size = 30) {
  const ids = skillIds.slice(0, 10);
  const cs = [F.where('isOpen', '==', true)];
  if (ids.length) cs.push(F.where('skillsNeeded', 'array-contains-any', ids));
  const s = await F.getDocs(F.query(col('helpRequests'), ...cs, F.orderBy('createdAt', 'desc'), F.limit(size)));
  return s.docs.map(withId);
}
const set = (id, f) => F.updateDoc(F.doc(db, 'helpRequests', id), { ...f, updatedAt: F.serverTimestamp() });
export const acceptRequest = (id) => set(id, { status: 'accepted' });
export const declineRequest = (id) => set(id, { status: 'declined' });
export const cancelRequest = (id) => set(id, { status: 'cancelled', isOpen: false });
export const completeRequest = (id) => set(id, { status: 'completed', isOpen: false });
/** Volunteer on an open-board request. */
export const volunteer = (req, uid) => set(req.id, { status: 'accepted', isOpen: false, helperUid: uid, participants: [req.requesterUid, uid] });

export function watchMessages(id, cb, onError) {
  return F.onSnapshot(F.query(col('helpRequests', id, 'messages'), F.orderBy('createdAt', 'asc'), F.limit(200)), (s) => cb(s.docs.map(withId)), onError);
}
export const sendMessage = (id, uid, text) => F.addDoc(col('helpRequests', id, 'messages'), { senderUid: uid, text: cleanText(text, 1500, { multiline: true }), createdAt: F.serverTimestamp() });
