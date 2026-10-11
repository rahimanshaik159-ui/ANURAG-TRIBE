// Tribes: discovery, membership views, join requests, settings, presence, and membership changes.
// Membership CHANGES are direct Firestore writes validated by firestore.rules (no Cloud Functions).
import { F, db, auth } from '../core/firebase.js';
import { page, withId, col, getOne } from './_util.js';
import { APP } from '../config/app-config.js';
import { cleanText } from '../lib/validators.js';
import { inviteDocId, hardCap, canRemove, roleChangeKind, membershipMarker, normalizeTribeInput } from '../lib/tribeLogic.js';

export const getTribe = (id) => getOne('tribes', id);

/** Public Tribe discovery. Queries MUST keep privacy=='public' && status=='active' (matches rules). */
export async function listTribes({ category = '', skillId = '', text = '', cursor = null, size = APP.pageSize } = {}) {
  const base = [F.where('privacy', '==', 'public'), F.where('status', '==', 'active')];
  const t = text.trim().toLowerCase();
  if (t.length >= 2) {
    const q = F.query(col('tribes'), ...base, F.where('nameLower', '>=', t), F.where('nameLower', '<=', t + '\uf8ff'), F.orderBy('nameLower'), F.limit(size));
    const r = await page(q, size); r.hasMore = false; return r;
  }
  const cs = [...base];
  if (category) cs.push(F.where('category', '==', category));
  if (skillId) cs.push(F.where('skills', 'array-contains', skillId));
  cs.push(F.orderBy('lastActivityAt', 'desc'));
  if (cursor) cs.push(F.startAfter(cursor));
  cs.push(F.limit(size));
  return page(F.query(col('tribes'), ...cs), size);
}
/** Candidate Tribes for recommendations (scored client-side by lib/recommend.js). */
export async function tribeCandidates(ids, size = 40) {
  const u = [...new Set(ids)].slice(0, 10);
  const qs = [F.query(col('tribes'), F.where('privacy', '==', 'public'), F.where('status', '==', 'active'), F.orderBy('lastActivityAt', 'desc'), F.limit(20))];
  if (u.length) qs.push(F.query(col('tribes'), F.where('privacy', '==', 'public'), F.where('status', '==', 'active'), F.where('skills', 'array-contains-any', u), F.orderBy('lastActivityAt', 'desc'), F.limit(size)));
  const snaps = await Promise.all(qs.map((q) => F.getDocs(q)));
  const map = new Map(); snaps.forEach((s) => s.docs.forEach((d) => map.set(d.id, withId(d))));
  return [...map.values()];
}

export async function myMemberships(uid) {
  const s = await F.getDocs(F.query(F.collectionGroup(db, 'members'), F.where('uid', '==', uid), F.where('status', '==', 'active')));
  const mems = s.docs.map((d) => ({ tribeId: d.ref.parent.parent.id, ...d.data() }));
  const tribes = await Promise.all(mems.map(async (m) => { try { const t = await getTribe(m.tribeId); return t ? { ...t, myRole: m.role, lastReadAt: m.lastReadAt } : null; } catch (_) { return null; } }));
  return tribes.filter((t) => t && t.status !== 'archived');
}
export async function myMembership(tribeId, uid) {
  const m = await getOne('tribes', tribeId, 'members', uid).catch(() => null);
  return m && m.status === 'active' ? m : null;
}
export async function listMembers(tribeId) {
  const s = await F.getDocs(F.query(col('tribes', tribeId, 'members'), F.where('status', '==', 'active')));
  return s.docs.map(withId);
}
export async function myJoinRequests(uid) {
  const s = await F.getDocs(F.query(F.collectionGroup(db, 'joinRequests'), F.where('uid', '==', uid)));
  return s.docs.map((d) => ({ tribeId: d.ref.parent.parent.id, ...d.data() }));
}
export async function myJoinRequest(tribeId, uid) { return getOne('tribes', tribeId, 'joinRequests', uid).catch(() => null); }
export async function requestToJoin(tribeId, uid, message = '') {
  const ref = F.doc(db, 'tribes', tribeId, 'joinRequests', uid);
  const now = F.serverTimestamp();
  const ex = await F.getDoc(ref);
  if (ex.exists()) return F.updateDoc(ref, { status: 'pending', message, updatedAt: now });
  return F.setDoc(ref, { requestId: uid, uid, message, status: 'pending', createdAt: now, updatedAt: now });
}
export const cancelJoinRequest = (tribeId, uid) => F.updateDoc(F.doc(db, 'tribes', tribeId, 'joinRequests', uid), { status: 'cancelled', message: '', updatedAt: F.serverTimestamp() });
export async function pendingJoinRequests(tribeId) {
  const s = await F.getDocs(F.query(col('tribes', tribeId, 'joinRequests'), F.where('status', '==', 'pending')));
  return s.docs.map(withId);
}
export async function myInvites(uid) {
  const s = await F.getDocs(F.query(col('tribeInvites'), F.where('inviteeUid', '==', uid), F.where('status', '==', 'pending')));
  return s.docs.map(withId);
}
export const updateTribe = (tribeId, fields) => F.updateDoc(F.doc(db, 'tribes', tribeId), { ...fields, nameLower: fields.name.toLowerCase(), updatedAt: F.serverTimestamp() });
export const markRead = (tribeId, uid) => F.updateDoc(F.doc(db, 'tribes', tribeId, 'members', uid), { lastReadAt: F.serverTimestamp() }).catch(() => {});


// ---------------------------------------------------------------------------------------------
// Membership changes. These run DIRECTLY against Firestore (no Cloud Function): each one is a
// transaction/batch whose writes firestore.rules re-validate. The checks below only exist to give
// students clear messages first; the rules are the security boundary.
// memberCount is never trusted from the client: rules allow it to move only by +/-1, together with
// the matching member document, and name the affected person in `lastMembershipChange`.
// ---------------------------------------------------------------------------------------------
const fail = (code, message) => Object.assign(new Error(message), { code, ours: true });
const tribeDoc = (id) => F.doc(db, 'tribes', id);
const memberDoc = (t, u) => F.doc(db, 'tribes', t, 'members', u);
const requestDoc = (t, u) => F.doc(db, 'tribes', t, 'joinRequests', u);
const inviteDoc = (t, u) => F.doc(db, 'tribeInvites', inviteDocId(t, u));
const platformDoc = () => F.doc(db, 'settings', 'platform');
const marker = (uid, kind) => membershipMarker(uid, kind, F.serverTimestamp());

function requireVerifiedUser() {
  const me = auth && auth.currentUser;
  if (!db || !me) throw fail('auth/required', 'Please sign in to continue.');
  if (!me.emailVerified) throw fail('auth/unverified', 'Please verify your email first.');
  return me;
}
/** Run a write; turn the rules' generic denial into a message a student can act on. */
async function guarded(run, deniedMessage) {
  try { return await run(); } catch (e) {
    // Only Firestore's own (generic) denial is rewritten; our specific messages pass through untouched.
    if (e && e.code === 'permission-denied' && !e.ours) throw fail('permission-denied', deniedMessage);
    throw e;
  }
}
const STALE = 'That is no longer possible - the Tribe changed. Refresh and try again.';
const activeRole = (snap) => (snap.exists() && snap.data().status === 'active' ? snap.data().role : null);

/** Write the member document: first join creates it, a re-join re-activates the old one as a plain member. */
function writeJoinedMember(tx, ref, existingSnap, uid) {
  const now = F.serverTimestamp();
  if (existingSnap.exists()) tx.update(ref, { role: 'member', status: 'active', joinedAt: now, lastReadAt: now });
  else tx.set(ref, { uid, role: 'member', status: 'active', joinedAt: now, lastReadAt: now });
}

export async function createTribe(data) {
  const user = requireVerifiedUser();
  const norm = normalizeTribeInput(data);
  if (!norm.ok) throw fail('invalid-argument', Object.values(norm.errors)[0]);
  const profile = await F.getDoc(F.doc(db, 'users', user.uid));
  if (!profile.exists()) throw fail('failed-precondition', 'Please complete your profile first.');
  const tribeRef = F.doc(F.collection(db, 'tribes'));
  const now = F.serverTimestamp();
  const batch = F.writeBatch(db);
  batch.set(tribeRef, { ...norm.value, creatorUid: user.uid, memberCount: 1, status: 'active', createdAt: now, updatedAt: now, lastActivityAt: now });
  batch.set(memberDoc(tribeRef.id, user.uid), { uid: user.uid, role: 'owner', status: 'active', joinedAt: now, lastReadAt: now });
  await guarded(() => batch.commit(), 'You cannot create a Tribe right now. Check that your email is verified and your account is active.');
  return { tribeId: tribeRef.id };
}

export async function respondToJoinRequest(tribeId, uid, accept) {
  const me = requireVerifiedUser();
  if (!tribeId || !uid || typeof accept !== 'boolean') throw fail('invalid-argument', 'tribeId, uid and accept are required.');
  await guarded(() => F.runTransaction(db, async (tx) => {
    const [t, req, mine, target, plat] = await Promise.all([tx.get(tribeDoc(tribeId)), tx.get(requestDoc(tribeId, uid)), tx.get(memberDoc(tribeId, me.uid)), tx.get(memberDoc(tribeId, uid)), tx.get(platformDoc())]);
    if (!t.exists()) throw fail('not-found', 'Tribe not found.');
    if (!['owner', 'moderator'].includes(activeRole(mine))) throw fail('permission-denied', 'Only Tribe leaders can respond.');
    if (!req.exists() || req.data().status !== 'pending') throw fail('failed-precondition', 'No pending request.');
    const now = F.serverTimestamp();
    if (!accept) { tx.update(requestDoc(tribeId, uid), { status: 'rejected', updatedAt: now }); return; }
    const tribe = t.data();
    if (tribe.status !== 'active') throw fail('failed-precondition', 'Tribe is not active.');
    if ((tribe.memberCount || 0) >= hardCap(plat.exists() ? plat.data() : null)) throw fail('resource-exhausted', 'This Tribe reached the platform member limit.');
    if (target.exists() && target.data().status === 'active') throw fail('failed-precondition', 'This student is already a member.');
    writeJoinedMember(tx, memberDoc(tribeId, uid), target, uid);
    tx.update(tribeDoc(tribeId), { memberCount: (tribe.memberCount || 0) + 1, lastMembershipChange: marker(uid, 'join'), updatedAt: now });
    tx.update(requestDoc(tribeId, uid), { status: 'accepted', updatedAt: now });
  }), STALE);
  return { ok: true };
}

export async function inviteToTribe(tribeId, inviteeUid, message = '') {
  const me = requireVerifiedUser();
  if (!tribeId || !inviteeUid || inviteeUid === me.uid) throw fail('invalid-argument', 'tribeId and inviteeUid required.');
  // Profiles are read outside the transaction: a hidden/missing profile simply means "not available".
  const [mine, invitee] = await Promise.all([F.getDoc(F.doc(db, 'users', me.uid)), F.getDoc(F.doc(db, 'users', inviteeUid)).catch(() => null)]);
  const u = invitee && invitee.exists() ? invitee.data() : null;
  if (!u || u.visibility !== 'campus' || u.accountStatus === 'suspended') throw fail('not-found', 'Student not available for invitation.');
  if (!mine.exists()) throw fail('failed-precondition', 'Please complete your profile first.');
  await guarded(() => F.runTransaction(db, async (tx) => {
    const [t, leader, theirs, existing] = await Promise.all([tx.get(tribeDoc(tribeId)), tx.get(memberDoc(tribeId, me.uid)), tx.get(memberDoc(tribeId, inviteeUid)), tx.get(inviteDoc(tribeId, inviteeUid))]);
    if (!t.exists()) throw fail('not-found', 'Tribe not found.');
    if (!['owner', 'moderator'].includes(activeRole(leader))) throw fail('permission-denied', 'Only Tribe leaders can invite.');
    if (t.data().status !== 'active') throw fail('failed-precondition', 'Tribe is not active.');
    if (activeRole(theirs)) throw fail('already-exists', 'Already a member.');
    if (existing.exists() && existing.data().status === 'pending') throw fail('already-exists', 'An invitation is already pending.');
    tx.set(inviteDoc(tribeId, inviteeUid), {
      tribeId, tribeName: t.data().name, inviteeUid, inviterUid: me.uid, inviterName: mine.data().name,
      message: cleanText(message, 200), status: 'pending', createdAt: F.serverTimestamp(),
    });
  }), 'You cannot invite this student to this Tribe.');
  return { ok: true };
}

export async function respondToInvite(inviteId, accept) {
  const me = requireVerifiedUser();
  if (!inviteId || typeof accept !== 'boolean') throw fail('invalid-argument', 'inviteId and accept are required.');
  let tribeId = null;
  await guarded(() => F.runTransaction(db, async (tx) => {
    const inv = await tx.get(F.doc(db, 'tribeInvites', inviteId));
    if (!inv.exists() || inv.data().inviteeUid !== me.uid || inv.data().status !== 'pending') throw fail('failed-precondition', 'Invitation not available.');
    tribeId = inv.data().tribeId;
    if (inviteId !== inviteDocId(tribeId, me.uid)) throw fail('failed-precondition', 'Invitation not available.');
    const now = F.serverTimestamp();
    if (!accept) { tx.update(inv.ref, { status: 'declined', respondedAt: now }); return; }
    const [t, mine, plat] = await Promise.all([tx.get(tribeDoc(tribeId)), tx.get(memberDoc(tribeId, me.uid)), tx.get(platformDoc())]);
    if (!t.exists() || t.data().status !== 'active') throw fail('failed-precondition', 'Tribe is not active.');
    if ((t.data().memberCount || 0) >= hardCap(plat.exists() ? plat.data() : null)) throw fail('resource-exhausted', 'Tribe member limit reached.');
    if (activeRole(mine)) throw fail('failed-precondition', 'You are already a member of this Tribe.');
    writeJoinedMember(tx, memberDoc(tribeId, me.uid), mine, me.uid);
    tx.update(tribeDoc(tribeId), { memberCount: (t.data().memberCount || 0) + 1, lastMembershipChange: marker(me.uid, 'join'), updatedAt: now });
    tx.update(inv.ref, { status: 'accepted', respondedAt: now });
  }), STALE);
  return { ok: true, tribeId };
}

export async function removeMember(tribeId, uid) {
  const me = requireVerifiedUser();
  if (!tribeId || !uid || uid === me.uid) throw fail('invalid-argument', 'Use leaveTribe to leave.');
  await guarded(() => F.runTransaction(db, async (tx) => {
    const [t, mine, target] = await Promise.all([tx.get(tribeDoc(tribeId)), tx.get(memberDoc(tribeId, me.uid)), tx.get(memberDoc(tribeId, uid))]);
    if (!t.exists()) throw fail('not-found', 'Tribe not found.');
    if (!activeRole(target)) throw fail('not-found', 'Not an active member.');
    if (!canRemove(activeRole(mine), target.data().role)) throw fail('permission-denied', 'You cannot remove this member.');
    const now = F.serverTimestamp();
    tx.update(memberDoc(tribeId, uid), { status: 'removed', removedAt: now });
    tx.update(tribeDoc(tribeId), { memberCount: Math.max(0, (t.data().memberCount || 0) - 1), lastMembershipChange: marker(uid, 'remove'), updatedAt: now });
  }), STALE);
  return { ok: true };
}

export async function leaveTribe(tribeId) {
  const me = requireVerifiedUser();
  if (!tribeId) throw fail('invalid-argument', 'tribeId required.');
  await guarded(() => F.runTransaction(db, async (tx) => {
    const [t, mine] = await Promise.all([tx.get(tribeDoc(tribeId)), tx.get(memberDoc(tribeId, me.uid))]);
    if (!t.exists()) throw fail('not-found', 'Tribe not found.');
    const role = activeRole(mine);
    if (!role) throw fail('failed-precondition', 'You are not a member.');
    const count = t.data().memberCount || 0;
    const now = F.serverTimestamp();
    if (role === 'owner') {
      if (count > 1) throw fail('failed-precondition', 'Transfer ownership to another member before leaving.');
      // Last member leaving: the Tribe is archived (same as before).
      tx.update(tribeDoc(tribeId), { status: 'archived', memberCount: 0, lastMembershipChange: marker(me.uid, 'leave'), updatedAt: now });
    } else {
      tx.update(tribeDoc(tribeId), { memberCount: Math.max(0, count - 1), lastMembershipChange: marker(me.uid, 'leave'), updatedAt: now });
    }
    tx.update(memberDoc(tribeId, me.uid), { status: 'left', leftAt: now });
  }), STALE);
  return { ok: true };
}

export async function setMemberRole(tribeId, uid, role) {
  const me = requireVerifiedUser();
  if (!tribeId || !uid || uid === me.uid) throw fail('invalid-argument', 'Invalid role change.');
  await guarded(() => F.runTransaction(db, async (tx) => {
    const [mine, target] = await Promise.all([tx.get(memberDoc(tribeId, me.uid)), tx.get(memberDoc(tribeId, uid))]);
    if (activeRole(mine) !== 'owner') throw fail('permission-denied', 'Only the owner can change roles.');
    if (!activeRole(target)) throw fail('not-found', 'Not an active member.');
    const kind = roleChangeKind('owner', target.data().role, role);
    if (!kind) throw fail('invalid-argument', 'Invalid role change.');
    const now = F.serverTimestamp();
    if (kind === 'role') { tx.update(memberDoc(tribeId, uid), { role }); return; }
    // Ownership transfer: three documents, one atomic write.
    tx.update(memberDoc(tribeId, uid), { role: 'owner' });
    tx.update(memberDoc(tribeId, me.uid), { role: 'moderator' });
    tx.update(tribeDoc(tribeId), { lastMembershipChange: marker(uid, 'transfer'), updatedAt: now });
  }), STALE);
  return { ok: true };
}

export async function archiveTribe(tribeId) {
  const me = requireVerifiedUser();
  if (!tribeId) throw fail('invalid-argument', 'tribeId required.');
  const mine = await F.getDoc(memberDoc(tribeId, me.uid));
  if (activeRole(mine) !== 'owner') throw fail('permission-denied', 'Only the owner can archive a Tribe.');
  await guarded(() => F.updateDoc(tribeDoc(tribeId), { status: 'archived', updatedAt: F.serverTimestamp() }), 'Only the owner of an active Tribe can archive it.');
  return { ok: true };
}

// Presence heartbeat (online indicator). One tiny doc write per minute while chat is open.
export function startPresence(tribeId, uid) {
  const ref = F.doc(db, 'tribes', tribeId, 'presence', uid);
  const beat = () => { if (!document.hidden) F.setDoc(ref, { uid, lastSeen: F.serverTimestamp() }).catch(() => {}); };
  beat(); const t = setInterval(beat, APP.presenceIntervalMs);
  document.addEventListener('visibilitychange', beat);
  return () => { clearInterval(t); document.removeEventListener('visibilitychange', beat); F.deleteDoc(ref).catch(() => {}); };
}
export function watchPresence(tribeId, cb) {
  return F.onSnapshot(col('tribes', tribeId, 'presence'), (s) => {
    const cutoff = Date.now() - APP.presenceOnlineWindowMs;
    cb(new Set(s.docs.filter((d) => d.data().lastSeen && d.data().lastSeen.toMillis() > cutoff).map((d) => d.id)));
  }, () => cb(new Set()));
}
