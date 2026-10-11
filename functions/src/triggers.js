'use strict';
/** Firestore triggers: create notifications (clients cannot), keep counters, tidy signaling. */
const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const C = require('./core');
const { maybeEmail } = require('./email');
const { db, FieldValue } = C;
const opts = { region: C.REGION };
const withEmail = { region: C.REGION, secrets: [C.RESEND_API_KEY] };

const userName = async (uid) => { const s = await db.doc(`users/${uid}`).get(); return s.exists ? s.data().name : 'A student'; };

async function deleteCollection(path, batchSize = 300) {
  for (;;) {
    const snap = await db.collection(path).limit(batchSize).get();
    if (snap.empty) return;
    const b = db.batch(); snap.docs.forEach((d) => b.delete(d.ref)); await b.commit();
  }
}
async function tribeMemberUids(tribeId, { leadersOnly = false, exclude = [] } = {}) {
  let q = db.collection(`tribes/${tribeId}/members`).where('status', '==', 'active');
  const s = await q.get();
  return s.docs.map((d) => d.data()).filter((m) => (!leadersOnly || ['owner', 'moderator'].includes(m.role)) && !exclude.includes(m.uid)).map((m) => m.uid).slice(0, 60);
}
async function fanOut(uids, type, title, body, link, meta) {
  for (let i = 0; i < uids.length; i += 400) {
    const b = db.batch();
    uids.slice(i, i + 400).forEach((u) => b.set(C.notifRef(), C.notifData(u, type, title, body, link, meta)));
    await b.commit();
  }
}

// ---- notification -> email ------------------------------------------------
exports.onNotificationCreated = onDocumentCreated({ ...withEmail, document: 'notifications/{id}' }, async (e) => {
  await maybeEmail(e.params.id, e.data.data());
});

// ---- help requests --------------------------------------------------------
exports.onHelpRequestCreated = onDocumentCreated({ ...opts, document: 'helpRequests/{id}' }, async (e) => {
  const d = e.data.data();
  if (!d.targetUid) return; // open-board requests have no single recipient
  await C.notify(d.targetUid, 'help_request', `${await userName(d.requesterUid)} needs your help`, C.clip(d.title, 120), `help-requests.html?id=${e.params.id}`);
});
exports.onHelpRequestUpdated = onDocumentUpdated({ ...opts, document: 'helpRequests/{id}' }, async (e) => {
  const a = e.data.before.data(); const b = e.data.after.data();
  if (a.status === b.status) return;
  const link = `help-requests.html?id=${e.params.id}`;
  if (['accepted', 'declined'].includes(b.status)) {
    const helper = b.helperUid || b.targetUid;
    await C.notify(b.requesterUid, 'help_update', `${await userName(helper)} ${b.status} your request`, C.clip(b.title, 120), link);
  } else if (['completed', 'cancelled'].includes(b.status)) {
    const other = b.participants.find((u) => u !== b.requesterUid);
    if (other) await C.notify(other, 'help_update', `Request ${b.status}`, C.clip(b.title, 120), link);
  }
});
exports.onHelpMessage = onDocumentCreated({ ...opts, document: 'helpRequests/{id}/messages/{mid}' }, async (e) => {
  const m = e.data.data();
  const r = await db.doc(`helpRequests/${e.params.id}`).get();
  if (!r.exists) return;
  const other = r.data().participants.find((u) => u !== m.senderUid);
  if (other) await C.notify(other, 'help_message', `New message from ${await userName(m.senderUid)}`, C.clip(m.text, 100), `help-requests.html?id=${e.params.id}`);
});

// ---- direct file transfer (metadata notifications + signaling cleanup) -----
exports.onTransferCreated = onDocumentCreated({ ...opts, document: 'transferSessions/{id}' }, async (e) => {
  const d = e.data.data();
  const n = d.files.length;
  await C.notify(d.recipientUid, 'transfer_request', `${await userName(d.senderUid)} wants to send you ${n} file${n > 1 ? 's' : ''}`,
    'Accept to start a direct browser-to-browser transfer. Both of you need to stay online.', `transfer.html?id=${e.params.id}`);
});
exports.onTransferUpdated = onDocumentUpdated({ ...opts, document: 'transferSessions/{id}' }, async (e) => {
  const a = e.data.before.data(); const b = e.data.after.data();
  if (a.status === b.status) return;
  const link = `transfer.html?id=${e.params.id}`;
  if (b.status === 'accepted' && a.status === 'pending') await C.notify(b.senderUid, 'transfer_update', 'Transfer accepted', 'Open the transfer page to start sending.', link);
  if (b.status === 'rejected') await C.notify(b.senderUid, 'transfer_update', 'Transfer declined', 'The recipient declined the files.', link);
  if (['completed', 'rejected', 'cancelled', 'failed', 'expired'].includes(b.status)) await deleteCollection(`transferSessions/${e.params.id}/signaling`);
});

// ---- Tribes -----------------------------------------------------------------
exports.onJoinRequestWritten = onDocumentWritten({ ...opts, document: 'tribes/{tid}/joinRequests/{uid}' }, async (e) => {
  const after = e.data.after.exists ? e.data.after.data() : null;
  const before = e.data.before.exists ? e.data.before.data() : null;
  if (!after) return;
  const t = await db.doc(`tribes/${e.params.tid}`).get();
  if (!t.exists) return;
  // Leader decided on a pending request -> tell the student (this used to be sent by respondToJoinRequest).
  if (before && before.status === 'pending' && ['accepted', 'rejected'].includes(after.status)) {
    const accepted = after.status === 'accepted';
    await C.notify(e.params.uid, 'tribe_join_decision', accepted ? `You joined ${t.data().name}` : `Request to join ${t.data().name} was declined`,
      accepted ? 'Welcome! Say hello in the Tribe chat.' : 'You can look for other Tribes that match your skills.', accepted ? `tribe.html?id=${e.params.tid}` : 'tribes.html');
    return;
  }
  // New (or re-opened) pending request -> tell the leaders.
  if (after.status !== 'pending' || (before && before.status === 'pending')) return;
  const leaders = await tribeMemberUids(e.params.tid, { leadersOnly: true });
  await fanOut(leaders, 'tribe_join_request', `${await userName(e.params.uid)} wants to join ${t.data().name}`, C.clip(after.message, 120) || 'Review the request in the Tribe members tab.', `tribe.html?id=${e.params.tid}#members`);
});
// Invitations are written by Tribe leaders / invitees directly (see firestore.rules); notifications come from here,
// so a client can never forge one. (Previously sent inside inviteToTribe / respondToInvite.)
exports.onTribeInviteWritten = onDocumentWritten({ ...opts, document: 'tribeInvites/{id}' }, async (e) => {
  const after = e.data.after.exists ? e.data.after.data() : null;
  const before = e.data.before.exists ? e.data.before.data() : null;
  if (!after) return;
  if (after.status === 'pending' && !(before && before.status === 'pending')) {
    await C.notify(after.inviteeUid, 'tribe_invite', `${after.inviterName} invited you to ${after.tribeName}`,
      C.clip(after.message, 120) || 'Open the invitation to accept or decline.', 'my-tribes.html#invites');
  } else if (after.status === 'accepted' && before && before.status === 'pending') {
    await C.notify(after.inviterUid, 'tribe_join_decision', 'Invitation accepted', `A student joined ${after.tribeName}.`, `tribe.html?id=${after.tribeId}`);
  }
});
// Removal and role changes (previously sent inside removeTribeMember / setTribeMemberRole).
exports.onTribeMemberWritten = onDocumentWritten({ ...opts, document: 'tribes/{tid}/members/{uid}' }, async (e) => {
  if (!e.data.before.exists || !e.data.after.exists) return;
  const a = e.data.before.data(); const b = e.data.after.data();
  const removed = a.status === 'active' && b.status === 'removed';
  const roleChanged = b.status === 'active' && a.status === 'active' && a.role !== b.role && a.role !== 'owner'; // demoted old owner is not notified
  if (!removed && !roleChanged) return;
  const t = await db.doc(`tribes/${e.params.tid}`).get();
  const tname = t.exists ? t.data().name : 'your Tribe';
  if (removed) await C.notify(e.params.uid, 'tribe_removed', `Removed from ${tname}`, 'A Tribe leader removed you from the Tribe.', 'tribes.html');
  else await C.notify(e.params.uid, 'tribe_role', b.role === 'owner' ? `You now own ${tname}` : `Your role in ${tname}: ${b.role}`, '', `tribe.html?id=${e.params.tid}`);
});
exports.onTribeMessage = onDocumentCreated({ ...opts, document: 'tribes/{tid}/messages/{mid}' }, async (e) => {
  const m = e.data.data();
  // lastMessageAt drives unread dots; lastActivityAt drives "trending/active".
  await db.doc(`tribes/${e.params.tid}`).update({ lastMessageAt: FieldValue.serverTimestamp(), lastActivityAt: FieldValue.serverTimestamp() }).catch(() => {});
  if (m.replyTo && m.replyTo.senderUid && m.replyTo.senderUid !== m.senderUid) {
    const t = await db.doc(`tribes/${e.params.tid}`).get();
    await C.notify(m.replyTo.senderUid, 'tribe_reply', `${await userName(m.senderUid)} replied to you in ${t.exists ? t.data().name : 'your Tribe'}`, C.clip(m.text, 100), `tribe.html?id=${e.params.tid}`);
  }
});
exports.onVoiceRoomCreated = onDocumentCreated({ ...opts, document: 'tribeVoiceRooms/{rid}' }, async (e) => {
  const r = e.data.data();
  const t = await db.doc(`tribes/${r.tribeId}`).get();
  if (!t.exists) return;
  const uids = await tribeMemberUids(r.tribeId, { exclude: [r.createdBy] });
  await fanOut(uids, 'voice_started', `${await userName(r.createdBy)} started a voice meet`, `Join the ${t.data().name} voice room now.`, `tribe.html?id=${r.tribeId}#voice`);
});

// ---- projects & applications ---------------------------------------------------
exports.onProjectCreated = onDocumentCreated({ ...opts, document: 'projects/{id}' }, async (e) => {
  const p = e.data.data();
  if (!p.tribeId) return;
  const uids = await tribeMemberUids(p.tribeId, { exclude: [p.ownerUid] });
  await fanOut(uids, 'tribe_project_created', `New Tribe project: ${C.clip(p.title, 60)}`, `${p.tribeName || 'Your Tribe'} started a project.`, `tribe.html?id=${p.tribeId}#projects`);
  await db.doc(`tribes/${p.tribeId}`).update({ lastActivityAt: FieldValue.serverTimestamp() }).catch(() => {});
});
exports.onProjectUpdated = onDocumentUpdated({ ...opts, document: 'projects/{id}' }, async (e) => {
  const a = e.data.before.data(); const b = e.data.after.data();
  if (!b.tribeId || a.status === b.status) return;
  const uids = await tribeMemberUids(b.tribeId);
  await fanOut(uids, 'tribe_project_updated', `${C.clip(b.title, 60)} is now ${b.status.replace('_', ' ')}`, b.tribeName || '', `tribe.html?id=${b.tribeId}#projects`);
});
exports.onApplicationCreated = onDocumentCreated({ ...opts, document: 'applications/{id}' }, async (e) => {
  const a = e.data.data();
  await C.notify(a.ownerUid, 'project_application', `${await userName(a.applicantUid)} applied to ${C.clip(a.projectTitle, 60)}`, C.clip(a.message, 120), 'my-projects.html#applications');
  await db.doc(`projects/${a.projectId}`).update({ applicationCount: FieldValue.increment(1) }).catch(() => {});
});
exports.onApplicationUpdated = onDocumentUpdated({ ...opts, document: 'applications/{id}' }, async (e) => {
  const a = e.data.before.data(); const b = e.data.after.data();
  if (a.status === b.status || !['accepted', 'rejected'].includes(b.status)) return;
  await C.notify(b.applicantUid, 'project_update', `Your application was ${b.status}`, C.clip(b.projectTitle, 80), 'my-projects.html#applications');
});

// ---- showcase / announcements -------------------------------------------------
exports.onShowcaseUpdated = onDocumentUpdated({ ...opts, document: 'showcase/{id}' }, async (e) => {
  const a = e.data.before.data(); const b = e.data.after.data();
  if (a.status === b.status || b.status === 'pending') return;
  await C.notify(b.authorUid, 'showcase_decision', `Your showcase "${C.clip(b.title, 60)}" was ${b.status}`, C.clip(b.adminNote, 160), 'showcase.html');
});
exports.onAnnouncementCreated = onDocumentCreated({ ...opts, document: 'announcements/{id}', timeoutSeconds: 300 }, async (e) => {
  const a = e.data.data();
  let last = null; let total = 0;
  while (total < 5000) { // V1 ceiling; larger campuses should move this to a queue
    let q = db.collection('users').orderBy('createdAt').limit(400);
    if (last) q = q.startAfter(last);
    const s = await q.get();
    if (s.empty) break;
    await fanOut(s.docs.map((d) => d.id), 'announcement', C.clip(a.title, 100), C.clip(a.body, 200), 'notifications.html', { email: a.notifyEmail === true });
    last = s.docs[s.docs.length - 1]; total += s.size;
  }
});

// ---- counters (clients cannot write these) ------------------------------------
const inc = (ref, f, n) => ref.update({ [f]: FieldValue.increment(n) }).catch(() => {});
exports.onLikeWritten = onDocumentWritten({ ...opts, document: '{col}/{id}/likes/{uid}' }, async (e) => {
  if (!['posts', 'projects'].includes(e.params.col)) return;
  const d = (e.data.after.exists ? 1 : 0) - (e.data.before.exists ? 1 : 0);
  if (d) await inc(db.doc(`${e.params.col}/${e.params.id}`), 'likeCount', d);
});
exports.onCommentWritten = onDocumentWritten({ ...opts, document: 'comments/{id}' }, async (e) => {
  const doc = e.data.after.exists ? e.data.after.data() : e.data.before.data();
  const col = doc.targetType === 'project' ? 'projects' : 'posts';
  const d = (e.data.after.exists ? 1 : 0) - (e.data.before.exists ? 1 : 0);
  if (d) await inc(db.doc(`${col}/${doc.targetId}`), 'commentCount', d);
});
exports.onRegistrationWritten = onDocumentWritten({ ...opts, document: 'events/{id}/registrations/{uid}' }, async (e) => {
  const d = (e.data.after.exists ? 1 : 0) - (e.data.before.exists ? 1 : 0);
  if (d) await inc(db.doc(`events/${e.params.id}`), 'registrationCount', d);
});

module.exports.deleteCollection = deleteCollection;
