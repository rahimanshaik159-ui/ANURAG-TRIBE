// Tribe chat: TEXT + LINKS only. Never uploads media (no Storage, no binaries in Firestore).
// Sharing an actual file? Use the direct WebRTC transfer (transfer.html).
import { F, db } from '../core/firebase.js';
import { col, withId } from './_util.js';
import { APP } from '../config/app-config.js';
import { cleanText, extractFirstUrl, classifyLink } from '../lib/validators.js';

const q = (tribeId, n, after) => F.query(col('tribes', tribeId, 'messages'), F.orderBy('createdAt', 'desc'), ...(after ? [F.startAfter(after)] : []), F.limit(n));

/** Live latest messages (oldest->newest). `onError` fires on rules/permission problems. */
export function watchMessages(tribeId, cb, onError, n = APP.chatPageSize) {
  return F.onSnapshot(q(tribeId, n), { includeMetadataChanges: true }, (snap) => {
    cb(snap.docs.map((d) => ({ ...withId(d), pending: d.metadata.hasPendingWrites, _doc: d })).reverse(), snap.docs.length >= n);
  }, onError);
}
export async function loadOlder(tribeId, oldestDoc, n = APP.chatPageSize) {
  const s = await F.getDocs(q(tribeId, n, oldestDoc));
  return { items: s.docs.map((d) => ({ ...withId(d), _doc: d })).reverse(), hasMore: s.docs.length >= n };
}

export function buildMessage(uid, rawText, replyTo) {
  const text = cleanText(rawText, 2000, { multiline: true });
  if (!text) return null;
  const msg = { senderUid: uid, text, type: 'text', createdAt: F.serverTimestamp() };
  const url = extractFirstUrl(text);
  if (url) { const c = classifyLink(url); Object.assign(msg, { type: 'link', linkUrl: url, linkHost: c.host.slice(0, 100), linkProvider: c.provider }); }
  if (replyTo) msg.replyTo = { id: replyTo.id, senderUid: replyTo.senderUid, snippet: cleanText(replyTo.text, 140) };
  return msg;
}
export async function sendMessage(tribeId, uid, rawText, replyTo) {
  const msg = buildMessage(uid, rawText, replyTo);
  if (!msg) return null;
  return F.addDoc(col('tribes', tribeId, 'messages'), msg);
}
export const editMessage = (tribeId, id, rawText) =>
  F.updateDoc(F.doc(db, 'tribes', tribeId, 'messages', id), { text: cleanText(rawText, 2000, { multiline: true }), editedAt: F.serverTimestamp() });
export const deleteOwnMessage = (tribeId, id) => F.updateDoc(F.doc(db, 'tribes', tribeId, 'messages', id), { text: '', deleted: true });
export const hideMessageAsLeader = (tribeId, id, uid) => F.updateDoc(F.doc(db, 'tribes', tribeId, 'messages', id), { text: '', deleted: true, deletedBy: uid });

/** Report a message. The snapshot is verified by rules against the real message text. */
export function reportMessage(tribeId, message, uid, reason, details = '') {
  return F.addDoc(col('reports'), {
    reporterUid: uid, targetType: 'tribeMessage', targetId: message.id, tribeId,
    snapshot: { text: message.text, senderUid: message.senderUid }, reason, details: cleanText(details, 500), status: 'open', createdAt: F.serverTimestamp(),
  });
}
