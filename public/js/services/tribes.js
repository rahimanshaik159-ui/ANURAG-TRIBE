// Tribes: discovery, membership views, join requests, settings, presence.
// Membership CHANGES go through Cloud Functions (callFn) - see functions/src/tribes.js.
import { F, db, callFn } from '../core/firebase.js';
import { page, withId, col, getOne } from './_util.js';
import { APP } from '../config/app-config.js';

export const getTribe = (id) => getOne('tribes', id);

/** Public Tribe discovery. Queries MUST keep privacy=='public' && status=='active' (matches rules). */
export async function listTribes({ category = '', skillId = '', text = '', cursor = null, size = APP.pageSize } = {}) {
  const base = [F.where('privacy', '==', 'public'), F.where('status', '==', 'active')];
  const t = text.trim().toLowerCase();
  if (t.length >= 2) {
    const q = F.query(col('tribes'), ...base, F.where('nameLower', '>=', t), F.where('nameLower', '<=', t + '\uf8ff'), F.orderBy('nameLower'), F.limit(size));
    const r = await page(q, size); r.hasMore = false; return r;
  }
  const cs = [...base];
  if (category) cs.push(F.where('category', '==', category));
  if (skillId) cs.push(F.where('skills', 'array-contains', skillId));
  cs.push(F.orderBy('lastActivityAt', 'desc'));
  if (cursor) cs.push(F.startAfter(cursor));
  cs.push(F.limit(size));
  return page(F.query(col('tribes'), ...cs), size);
}
/** Candidate Tribes for recommendations (scored client-side by lib/recommend.js). */
export async function tribeCandidates(ids, size = 40) {
  const u = [...new Set(ids)].slice(0, 10);
  const qs = [F.query(col('tribes'), F.where('privacy', '==', 'public'), F.where('status', '==', 'active'), F.orderBy('lastActivityAt', 'desc'), F.limit(20))];
  if (u.length) qs.push(F.query(col('tribes'), F.where('privacy', '==', 'public'), F.where('status', '==', 'active'), F.where('skills', 'array-contains-any', u), F.orderBy('lastActivityAt', 'desc'), F.limit(size)));
  const snaps = await Promise.all(qs.map((q) => F.getDocs(q)));
  const map = new Map(); snaps.forEach((s) => s.docs.forEach((d) => map.set(d.id, withId(d))));
  return [...map.values()];
}

export async function myMemberships(uid) {
  const s = await F.getDocs(F.query(F.collectionGroup(db, 'members'), F.where('uid', '==', uid), F.where('status', '==', 'active')));
  const mems = s.docs.map((d) => ({ tribeId: d.ref.parent.parent.id, ...d.data() }));
  const tribes = await Promise.all(mems.map(async (m) => { try { const t = await getTribe(m.tribeId); return t ? { ...t, myRole: m.role, lastReadAt: m.lastReadAt } : null; } catch (_) { return null; } }));
  return tribes.filter((t) => t && t.status !== 'archived');
}
export async function myMembership(tribeId, uid) {
  const m = await getOne('tribes', tribeId, 'members', uid).catch(() => null);
  return m && m.status === 'active' ? m : null;
}
export async function listMembers(tribeId) {
  const s = await F.getDocs(F.query(col('tribes', tribeId, 'members'), F.where('status', '==', 'active')));
  return s.docs.map(withId);
}
export async function myJoinRequests(uid) {
  const s = await F.getDocs(F.query(F.collectionGroup(db, 'joinRequests'), F.where('uid', '==', uid)));
  return s.docs.map((d) => ({ tribeId: d.ref.parent.parent.id, ...d.data() }));
}
export async function myJoinRequest(tribeId, uid) { return getOne('tribes', tribeId, 'joinRequests', uid).catch(() => null); }
export async function requestToJoin(tribeId, uid, message = '') {
  const ref = F.doc(db, 'tribes', tribeId, 'joinRequests', uid);
  const now = F.serverTimestamp();
  const ex = await F.getDoc(ref);
  if (ex.exists()) return F.updateDoc(ref, { status: 'pending', message, updatedAt: now });
  return F.setDoc(ref, { requestId: uid, uid, message, status: 'pending', createdAt: now, updatedAt: now });
}
export const cancelJoinRequest = (tribeId, uid) => F.updateDoc(F.doc(db, 'tribes', tribeId, 'joinRequests', uid), { status: 'cancelled', message: '', updatedAt: F.serverTimestamp() });
export async function pendingJoinRequests(tribeId) {
  const s = await F.getDocs(F.query(col('tribes', tribeId, 'joinRequests'), F.where('status', '==', 'pending')));
  return s.docs.map(withId);
}
export async function myInvites(uid) {
  const s = await F.getDocs(F.query(col('tribeInvites'), F.where('inviteeUid', '==', uid), F.where('status', '==', 'pending')));
  return s.docs.map(withId);
}
export const updateTribe = (tribeId, fields) => F.updateDoc(F.doc(db, 'tribes', tribeId), { ...fields, nameLower: fields.name.toLowerCase(), updatedAt: F.serverTimestamp() });
export const markRead = (tribeId, uid) => F.updateDoc(F.doc(db, 'tribes', tribeId, 'members', uid), { lastReadAt: F.serverTimestamp() }).catch(() => {});

// Cloud Function wrappers (atomic, server-checked membership transitions)
export const createTribe = (data) => callFn('createTribe', data);
export const respondToJoinRequest = (tribeId, uid, accept) => callFn('respondToJoinRequest', { tribeId, uid, accept });
export const inviteToTribe = (tribeId, inviteeUid, message = '') => callFn('inviteToTribe', { tribeId, inviteeUid, message });
export const respondToInvite = (inviteId, accept) => callFn('respondToInvite', { inviteId, accept });
export const removeMember = (tribeId, uid) => callFn('removeTribeMember', { tribeId, uid });
export const leaveTribe = (tribeId) => callFn('leaveTribe', { tribeId });
export const setMemberRole = (tribeId, uid, role) => callFn('setTribeMemberRole', { tribeId, uid, role });
export const archiveTribe = (tribeId) => callFn('archiveTribe', { tribeId });

// Presence heartbeat (online indicator). One tiny doc write per minute while chat is open.
export function startPresence(tribeId, uid) {
  const ref = F.doc(db, 'tribes', tribeId, 'presence', uid);
  const beat = () => { if (!document.hidden) F.setDoc(ref, { uid, lastSeen: F.serverTimestamp() }).catch(() => {}); };
  beat(); const t = setInterval(beat, APP.presenceIntervalMs);
  document.addEventListener('visibilitychange', beat);
  return () => { clearInterval(t); document.removeEventListener('visibilitychange', beat); F.deleteDoc(ref).catch(() => {}); };
}
export function watchPresence(tribeId, cb) {
  return F.onSnapshot(col('tribes', tribeId, 'presence'), (s) => {
    const cutoff = Date.now() - APP.presenceOnlineWindowMs;
    cb(new Set(s.docs.filter((d) => d.data().lastSeen && d.data().lastSeen.toMillis() > cutoff).map((d) => d.id)));
  }, () => cb(new Set()));
}
