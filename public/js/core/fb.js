// Central Firebase SDK wrapper — use one consistent version (11.10.0).

export {
  initializeApp
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';

export {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  setPersistence,
  browserLocalPersistence,
  connectAuthEmulator
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

export {
  getFirestore,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  arrayUnion,
  arrayRemove,
  increment,
  Timestamp,
  getCountFromServer,
  runTransaction,
  connectFirestoreEmulator
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

export {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js';

export {
  initializeAppCheck,
  ReCaptchaV3Provider
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app-check.js';