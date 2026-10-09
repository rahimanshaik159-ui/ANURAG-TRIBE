// Firestore security-rules tests. REQUIRE the Firebase emulator:  npm run test:rules
// (WRITTEN BUT NOT EXECUTED in the authoring sandbox, which could not download the emulator.
//  Treat a first green run on your machine as part of setup.)
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, serverTimestamp, writeBatch, getDocs, query, where, Timestamp } from 'firebase/firestore';

let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'anurag-tribe-test', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const verified = (uid, claims = {}) => env.authenticatedContext(uid, { email_verified: true, ...claims }).firestore();
const unverified = (uid) => env.authenticatedContext(uid, { email_verified: false }).firestore();
const seed = (fn) => env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));
const profile = (uid, over = {}) => ({ uid, name: 'Test User', nameLower: 'test user', username: `user_${uid}`, department: 'CSE', year: 2, avatar: { type: 'none' }, skills: [], interests: [], learning: [], lookingFor: [], currentProjects: [], availability: 'none', social: {}, visibility: 'campus', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...over });
const addTribe = (db, id = 't1', privacy = 'public') => setDoc(doc(db, 'tribes', id), { name: 'Film', nameLower: 'film', description: 'A tribe for films', category: 'filmmaking', skills: [], interests: [], creatorUid: 'owner', privacy, idealMemberCount: 6, memberCount: 2, status: 'active', createdAt: Timestamp.now(), updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now() });
const addMember = (db, t, uid, role = 'member', status = 'active') => setDoc(doc(db, 'tribes', t, 'members', uid), { uid, role, status, joinedAt: Timestamp.now() });

test('registration: unverified user can create own profile+username in one batch, not someone else\'s', async () => {
  const db = unverified('u1'); const b = writeBatch(db);
  b.set(doc(db, 'usernames', 'user_u1'), { uid: 'u1' }); b.set(doc(db, 'users', 'u1'), profile('u1')); await assertSucceeds(b.commit());
  const b2 = writeBatch(db); b2.set(doc(db, 'usernames', 'user_u2'), { uid: 'u2' }); b2.set(doc(db, 'users', 'u2'), profile('u2')); await assertFails(b2.commit());
});
test('users cannot grant themselves a role or accountStatus', async () => {
  await seed((db) => setDoc(doc(db, 'users', 'u1'), { ...profile('u1'), createdAt: Timestamp.now(), updatedAt: Timestamp.now() }));
  const db = verified('u1'); await assertFails(updateDoc(doc(db, 'users', 'u1'), { role: 'superAdmin', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'users', 'u1'), { accountStatus: 'active', updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(db, 'users', 'u1'), { bio: 'hello', updatedAt: serverTimestamp() }));
});
test('profile data validation: bad avatar id and javascript: social links are rejected', async () => {
  await seed((db) => setDoc(doc(db, 'users', 'u1'), { ...profile('u1'), createdAt: Timestamp.now(), updatedAt: Timestamp.now() }));
  const db = verified('u1');
  await assertFails(updateDoc(doc(db, 'users', 'u1'), { avatar: { type: 'preset', id: 'avatar99' }, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'users', 'u1'), { social: { github: 'javascript:alert(1)' }, updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(db, 'users', 'u1'), { avatar: { type: 'preset', id: 'avatar12' }, social: { github: 'https://github.com/x' }, updatedAt: serverTimestamp() }));
});
test('hidden profiles are not readable by others; directory query must filter visibility', async () => {
  await seed(async (db) => { await setDoc(doc(db, 'users', 'h1'), { ...profile('h1', { visibility: 'hidden' }), createdAt: Timestamp.now(), updatedAt: Timestamp.now() }); await setDoc(doc(db, 'users', 'c1'), { ...profile('c1'), createdAt: Timestamp.now(), updatedAt: Timestamp.now() }); });
  const db = verified('u9'); await assertFails(getDoc(doc(db, 'users', 'h1'))); await assertSucceeds(getDoc(doc(db, 'users', 'c1')));
  await assertSucceeds(getDocs(query(collection(db, 'users'), where('visibility', '==', 'campus')))); await assertFails(getDocs(collection(db, 'users')));
});
test('tribes cannot be created by clients (callable only); members subcollection is client read-only', async () => {
  const db = verified('u1'); await assertFails(setDoc(doc(db, 'tribes', 'x'), { name: 'Hacked', nameLower: 'hacked', description: 'long enough text', category: 'tech', skills: [], interests: [], creatorUid: 'u1', privacy: 'public', idealMemberCount: 6, memberCount: 1, status: 'active' }));
  await seed((s) => addTribe(s)); await assertFails(setDoc(doc(db, 'tribes', 't1', 'members', 'u1'), { uid: 'u1', role: 'owner', status: 'active' }));
});
test('private Tribe is invisible to non-members; public Tribe discoverable', async () => {
  await seed(async (s) => { await addTribe(s, 'pub', 'public'); await addTribe(s, 'priv', 'private'); await addMember(s, 'priv', 'm1'); });
  const out = verified('outsider'); await assertSucceeds(getDoc(doc(out, 'tribes', 'pub'))); await assertFails(getDoc(doc(out, 'tribes', 'priv')));
  await assertSucceeds(getDoc(doc(verified('m1'), 'tribes', 'priv'))); await assertFails(getDocs(query(collection(out, 'tribes'), where('status', '==', 'active'))));
});
test('Tribe chat: only active members read/write; sender identity enforced; no media types; size limit', async () => {
  await seed(async (s) => { await addTribe(s); await addMember(s, 't1', 'm1'); await addMember(s, 't1', 'gone', 'member', 'removed'); });
  const m = verified('m1'); const msg = (o = {}) => ({ senderUid: 'm1', text: 'hello', type: 'text', createdAt: serverTimestamp(), ...o });
  await assertSucceeds(addDoc(collection(m, 'tribes', 't1', 'messages'), msg()));
  await assertFails(addDoc(collection(m, 'tribes', 't1', 'messages'), msg({ senderUid: 'someoneelse' })));
  await assertFails(addDoc(collection(m, 'tribes', 't1', 'messages'), msg({ type: 'image', imageData: 'AAAA' })));
  await assertFails(addDoc(collection(m, 'tribes', 't1', 'messages'), msg({ text: 'x'.repeat(2001) })));
  await assertFails(addDoc(collection(m, 'tribes', 't1', 'messages'), msg({ type: 'link', linkUrl: 'javascript:alert(1)' })));
  await assertSucceeds(addDoc(collection(m, 'tribes', 't1', 'messages'), msg({ type: 'link', linkUrl: 'https://github.com/a/b', linkHost: 'github.com', linkProvider: 'github' })));
  await assertFails(getDocs(collection(verified('outsider'), 'tribes', 't1', 'messages'))); await assertFails(addDoc(collection(verified('gone'), 'tribes', 't1', 'messages'), msg({ senderUid: 'gone' })));
  await assertFails(getDocs(collection(verified('admin1', { role: 'admin' }), 'tribes', 't1', 'messages')));   // admins cannot read private chat
});
test('reporting a Tribe message requires a snapshot that matches the real message', async () => {
  await seed(async (s) => { await addTribe(s); await addMember(s, 't1', 'm1'); await addMember(s, 't1', 'm2'); await setDoc(doc(s, 'tribes', 't1', 'messages', 'x'), { senderUid: 'm2', text: 'bad words', type: 'text', createdAt: Timestamp.now() }); });
  const m = verified('m1'); const rep = (text) => ({ reporterUid: 'm1', targetType: 'tribeMessage', targetId: 'x', tribeId: 't1', snapshot: { text, senderUid: 'm2' }, reason: 'harassment', details: '', status: 'open', createdAt: serverTimestamp() });
  await assertFails(addDoc(collection(m, 'reports'), rep('forged text'))); await assertSucceeds(addDoc(collection(m, 'reports'), rep('bad words')));
});
test('join requests: self only, public active Tribe only; leaders (not members) can read; accept is callable-only', async () => {
  await seed(async (s) => { await addTribe(s); await addMember(s, 't1', 'owner', 'owner'); await addMember(s, 't1', 'mem'); });
  const u = verified('u1'); const req = { requestId: 'u1', uid: 'u1', message: 'hi', status: 'pending', createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(u, 'tribes', 't1', 'joinRequests', 'u1'), req)); await assertFails(setDoc(doc(verified('u2'), 'tribes', 't1', 'joinRequests', 'u1'), req));
  await assertSucceeds(getDoc(doc(verified('owner'), 'tribes', 't1', 'joinRequests', 'u1'))); await assertFails(getDoc(doc(verified('mem'), 'tribes', 't1', 'joinRequests', 'u1')));
  await assertFails(updateDoc(doc(u, 'tribes', 't1', 'joinRequests', 'u1'), { status: 'accepted', updatedAt: serverTimestamp() }));
});
test('unverified email cannot write content or read the directory', async () => {
  await seed((s) => setDoc(doc(s, 'users', 'c1'), { ...profile('c1'), createdAt: Timestamp.now(), updatedAt: Timestamp.now() }));
  const db = unverified('u1'); await assertFails(getDoc(doc(db, 'users', 'c1')));
  await assertFails(addDoc(collection(db, 'posts'), { authorUid: 'u1', category: 'idea', text: 'hello there', status: 'visible', likeCount: 0, commentCount: 0, createdAt: serverTimestamp() }));
});
test('counters and notifications are server-only', async () => {
  const db = verified('u1');
  await assertFails(addDoc(collection(db, 'posts'), { authorUid: 'u1', category: 'idea', text: 'hello there', status: 'visible', likeCount: 999, commentCount: 0, createdAt: serverTimestamp() }));
  await assertFails(addDoc(collection(db, 'notifications'), { uid: 'u2', type: 'x', title: 'spam', body: '', link: 'x.html', read: false, createdAt: serverTimestamp() }));
});

test('roles: Firestore admin role permits moderation; only the configured Super Admin can edit platform settings', async () => {
  await seed(async (s) => {
    await setDoc(doc(s, 'posts', 'p1'), {
      authorUid: 'u9',
      category: 'idea',
      text: 'hello there',
      status: 'visible',
      likeCount: 0,
      commentCount: 0,
      createdAt: Timestamp.now()
    });

    await setDoc(doc(s, 'users', 'a1'), { role: 'admin' });
  });

  await assertSucceeds(
    updateDoc(doc(verified('a1'), 'posts', 'p1'), { status: 'hidden' })
  );

  await assertFails(
    updateDoc(doc(verified('u1'), 'posts', 'p1'), { status: 'hidden' })
  );

  await assertFails(
    setDoc(doc(verified('a1'), 'settings', 'platform'), { tribeHardCap: 5 })
  );

  // The configured Super Admin UID must be used here.
  await assertSucceeds(
    setDoc(
      doc(verified('o5fX7pb3qbRTpA2GGE9SeBVL2up2'), 'settings', 'platform'),
      { tribeHardCap: 40 }
    )
  );

  await assertFails(
    updateDoc(
      doc(verified('a1', { suspended: true }), 'posts', 'p1'),
      { status: 'visible' }
    )
  );
});

test('direct transfer: metadata only, 500MB cap per file, <=3 files, context required, recipient-only accept, signaling only for the addressee', async () => {
  await seed(async (s) => { await addTribe(s); await addMember(s, 't1', 'A'); await addMember(s, 't1', 'B'); });
  const A = verified('A'); const base = { senderUid: 'A', recipientUid: 'B', contextType: 'tribe', contextId: 't1', status: 'pending', attempt: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 3600e3) };
  const MB = 1048576; const ok = { ...base, files: [{ name: 'a.mp4', size: 500 * MB, type: 'video/mp4' }], totalBytes: 500 * MB };
  const r = await assertSucceeds(addDoc(collection(A, 'transferSessions'), ok));
  await assertFails(addDoc(collection(A, 'transferSessions'), { ...base, files: [{ name: 'a.mp4', size: 500 * MB + 1 }], totalBytes: 500 * MB + 1 }));
  await assertFails(addDoc(collection(A, 'transferSessions'), { ...base, files: [1, 2, 3, 4].map((i) => ({ name: `f${i}`, size: 10 })), totalBytes: 40 }));
  await assertFails(addDoc(collection(A, 'transferSessions'), { ...ok, recipientUid: 'stranger' }));           // not in the same Tribe
  await assertFails(addDoc(collection(A, 'transferSessions'), { ...ok, fileData: 'AAAA' }));                    // no extra fields (no binary smuggling)
  await assertFails(updateDoc(r, { status: 'accepted', updatedAt: serverTimestamp() }));                         // sender cannot accept for the recipient
  await assertSucceeds(updateDoc(doc(verified('B'), 'transferSessions', r.id), { status: 'accepted', updatedAt: serverTimestamp() }));
  await assertFails(getDoc(doc(verified('C'), 'transferSessions', r.id)));
  await assertSucceeds(addDoc(collection(A, 'transferSessions', r.id, 'signaling'), { from: 'A', to: 'B', kind: 'offer', payload: '{}', attempt: 1, createdAt: serverTimestamp() }));
  await assertFails(addDoc(collection(A, 'transferSessions', r.id, 'signaling'), { from: 'A', to: 'C', kind: 'offer', payload: '{}', attempt: 1, createdAt: serverTimestamp() }));
});
test('voice: only Tribe members create rooms / join; signaling readable only by addressee', async () => {
  await seed(async (s) => { await addTribe(s); await addMember(s, 't1', 'A'); await addMember(s, 't1', 'B'); });
  const A = verified('A'); const room = await assertSucceeds(addDoc(collection(A, 'tribeVoiceRooms'), { tribeId: 't1', createdBy: 'A', status: 'active', createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 3600e3) }));
  await assertFails(addDoc(collection(verified('outsider'), 'tribeVoiceRooms'), { tribeId: 't1', createdBy: 'outsider', status: 'active', createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 3600e3) }));
  await assertSucceeds(setDoc(doc(A, 'tribeVoiceRooms', room.id, 'participants', 'A'), { uid: 'A', joinedAt: serverTimestamp(), lastSeen: serverTimestamp(), muted: false, sessionId: 's' }));
  await assertSucceeds(addDoc(collection(A, 'tribeVoiceRooms', room.id, 'signaling'), { from: 'A', to: 'B', kind: 'offer', payload: '{}', session: 's', createdAt: serverTimestamp() }));
  await assertFails(addDoc(collection(A, 'tribeVoiceRooms', room.id, 'signaling'), { from: 'A', to: 'outsider', kind: 'offer', payload: '{}', session: 's', createdAt: serverTimestamp() }));
});
test('help requests are private to participants; admins cannot read them', async () => {
  await seed((s) => setDoc(doc(s, 'helpRequests', 'h1'), { requesterUid: 'A', targetUid: 'B', helperUid: null, title: 'Need editor', description: 'Please help me', skillsNeeded: [], tribeId: null, isOpen: false, participants: ['A', 'B'], status: 'open', createdAt: Timestamp.now(), updatedAt: Timestamp.now() }));
  await assertSucceeds(getDoc(doc(verified('B'), 'helpRequests', 'h1'))); await assertFails(getDoc(doc(verified('C'), 'helpRequests', 'h1'))); await assertFails(getDoc(doc(verified('adm', { role: 'admin' }), 'helpRequests', 'h1')));
  await assertFails(updateDoc(doc(verified('C'), 'helpRequests', 'h1'), { status: 'accepted', updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(verified('B'), 'helpRequests', 'h1'), { status: 'accepted', updatedAt: serverTimestamp() }));
});

test('showcase: approved is public; pending is private to author/admin; students cannot self-approve', async () => {
  await seed(async (s) => {
    const b = {
      authorUid: 'A',
      title: 'Film',
      description: 'A short film about campus',
      category: 'film',
      links: [],
      status: 'pending',
      featureConsent: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    await setDoc(doc(s, 'showcase', 'p'), b);
    await setDoc(doc(s, 'showcase', 'a'), { ...b, status: 'approved' });
    await setDoc(doc(s, 'users', 'adm'), { role: 'admin' });
  });

  const anon = env.unauthenticatedContext().firestore();

  await assertSucceeds(getDoc(doc(anon, 'showcase', 'a')));
  await assertFails(getDoc(doc(anon, 'showcase', 'p')));

  await assertFails(
    updateDoc(doc(verified('A'), 'showcase', 'p'), {
      status: 'approved',
      updatedAt: serverTimestamp()
    })
  );

  await assertSucceeds(
    updateDoc(doc(verified('adm'), 'showcase', 'p'), {
      status: 'approved',
      adminNote: 'ok',
      updatedAt: serverTimestamp()
    })
  );
});
test('email logs, admin log and unknown collections are inaccessible to clients', async () => {
  const db = verified('a1', { role: 'superAdmin' }); await assertFails(getDoc(doc(db, 'emailLogs', 'x'))); await assertFails(setDoc(doc(db, 'adminLog', 'x'), { a: 1 })); await assertFails(getDoc(doc(db, 'whatever', 'x')));
});
