// Posts/ideas, showcase, events, resources, announcements, reports, notifications.
import { F, db } from '../core/firebase.js';
import { page, withId, col, getOne } from './_util.js';
import { APP } from '../config/app-config.js';
import { cleanText, normalizeUrl } from '../lib/validators.js';

// ---------------------------------------------------------------- posts / ideas
export async function listPosts({ category = '', cursor = null, size = APP.pageSize } = {}) {
  const cs = [F.where('status', '==', 'visible')];
  if (category) cs.push(F.where('category', '==', category));
  cs.push(F.orderBy('createdAt', 'desc')); if (cursor) cs.push(F.startAfter(cursor)); cs.push(F.limit(size));
  return page(F.query(col('posts'), ...cs), size);
}
export async function createPost(uid, { category, text, linkUrl }) {
  const url = linkUrl ? normalizeUrl(linkUrl) : '';
  if (linkUrl && !url) throw new Error('Enter a valid link or leave it empty.');
  const d = { authorUid: uid, category, text: cleanText(text, 1500, { multiline: true }), status: 'visible', likeCount: 0, commentCount: 0, createdAt: F.serverTimestamp() };
  if (url) d.linkUrl = url;
  return F.addDoc(col('posts'), d);
}
export const deletePost = (id) => F.deleteDoc(F.doc(db, 'posts', id));
export const hidePost = (id) => F.updateDoc(F.doc(db, 'posts', id), { status: 'hidden' });
export const unhidePost = (id) => F.updateDoc(F.doc(db, 'posts', id), { status: 'visible' });
export async function isSaved(uid, postId) { return (await F.getDoc(F.doc(db, 'users', uid, 'saved', postId))).exists(); }
export async function toggleSave(uid, postId, saved) {
  const ref = F.doc(db, 'users', uid, 'saved', postId);
  if (saved) await F.deleteDoc(ref); else await F.setDoc(ref, { postId, createdAt: F.serverTimestamp() });
  return !saved;
}
export async function savedPostIds(uid) { const s = await F.getDocs(F.query(col('users', uid, 'saved'), F.limit(100))); return s.docs.map((d) => d.id); }

// ---------------------------------------------------------------- showcase
export async function listShowcase({ category = '', cursor = null, size = APP.pageSize } = {}) {
  const cs = [F.where('status', '==', 'approved')];
  if (category) cs.push(F.where('category', '==', category));
  cs.push(F.orderBy('createdAt', 'desc')); if (cursor) cs.push(F.startAfter(cursor)); cs.push(F.limit(size));
  return page(F.query(col('showcase'), ...cs), size);
}
export async function myShowcase(uid) {
  const s = await F.getDocs(F.query(col('showcase'), F.where('authorUid', '==', uid), F.orderBy('createdAt', 'desc'), F.limit(30)));
  return s.docs.map(withId);
}
/** featureConsent = the student explicitly agrees to be considered for ANURAG TRIBE social promotion
 *  (manual admin review only; nothing is ever auto-posted). */
export async function submitShowcase(uid, { title, description, category, links, tribeId = null, projectId = null, featureConsent = false }) {
  const now = F.serverTimestamp();
  const ls = (links || []).map((l) => ({ label: cleanText(l.label || '', 40), url: normalizeUrl(l.url) })).filter((l) => l.url).slice(0, 6);
  if (!ls.length) throw new Error('Add at least one link to your work (YouTube, GitHub, Behance, website...).');
  return F.addDoc(col('showcase'), {
    authorUid: uid, title: cleanText(title, 100), description: cleanText(description, 1000, { multiline: true }), category, links: ls,
    tribeId, projectId, status: 'pending', featureConsent: !!featureConsent, consentAt: featureConsent ? now : null, adminNote: '', createdAt: now, updatedAt: now,
  });
}
export const deleteShowcase = (id) => F.deleteDoc(F.doc(db, 'showcase', id));

// ---------------------------------------------------------------- events
export async function listEvents({ upcoming = true, size = 30 } = {}) {
  const t = F.Timestamp.now();
  const q = upcoming
    ? F.query(col('events'), F.where('startAt', '>=', t), F.orderBy('startAt', 'asc'), F.limit(size))
    : F.query(col('events'), F.where('startAt', '<', t), F.orderBy('startAt', 'desc'), F.limit(size));
  return (await F.getDocs(q)).docs.map(withId);
}
export const isRegistered = async (eventId, uid) => (await F.getDoc(F.doc(db, 'events', eventId, 'registrations', uid))).exists();
export const registerForEvent = (eventId, uid) => F.setDoc(F.doc(db, 'events', eventId, 'registrations', uid), { uid, createdAt: F.serverTimestamp() });
export const unregisterEvent = (eventId, uid) => F.deleteDoc(F.doc(db, 'events', eventId, 'registrations', uid));

// ---------------------------------------------------------------- resources / announcements
export async function listResources({ area = '', size = 60 } = {}) {
  const cs = []; if (area) cs.push(F.where('area', '==', area));
  const s = await F.getDocs(F.query(col('resources'), ...cs, F.orderBy('createdAt', 'desc'), F.limit(size)));
  return s.docs.map(withId);
}
export async function listAnnouncements(size = 5) {
  return (await F.getDocs(F.query(col('announcements'), F.orderBy('createdAt', 'desc'), F.limit(size)))).docs.map(withId);
}

// ---------------------------------------------------------------- reports
export async function reportContent(uid, { targetType, targetId, reason, details = '' }) {
  return F.addDoc(col('reports'), { reporterUid: uid, targetType, targetId, tribeId: null, reason, details: cleanText(details, 500), status: 'open', createdAt: F.serverTimestamp() });
}

// ---------------------------------------------------------------- notifications
export async function listNotifications(uid, size = 40) {
  return (await F.getDocs(F.query(col('notifications'), F.where('uid', '==', uid), F.orderBy('createdAt', 'desc'), F.limit(size)))).docs.map(withId);
}
export function watchUnread(uid, cb) {
  return F.onSnapshot(F.query(col('notifications'), F.where('uid', '==', uid), F.where('read', '==', false), F.limit(20)), (s) => cb(s.size), () => cb(0));
}
export const markNotificationRead = (id) => F.updateDoc(F.doc(db, 'notifications', id), { read: true });
export async function markAllRead(uid) {
  const s = await F.getDocs(F.query(col('notifications'), F.where('uid', '==', uid), F.where('read', '==', false), F.limit(50)));
  const b = F.writeBatch(db); s.docs.forEach((d) => b.update(d.ref, { read: true })); await b.commit(); return s.size;
}
export const deleteNotification = (id) => F.deleteDoc(F.doc(db, 'notifications', id));
export { getOne };
