// Profiles, discovery search, and recommendation candidate loading.
import { F, db } from '../core/firebase.js';
import { page, withId, col, getOne } from './_util.js';
import { parseDiscoveryQuery } from '../lib/discovery.js';
import { DEFAULT_TAXONOMY, buildTaxonomy } from '../lib/taxonomy.js';
import { APP } from '../config/app-config.js';

const cache = new Map();
export async function getUser(uid) {
  if (!uid) return null;
  if (cache.has(uid)) return cache.get(uid);
  let u = null;
  try { u = await getOne('users', uid); } catch (_) { /* hidden or inaccessible */ }
  const val = u || { uid, id: uid, name: 'ANURAG TRIBE student', avatar: { type: 'none' }, skills: [], interests: [], _missing: true };
  val.uid = uid; cache.set(uid, val); return val;
}
export async function getUsers(uids) { return Promise.all([...new Set(uids)].map(getUser)); }
export const invalidateUser = (uid) => cache.delete(uid);

export async function loadTaxonomy() {
  try { const t = await getOne('settings', 'taxonomy'); return buildTaxonomy(t || {}); } catch (_) { return DEFAULT_TAXONOMY; }
}

/** Save profile edits. Handles username change atomically (usernames/{name} reservation). */
export async function saveProfile(uid, oldUsername, p) {
  const b = F.writeBatch(db);
  const now = F.serverTimestamp();
  if (p.username !== oldUsername) {
    const taken = await F.getDoc(F.doc(db, 'usernames', p.username));
    if (taken.exists()) { const e = new Error('That username is taken.'); e.fields = { username: 'That username is taken.' }; throw e; }
    b.set(F.doc(db, 'usernames', p.username), { uid });
    if (oldUsername) b.delete(F.doc(db, 'usernames', oldUsername));
  }
  b.update(F.doc(db, 'users', uid), { ...p, nameLower: p.name.toLowerCase(), updatedAt: now });
  await b.commit();
  invalidateUser(uid);
}
export async function getPrefs(uid) { return (await getOne('userPrivate', uid)) || { emailNotifications: true, emailAnnouncements: true }; }
export const savePrefs = (uid, prefs) => F.setDoc(F.doc(db, 'userPrivate', uid), { ...prefs, updatedAt: F.serverTimestamp() });

/**
 * Discover students. Firestore has no full-text search, so:
 *  - free text that names a skill ("video editors") becomes a skill filter;
 *  - a leftover word is a name/username PREFIX search (merged from two indexed queries);
 *  - department/year/skill filters are applied server-side when there's no text,
 *    and client-side on the (small) result set when there is.
 */
export async function searchStudents({ text = '', department = '', year = 0, skillId = '', cursor = null, size = APP.pageSize } = {}, tax = DEFAULT_TAXONOMY) {
  const parsed = parseDiscoveryQuery(text, tax);
  const skill = skillId || parsed.skillIds[0] || '';
  department = department || parsed.department; year = year || parsed.year;
  const residual = parsed.residual.replace(/^@/, '');

  if (residual.length >= 2) {
    const end = residual + '\uf8ff';
    const [a, b] = await Promise.all([
      F.getDocs(F.query(col('users'), F.where('visibility', '==', 'campus'), F.where('nameLower', '>=', residual), F.where('nameLower', '<=', end), F.orderBy('nameLower'), F.limit(size))),
      F.getDocs(F.query(col('users'), F.where('visibility', '==', 'campus'), F.where('username', '>=', residual), F.where('username', '<=', end), F.orderBy('username'), F.limit(size))),
    ]);
    const map = new Map(); [...a.docs, ...b.docs].forEach((d) => map.set(d.id, withId(d)));
    let items = [...map.values()];
    if (department) items = items.filter((u) => u.department === department);
    if (year) items = items.filter((u) => u.year === year);
    if (skill) items = items.filter((u) => (u.skills || []).includes(skill) || (u.interests || []).includes(skill));
    return { items, cursor: null, hasMore: false, applied: { skill, department, year, text: residual } };
  }
  const cs = [F.where('visibility', '==', 'campus')];
  if (department) cs.push(F.where('department', '==', department));
  if (year) cs.push(F.where('year', '==', year));
  if (skill) cs.push(F.where('skills', 'array-contains', skill));
  cs.push(F.orderBy('createdAt', 'desc'));
  if (cursor) cs.push(F.startAfter(cursor));
  cs.push(F.limit(size));
  const r = await page(F.query(col('users'), ...cs), size);
  return { ...r, applied: { skill, department, year, text: '' } };
}

/** Candidates for recommendations/"I need someone": students sharing any of these skill ids. */
export async function peopleWithSkills(skillIds, { size = 40, field = 'skills' } = {}) {
  const ids = [...new Set(skillIds)].slice(0, 10);
  if (!ids.length) return [];
  const s = await F.getDocs(F.query(col('users'), F.where('visibility', '==', 'campus'), F.where(field, 'array-contains-any', ids), F.orderBy('createdAt', 'desc'), F.limit(size)));
  return s.docs.map(withId);
}
export async function usernameAvailable(name) { return !(await F.getDoc(F.doc(db, 'usernames', name))).exists(); }
