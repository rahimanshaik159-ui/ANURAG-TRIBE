import { boot } from './_boot.js';
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { pageHero, skeletonGrid, emptyState, tabs, toast, busy, chip, select } from '../core/ui.js';
import { projectCard, statusLabel } from '../components/cards.js';
import { openProjectModal } from '../components/projectModal.js';
import { myProjects, applicationsForOwner, myApplications, respondToApplication, withdrawApplication, setProjectStatus } from '../services/projects.js';
import { getUser } from '../services/users.js';
import { PROJECT_STATUSES } from '../lib/taxonomy.js';
import { friendlyError } from '../core/firebase.js';
import { timeAgo } from '../lib/format.js';

boot({ require: 'user' }, async (ctx) => {
  const { main: app, tax, user } = ctx; clear(app); const body = h('div', {});
  let active = location.hash === '#applications' ? 'received' : 'mine';
  const t = tabs([{ id: 'mine', label: 'My projects' }, { id: 'received', label: 'Applications received' }, { id: 'sent', label: 'My applications' }], active, (id) => { active = id; draw(); });
  async function draw() {
    clear(body); body.append(skeletonGrid(3));
    try {
      if (active === 'mine') {
        const ps = await myProjects(user.uid); clear(body);
        body.append(ps.length ? h('div', { class: 'grid grid-cards-lg' }, ps.map((p) => { const c = projectCard(p, { tax }); if (p.ownerUid === user.uid) { const s = select(PROJECT_STATUSES.map((x) => ({ value: x.id, label: x.label })), { value: p.status, 'aria-label': 'Change stage' }); s.onchange = async () => { try { await setProjectStatus(p.id, s.value); toast('Stage updated.', 'success'); } catch (e) { toast(friendlyError(e), 'error'); } }; c.querySelector('.pj-body').append(s); } return c; }))
          : emptyState({ icon: 'folder', title: 'No projects yet', text: 'Start one and invite collaborators, or apply to someone else\'s project.', action: h('div', { class: 'row' }, h('button', { class: 'btn btn-primary', onclick: () => openProjectModal({ me: { uid: user.uid }, tax, onDone: draw }) }, 'Add a project'), h('a', { class: 'btn btn-outline', href: 'projects.html' }, 'Browse projects')) }));
      } else if (active === 'received') {
        const as = await applicationsForOwner(user.uid); const us = await Promise.all(as.map((a) => getUser(a.applicantUid))); clear(body);
        body.append(as.length ? h('div', { class: 'stack' }, as.map((a, i) => h('div', { class: 'card row between wrap' }, h('div', { class: 'grow' }, h('strong', {}, us[i].name), ' applied to ', h('a', { class: 'red', href: `projects.html?id=${a.projectId}` }, a.projectTitle), h('p', { class: 'muted small', style: { margin: '4px 0 0' } }, `${timeAgo(a.createdAt)}${a.message ? ` \u2022 "${a.message}"` : ''}`), h('a', { class: 'small red', href: `profile.html?id=${a.applicantUid}` }, 'View profile')),
          a.status === 'pending' ? h('div', { class: 'row' }, h('button', { class: 'btn btn-primary btn-sm', onclick: (e) => busy(e.currentTarget, async () => { await respondToApplication(a, true); toast('Accepted - they joined the team.', 'success'); draw(); }) }, 'Accept'), h('button', { class: 'btn btn-outline btn-sm', onclick: (e) => busy(e.currentTarget, async () => { await respondToApplication(a, false); draw(); }) }, 'Decline')) : chip(a.status, a.status === 'accepted' ? 'chip-red' : ''))))
          : emptyState({ icon: 'inbox', title: 'No applications yet', text: 'When students apply to your projects they will appear here.' }));
      } else {
        const as = await myApplications(user.uid); clear(body);
        body.append(as.length ? h('div', { class: 'stack' }, as.map((a) => h('div', { class: 'card row between wrap' }, h('div', {}, h('a', { class: 'red', href: `projects.html?id=${a.projectId}` }, h('strong', {}, a.projectTitle)), h('p', { class: 'muted small', style: { margin: '4px 0 0' } }, `Applied ${timeAgo(a.createdAt)}`)), h('div', { class: 'row' }, chip(a.status, a.status === 'accepted' ? 'chip-red' : ''), a.status === 'pending' ? h('button', { class: 'btn btn-outline btn-sm', onclick: (e) => busy(e.currentTarget, async () => { await withdrawApplication(a.id); draw(); }) }, 'Withdraw') : null))))
          : emptyState({ icon: 'send', title: 'No applications sent', text: 'Find a project that needs your skills.', action: h('a', { class: 'btn btn-primary', href: 'projects.html' }, 'Browse projects') }));
      }
    } catch (e) { clear(body); body.append(emptyState({ icon: 'alert', title: 'Could not load', text: friendlyError(e) })); }
  }
  app.append(pageHero('My projects', 'Projects you own or contribute to, and applications.', { right: h('button', { class: 'btn btn-primary', onclick: () => openProjectModal({ me: { uid: user.uid }, tax, onDone: draw }) }, icon('plus', 16), 'Add project') }), h('div', { class: 'container section-sm stack' }, t, body));
  draw();
});
