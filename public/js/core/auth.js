// Authentication + session. Roles come ONLY from Firebase custom claims set by Cloud Functions.
// Frontend role checks here are for UX; Firestore rules + functions enforce the real boundary.

import { F, auth, db, configured } from './firebase.js';
import { validateProfile } from '../lib/validators.js';
import { getUserRole } from './roles.js';

export const session = { user: null, profile: null, role: 'user', ready: false, verified: false };
const listeners = new Set();
export const onSession = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };
const emit = () => listeners.forEach((cb) => { try { cb(session); } catch (e) { console.error(e); } });
export const isAdmin = () => session.role === 'admin' || session.role === 'superAdmin';
export const isSuper = () => session.role === 'superAdmin';


async function establish(user) {
  session.user = user;
  session.verified = user.emailVerified;

  try {
    if (user.emailVerified) {
      session.role = await getUserRole(user);
    } else {
      session.role = 'user';
    }
  } catch (error) {
    console.error('Role/profile setup failed:', error);
    session.role = 'user';
  }

  try {
    session.profile = await loadProfile(user.uid);
  } catch (error) {
    console.warn('Profile load failed:', error);
    session.profile = null;
  }
}

export async function loadProfile(uid = session.user && session.user.uid) {
  if (!uid) return null;
  const s = await F.getDoc(F.doc(db, 'users', uid));
  return s.exists() ? { uid: s.id, ...s.data() } : null;
} 

let initPromise;
export function initAuth() {
  if (initPromise) return initPromise;
  initPromise = new Promise((resolve) => {
    if (!configured) { session.ready = true; resolve(session); return; }
    F.setPersistence(auth, F.browserLocalPersistence).catch(() => {});
    F.onAuthStateChanged(auth, async (user) => {
      if (user) await establish(user); else { session.user = null; session.profile = null; session.role = 'user'; session.verified = false; }
      const first = !session.ready; session.ready = true; emit(); if (first) resolve(session);
    });
  });
  return initPromise;
}

const actionSettings = () => ({ url: `${location.origin}/login.html?verified=1`, handleCodeInApp: false });

/** Create account + profile docs (users, userPrivate, usernames) in one atomic batch. */
export async function register({ email, password, profile, emailNotifications = true }) {
  const v = validateProfile(profile);
  if (!v.ok) { const e = new Error(Object.values(v.errors)[0]); e.fields = v.errors; throw e; }
  const p = v.value;
  const taken = await F.getDoc(F.doc(db, 'usernames', p.username));
  if (taken.exists()) { const e = new Error('That username is taken.'); e.fields = { username: 'That username is taken.' }; throw e; }
  const cred = await F.createUserWithEmailAndPassword(auth, email.trim(), password);
  try {
    await F.updateProfile(cred.user, { displayName: p.name });
    const now = F.serverTimestamp();
    const b = F.writeBatch(db);
    b.set(F.doc(db, 'usernames', p.username), { uid: cred.user.uid });
    b.set(F.doc(db, 'users', cred.user.uid), { ...p, uid: cred.user.uid, nameLower: p.name.toLowerCase(), createdAt: now, updatedAt: now });
    b.set(F.doc(db, 'userPrivate', cred.user.uid), { emailNotifications, emailAnnouncements: true, updatedAt: now });
    await b.commit();
  } catch (err) {
    // Username race or rules failure: remove the half-created account so the user can retry cleanly.
    try { await cred.user.delete(); } catch (_) { /* ignore */ }
    if (err.code === 'permission-denied') { const e = new Error('That username was just taken. Please choose another.'); e.fields = { username: 'That username is taken.' }; throw e; }
    throw err;
  }
  await F.sendEmailVerification(cred.user, actionSettings());
  return cred.user;
}
export const login = async (email, password) => (await F.signInWithEmailAndPassword(auth, email.trim(), password)).user;
export async function logout() { sessionStorage.removeItem('at_claims_synced'); await F.signOut(auth); }
export const resetPassword = (email) => F.sendPasswordResetEmail(auth, email.trim(), actionSettings());
export const resendVerification = () => F.sendEmailVerification(auth.currentUser, actionSettings());
/** Re-check verification (user clicked the email link in another tab). */
export async function refreshUser() {
  if (!auth.currentUser) return session;
  await auth.currentUser.reload(); await auth.currentUser.getIdToken(true);
  await establish(auth.currentUser); emit(); return session;
}
export async function refreshProfile() { session.profile = await loadProfile(); emit(); return session.profile; }
