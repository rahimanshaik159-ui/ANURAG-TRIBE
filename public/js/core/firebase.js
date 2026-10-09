// Firebase initialisation. If firebase-config.js still holds placeholders the app
// stays usable for static pages and shows a clear setup message (no fake data).
import * as F from './fb.js';
import { firebaseConfig } from '../config/firebase-config.js';
import { APP } from '../config/app-config.js';

export const configured = !!firebaseConfig.apiKey && !/YOUR_/.test(firebaseConfig.apiKey) && !/YOUR_/.test(firebaseConfig.projectId);

export let app = null, auth = null, db = null, functions = null;
if (configured) {
  app = F.initializeApp(firebaseConfig);
  if (APP.appCheckSiteKey) {
    try { F.initializeAppCheck(app, { provider: new F.ReCaptchaV3Provider(APP.appCheckSiteKey), isTokenAutoRefreshEnabled: true }); }
    catch (e) { console.warn('App Check init failed', e); }
  }
  auth = F.getAuth(app);
db = F.getFirestore(app);
functions = F.getFunctions(app, APP.functionsRegion);

// Connect only when explicitly running local emulator testing.
if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
  F.connectAuthEmulator(auth, 'http://127.0.0.1:9099', {
    disableWarnings: true
  });
  F.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  F.connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
}

const FRIENDLY = {
  'functions/unauthenticated': 'Please sign in again.',
  'functions/permission-denied': "You don't have permission to do that.",
  'functions/failed-precondition': null, 'functions/invalid-argument': null, 'functions/already-exists': null,
  'functions/resource-exhausted': null, 'functions/not-found': null,
  'permission-denied': "You don't have permission to do that (or your email isn't verified yet).",
  'unavailable': 'Network problem. Check your connection and try again.',
};
/** Turn Firebase errors into messages a student can act on. */
export function friendlyError(e) {
  const code = e && e.code ? e.code : '';
  if (code in FRIENDLY && FRIENDLY[code]) return FRIENDLY[code];
  if (code.startsWith('functions/') && e.message) return e.message;
  const auth = {
    'auth/invalid-credential': 'Email or password is incorrect.', 'auth/wrong-password': 'Email or password is incorrect.',
    'auth/user-not-found': 'Email or password is incorrect.', 'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/weak-password': 'Choose a stronger password.', 'auth/too-many-requests': 'Too many attempts. Wait a bit and try again.',
    'auth/network-request-failed': 'Network problem. Check your connection.', 'auth/invalid-email': 'Enter a valid email.',
    'auth/user-disabled': 'This account has been suspended. Contact an admin.',
  };
  if (auth[code]) return auth[code];
  if (code === 'failed-precondition' && /index/i.test(e.message || '')) return 'This view needs a database index. Deploy firestore.indexes.json (see README).';
  return (e && e.message) ? e.message.replace(/^Firebase: /, '') : 'Something went wrong.';
}

/** Call a Cloud Function (callable). */
export async function callFn(name, data = {}) {
  if (!configured) throw new Error('Firebase is not configured yet.');
  const res = await F.httpsCallable(functions, name)(data);
  return res.data;
}
export { F };
