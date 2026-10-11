// Server-side authorization helpers (functions/src/core.js). Pure logic only: no network, no Firebase project.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
process.env.SUPER_ADMIN_UID = 'o5fX7pb3qbRTpA2GGE9SeBVL2up2'; // the runtime supplies params through the environment
const C = require('../../functions/src/core.js');
const SUPER = 'o5fX7pb3qbRTpA2GGE9SeBVL2up2';
const req = (token, uid = 'u1') => ({ auth: { uid, token } });

test('roleFromUser mirrors firestore.rules: super UID, users/{uid}.role == admin, otherwise user', () => {
  assert.equal(C.roleFromUser(SUPER, SUPER, null), 'superAdmin');
  assert.equal(C.roleFromUser('a', SUPER, { role: 'admin' }), 'admin');
  assert.equal(C.roleFromUser('a', SUPER, { role: 'user' }), 'user');
  assert.equal(C.roleFromUser('a', SUPER, { role: 'superAdmin' }), 'user');   // a Firestore doc can never mint a super admin
  assert.equal(C.roleFromUser('a', SUPER, null), 'user');
  assert.equal(C.roleFromUser(undefined, SUPER, { role: 'admin' }), 'admin');
});
test('stale custom-claim roles are ignored (demotion only edits Firestore)', async () => {
  // A token still carrying role=admin must NOT grant admin; this uid is not the super admin and (stubbed) has no doc.
  const orig = C.db.doc; C.db.doc = () => ({ get: async () => ({ exists: false, data: () => ({}) }) });
  try { await assert.rejects(C.requireAdmin(req({ email_verified: true, role: 'admin' })), /Admins only/); }
  finally { C.db.doc = orig; }
});
test('requireAdmin: super admin passes without any Firestore read', async () => {
  const r = await C.requireAdmin(req({ email_verified: true }, SUPER));
  assert.deepEqual(r, { uid: SUPER, role: 'superAdmin' });
});
test('requireAdmin: Firestore admin passes; plain user refused', async () => {
  const orig = C.db.doc;
  C.db.doc = (p) => ({ get: async () => ({ exists: true, data: () => ({ role: p === 'users/adm' ? 'admin' : 'user' }) }) });
  try {
    assert.deepEqual(await C.requireAdmin(req({ email_verified: true }, 'adm')), { uid: 'adm', role: 'admin' });
    await assert.rejects(C.requireAdmin(req({ email_verified: true }, 'plain')), /Admins only/);
  } finally { C.db.doc = orig; }
});
test('requireVerified: signed out, unverified and suspended callers are all refused', () => {
  assert.throws(() => C.requireVerified({}), /sign in/i);
  assert.throws(() => C.requireVerified(req({ email_verified: false })), /Verify your email/);
  assert.throws(() => C.requireVerified(req({ email_verified: true, suspended: true })), /suspended/i);
  assert.equal(C.requireVerified(req({ email_verified: true })), 'u1');
});
test('suspended admin is refused before any role lookup', async () => {
  await assert.rejects(C.requireAdmin(req({ email_verified: true, suspended: true }, SUPER)), /suspended/i);
});
