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
const SUPER_ADMIN_EMAILS = defineString('SUPER_ADMIN_EMAILS', { default: '' });
const EMAIL_FROM = defineString('EMAIL_FROM', { default: 'ANURAG TRIBE <no-reply@example.com>' });
const TURN_URLS = defineString('TURN_URLS', { default: '' });
const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
const TURN_SHARED_SECRET = defineSecret('TURN_SHARED_SECRET');

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
const roleOf = (req) => (req.auth && req.auth.token.role) || 'user';
function requireAdmin(req) {
  const uid = requireVerified(req);
  if (!['admin', 'superAdmin'].includes(roleOf(req))) throw new HttpsError('permission-denied', 'Admins only.');
  return uid;
}
function requireSuper(req) {
  const uid = requireVerified(req);
  if (roleOf(req) !== 'superAdmin') throw new HttpsError('permission-denied', 'Super admin only.');
  return uid;
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
  admin, db, FieldValue, Timestamp, HttpsError, REGION, APP_URL, SUPER_ADMIN_EMAILS, EMAIL_FROM,
  TURN_URLS, RESEND_API_KEY, TURN_SHARED_SECRET, getSettings, requireVerified, requireAdmin, requireSuper,
  roleOf, notifRef, notifData, notify, clip, DEFAULT_SETTINGS,
};
