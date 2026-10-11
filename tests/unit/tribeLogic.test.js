import test from 'node:test';
import assert from 'node:assert/strict';
import { inviteDocId, hardCap, canRemove, roleChangeKind, membershipMarker, normalizeTribeInput, DEFAULT_HARD_CAP } from '../../public/js/lib/tribeLogic.js';

test('inviteDocId is deterministic: one invitation per (tribe, student)', () => {
  assert.equal(inviteDocId('t1', 'u9'), 't1_u9');
});
test('hardCap uses settings, falls back to 30 for missing/invalid values', () => {
  assert.equal(hardCap({ tribeHardCap: 12 }), 12);
  for (const bad of [null, undefined, {}, { tribeHardCap: 'x' }, { tribeHardCap: 0 }, { tribeHardCap: -3 }]) assert.equal(hardCap(bad), DEFAULT_HARD_CAP);
});
test('canRemove: owner removes anyone but an owner; moderator only plain members; member nobody', () => {
  assert.equal(canRemove('owner', 'moderator'), true);
  assert.equal(canRemove('owner', 'member'), true);
  assert.equal(canRemove('owner', 'owner'), false);
  assert.equal(canRemove('moderator', 'member'), true);
  assert.equal(canRemove('moderator', 'moderator'), false);
  assert.equal(canRemove('moderator', 'owner'), false);
  assert.equal(canRemove('member', 'member'), false);
  assert.equal(canRemove(null, 'member'), false);
});
test('roleChangeKind: only the owner; never to/from owner except a transfer; no-op rejected', () => {
  assert.equal(roleChangeKind('owner', 'member', 'moderator'), 'role');
  assert.equal(roleChangeKind('owner', 'moderator', 'member'), 'role');
  assert.equal(roleChangeKind('owner', 'member', 'owner'), 'transfer');
  assert.equal(roleChangeKind('owner', 'moderator', 'owner'), 'transfer');
  assert.equal(roleChangeKind('moderator', 'member', 'moderator'), null);   // moderators cannot escalate anyone
  assert.equal(roleChangeKind('member', 'member', 'owner'), null);          // no self-service escalation
  assert.equal(roleChangeKind('owner', 'owner', 'member'), null);           // cannot demote an owner this way
  assert.equal(roleChangeKind('owner', 'member', 'member'), null);          // no-op
  assert.equal(roleChangeKind('owner', 'member', 'superAdmin'), null);      // unknown role
});
test('membershipMarker has exactly the keys the rules require', () => {
  assert.deepEqual(Object.keys(membershipMarker('u', 'join', 'T')).sort(), ['at', 'kind', 'uid']);
});
test('normalizeTribeInput: clips, normalises, filters slugs, clamps size', () => {
  const r = normalizeTribeInput({ name: '  Film   Tribe ', description: 'A tribe for short films', goal: 'g'.repeat(300), category: 'filmmaking',
    skills: ['video-editing', 'BAD SLUG', 5, 'x', ...Array(20).fill('ok-skill')], interests: 'nope', privacy: 'weird', idealMemberCount: '99', projectFocus: 'f' });
  assert.equal(r.ok, true);
  assert.equal(r.value.name, 'Film Tribe');
  assert.equal(r.value.nameLower, 'film tribe');
  assert.equal(r.value.goal.length, 200);
  assert.equal(r.value.privacy, 'public');                    // anything but 'private' is public
  assert.equal(r.value.idealMemberCount, 12);
  assert.equal(r.value.skills.length, 12);
  assert.ok(!r.value.skills.includes('BAD SLUG') && !r.value.skills.includes('x'));
  assert.deepEqual(r.value.interests, []);
  assert.deepEqual(Object.keys(r.value).sort(), ['category', 'description', 'goal', 'idealMemberCount', 'interests', 'name', 'nameLower', 'privacy', 'projectFocus', 'skills']);
});
test('normalizeTribeInput: rejects short name/description and missing category', () => {
  const r = normalizeTribeInput({ name: 'ab', description: 'short', category: '' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.name && r.errors.description && r.errors.category);
  assert.equal(normalizeTribeInput({ name: 'Good name', description: 'long enough text', category: 'x'.repeat(31) }).ok, false);
});
test('normalizeTribeInput: private stays private; ideal size defaults to 6', () => {
  const r = normalizeTribeInput({ name: 'Secret', description: 'invite only group', category: 'tech', privacy: 'private' });
  assert.equal(r.value.privacy, 'private'); assert.equal(r.value.idealMemberCount, 6);
});
