'use strict';
/**
 * Moderation callables that MUST stay on a trusted server:
 *
 *  - setUserSuspended  changes Firebase Auth state (custom claim `suspended`, account disabled, refresh
 *                      tokens revoked). The Auth Admin SDK has no client-side equivalent, and
 *                      firestore.rules enforce suspension through that claim.
 *  - setTribeStatus    suspends / reinstates a Tribe with a guaranteed audit-log entry (adminLog) and a
 *                      trusted notification to the owner. Rules cannot guarantee that a log row is written.
 *
 * Admin identity matches firestore.rules: the Super Admin UID, or users/{uid}.role == 'admin'.
 * (Role assignment itself needs no function: the Super Admin edits users/{uid}.role directly, which
 * firestore.rules allow only for the Super Admin. syncMyClaims / setUserRole were removed as dead code.)
 */
const { onCall } = require('firebase-functions/v2/https');
const C = require('./core');
const { admin, db, FieldValue, HttpsError } = C;

async function applyClaims(uid, patch) {
  const user = await admin.auth().getUser(uid);
  const claims = { ...(user.customClaims || {}), ...patch };
  if (claims.suspended !== true) delete claims.suspended;
  await admin.auth().setCustomUserClaims(uid, claims);
  return claims;
}

exports.setUserSuspended = onCall({ region: C.REGION }, async (req) => {
  const { uid: me, role: myRole } = await C.requireAdmin(req);
  const { uid, suspended, reason } = req.data || {};
  if (!uid || typeof suspended !== 'boolean') throw new HttpsError('invalid-argument', 'uid and suspended required.');
  if (uid === me) throw new HttpsError('failed-precondition', 'You cannot suspend yourself.');
  const targetRole = await C.roleOfUid(uid);
  // Admins can only act on members; super admins can act on admins too; nobody can suspend a super admin.
  if (targetRole === 'superAdmin') throw new HttpsError('permission-denied', 'Super admins cannot be suspended.');
  if (targetRole !== 'user' && myRole !== 'superAdmin') throw new HttpsError('permission-denied', 'Only a super admin can suspend an admin.');
  await admin.auth().getUser(uid); // throws auth/user-not-found for unknown ids
  await applyClaims(uid, { suspended });
  await admin.auth().updateUser(uid, { disabled: suspended });
  if (suspended) await admin.auth().revokeRefreshTokens(uid);
  await db.doc(`users/${uid}`).set({ accountStatus: suspended ? 'suspended' : 'active' }, { merge: true });
  await db.collection('adminLog').add({ by: me, action: suspended ? 'suspendUser' : 'unsuspendUser', target: uid, reason: C.clip(reason, 300), at: FieldValue.serverTimestamp() });
  return { ok: true };
});

exports.setTribeStatus = onCall({ region: C.REGION }, async (req) => {
  const { uid: me } = await C.requireAdmin(req);
  const { tribeId, status, reason } = req.data || {};
  if (!tribeId || !['active', 'suspended'].includes(status)) throw new HttpsError('invalid-argument', 'tribeId and status required.');
  const ref = db.doc(`tribes/${tribeId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Tribe not found.');
  // An owner-archived Tribe stays archived: moderation toggles only active <-> suspended.
  if (snap.data().status === 'archived') throw new HttpsError('failed-precondition', 'This Tribe is archived.');
  await ref.update({ status, updatedAt: FieldValue.serverTimestamp() });
  await db.collection('adminLog').add({ by: me, action: `tribe:${status}`, target: tribeId, reason: C.clip(reason, 300), at: FieldValue.serverTimestamp() });
  await C.notify(snap.data().creatorUid, 'admin_action', status === 'suspended' ? 'Your Tribe was suspended' : 'Your Tribe was reinstated',
    C.clip(reason, 200) || 'Contact an admin for details.', `tribe.html?id=${tribeId}`);
  return { ok: true };
});
