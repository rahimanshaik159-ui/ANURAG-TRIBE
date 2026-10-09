// Tribe projects live in the shared `projects` collection (tribeId set) - one project system, not two.
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { openModal, toast, field, input, textarea, select, counter, emptyState, confirmDialog, skeletonGrid } from '../core/ui.js';
import { projectCard, statusLabel } from './cards.js';
import { skillPicker } from './skillPicker.js';
import { openShowcaseModal } from './showcaseModal.js';
import { openProjectModal } from './projectModal.js';
import { listTribeProjects, createProject, updateProject, deleteProject } from '../services/projects.js';
import { getUser } from '../services/users.js';
import { PROJECT_CATEGORIES } from '../lib/taxonomy.js';
import { friendlyError } from '../core/firebase.js';
import { normalizeUrl, cleanText } from '../lib/validators.js';

const FLOW = [['idea', 'Idea'], ['planning', 'Planning'], ['in_progress', 'In progress'], ['completed', 'Completed']];

export function mountProjects({ tribe, me, memberUids, isLeader, tax, container }) {
  const box = h('div', { class: 'stack-lg stack' }); container.append(box); let destroyed = false;
  async function load() {
    clear(box); box.append(skeletonGrid(2));
    try {
      const ps = await listTribeProjects(tribe.id); if (destroyed) return; clear(box);
      box.append(h('div', { class: 'row between wrap' }, h('div', {}, h('h2', { style: { margin: 0 } }, 'Tribe projects'), h('p', { class: 'muted', style: { margin: 0 } }, 'IDEA \u2192 PLANNING \u2192 IN PROGRESS \u2192 COMPLETED')), tribe.status === 'active' ? h('button', { class: 'btn btn-primary', onclick: () => createFlow() }, icon('plus', 16), 'New project') : null));
      if (!ps.length) { box.append(emptyState({ icon: 'folder', title: 'No Tribe projects yet', text: 'Turn a conversation into a project: a short film, an app, a hackathon entry, a startup idea.', action: h('button', { class: 'btn btn-primary', onclick: () => createFlow() }, 'Start the first project') })); return; }
      box.append(h('div', { class: 'grid grid-cards-lg' }, ps.map((p) => { const c = projectCard(p, { tax }); c.style.cursor = 'pointer'; c.addEventListener('click', (e) => { if (!e.target.closest('a')) detail(p); }); c.querySelector('h3 a')?.addEventListener('click', (e) => { e.preventDefault(); detail(p); }); return c; })));
    } catch (e) { clear(box); box.append(emptyState({ icon: 'alert', title: 'Could not load projects', text: friendlyError(e) })); }
  }
  function createFlow() { openProjectModal({ me, tax, tribe, onDone: () => load() }); }
  async function detail(p) {
    const users = await Promise.all(memberUids.map(getUser)); const byId = Object.fromEntries(users.map((u) => [u.uid, u]));
    const canManage = p.ownerUid === me.uid || isLeader; const body = h('div', { class: 'stack-lg stack' });
    const save = async (patch, msg) => { try { await updateProject(p.id, patch); Object.assign(p, patch); if (msg) toast(msg, 'success'); draw(); } catch (e) { toast(friendlyError(e), 'error'); } };
    function draw() {
      clear(body);
      body.append(h('div', { class: 'row wrap' }, FLOW.map(([id, label], i) => { const idx = FLOW.findIndex((f) => f[0] === p.status); return h('button', { class: `btn btn-sm ${i === idx ? 'btn-primary' : i < idx ? 'btn-dark' : 'btn-outline'}`, onclick: () => p.status !== id && save({ status: id }, `Moved to ${label}`) }, `${i + 1}. ${label}`); })));
      body.append(h('p', { style: { whiteSpace: 'pre-wrap', margin: 0 } }, p.description));
      body.append(h('div', {}, h('h4', {}, 'Links'), (p.links || []).length ? h('div', { class: 'chips' }, p.links.map((l, i) => h('span', { class: 'chip chip-link', style: { padding: '4px 4px 4px 12px' } }, h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer nofollow' }, l.label || new URL(l.url).hostname), h('button', { class: 'icon-btn', style: { width: '24px', height: '24px' }, 'aria-label': 'Remove link', onclick: () => save({ links: p.links.filter((_, j) => j !== i) }) }, icon('x', 12))))) : h('p', { class: 'muted small' }, 'No links yet.'),
        h('button', { class: 'btn btn-outline btn-sm', style: { marginTop: '8px' }, onclick: () => { const l = input({ placeholder: 'Label' }); const u = input({ placeholder: 'https://...' }); openModal({ title: 'Add link', size: 'sm', body: h('div', {}, field('Label', l), field('URL', u)), actions: [{ label: 'Cancel', onClick: (c) => c() }, { label: 'Add', variant: 'btn-primary', onClick: async (c) => { const url = normalizeUrl(u.value); if (!url) return toast('Enter a valid link.', 'error'); if ((p.links || []).length >= 8) return toast('Up to 8 links.', 'error'); c(); save({ links: [...(p.links || []), { label: cleanText(l.value, 40), url }] }); } }] }); } }, icon('plus', 14), 'Add link')));
      const asg = h('div', {}, h('h4', {}, 'Responsibilities'), (p.assignments || []).length ? (p.assignments || []).map((a, i) => h('div', { class: 'list-item', style: { padding: '8px 0' } }, h('strong', {}, byId[a.uid]?.name || 'Member'), h('span', { class: 'grow muted' }, a.task), canManage ? h('button', { class: 'icon-btn', 'aria-label': 'Remove', onclick: () => save({ assignments: p.assignments.filter((_, j) => j !== i) }) }, icon('trash', 16)) : null)) : h('p', { class: 'muted small' }, 'Nobody assigned yet. e.g. Director, Editor, Writer, Cinematographer, Music.'));
      if (canManage) asg.append(h('button', { class: 'btn btn-outline btn-sm', style: { marginTop: '8px' }, onclick: () => { const who = select(users.map((u) => ({ value: u.uid, label: u.name }))); const task = input({ placeholder: 'e.g. Editor', maxlength: 60 }); openModal({ title: 'Assign responsibility', size: 'sm', body: h('div', {}, field('Member', who), field('Responsibility', task)), actions: [{ label: 'Cancel', onClick: (c) => c() }, { label: 'Assign', variant: 'btn-primary', onClick: async (c) => { if (!task.value.trim()) return; if ((p.assignments || []).length >= 20) return toast('Up to 20 assignments.', 'error'); c(); save({ assignments: [...(p.assignments || []), { uid: who.value, task: cleanText(task.value, 60) }] }, 'Assigned'); } }] }); } }, icon('plus', 14), 'Assign'));
      body.append(asg);
      if (canManage) body.append(h('div', { class: 'card', style: { background: 'var(--bg-soft)' } }, h('h4', {}, 'Invite collaborators'), h('p', { class: 'muted small' }, p.visibility === 'campus' ? 'This project is listed in the Projects Hub. Students outside the Tribe can apply to join.' : 'Only Tribe members can see this project. Open it up to let other students apply.'),
        h('button', { class: 'btn btn-outline btn-sm', onclick: () => save({ visibility: p.visibility === 'campus' ? 'tribe' : 'campus' }, p.visibility === 'campus' ? 'Now Tribe-only' : 'Now open to campus applications') }, p.visibility === 'campus' ? 'Make Tribe-only' : 'Open to campus collaborators')));
      body.append(h('div', { class: 'row wrap' }, p.status === 'completed' ? h('button', { class: 'btn btn-primary', onclick: () => openShowcaseModal({ me, prefill: { title: p.title, description: p.description, category: p.category, links: p.links, tribeId: tribe.id, projectId: p.id } }) }, icon('award', 16), 'Submit to Showcase') : null, h('a', { class: 'btn btn-outline', href: `tribe.html?id=${tribe.id}#chat` }, icon('message', 16), 'Discuss in chat'),
        p.ownerUid === me.uid || false ? h('button', { class: 'btn btn-danger btn-sm', onclick: async () => { if (await confirmDialog({ title: 'Delete project?', message: 'This removes the project for everyone.', confirmLabel: 'Delete', danger: true })) { try { await deleteProject(p.id); m.close(); load(); } catch (e) { toast(friendlyError(e), 'error'); } } } }, icon('trash', 14), 'Delete') : null));
    }
    draw(); const m = openModal({ title: p.title, size: 'lg', body, onClose: () => load(), actions: [] });
  }
  load();
  return { destroy() { destroyed = true; box.remove(); } };
}
