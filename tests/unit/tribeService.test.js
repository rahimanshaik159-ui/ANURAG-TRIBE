// Executes the REAL services/tribes.js against an in-memory Firestore and checks the exact write sets.
// NOT a rules test: it proves the client writes what firestore.rules expects (see tests/rules for enforcement).
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { store, log, reset, seed, auth, SERVER_TS } from './helpers/fakeFirebase.mjs';
const svc = await import('../../public/js/services/tribes.js');

const T = (over = {}) => ({ name: 'Film', status: 'active', memberCount: 2, privacy: 'public', ...over });
const M = (uid, role = 'member', status = 'active') => ({ uid, role, status });
const get = (p) => store.get(p);
const wrote = (path) => log.filter((l) => l.path === path);
const rejects = (p, re) => assert.rejects(p, (e) => re.test(e.message));

beforeEach(() => { reset(); auth.currentUser = { uid: 'me', emailVerified: true };
  seed('users/me', { name: 'Me', visibility: 'campus' }); seed('tribes/t1', T()); seed('tribes/t1/members/me', M('me', 'owner')); seed('tribes/t1/members/mem', M('mem')); });

test('createTribe: batch of Tribe + owner member with exact key sets, memberCount 1', async () => {
  const r = await svc.createTribe({ name: 'New Tribe', description: 'long enough text', category: 'tech', skills: ['a-b'], interests: [], privacy: 'public', idealMemberCount: 6, goal: '', projectFocus: '' });
  const t = get(`tribes/${r.tribeId}`);
  assert.deepEqual(Object.keys(t).sort(), ['category','createdAt','creatorUid','description','goal','idealMemberCount','interests','lastActivityAt','memberCount','name','nameLower','privacy','projectFocus','skills','status','updatedAt']);
  assert.equal(t.memberCount, 1); assert.equal(t.creatorUid, 'me'); assert.equal(t.createdAt, SERVER_TS);
  assert.deepEqual(Object.keys(get(`tribes/${r.tribeId}/members/me`)).sort(), ['joinedAt','lastReadAt','role','status','uid']);
  assert.equal(get(`tribes/${r.tribeId}/members/me`).role, 'owner');
});
test('createTribe: unverified email and invalid input are refused before any write', async () => {
  auth.currentUser = { uid: 'me', emailVerified: false };
  await rejects(svc.createTribe({ name: 'New Tribe', description: 'long enough text', category: 'tech' }), /verify your email/i);
  auth.currentUser = { uid: 'me', emailVerified: true };
  await rejects(svc.createTribe({ name: 'ab', description: 'x', category: '' }), /at least 3/i);
  assert.equal(log.length, 0);
});

test('accept join request: member created, count +1, marker names the student, request accepted', async () => {
  seed('tribes/t1/joinRequests/u2', { uid: 'u2', requestId: 'u2', status: 'pending' });
  await svc.respondToJoinRequest('t1', 'u2', true);
  assert.deepEqual(Object.keys(get('tribes/t1/members/u2')).sort(), ['joinedAt','lastReadAt','role','status','uid']);
  assert.equal(get('tribes/t1/members/u2').role, 'member');
  assert.equal(get('tribes/t1').memberCount, 3);
  assert.deepEqual({ uid: get('tribes/t1').lastMembershipChange.uid, kind: get('tribes/t1').lastMembershipChange.kind }, { uid: 'u2', kind: 'join' });
  assert.equal(get('tribes/t1').lastMembershipChange.at, SERVER_TS);
  assert.equal(get('tribes/t1/joinRequests/u2').status, 'accepted');
});
test('accept join request: re-join re-activates a left member as a plain member (update, not create)', async () => {
  seed('tribes/t1/members/u2', { uid: 'u2', role: 'moderator', status: 'left', leftAt: 'x' });
  seed('tribes/t1/joinRequests/u2', { uid: 'u2', requestId: 'u2', status: 'pending' });
  await svc.respondToJoinRequest('t1', 'u2', true);
  const w = wrote('tribes/t1/members/u2')[0];
  assert.equal(w.op, 'update'); assert.deepEqual(Object.keys(w.data).sort(), ['joinedAt','lastReadAt','role','status']);
  assert.equal(get('tribes/t1/members/u2').role, 'member');
});
test('decline join request: only the request changes; count untouched', async () => {
  seed('tribes/t1/joinRequests/u2', { uid: 'u2', requestId: 'u2', status: 'pending' });
  await svc.respondToJoinRequest('t1', 'u2', false);
  assert.equal(get('tribes/t1/joinRequests/u2').status, 'rejected'); assert.equal(get('tribes/t1').memberCount, 2); assert.equal(log.length, 1);
});
test('join request: ordinary member, repeat response, full/inactive Tribe, existing member are all refused', async () => {
  seed('tribes/t1/joinRequests/u2', { uid: 'u2', requestId: 'u2', status: 'pending' });
  auth.currentUser = { uid: 'mem', emailVerified: true };
  await rejects(svc.respondToJoinRequest('t1', 'u2', true), /Only Tribe leaders/);
  auth.currentUser = { uid: 'me', emailVerified: true };
  seed('settings/platform', { tribeHardCap: 2 });
  await rejects(svc.respondToJoinRequest('t1', 'u2', true), /member limit/);
  store.delete('settings/platform'); seed('tribes/t1', T({ status: 'suspended' }));
  await rejects(svc.respondToJoinRequest('t1', 'u2', true), /not active/);
  seed('tribes/t1', T()); seed('tribes/t1/members/u2', M('u2'));
  await rejects(svc.respondToJoinRequest('t1', 'u2', true), /already a member/);
  await svc.respondToJoinRequest('t1', 'u3', false).catch(() => {});
  assert.equal(log.length, 0);
  seed('tribes/t1/joinRequests/u2', { status: 'accepted' });
  await rejects(svc.respondToJoinRequest('t1', 'u2', true), /No pending request/);
});

test('invite: writes the exact invitation document with deterministic id', async () => {
  seed('users/u2', { name: 'U2', visibility: 'campus' });
  await svc.inviteToTribe('t1', 'u2', '  join us  ');
  const d = get('tribeInvites/t1_u2');
  assert.deepEqual(Object.keys(d).sort(), ['createdAt','inviteeUid','inviterName','inviterUid','message','status','tribeId','tribeName']);
  assert.deepEqual({ s: d.status, i: d.inviterUid, n: d.inviterName, t: d.tribeName, m: d.message }, { s: 'pending', i: 'me', n: 'Me', t: 'Film', m: 'join us' });
});
test('invite: refuses hidden/suspended/missing invitee, active member, duplicate pending, non-leader, inactive Tribe, self', async () => {
  seed('users/hid', { name: 'H', visibility: 'hidden' }); seed('users/sus', { name: 'S', visibility: 'campus', accountStatus: 'suspended' });
  await rejects(svc.inviteToTribe('t1', 'hid'), /not available/); await rejects(svc.inviteToTribe('t1', 'sus'), /not available/); await rejects(svc.inviteToTribe('t1', 'ghost'), /not available/);
  await rejects(svc.inviteToTribe('t1', 'me'), /required/);
  seed('users/mem', { name: 'Mem', visibility: 'campus' }); await rejects(svc.inviteToTribe('t1', 'mem'), /Already a member/);
  seed('users/u2', { name: 'U2', visibility: 'campus' }); await svc.inviteToTribe('t1', 'u2'); await rejects(svc.inviteToTribe('t1', 'u2'), /already pending/);
  seed('users/u3', { name: 'U3', visibility: 'campus' }); seed('tribes/t1', T({ status: 'archived' })); await rejects(svc.inviteToTribe('t1', 'u3'), /not active/);
  seed('tribes/t1', T()); auth.currentUser = { uid: 'mem', emailVerified: true }; seed('users/mem', { name: 'Mem', visibility: 'campus' });
  await rejects(svc.inviteToTribe('t1', 'u3'), /Only Tribe leaders/);
  assert.equal(Object.keys(Object.fromEntries(store)).filter((k) => k.startsWith('tribeInvites/')).length, 1);
});
test('invite: can re-invite after the earlier invitation was answered', async () => {
  seed('users/u2', { name: 'U2', visibility: 'campus' }); seed('tribeInvites/t1_u2', { status: 'declined', inviteeUid: 'u2' });
  await svc.inviteToTribe('t1', 'u2'); assert.equal(get('tribeInvites/t1_u2').status, 'pending');
});

test('accept invitation: member + count +1 + marker + invite accepted; returns tribeId', async () => {
  auth.currentUser = { uid: 'u2', emailVerified: true };
  seed('tribeInvites/t1_u2', { tribeId: 't1', inviteeUid: 'u2', status: 'pending' });
  const r = await svc.respondToInvite('t1_u2', true);
  assert.deepEqual(r, { ok: true, tribeId: 't1' });
  assert.equal(get('tribes/t1/members/u2').role, 'member'); assert.equal(get('tribes/t1').memberCount, 3);
  assert.equal(get('tribes/t1').lastMembershipChange.uid, 'u2'); assert.equal(get('tribeInvites/t1_u2').status, 'accepted');
  assert.deepEqual(Object.keys(wrote('tribeInvites/t1_u2')[0].data).sort(), ['respondedAt','status']);
});
test('decline invitation touches only the invitation; repeated/foreign responses are refused', async () => {
  auth.currentUser = { uid: 'u2', emailVerified: true };
  seed('tribeInvites/t1_u2', { tribeId: 't1', inviteeUid: 'u2', status: 'pending' });
  await svc.respondToInvite('t1_u2', false); assert.equal(get('tribeInvites/t1_u2').status, 'declined'); assert.equal(get('tribes/t1').memberCount, 2);
  await rejects(svc.respondToInvite('t1_u2', true), /not available/);
  seed('tribeInvites/t1_u3', { tribeId: 't1', inviteeUid: 'u3', status: 'pending' });
  await rejects(svc.respondToInvite('t1_u3', true), /not available/);
});

test('remove member: status removed + count -1 + marker; matrix enforced client-side', async () => {
  await svc.removeMember('t1', 'mem');
  assert.equal(get('tribes/t1/members/mem').status, 'removed'); assert.equal(get('tribes/t1').memberCount, 1);
  assert.deepEqual({ ...get('tribes/t1').lastMembershipChange, at: 0 }, { uid: 'mem', kind: 'remove', at: 0 });
  await rejects(svc.removeMember('t1', 'mem'), /Not an active/); await rejects(svc.removeMember('t1', 'me'), /leaveTribe/);
  seed('tribes/t1/members/mod', M('mod', 'moderator')); seed('tribes/t1/members/m2', M('m2'));
  auth.currentUser = { uid: 'mod', emailVerified: true };
  await rejects(svc.removeMember('t1', 'me'), /cannot remove/); await svc.removeMember('t1', 'm2');
  auth.currentUser = { uid: 'm2', emailVerified: true }; await rejects(svc.removeMember('t1', 'mod'), /cannot remove|Not an active/);
});

test('leave: member -1; owner with others refused; last owner archives (count 0)', async () => {
  auth.currentUser = { uid: 'mem', emailVerified: true }; await svc.leaveTribe('t1');
  assert.equal(get('tribes/t1/members/mem').status, 'left'); assert.equal(get('tribes/t1').memberCount, 1);
  auth.currentUser = { uid: 'me', emailVerified: true }; seed('tribes/t1', T({ memberCount: 2 }));
  await rejects(svc.leaveTribe('t1'), /Transfer ownership/);
  seed('tribes/t1', T({ memberCount: 1 })); await svc.leaveTribe('t1');
  assert.deepEqual({ s: get('tribes/t1').status, c: get('tribes/t1').memberCount }, { s: 'archived', c: 0 });
  await rejects(svc.leaveTribe('t1'), /not a member/);
});

test('roles: owner toggles moderator; transfer writes target owner + self moderator + marker, count untouched', async () => {
  await svc.setMemberRole('t1', 'mem', 'moderator'); assert.equal(get('tribes/t1/members/mem').role, 'moderator'); assert.equal(log.length, 1);
  reset(); seed('users/me', { name: 'Me' }); seed('tribes/t1', T()); seed('tribes/t1/members/me', M('me', 'owner')); seed('tribes/t1/members/mem', M('mem'));
  await svc.setMemberRole('t1', 'mem', 'owner');
  assert.equal(get('tribes/t1/members/mem').role, 'owner'); assert.equal(get('tribes/t1/members/me').role, 'moderator');
  assert.equal(get('tribes/t1').lastMembershipChange.kind, 'transfer'); assert.equal(get('tribes/t1').memberCount, 2);
  assert.ok(!('memberCount' in wrote('tribes/t1')[0].data));
  await rejects(svc.setMemberRole('t1', 'mem', 'member'), /Only the owner/);   // 'me' is now just a moderator
});
test('roles: non-owner and invalid role changes are refused', async () => {
  auth.currentUser = { uid: 'mem', emailVerified: true }; await rejects(svc.setMemberRole('t1', 'me', 'member'), /Only the owner/);
  auth.currentUser = { uid: 'me', emailVerified: true };
  await rejects(svc.setMemberRole('t1', 'mem', 'admin'), /Invalid role/); await rejects(svc.setMemberRole('t1', 'me', 'member'), /Invalid role/);
  assert.equal(log.length, 0);
});

test('archive: owner only; writes only status + updatedAt', async () => {
  auth.currentUser = { uid: 'mem', emailVerified: true }; await rejects(svc.archiveTribe('t1'), /Only the owner/);
  auth.currentUser = { uid: 'me', emailVerified: true }; await svc.archiveTribe('t1');
  assert.deepEqual(Object.keys(log[0].data).sort(), ['status', 'updatedAt']); assert.equal(get('tribes/t1').status, 'archived');
});
test('every membership operation requires a verified signed-in user', async () => {
  for (const u of [null, { uid: 'me', emailVerified: false }]) {
    auth.currentUser = u;
    for (const fn of [() => svc.removeMember('t1', 'mem'), () => svc.leaveTribe('t1'), () => svc.archiveTribe('t1'), () => svc.setMemberRole('t1', 'mem', 'moderator'), () => svc.inviteToTribe('t1', 'u2'), () => svc.respondToInvite('t1_me', true), () => svc.respondToJoinRequest('t1', 'u2', true)])
      await assert.rejects(fn(), /sign in|verify your email/i);
  }
  assert.equal(log.length, 0);
});
