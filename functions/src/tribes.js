'use strict';
/**
 * TRIBE membership callables. Membership is the security backbone for chat,
 * voice and projects, so every transition happens here, atomically, with
 * server-side checks (clients can't write `members`).
 *
 * Roles inside a Tribe: owner > moderator > member.
 * Ideal size is a SOFT target (default 6). Only the platform hard cap blocks joins.
 */
const { onCall } = require('firebase-functions/v2/https');
const C = require('./core');
const { db, FieldValue, HttpsError } = C;

const slug = /^[a-z0-9-]{2,40}$/;
const arr = (v, max) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && slug.test(x)).slice(0, max) : []);

const memberRef = (t, u) => db.doc(`tribes/${t}/members/${u}`);
async function getLeader(tribeId, uid) {
  const [t, m] = await Promise.all([db.doc(`tribes/${tribeId}`).get(), memberRef(tribeId, uid).get()]);
  if (!t.exists) throw new HttpsError('not-found', 'Tribe not found.');
  const role = m.exists && m.data().status === 'active' ? m.data().role : null;
  return { tribe: t, role, isLeader: role === 'owner' || role === 'moderator' };
}
async function names(uids) {
  const out = {};
  await Promise.all(uids.map(async (u) => { const s = await db.doc(`users/${u}`).get(); out[u] = s.exists ? s.data().name : 'A student'; }));
  return out;
}

exports.createTribe = onCall({ region: C.REGION }, async (req) => {
  const uid = C.requireVerified(req);
  const d = req.data || {};
  const settings = await C.getSettings();
  const name = C.clip(d.name, 40);
  const description = C.clip(d.description, 500);
  if (name.length < 3) throw new HttpsError('invalid-argument', 'Tribe name must be at least 3 characters.');
  if (description.length < 10) throw new HttpsError('invalid-argument', 'Please describe the Tribe (10+ characters).');
  if (!settings.tribeCategories.includes(d.category)) throw new HttpsError('invalid-argument', 'Unknown category.');
  const privacy = d.privacy === 'private' ? 'private' : 'public';
  const ideal = Math.min(12, Math.max(2, parseInt(d.idealMemberCount, 10) || 6));

  const owned = await db.collection('tribes').where('creatorUid', '==', uid).where('status', '==', 'active').get();
  if (owned.size >= settings.maxTribesPerUser)
    throw new HttpsError('resource-exhausted', `You can own up to ${settings.maxTribesPerUser} active Tribes.`);
  const dup = await db.collection('tribes').where('nameLower', '==', name.toLowerCase()).limit(1).get();
  if (!dup.empty) throw new HttpsError('already-exists', 'A Tribe with this name already exists.');

  const ref = db.collection('tribes').doc();
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(ref, {
    name, nameLower: name.toLowerCase(), description, goal: C.clip(d.goal, 200), category: d.category,
    skills: arr(d.skills, 12), interests: arr(d.interests, 12), creatorUid: uid, privacy,
    idealMemberCount: ideal, memberCount: 1, status: 'active', projectFocus: C.clip(d.projectFocus, 100),
    createdAt: now, updatedAt: now, lastActivityAt: now,
  });
  batch.set(memberRef(ref.id, uid), { uid, role: 'owner', status: 'active', joinedAt: now, lastReadAt: now });
  await batch.commit();
  return { tribeId: ref.id };
});

exports.respondToJoinRequest = onCall({ region: C.REGION }, async (req) => {
  const me = C.requireVerified(req);
  const { tribeId, uid, accept } = req.data || {};
  if (!tribeId || !uid || typeof accept !== 'boolean') throw new HttpsError('invalid-argument', 'tribeId, uid, accept required.');
  const { tribe, isLeader } = await getLeader(tribeId, me);
  if (!isLeader) throw new HttpsError('permission-denied', 'Only Tribe leaders can respond.');
  const settings = await C.getSettings();
  const reqRef = db.doc(`tribes/${tribeId}/joinRequests/${uid}`);
  const tribeRef = db.doc(`tribes/${tribeId}`);
  await db.runTransaction(async (tx) => {
    const [r, t, m] = await Promise.all([tx.get(reqRef), tx.get(tribeRef), tx.get(memberRef(tribeId, uid))]);
    if (!r.exists || r.data().status !== 'pending') throw new HttpsError('failed-precondition', 'No pending request.');
    const now = FieldValue.serverTimestamp();
    if (!accept) { tx.update(reqRef, { status: 'rejected', updatedAt: now }); return; }
    if (t.data().status !== 'active') throw new HttpsError('failed-precondition', 'Tribe is not active.');
    if (t.data().memberCount >= settings.tribeHardCap) throw new HttpsError('resource-exhausted', 'This Tribe reached the platform member limit.');
    const alreadyActive = m.exists && m.data().status === 'active';
    tx.set(memberRef(tribeId, uid), { uid, role: 'member', status: 'active', joinedAt: now, lastReadAt: now });
    tx.update(reqRef, { status: 'accepted', updatedAt: now });
    if (!alreadyActive) tx.update(tribeRef, { memberCount: FieldValue.increment(1), updatedAt: now });
  });
  const tname = tribe.data().name;
  await C.notify(uid, 'tribe_join_decision', accept ? `You joined ${tname}` : `Request to join ${tname} was declined`,
    accept ? 'Welcome! Say hello in the Tribe chat.' : 'You can look for other Tribes that match your skills.', accept ? `tribe.html?id=${tribeId}` : 'tribes.html');
  return { ok: true };
});

exports.inviteToTribe = onCall({ region: C.REGION }, async (req) => {
  const me = C.requireVerified(req);
  const { tribeId, inviteeUid } = req.data || {};
  if (!tribeId || !inviteeUid || inviteeUid === me) throw new HttpsError('invalid-argument', 'tribeId and inviteeUid required.');
  const { tribe, isLeader } = await getLeader(tribeId, me);
  if (!isLeader) throw new HttpsError('permission-denied', 'Only Tribe leaders can invite.');
  if (tribe.data().status !== 'active') throw new HttpsError('failed-precondition', 'Tribe is not active.');
  const [u, m] = await Promise.all([db.doc(`users/${inviteeUid}`).get(), memberRef(tribeId, inviteeUid).get()]);
  if (!u.exists || u.data().visibility !== 'campus' || u.data().accountStatus === 'suspended') throw new HttpsError('not-found', 'Student not available for invitation.');
  if (m.exists && m.data().status === 'active') throw new HttpsError('already-exists', 'Already a member.');
  const id = `${tribeId}_${inviteeUid}`;
  const ex = await db.doc(`tribeInvites/${id}`).get();
  if (ex.exists && ex.data().status === 'pending') throw new HttpsError('already-exists', 'An invitation is already pending.');
  const n = await names([me]);
  await db.doc(`tribeInvites/${id}`).set({
    tribeId, tribeName: tribe.data().name, inviteeUid, inviterUid: me, inviterName: n[me],
    message: C.clip((req.data || {}).message, 200), status: 'pending', createdAt: FieldValue.serverTimestamp(),
  });
  await C.notify(inviteeUid, 'tribe_invite', `${n[me]} invited you to ${tribe.data().name}`,
    C.clip((req.data || {}).message, 120) || 'Open the invitation to accept or decline.', 'my-tribes.html#invites');
  return { ok: true };
});

exports.respondToInvite = onCall({ region: C.REGION }, async (req) => {
  const me = C.requireVerified(req);
  const { inviteId, accept } = req.data || {};
  const ref = db.doc(`tribeInvites/${inviteId}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data().inviteeUid !== me || snap.data().status !== 'pending') throw new HttpsError('failed-precondition', 'Invitation not available.');
  const { tribeId } = snap.data();
  const settings = await C.getSettings();
  const tribeRef = db.doc(`tribes/${tribeId}`);
  await db.runTransaction(async (tx) => {
    const [t, m] = await Promise.all([tx.get(tribeRef), tx.get(memberRef(tribeId, me))]);
    const now = FieldValue.serverTimestamp();
    if (!accept) { tx.update(ref, { status: 'declined', respondedAt: now }); return; }
    if (!t.exists || t.data().status !== 'active') throw new HttpsError('failed-precondition', 'Tribe is not active.');
    if (t.data().memberCount >= settings.tribeHardCap) throw new HttpsError('resource-exhausted', 'Tribe member limit reached.');
    const alreadyActive = m.exists && m.data().status === 'active';
    tx.set(memberRef(tribeId, me), { uid: me, role: 'member', status: 'active', joinedAt: now, lastReadAt: now });
    tx.update(ref, { status: 'accepted', respondedAt: now });
    if (!alreadyActive) tx.update(tribeRef, { memberCount: FieldValue.increment(1), updatedAt: now });
  });
  if (accept) await C.notify(snap.data().inviterUid, 'tribe_join_decision', 'Invitation accepted', `A student joined ${snap.data().tribeName}.`, `tribe.html?id=${tribeId}`);
  return { ok: true, tribeId };
});

exports.removeTribeMember = onCall({ region: C.REGION }, async (req) => {
  const me = C.requireVerified(req);
  const { tribeId, uid } = req.data || {};
  if (!tribeId || !uid || uid === me) throw new HttpsError('invalid-argument', 'Use leaveTribe to leave.');
  const { tribe, role } = await getLeader(tribeId, me);
  const target = await memberRef(tribeId, uid).get();
  if (!target.exists || target.data().status !== 'active') throw new HttpsError('not-found', 'Not an active member.');
  const tr = target.data().role;
  const allowed = role === 'owner' ? tr !== 'owner' : role === 'moderator' ? tr === 'member' : false;
  if (!allowed) throw new HttpsError('permission-denied', 'You cannot remove this member.');
  const now = FieldValue.serverTimestamp();
  const b = db.batch();
  b.update(memberRef(tribeId, uid), { status: 'removed', removedAt: now });
  b.update(db.doc(`tribes/${tribeId}`), { memberCount: FieldValue.increment(-1), updatedAt: now });
  await b.commit();
  await C.notify(uid, 'tribe_removed', `Removed from ${tribe.data().name}`, 'A Tribe leader removed you from the Tribe.', 'tribes.html');
  return { ok: true };
});

exports.leaveTribe = onCall({ region: C.REGION }, async (req) => {
  const me = C.requireVerified(req);
  const { tribeId } = req.data || {};
  const { tribe, role } = await getLeader(tribeId, me);
  if (!role) throw new HttpsError('failed-precondition', 'You are not a member.');
  const now = FieldValue.serverTimestamp();
  if (role === 'owner') {
    const others = await db.collection(`tribes/${tribeId}/members`).where('status', '==', 'active').get();
    if (others.size > 1) throw new HttpsError('failed-precondition', 'Transfer ownership to another member before leaving.');
    // Last member leaving: archive the Tribe.
    await db.doc(`tribes/${tribeId}`).update({ status: 'archived', memberCount: 0, updatedAt: now });
  } else {
    await db.doc(`tribes/${tribeId}`).update({ memberCount: FieldValue.increment(-1), updatedAt: now });
  }
  await memberRef(tribeId, me).update({ status: 'left', leftAt: now });
  return { ok: true };
});

exports.setTribeMemberRole = onCall({ region: C.REGION }, async (req) => {
  const me = C.requireVerified(req);
  const { tribeId, uid, role } = req.data || {};
  if (!['moderator', 'member', 'owner'].includes(role) || !uid || uid === me) throw new HttpsError('invalid-argument', 'Invalid role change.');
  const { tribe, role: myRole } = await getLeader(tribeId, me);
  if (myRole !== 'owner') throw new HttpsError('permission-denied', 'Only the owner can change roles.');
  const t = await memberRef(tribeId, uid).get();
  if (!t.exists || t.data().status !== 'active') throw new HttpsError('not-found', 'Not an active member.');
  const b = db.batch();
  b.update(memberRef(tribeId, uid), { role });
  if (role === 'owner') b.update(memberRef(tribeId, me), { role: 'moderator' }); // ownership transfer
  await b.commit();
  await C.notify(uid, 'tribe_role', role === 'owner' ? `You now own ${tribe.data().name}` : `Your role in ${tribe.data().name}: ${role}`, '', `tribe.html?id=${tribeId}`);
  return { ok: true };
});

exports.archiveTribe = onCall({ region: C.REGION }, async (req) => {
  const me = C.requireVerified(req);
  const { tribeId } = req.data || {};
  const { role } = await getLeader(tribeId, me);
  if (role !== 'owner') throw new HttpsError('permission-denied', 'Only the owner can archive a Tribe.');
  await db.doc(`tribes/${tribeId}`).update({ status: 'archived', updatedAt: FieldValue.serverTimestamp() });
  return { ok: true };
});
