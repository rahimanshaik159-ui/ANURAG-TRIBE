
import { auth, db, F } from './firebase.js';

const SUPER_ADMIN_UID = 'o5fX7pb3qbRTpA2GGE9SeBVL2up2';

export async function getUserRole(user = auth.currentUser) {
  if (!user || !user.emailVerified) return 'guest';

  if (user.uid === SUPER_ADMIN_UID) {
    return 'superAdmin';
  }

  const userRef = F.doc(db, 'users', user.uid);
  const snapshot = await F.getDoc(userRef);

  if (!snapshot.exists()) return 'user';

  const role = snapshot.data().role;

  return role === 'admin' ? 'admin' : 'user';
}

export function canManageUsers(role) {
  return role === 'superAdmin';
}

export function canModerateContent(role) {
  return role === 'superAdmin' || role === 'admin';
}
