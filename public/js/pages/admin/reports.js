// Admin overview + report moderation queue.
import { h, clear } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { toast, busy, chip, tabs, skeletonGrid, errorState, emptyState, openModal, textarea, field, select } from '../../core/ui.js';
import { askText, fmt } from './_ui.js';
import { F, db, callFn, friendlyError } from '../../core/firebase.js';
import { col, withId } from '../../services/_util.js';
import { getUser } from '../../services/users.js';
import { isSuper } from '../../core/auth.js';

export async function overview(el, ctx) {
  const defs = [['Students', col('users')], ['Tribes', col('tribes')], ['Projects', col('projects')], ['Posts', col('posts')]];
  const open = F.query(col('reports'), F.where('status', '==', 'open')); const pend = F.query(col('showcase'), F.where('status', '==', 'pending'));
  const box = h('div', { class: 'kpis' }); el.append(h('div', { class: 'stack' }, h('h2', {}, isSuper() ? 'Super Admin overview' : 'Admin overview'), box,
    h('div', { class: 'banner' }, icon('shield', 18), h('span', {}, 'Privacy boundary: admins cannot read private Tribe chats or help-request conversations. Reported messages are reviewed from a verified snapshot only.'))));
  const kpi = (l, n, href) => h(href ? 'a' : 'div', { class: 'card kpi', href }, h('strong', {}, n), h('span', {}, l));
  const counts = await Promise.all([...defs.map(([, q]) => F.getCountFromServer(q).then((s) => s.data().count).catch(() => '-')), F.getCountFromServer(open).then((s) => s.data().count).catch(() => '-'), F.getCountFromServer(pend).then((s) => s.data().count).catch(() => '-')]);
  [...defs.map(([l], i) => kpi(l, counts[i])), kpi('Open reports', counts[4], '#reports'), kpi('Showcase pending', counts[5], '#showcase')].forEach((k) => box.append(k));
}

const TYPE_LABEL = { post: 'Post', comment: 'Comment', project: 'Project', tribe: 'Tribe', tribeMessage: 'Tribe message', user: 'Student', showcase: 'Showcase' };
export async function reports(el, ctx) {
  let status = 'open'; const body = h('div', {});
  const t = tabs([{ id: 'open', label: 'Open' }, { id: 'reviewing', label: 'Reviewing' }, { id: 'resolved', label: 'Resolved' }, { id: 'dismissed', label: 'Dismissed' }], status, (s) => { status = s; draw(); });
  async function setStatus(r, s, note) { await F.updateDoc(F.doc(db, 'reports', r.id), { status: s, resolution: note || '', handledBy: ctx.user.uid, handledAt: F.serverTimestamp() }); toast('Report updated.', 'success'); draw(); }
  // Quick moderation actions per target type (all enforced by rules / callables, not by this UI)
  function actionsFor(r) {
    const a = [];
    if (r.targetType === 'post') a.push(['Hide post', async () => { await F.updateDoc(F.doc(db, 'posts', r.targetId), { status: 'hidden' }); }]);
    if (r.targetType === 'project') a.push(['Archive project', async () => { await F.updateDoc(F.doc(db, 'projects', r.targetId), { status: 'archived', updatedAt: F.serverTimestamp() }); }]);
    if (r.targetType === 'comment') a.push(['Delete comment', async () => { await F.deleteDoc(F.doc(db, 'comments', r.targetId)); }]);
    if (r.targetType === 'showcase') a.push(['Reject showcase', async () => { await F.updateDoc(F.doc(db, 'showcase', r.targetId), { status: 'rejected', adminNote: 'Removed after a report.', updatedAt: F.serverTimestamp() }); }]);
    if (r.targetType === 'tribe' || r.targetType === 'tribeMessage') { const tid = r.tribeId || r.targetId; a.push(['Suspend Tribe', async () => { const reason = await askText('Suspend Tribe', 'Reason (owner is notified)', { required: true }); if (reason === null) throw new Error('cancelled'); await callFn('setTribeStatus', { tribeId: tid, status: 'suspended', reason }); }]); }
    const uid = r.targetType === 'user' ? r.targetId : r.targetType === 'tribeMessage' ? (r.snapshot && r.snapshot.senderUid) : null;
    if (uid) a.push(['Suspend student', async () => { const reason = await askText('Suspend student', 'Reason (logged)', { required: true }); if (reason === null) throw new Error('cancelled'); await callFn('setUserSuspended', { uid, suspended: true, reason }); }]);
    return a;
  }
  async function draw() {
    clear(body); body.append(skeletonGrid(2));
    try {
      const rows = (await F.getDocs(F.query(col('reports'), F.where('status', '==', status), F.orderBy('createdAt', 'desc'), F.limit(40)))).docs.map(withId); clear(body);
      if (!rows.length) { body.append(emptyState({ icon: 'check', title: 'Nothing here', text: 'No reports in this state.' })); return; }
      const reporters = await Promise.all(rows.map((r) => getUser(r.reporterUid)));
      body.append(h('div', { class: 'stack' }, rows.map((r, i) => h('div', { class: 'card stack' },
        h('div', { class: 'row between wrap' }, h('div', { class: 'row' }, chip(TYPE_LABEL[r.targetType] || r.targetType, 'chip-dark'), chip(r.reason, 'chip-red'), h('span', { class: 'muted small' }, `${fmt(r.createdAt)} \u2022 by ${reporters[i].name}`)), h('a', { class: 'small red', href: r.targetType === 'user' ? `profile.html?id=${r.targetId}` : r.targetType === 'project' ? `projects.html?id=${r.targetId}` : r.tribeId ? '#tribes' : '#' }, r.targetType === 'tribeMessage' ? '' : 'Open target')),
        r.snapshot ? h('blockquote', { style: { margin: 0, padding: '10px 14px', borderLeft: '4px solid var(--red)', background: 'var(--bg-soft)', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' } }, r.snapshot.text) : null,
        r.details ? h('p', { style: { margin: 0 } }, h('strong', {}, 'Reporter says: '), r.details) : null,
        h('div', { class: 'row wrap' }, actionsFor(r).map(([l, fn]) => h('button', { class: 'btn btn-danger btn-sm', onclick: (e) => busy(e.currentTarget, async () => { try { await fn(); await setStatus(r, 'resolved', l); } catch (er) { if (er.message !== 'cancelled') throw er; } }) }, l)),
          status === 'open' ? h('button', { class: 'btn btn-outline btn-sm', onclick: (e) => busy(e.currentTarget, () => setStatus(r, 'reviewing')) }, 'Mark reviewing') : null,
          status !== 'resolved' ? h('button', { class: 'btn btn-dark btn-sm', onclick: async (e) => { const n = await askText('Resolve report', 'Resolution note (optional)'); if (n !== null) await busy(e.target, () => setStatus(r, 'resolved', n)); } }, 'Resolve') : null,
          status !== 'dismissed' ? h('button', { class: 'btn btn-ghost btn-sm', onclick: (e) => busy(e.currentTarget, () => setStatus(r, 'dismissed', 'No action needed')) }, 'Dismiss') : null)))));
    } catch (e) { clear(body); body.append(errorState(friendlyError(e), draw)); }
  }
  el.append(h('div', { class: 'stack' }, h('h2', {}, 'Reports'), t, body)); draw();
}
