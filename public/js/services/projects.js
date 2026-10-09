// One project system. Tribe projects are `projects` docs with tribeId set (visibility 'tribe').
import { F, db } from '../core/firebase.js';
import { page, withId, col, getOne } from './_util.js';
import { APP } from '../config/app-config.js';
import { cleanText, normalizeUrl } from '../lib/validators.js';

export const getProject = (id) => getOne('projects', id);

export async function listCampusProjects({ category = '', skillId = '', cursor = null, size = APP.pageSize } = {}) {
  const cs = [F.where('visibility', '==', 'campus')];
  if (category) cs.push(F.where('category', '==', category));
  if (skillId) cs.push(F.where('skillsNeeded', 'array-contains', skillId));
  cs.push(F.orderBy('updatedAt', 'desc'));
  if (cursor) cs.push(F.startAfter(cursor));
  cs.push(F.limit(size));
  return page(F.query(col('projects'), ...cs), size);
}
export async function projectCandidates(skillIds, size = 30) {
  const ids = [...new Set(skillIds)].slice(0, 10); if (!ids.length) return [];
  const s = await F.getDocs(F.query(col('projects'), F.where('visibility', '==', 'campus'), F.where('skillsNeeded', 'array-contains-any', ids), F.orderBy('updatedAt', 'desc'), F.limit(size)));
  return s.docs.map(withId);
}
export async function listTribeProjects(tribeId) {
  const s = await F.getDocs(F.query(col('projects'), F.where('tribeId', '==', tribeId), F.orderBy('updatedAt', 'desc'), F.limit(50)));
  return s.docs.map(withId);
}
export async function myProjects(uid) {
  const [a, b] = await Promise.all([
    F.getDocs(F.query(col('projects'), F.where('ownerUid', '==', uid), F.orderBy('updatedAt', 'desc'), F.limit(50))),
    F.getDocs(F.query(col('projects'), F.where('memberUids', 'array-contains', uid), F.orderBy('updatedAt', 'desc'), F.limit(50))),
  ]);
  const m = new Map(); [...a.docs, ...b.docs].forEach((d) => m.set(d.id, withId(d)));
  return [...m.values()].sort((x, y) => (y.updatedAt?.toMillis?.() || 0) - (x.updatedAt?.toMillis?.() || 0));
}

export function normalizeLinks(list) {
  return (list || []).map((l) => ({ label: cleanText(l.label || '', 40), url: normalizeUrl(l.url) })).filter((l) => l.url).slice(0, 8);
}
/** Create a project. For a Tribe project pass {tribeId, tribeName}; visibility becomes 'tribe' unless set. */
export async function createProject(uid, p) {
  const tribe = !!p.tribeId;
  const now = F.serverTimestamp();
  const data = {
    ownerUid: uid, title: cleanText(p.title, 100), description: cleanText(p.description, 1500, { multiline: true }),
    category: p.category, skillsNeeded: (p.skillsNeeded || []).slice(0, 10), links: normalizeLinks(p.links), assignments: [],
    visibility: tribe ? (p.visibility === 'campus' ? 'campus' : 'tribe') : 'campus',
    tribeId: tribe ? p.tribeId : null, tribeName: tribe ? p.tribeName || '' : '', memberUids: [uid],
    status: p.status || 'idea', likeCount: 0, commentCount: 0, applicationCount: 0, createdAt: now, updatedAt: now,
  };
  const ref = await F.addDoc(col('projects'), data);
  return ref.id;
}
export function updateProject(id, fields) {
  const f = { ...fields, updatedAt: F.serverTimestamp() };
  if (f.title) f.title = cleanText(f.title, 100);
  if (f.description) f.description = cleanText(f.description, 1500, { multiline: true });
  if (f.links) f.links = normalizeLinks(f.links);
  return F.updateDoc(F.doc(db, 'projects', id), f);
}
export const setProjectStatus = (id, status) => updateProject(id, { status });
export const deleteProject = (id) => F.deleteDoc(F.doc(db, 'projects', id));

export async function applyToProject(project, uid, message) {
  const ex = await F.getDocs(F.query(col('applications'), F.where('projectId', '==', project.id), F.where('applicantUid', '==', uid)));
  if (!ex.empty && ex.docs.some((d) => ['pending', 'accepted'].includes(d.data().status))) throw new Error('You already applied to this project.');
  const now = F.serverTimestamp();
  return F.addDoc(col('applications'), { projectId: project.id, projectTitle: project.title.slice(0, 100), ownerUid: project.ownerUid, applicantUid: uid, message: cleanText(message, 500), status: 'pending', createdAt: now, updatedAt: now });
}
export async function applicationsForOwner(uid) {
  const s = await F.getDocs(F.query(col('applications'), F.where('ownerUid', '==', uid), F.orderBy('createdAt', 'desc'), F.limit(50)));
  return s.docs.map(withId);
}
export async function myApplications(uid) {
  const s = await F.getDocs(F.query(col('applications'), F.where('applicantUid', '==', uid), F.orderBy('createdAt', 'desc'), F.limit(50)));
  return s.docs.map(withId);
}
export async function respondToApplication(app, accept) {
  await F.updateDoc(F.doc(db, 'applications', app.id), { status: accept ? 'accepted' : 'rejected', updatedAt: F.serverTimestamp() });
  if (accept) await F.updateDoc(F.doc(db, 'projects', app.projectId), { memberUids: F.arrayUnion(app.applicantUid), updatedAt: F.serverTimestamp() });
}
export const withdrawApplication = (id) => F.updateDoc(F.doc(db, 'applications', id), { status: 'withdrawn', updatedAt: F.serverTimestamp() });

// Likes: docs under projects/{id}/likes/{uid}; likeCount maintained by a Cloud Function trigger.
export async function hasLiked(col_, id, uid) { return (await F.getDoc(F.doc(db, col_, id, 'likes', uid))).exists(); }
export async function toggleLike(col_, id, uid, liked) {
  const ref = F.doc(db, col_, id, 'likes', uid);
  if (liked) await F.deleteDoc(ref); else await F.setDoc(ref, { uid, createdAt: F.serverTimestamp() });
  return !liked;
}
export async function listComments(targetType, targetId, size = 30) {
  const s = await F.getDocs(F.query(col('comments'), F.where('targetType', '==', targetType), F.where('targetId', '==', targetId), F.orderBy('createdAt', 'asc'), F.limit(size)));
  return s.docs.map(withId);
}
export const addComment = (targetType, targetId, uid, text) => F.addDoc(col('comments'), { targetType, targetId, authorUid: uid, text: cleanText(text, 500), createdAt: F.serverTimestamp() });
export const deleteComment = (id) => F.deleteDoc(F.doc(db, 'comments', id));
