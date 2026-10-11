'use strict';
/** Shared admin SDK handles, auth guards, platform settings. */
const admin = require('firebase-admin');
const { HttpsError } = require('firebase-functions/v2/https');
const { defineString, defineSecret } = require('firebase-functions/params');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

const REGION = 'asia-south1'; // must match APP.functionsRegion in public/js/config/app-config.js
const APP_URL = defineString('APP_URL', { default: 'http://localhost:5000' });
// Must equal the UID hard-coded in isSuper() in firestore.rules and SUPER_ADMIN_UID in public/js/core/roles.js.
const SUPER_ADMIN_UID = defineString('SUPER_ADMIN_UID', { default: 'o5fX7pb3qbRTpA2GGE9SeBVL2up2' });
const EMAIL_FROM = defineString('EMAIL_FROM', { default: 'ANURAG TRIBE <no-reply@example.com>' });
const RESEND_API_KEY = defineSecret('RESEND_API_KEY');

const DEFAULT_SETTINGS = {
  maxTribesPerUser: 3,       // active Tribes a student may OWN
  tribeHardCap: 30,          // absolute member ceiling (ideal size 5-6 is only a soft target)
  emailsPerUserPerHour: 10,
  tribeCategories: ['filmmaking', 'tech', 'startup', 'photography', 'ai-ml', 'cybersecurity',
    'competitive-exams', 'study-group', 'design', 'music', 'content-creation', 'entrepreneurship', 'research', 'other'],
};
let settingsCache = { at: 0, value: DEFAULT_SETTINGS };
async function getSettings() {
  if (Date.now() - settingsCache.at < 60000) return settingsCache.value;
  const [p, t] = await Promise.all([db.doc('settings/platform').get(), db.doc('settings/taxonomy').get()]);
  const extra = (t.exists && t.data().extraCategories || []).map((c) => c.id).filter(Boolean);
  const value = { ...DEFAULT_SETTINGS, ...(p.exists ? p.data() : {}) };
  value.tribeCategories = [...new Set([...DEFAULT_SETTINGS.tribeCategories, ...extra])];
  settingsCache = { at: Date.now(), value };
  return value;
}

/** Callers must be signed in, email-verified and not suspended. */
function requireVerified(req) {
  const a = req.auth;
  if (!a) throw new HttpsError('unauthenticated', 'Please sign in.');
  if (a.token.email_verified !== true) throw new HttpsError('failed-precondition', 'Verify your email first.');
  if (a.token.suspended === true) throw new HttpsError('permission-denied', 'Account suspended.');
  return a.uid;
}
/**
 * Roles live in Firestore (users/{uid}.role, written by the Super Admin through firestore.rules) plus the
 * single Super Admin UID - exactly what firestore.rules isAdmin()/isSuper() use. Custom-claim roles are
 * deliberately NOT trusted: demoting an admin only edits the Firestore document, so a stale claim would
 * otherwise keep granting server-side power.
 */
function roleFromUser(uid, superUid, userData) {
  if (uid && uid === superUid) return 'superAdmin';
  return userData && userData.role === 'admin' ? 'admin' : 'user';
}
async function roleOfUid(uid) {
  if (uid === SUPER_ADMIN_UID.value()) return 'superAdmin';
  const s = await db.doc(`users/${uid}`).get();
  return roleFromUser(uid, SUPER_ADMIN_UID.value(), s.exists ? s.data() : null);
}
/** Verified, not suspended, and an admin/super admin. Returns { uid, role }. */
async function requireAdmin(req) {
  const uid = requireVerified(req);
  const role = await roleOfUid(uid);
  if (role === 'user') throw new HttpsError('permission-denied', 'Admins only.');
  return { uid, role };
}

/** Create one notification doc (clients can never create these). */
function notifRef() { return db.collection('notifications').doc(); }
function notifData(uid, type, title, body, link, meta = {}) {
  return { uid, type, title, body, link, meta, read: false, createdAt: FieldValue.serverTimestamp() };
}
async function notify(uid, type, title, body, link, meta) {
  if (!uid) return;
  await notifRef().set(notifData(uid, type, title, body, link, meta));
}

const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

module.exports = {
  admin, db, FieldValue, Timestamp, HttpsError, REGION, APP_URL, SUPER_ADMIN_UID, EMAIL_FROM,
  RESEND_API_KEY, getSettings, requireVerified, requireAdmin, roleFromUser, roleOfUid,
  notifRef, notifData, notify, clip, DEFAULT_SETTINGS,
};
