// Tribe membership rules (no Cloud Functions): REQUIRES the Firestore emulator.   npm run test:rules
// Every write mirrors what public/js/services/tribes.js sends, and then tampers with it.
import test, { before, after, beforeEach } from 'node:test';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, writeBatch, Timestamp } from 'firebase/firestore';

let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'anurag-tribe-membership', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const as = (uid, claims = {}) => env.authenticatedContext(uid, { email_verified: true, ...claims }).firestore();
const unverified = (uid) => env.authenticatedContext(uid, { email_verified: false }).firestore();
const seed = (fn) => env.withSecurityRulesDisabled(async (c) => fn(c.firestore()));
const ts = () => serverTimestamp();
const mc = (uid, kind) => ({ uid, kind, at: ts() });

const P = (db) => ({
  t: doc(db, 'tribes', 't1'), m: (u) => doc(db, 'tribes', 't1', 'members', u),
  jr: (u) => doc(db, 'tribes', 't1', 'joinRequests', u), inv: (u) => doc(db, 'tribeInvites', `t1_${u}`),
});
const tribeDoc = (o = {}) => ({ name: 'Film', nameLower: 'film', description: 'A tribe for films', goal: '', category: 'filmmaking', skills: [], interests: [], creatorUid: 'own', privacy: 'public', idealMemberCount: 6, memberCount: 3, status: 'active', projectFocus: '', createdAt: Timestamp.now(), updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now(), ...o });
const memberDoc = (uid, role = 'member', status = 'active') => ({ uid, role, status, joinedAt: Timestamp.now(), lastReadAt: Timestamp.now() });
const user = (name, o = {}) => ({ name, visibility: 'campus', ...o });

async function base({ count = 3, tribe = {} } = {}) {
  await seed(async (s) => {
    await setDoc(doc(s, 'tribes', 't1'), tribeDoc({ memberCount: count, ...tribe }));
    for (const [u, r] of [['own', 'owner'], ['mod', 'moderator'], ['mem', 'member']]) { await setDoc(doc(s, 'tribes', 't1', 'members', u), memberDoc(u, r)); await setDoc(doc(s, 'users', u), user(`N-${u}`)); }
    for (const u of ['u2', 'u3']) await setDoc(doc(s, 'users', u), user(`N-${u}`));
    await setDoc(doc(s, 'users', 'hid'), user('Hidden', { visibility: 'hidden' }));
    await setDoc(doc(s, 'users', 'sus'), user('Suspended', { accountStatus: 'suspended' }));
  });
}
const pendingRequest = (u, over = {}) => seed((s) => setDoc(doc(s, 'tribes', 't1', 'joinRequests', u), { requestId: u, uid: u, message: '', status: 'pending', createdAt: Timestamp.now(), updatedAt: Timestamp.now(), ...over }));
const pendingInvite = (u, over = {}) => seed((s) => setDoc(doc(s, 'tribeInvites', `t1_${u}`), { tribeId: 't1', tribeName: 'Film', inviteeUid: u, inviterUid: 'own', inviterName: 'N-own', message: '', status: 'pending', createdAt: Timestamp.now(), ...over }));

// ---- write sets (same shape as services/tribes.js) -------------------------------------------------
const newMember = (o = {}) => ({ uid: 'u2', role: 'member', status: 'active', joinedAt: ts(), lastReadAt: ts(), ...o });
function acceptRequest(db, u = 'u2', o = {}) {
  const p = P(db); const b = writeBatch(db);
  b.set(p.m(u), o.member || newMember({ uid: u }));
  b.update(p.t, o.tribe || { memberCount: 4, lastMembershipChange: mc(u, 'join'), updatedAt: ts() });
  if (!o.skipRequest) b.update(p.jr(u), { status: 'accepted', updatedAt: ts() });
  return b.commit();
}
function acceptInvite(db, u = 'u2', o = {}) {
  const p = P(db); const b = writeBatch(db);
  b.set(p.m(u), o.member || newMember({ uid: u }));
  b.update(p.t, o.tribe || { memberCount: 4, lastMembershipChange: mc(u, 'join'), updatedAt: ts() });
  if (!o.skipInvite) b.update(p.inv(u), { status: 'accepted', respondedAt: ts() });
  return b.commit();
}
function removeMember(db, target, o = {}) {
  const p = P(db); const b = writeBatch(db);
  b.update(p.m(target), { status: 'removed', removedAt: ts() });
  b.update(p.t, o.tribe || { memberCount: 2, lastMembershipChange: mc(target, 'remove'), updatedAt: ts() });
  return b.commit();
}
function leave(db, uid, o = {}) {
  const p = P(db); const b = writeBatch(db);
  b.update(p.m(uid), { status: 'left', leftAt: ts() });
  b.update(p.t, o.tribe || { memberCount: 2, lastMembershipChange: mc(uid, 'leave'), updatedAt: ts() });
  return b.commit();
}
function transfer(db, to, o = {}) {
  const p = P(db); const b = writeBatch(db);
  b.update(p.m(to), { role: 'owner' });
  if (!o.skipDemote) b.update(p.m('own'), { role: 'moderator' });
  b.update(p.t, o.tribe || { lastMembershipChange: mc(to, 'transfer'), updatedAt: ts() });
  return b.commit();
}
const invite = (db, u = 'u2', o = {}) => setDoc(doc(db, 'tribeInvites', o.id || `t1_${u}`), { tribeId: 't1', tribeName: 'Film', inviteeUid: u, inviterUid: o.by || 'own', inviterName: 'N-own', message: 'hi', status: 'pending', createdAt: ts(), ...(o.data || {}) });

// ============================================================ creating a Tribe
const newTribeData = (o = {}) => ({ name: 'New Tribe', nameLower: 'new tribe', description: 'A brand new tribe', goal: '', category: 'tech', skills: [], interests: [], privacy: 'public', idealMemberCount: 6, projectFocus: '', creatorUid: 'c1', memberCount: 1, status: 'active', createdAt: ts(), updatedAt: ts(), lastActivityAt: ts(), ...o });
function createTribe(db, o = {}) {
  const b = writeBatch(db);
  b.set(doc(db, 'tribes', 'nt'), o.tribe || newTribeData());
  if (!o.skipOwner) b.set(doc(db, 'tribes', 'nt', 'members', o.ownerUid || 'c1'), o.member || { uid: o.ownerUid || 'c1', role: 'owner', status: 'active', joinedAt: ts(), lastReadAt: ts() });
  return b.commit();
}
test('create Tribe: verified user succeeds; unverified, suspended and signed-out users fail', async () => {
  await assertSucceeds(createTribe(as('c1')));
  await env.clearFirestore();
  await assertFails(createTribe(unverified('c1')));
  await assertFails(createTribe(as('c1', { suspended: true })));
  await assertFails(createTribe(env.unauthenticatedContext().firestore()));
});
test('create Tribe: forged counts, creator, status, extra fields, missing/incorrect owner doc all fail', async () => {
  const c = as('c1');
  await assertFails(createTribe(c, { tribe: newTribeData({ memberCount: 5 }) }));
  await assertFails(createTribe(c, { tribe: newTribeData({ creatorUid: 'someoneElse' }) }));
  await assertFails(createTribe(c, { tribe: newTribeData({ status: 'archived' }) }));
  await assertFails(createTribe(c, { tribe: newTribeData({ lastMembershipChange: mc('c1', 'join') }) }));
  await assertFails(createTribe(c, { tribe: newTribeData({ extra: 1 }) }));
  await assertFails(createTribe(c, { tribe: newTribeData({ name: 'ab', nameLower: 'ab' }) }));
  await assertFails(createTribe(c, { skipOwner: true }));
  await assertFails(createTribe(c, { member: { uid: 'c1', role: 'moderator', status: 'active', joinedAt: ts(), lastReadAt: ts() } }));
  await assertFails(createTribe(c, { ownerUid: 'victim' }));                 // owner doc for somebody else
});
test('create Tribe: nobody can add an owner document to an existing Tribe', async () => {
  await base();
  await assertFails(setDoc(doc(as('u2'), 'tribes', 't1', 'members', 'u2'), { uid: 'u2', role: 'owner', status: 'active', joinedAt: ts(), lastReadAt: ts() }));
});

// ============================================================ join requests
test('join request: accepted by an owner or moderator; atomically adds member, +1 count, marker', async () => {
  await base(); await pendingRequest('u2');
  await assertSucceeds(acceptRequest(as('own')));
  await env.clearFirestore(); await base(); await pendingRequest('u2');
  await assertSucceeds(acceptRequest(as('mod')));
});
test('join request: ordinary member, outsider, unverified and suspended leaders cannot accept', async () => {
  await base(); await pendingRequest('u2');
  for (const db of [as('mem'), as('u3'), unverified('own'), as('own', { suspended: true })]) await assertFails(acceptRequest(db));
});
test('join request: tampered accept writes fail (count, marker, role, request state, other user)', async () => {
  await base(); await pendingRequest('u2');
  const o = as('own');
  await assertFails(acceptRequest(o, 'u2', { tribe: { memberCount: 5, lastMembershipChange: mc('u2', 'join'), updatedAt: ts() } }));   // +2
  await assertFails(acceptRequest(o, 'u2', { tribe: { memberCount: 3, lastMembershipChange: mc('u2', 'join'), updatedAt: ts() } }));   // +0
  await assertFails(acceptRequest(o, 'u2', { tribe: { memberCount: 4, updatedAt: ts() } }));                                            // no marker
  await assertFails(acceptRequest(o, 'u2', { tribe: { memberCount: 4, lastMembershipChange: mc('u3', 'join'), updatedAt: ts() } }));   // marker names someone else
  await assertFails(acceptRequest(o, 'u2', { tribe: { memberCount: 4, lastMembershipChange: { uid: 'u2', kind: 'join', at: Timestamp.now() }, updatedAt: ts() } })); // stale / client-chosen time
  await assertFails(acceptRequest(o, 'u2', { member: newMember({ role: 'moderator' }) }));                                              // role escalation
  await assertFails(acceptRequest(o, 'u2', { member: newMember({ role: 'owner' }) }));
  await assertFails(acceptRequest(o, 'u2', { skipRequest: true }));                                                                     // request not accepted
  await assertFails(acceptRequest(o, 'u3'));                                                                                            // u3 never asked
});
test('join request: cannot be accepted twice, into a suspended Tribe, or beyond the hard cap', async () => {
  await base(); await pendingRequest('u2', { status: 'accepted' });
  await assertFails(acceptRequest(as('own')));
  await env.clearFirestore(); await base({ tribe: { status: 'suspended' } }); await pendingRequest('u2');
  await assertFails(acceptRequest(as('own')));
  await env.clearFirestore(); await base(); await pendingRequest('u2');
  await seed((s) => setDoc(doc(s, 'settings', 'platform'), { tribeHardCap: 3 }));
  await assertFails(acceptRequest(as('own')));
  await seed((s) => setDoc(doc(s, 'settings', 'platform'), { tribeHardCap: 4 }));
  await assertSucceeds(acceptRequest(as('own')));
});
test('join request: a count bump or a member document alone (without the other half) is refused', async () => {
  await base(); await pendingRequest('u2');
  await assertFails(updateDoc(P(as('own')).t, { memberCount: 4, lastMembershipChange: mc('u2', 'join'), updatedAt: ts() }));
  await assertFails(updateDoc(P(as('own')).t, { memberCount: 99, updatedAt: ts() }));
  await assertFails(setDoc(P(as('own')).m('u2'), newMember()));
  await assertFails(setDoc(P(as('u2')).m('u2'), newMember()));              // self-join without invitation
});
test('join request: leader may decline; ordinary members may not; decline never touches membership', async () => {
  await base(); await pendingRequest('u2');
  await assertFails(updateDoc(P(as('mem')).jr('u2'), { status: 'rejected', updatedAt: ts() }));
  await assertFails(updateDoc(P(as('u2')).jr('u2'), { status: 'accepted', updatedAt: ts() }));
  await assertSucceeds(updateDoc(P(as('mod')).jr('u2'), { status: 'rejected', updatedAt: ts() }));
  await assertFails(updateDoc(P(as('own')).jr('u2'), { status: 'accepted', updatedAt: ts() }));         // already decided
});
test('join request: leader cannot mark accepted without the member becoming active', async () => {
  await base(); await pendingRequest('u2');
  await assertFails(updateDoc(P(as('own')).jr('u2'), { status: 'accepted', updatedAt: ts() }));
});
test('join request: simultaneous accepts cannot corrupt memberCount (second writer is refused)', async () => {
  await base(); await pendingRequest('u2'); await pendingRequest('u3');
  const o = as('own'); const m = as('mod');
  const mk = (db, u) => { const p = P(db); const b = writeBatch(db); b.set(p.m(u), newMember({ uid: u })); b.update(p.t, { memberCount: 4, lastMembershipChange: mc(u, 'join'), updatedAt: ts() }); b.update(p.jr(u), { status: 'accepted', updatedAt: ts() }); return b; };
  const b1 = mk(o, 'u2'); const b2 = mk(m, 'u3');                          // both built from count 3
  await assertSucceeds(b1.commit());
  await assertFails(b2.commit());                                          // count is now 4, so 3 -> 4 is no longer +1
  await assertSucceeds(getDoc(P(o).t));
});
test('re-join: a member who left (or was removed) comes back only as a plain member', async () => {
  await base({ count: 2 }); await seed((s) => setDoc(doc(s, 'tribes', 't1', 'members', 'u2'), { uid: 'u2', role: 'moderator', status: 'left', joinedAt: Timestamp.now(), leftAt: Timestamp.now() }));
  await pendingRequest('u2');
  const rejoin = (db, role) => { const p = P(db); const b = writeBatch(db); b.update(p.m('u2'), { role, status: 'active', joinedAt: ts(), lastReadAt: ts() }); b.update(p.t, { memberCount: 3, lastMembershipChange: mc('u2', 'join'), updatedAt: ts() }); b.update(p.jr('u2'), { status: 'accepted', updatedAt: ts() }); return b.commit(); };
  await assertFails(rejoin(as('own'), 'moderator'));
  await assertFails(rejoin(as('own'), 'owner'));
  await assertSucceeds(rejoin(as('own'), 'member'));
});

// ============================================================ invitations
test('invite: leaders (owner, moderator) can invite an available student; the document id is deterministic', async () => {
  await base(); await assertSucceeds(invite(as('own')));
  await env.clearFirestore(); await base(); await assertSucceeds(invite(as('mod'), 'u3', { by: 'mod', data: { inviterName: 'N-mod' } }));
});
test('invite: ordinary member, outsider, self-invite, unverified and suspended callers fail', async () => {
  await base();
  await assertFails(invite(as('mem'), 'u2', { by: 'mem', data: { inviterName: 'N-mem' } }));
  await assertFails(invite(as('u3'), 'u2', { by: 'u3', data: { inviterName: 'N-u3' } }));
  await assertFails(invite(as('own'), 'own'));
  await assertFails(invite(unverified('own')));
  await assertFails(invite(as('own', { suspended: true })));
});
test('invite: hidden, suspended, missing, already-active invitees and inactive Tribes are refused', async () => {
  await base(); const o = as('own');
  await assertFails(invite(o, 'hid')); await assertFails(invite(o, 'sus')); await assertFails(invite(o, 'ghost')); await assertFails(invite(o, 'mem'));
  await env.clearFirestore(); await base({ tribe: { status: 'suspended' } }); await assertFails(invite(as('own')));
});
test('invite: forged inviter on behalf of someone else, wrong names, id mismatch, extra fields, long message all fail', async () => {
  await base(); const o = as('own');
  await assertFails(invite(o, 'u2', { data: { inviterUid: 'mod' } }));
  await assertFails(invite(o, 'u2', { data: { inviterName: 'The Dean' } }));
  await assertFails(invite(o, 'u2', { data: { tribeName: 'Other Tribe' } }));
  await assertFails(invite(o, 'u2', { id: 't1_u3' }));
  await assertFails(invite(o, 'u2', { data: { status: 'accepted' } }));
  await assertFails(invite(o, 'u2', { data: { extra: true } }));
  await assertFails(invite(o, 'u2', { data: { message: 'x'.repeat(201) } }));
  await assertFails(invite(o, 'u2', { data: { createdAt: Timestamp.now() } }));
});
test('invite: a duplicate pending invitation is impossible; re-inviting after an answer is allowed', async () => {
  await base(); await pendingInvite('u2');
  await assertFails(invite(as('own'), 'u2'));                                 // same id, still pending
  await assertFails(invite(as('mod'), 'u2', { by: 'mod', data: { inviterName: 'N-mod' } }));
  await seed((s) => setDoc(doc(s, 'tribeInvites', 't1_u2'), { tribeId: 't1', tribeName: 'Film', inviteeUid: 'u2', inviterUid: 'own', inviterName: 'N-own', message: '', status: 'declined', createdAt: Timestamp.now() }));
  await assertSucceeds(invite(as('own'), 'u2'));
});
test('invite: only the inviter and invitee can read it; the invitee can read a private Tribe while invited', async () => {
  await base({ tribe: { privacy: 'private' } }); await pendingInvite('u2');
  await assertSucceeds(getDoc(P(as('u2')).inv('u2'))); await assertSucceeds(getDoc(P(as('own')).inv('u2')));
  await assertFails(getDoc(P(as('u3')).inv('u2'))); await assertFails(getDoc(P(as('mod')).inv('u2')));
  await assertSucceeds(getDoc(P(as('u2')).t)); await assertFails(getDoc(P(as('u3')).t));
});
test('invite: invitee accepts atomically (member + count + marker); tampering fails', async () => {
  await base(); await pendingInvite('u2');
  const u = as('u2');
  await assertFails(acceptInvite(u, 'u2', { skipInvite: true }));                                                                          // invite not accepted
  await assertFails(acceptInvite(u, 'u2', { member: newMember({ role: 'moderator' }) }));
  await assertFails(acceptInvite(u, 'u2', { tribe: { memberCount: 9, lastMembershipChange: mc('u2', 'join'), updatedAt: ts() } }));
  await assertFails(acceptInvite(u, 'u2', { tribe: { memberCount: 4, updatedAt: ts() } }));
  await assertFails(acceptInvite(as('u3'), 'u2'));                                                                                         // somebody else acting for u2
  await assertFails(acceptInvite(as('u3'), 'u3'));                                                                                         // u3 holds no invitation
  await assertSucceeds(acceptInvite(u, 'u2'));
});
test('invite: a second response is refused; the invitee can decline; others cannot respond', async () => {
  await base(); await pendingInvite('u2');
  await assertFails(updateDoc(P(as('u3')).inv('u2'), { status: 'declined', respondedAt: ts() }));
  await assertFails(updateDoc(P(as('own')).inv('u2'), { status: 'declined', respondedAt: ts() }));
  await assertFails(updateDoc(P(as('u2')).inv('u2'), { status: 'accepted', respondedAt: ts() }));         // no member doc in the write
  await assertSucceeds(updateDoc(P(as('u2')).inv('u2'), { status: 'declined', respondedAt: ts() }));
  await assertFails(updateDoc(P(as('u2')).inv('u2'), { status: 'declined', respondedAt: ts() }));         // repeated
  await assertFails(acceptInvite(as('u2'), 'u2'));                                                         // accepting a declined invite
});
test('invite: acceptance is refused for a suspended Tribe and at the hard cap', async () => {
  await base({ tribe: { status: 'suspended' } }); await pendingInvite('u2');
  await assertFails(acceptInvite(as('u2')));
  await env.clearFirestore(); await base(); await pendingInvite('u2');
  await seed((s) => setDoc(doc(s, 'settings', 'platform'), { tribeHardCap: 3 }));
  await assertFails(acceptInvite(as('u2')));
});
test('invitations cannot be deleted by anyone', async () => {
  await base(); await pendingInvite('u2');
  const { deleteDoc } = await import('firebase/firestore');
  await assertFails(deleteDoc(P(as('own')).inv('u2'))); await assertFails(deleteDoc(P(as('u2')).inv('u2')));
});

// ============================================================ removing members
test('remove: owner removes a member or a moderator; moderator removes only members', async () => {
  await base(); await assertSucceeds(removeMember(as('own'), 'mem'));
  await env.clearFirestore(); await base(); await assertSucceeds(removeMember(as('own'), 'mod'));
  await env.clearFirestore(); await base(); await assertSucceeds(removeMember(as('mod'), 'mem'));
});
test('remove: forbidden pairs (moderator->moderator/owner, owner->owner/self, member->anyone, outsiders, unverified)', async () => {
  await base();
  await assertFails(removeMember(as('mod'), 'own', { tribe: { memberCount: 2, lastMembershipChange: mc('own', 'remove'), updatedAt: ts() } }));
  await assertFails(removeMember(as('mem'), 'mod', { tribe: { memberCount: 2, lastMembershipChange: mc('mod', 'remove'), updatedAt: ts() } }));
  await assertFails(removeMember(as('mem'), 'mem'));
  await assertFails(removeMember(as('own'), 'own', { tribe: { memberCount: 2, lastMembershipChange: mc('own', 'remove'), updatedAt: ts() } }));
  await assertFails(removeMember(as('u3'), 'mem'));
  await assertFails(removeMember(unverified('own'), 'mem'));
  await assertFails(removeMember(as('own', { suspended: true }), 'mem'));
});
test('remove: count must drop by exactly one, with a matching marker', async () => {
  await base(); const o = as('own');
  await assertFails(removeMember(o, 'mem', { tribe: { memberCount: 1, lastMembershipChange: mc('mem', 'remove'), updatedAt: ts() } }));
  await assertFails(removeMember(o, 'mem', { tribe: { memberCount: 3, lastMembershipChange: mc('mem', 'remove'), updatedAt: ts() } }));
  await assertFails(removeMember(o, 'mem', { tribe: { memberCount: 2, updatedAt: ts() } }));
  await assertFails(removeMember(o, 'mem', { tribe: { memberCount: 2, lastMembershipChange: mc('mod', 'remove'), updatedAt: ts() } }));
  await assertFails(removeMember(o, 'mem', { tribe: { memberCount: 2, lastMembershipChange: mc('mem', 'leave'), updatedAt: ts() } }));
  await assertFails(updateDoc(P(o).m('mem'), { status: 'removed', removedAt: ts() }));                    // member doc alone
  await assertFails(updateDoc(P(o).t, { memberCount: 2, lastMembershipChange: mc('mem', 'remove'), updatedAt: ts() })); // tribe doc alone
});
test('remove: removed members lose chat access', async () => {
  await base(); await seed((s) => setDoc(doc(s, 'tribes', 't1', 'messages', 'x'), { senderUid: 'own', text: 'hi', type: 'text', createdAt: Timestamp.now() }));
  await assertSucceeds(getDoc(doc(as('mem'), 'tribes', 't1', 'messages', 'x')));
  await removeMember(as('own'), 'mem');
  await assertFails(getDoc(doc(as('mem'), 'tribes', 't1', 'messages', 'x')));
});

// ============================================================ leaving
test('leave: a member and a moderator can leave; count drops by one', async () => {
  await base(); await assertSucceeds(leave(as('mem'), 'mem'));
  await env.clearFirestore(); await base(); await assertSucceeds(leave(as('mod'), 'mod'));
});
test('leave: cannot leave on behalf of others, skip the count, or leave twice', async () => {
  await base();
  await assertFails(leave(as('mem'), 'mod', { tribe: { memberCount: 2, lastMembershipChange: mc('mod', 'leave'), updatedAt: ts() } }));
  await assertFails(leave(as('mem'), 'mem', { tribe: { memberCount: 3, lastMembershipChange: mc('mem', 'leave'), updatedAt: ts() } }));
  await assertFails(leave(as('mem'), 'mem', { tribe: { memberCount: 1, lastMembershipChange: mc('mem', 'leave'), updatedAt: ts() } }));
  await assertFails(leave(unverified('mem'), 'mem'));
  await assertSucceeds(leave(as('mem'), 'mem'));
  await assertFails(leave(as('mem'), 'mem', { tribe: { memberCount: 1, lastMembershipChange: mc('mem', 'leave'), updatedAt: ts() } }));
});
test('leave: an owner with other members cannot leave; the last owner leaves and the Tribe is archived', async () => {
  await base(); await assertFails(leave(as('own'), 'own'));
  await assertFails(leave(as('own'), 'own', { tribe: { memberCount: 2, lastMembershipChange: mc('own', 'leave'), updatedAt: ts() } }));
  await env.clearFirestore(); await base({ count: 1 });
  await seed(async (s) => { await setDoc(doc(s, 'tribes', 't1', 'members', 'mod'), memberDoc('mod', 'moderator', 'left')); await setDoc(doc(s, 'tribes', 't1', 'members', 'mem'), memberDoc('mem', 'member', 'left')); });
  const lastLeave = (db, tribe) => { const p = P(db); const b = writeBatch(db); b.update(p.m('own'), { status: 'left', leftAt: ts() }); b.update(p.t, tribe); return b.commit(); };
  await assertFails(lastLeave(as('own'), { memberCount: 0, lastMembershipChange: mc('own', 'leave'), updatedAt: ts() }));                 // not archived
  await assertFails(lastLeave(as('own'), { status: 'archived', memberCount: 5, lastMembershipChange: mc('own', 'leave'), updatedAt: ts() }));
  await assertSucceeds(lastLeave(as('own'), { status: 'archived', memberCount: 0, lastMembershipChange: mc('own', 'leave'), updatedAt: ts() }));
});

// ============================================================ roles & ownership
test('roles: the owner toggles member <-> moderator; nobody else can', async () => {
  await base();
  await assertSucceeds(updateDoc(P(as('own')).m('mem'), { role: 'moderator' }));
  await assertSucceeds(updateDoc(P(as('own')).m('mem'), { role: 'member' }));
  await assertFails(updateDoc(P(as('mod')).m('mem'), { role: 'moderator' }));
  await assertFails(updateDoc(P(as('mem')).m('mem'), { role: 'moderator' }));
  await assertFails(updateDoc(P(as('mem')).m('mem'), { role: 'owner' }));
  await assertFails(updateDoc(P(as('mod')).m('mod'), { role: 'owner' }));
  await assertFails(updateDoc(P(as('u3')).m('mem'), { role: 'moderator' }));
  await assertFails(updateDoc(P(unverified('own')).m('mem'), { role: 'moderator' }));
});
test('roles: no direct promotion to owner, no demoting an owner, no role change with other fields', async () => {
  await base();
  await assertFails(updateDoc(P(as('own')).m('mem'), { role: 'owner' }));
  await assertFails(updateDoc(P(as('own')).m('own'), { role: 'member' }));
  await assertFails(updateDoc(P(as('own')).m('mem'), { role: 'moderator', status: 'removed' }));
  await assertFails(updateDoc(P(as('own')).m('mem'), { role: 'admin' }));
});
test('roles: ownership transfer is atomic (new owner + old owner demoted + marker); partial writes fail', async () => {
  await base();
  await assertFails(transfer(as('mod'), 'mem'));
  await assertFails(transfer(as('own'), 'mem', { skipDemote: true }));
  await assertFails(transfer(as('own'), 'mem', { tribe: { updatedAt: ts() } }));
  await assertFails(transfer(as('own'), 'mem', { tribe: { memberCount: 9, lastMembershipChange: mc('mem', 'transfer'), updatedAt: ts() } }));
  await assertFails(transfer(as('own'), 'u3'));                                                         // not a member
  await assertFails(updateDoc(P(as('own')).m('own'), { role: 'moderator' }));                           // lone demotion
  await assertSucceeds(transfer(as('own'), 'mem'));
  await assertFails(updateDoc(P(as('own')).m('mod'), { role: 'member' }));                              // former owner is now only a moderator
});

// ============================================================ archive & edits
test('archive: only the owner of an active Tribe, changing only status', async () => {
  await base();
  await assertFails(updateDoc(P(as('mod')).t, { status: 'archived', updatedAt: ts() }));
  await assertFails(updateDoc(P(as('mem')).t, { status: 'archived', updatedAt: ts() }));
  await assertFails(updateDoc(P(as('own')).t, { status: 'archived', memberCount: 0, updatedAt: ts() }));
  await assertFails(updateDoc(P(as('own')).t, { status: 'suspended', updatedAt: ts() }));
  await assertSucceeds(updateDoc(P(as('own')).t, { status: 'archived', updatedAt: ts() }));
  await assertFails(updateDoc(P(as('own')).t, { status: 'archived', updatedAt: ts() }));                 // already archived
});
test('Tribe edits: leaders edit details but never memberCount, status or the marker; admins cannot edit directly', async () => {
  await base();
  const edit = (db, f) => updateDoc(P(db).t, { ...f, updatedAt: ts() });
  await assertSucceeds(edit(as('mod'), { description: 'A much better description' }));
  await assertFails(edit(as('mem'), { description: 'A much better description' }));
  await assertFails(edit(as('own'), { memberCount: 30 }));
  await assertFails(edit(as('own'), { status: 'suspended' }));
  await assertFails(edit(as('own'), { creatorUid: 'u2' }));
  await assertFails(edit(as('own'), { lastMembershipChange: mc('u2', 'join') }));
  await seed((s) => setDoc(doc(s, 'users', 'adm'), { role: 'admin' }));
  await assertFails(edit(as('adm'), { status: 'suspended' }));                                          // done by the setTribeStatus callable
});
test('members: own lastReadAt only; role/status tampering through the old self-update path fails', async () => {
  await base();
  await assertSucceeds(updateDoc(P(as('mem')).m('mem'), { lastReadAt: ts() }));
  await assertFails(updateDoc(P(as('mem')).m('mem'), { role: 'owner' }));
  await assertFails(updateDoc(P(as('mem')).m('mem'), { lastReadAt: ts(), status: 'left' }));
  await assertFails(updateDoc(P(as('mod')).m('mem'), { lastReadAt: ts() }));
});

// ============================================================ notifications & privacy
test('notifications cannot be forged: not for others, not for yourself, not by leaders', async () => {
  await base();
  const n = (uid) => ({ uid, type: 'tribe_invite', title: 'x', body: '', link: 'x.html', read: false, createdAt: ts() });
  const { addDoc, collection } = await import('firebase/firestore');
  for (const db of [as('own'), as('u2')]) { await assertFails(addDoc(collection(db, 'notifications'), n('u3'))); await assertFails(addDoc(collection(db, 'notifications'), n('u2'))); }
});
test('privacy: a private Tribe and its roster stay hidden from outsiders', async () => {
  await base({ tribe: { privacy: 'private' } });
  await assertFails(getDoc(P(as('u3')).t)); await assertFails(getDoc(P(as('u3')).m('mem')));
  await assertSucceeds(getDoc(P(as('mem')).m('own')));
  await assertSucceeds(getDoc(P(as('u3')).m('u3')));                                                     // own (non-existent) membership is checkable
});
