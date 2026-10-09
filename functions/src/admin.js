'use strict';
/**
 * Roles & moderation callables.
 * Roles live in Firebase custom claims { role: 'user'|'admin'|'superAdmin', suspended?: true }.
 * Only these functions can change them - a user can never promote themselves.
 */
const { onCall } = require('firebase-functions/v2/https');
const C = require('./core');
const { admin, db, FieldValue, HttpsError } = C;

const ROLES = ['user', 'admin', 'superAdmin'];

async function applyClaims(uid, patch) {
  const user = await admin.auth().getUser(uid);
  const claims = { ...(user.customClaims || {}), ...patch };
  if (claims.suspended !== true) delete claims.suspended;
  await admin.auth().setCustomUserClaims(uid, claims);
  return claims;
}

/** First-login bootstrap: emails in SUPER_ADMIN_EMAILS become superAdmin once verified. */
exports.syncMyClaims = onCall({ region: C.REGION }, async (req) => {
  const uid = C.requireVerified(req);
  const email = (req.auth.token.email || '').toLowerCase();
  const allow = C.SUPER_ADMIN_EMAILS.value().split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  let role = req.auth.token.role || 'user';
  if (allow.includes(email) && role !== 'superAdmin') {
    await applyClaims(uid, { role: 'superAdmin' });
    await db.doc(`users/${uid}`).set({ role: 'superAdmin' }, { merge: true });
    role = 'superAdmin';
  }
  return { role, needsTokenRefresh: role !== (req.auth.token.role || 'user') };
});

exports.setUserRole = onCall({ region: C.REGION }, async (req) => {
  const me = C.requireSuper(req);
  const { uid, role } = req.data || {};
  if (!uid || !ROLES.includes(role)) throw new HttpsError('invalid-argument', 'uid and valid role required.');
  if (uid === me) throw new HttpsError('failed-precondition', 'You cannot change your own role.');
  const target = await admin.auth().getUser(uid);
  if (!target.emailVerified) throw new HttpsError('failed-precondition', 'Target must have a verified email.');
  await applyClaims(uid, { role });
  await db.doc(`users/${uid}`).set({ role }, { merge: true });
  await C.notify(uid, 'admin_action', 'Your role changed',
    `You are now: ${role === 'superAdmin' ? 'Super Admin' : role === 'admin' ? 'Admin' : 'Member'}. Sign out and in again to apply.`, 'dashboard.html');
  return { ok: true };
});

exports.setUserSuspended = onCall({ region: C.REGION }, async (req) => {
  const me = C.requireAdmin(req);
  const { uid, suspended, reason } = req.data || {};
  if (!uid || typeof suspended !== 'boolean') throw new HttpsError('invalid-argument', 'uid and suspended required.');
  if (uid === me) throw new HttpsError('failed-precondition', 'You cannot suspend yourself.');
  const target = await admin.auth().getUser(uid);
  const targetRole = (target.customClaims || {}).role || 'user';
  // Admins can only act on members; super admins can act on admins too.
  if (targetRole !== 'user' && C.roleOf(req) !== 'superAdmin') throw new HttpsError('permission-denied', 'Only a super admin can suspend an admin.');
  if (targetRole === 'superAdmin') throw new HttpsError('permission-denied', 'Super admins cannot be suspended.');
  await applyClaims(uid, { suspended });
  await admin.auth().updateUser(uid, { disabled: suspended });
  if (suspended) await admin.auth().revokeRefreshTokens(uid);
  await db.doc(`users/${uid}`).set({ accountStatus: suspended ? 'suspended' : 'active' }, { merge: true });
  await db.collection('adminLog').add({ by: me, action: suspended ? 'suspendUser' : 'unsuspendUser', target: uid, reason: C.clip(reason, 300), at: FieldValue.serverTimestamp() });
  return { ok: true };
});

exports.setTribeStatus = onCall({ region: C.REGION }, async (req) => {
  const me = C.requireAdmin(req);
  const { tribeId, status, reason } = req.data || {};
  if (!tribeId || !['active', 'suspended'].includes(status)) throw new HttpsError('invalid-argument', 'tribeId and status required.');
  const ref = db.doc(`tribes/${tribeId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Tribe not found.');
  await ref.update({ status, updatedAt: FieldValue.serverTimestamp() });
  await db.collection('adminLog').add({ by: me, action: `tribe:${status}`, target: tribeId, reason: C.clip(reason, 300), at: FieldValue.serverTimestamp() });
  await C.notify(snap.data().creatorUid, 'admin_action', status === 'suspended' ? 'Your Tribe was suspended' : 'Your Tribe was reinstated',
    C.clip(reason, 200) || 'Contact an admin for details.', `tribe.html?id=${tribeId}`);
  return { ok: true };
});
