// Create a project (campus-visible, or inside a Tribe when `tribe` is passed).
import { h } from '../core/dom.js';
import { field, input, textarea, select, counter, openModal, toast } from '../core/ui.js';
import { skillPicker } from './skillPicker.js';
import { createProject } from '../services/projects.js';
import { PROJECT_CATEGORIES } from '../lib/taxonomy.js';
import { normalizeUrl, cleanText } from '../lib/validators.js';
import { friendlyError } from '../core/firebase.js';

const FLOW = [['idea', 'Idea'], ['planning', 'Planning'], ['in_progress', 'In progress']];
export function openProjectModal({ me, tax, tribe = null, onDone }) {
  const title = input({ maxlength: 100, placeholder: 'e.g. Smart Campus Management System' }); const desc = textarea({ rows: 4, placeholder: 'What are you building? Who do you need?' });
  const cat = select(PROJECT_CATEGORIES.map((c) => ({ value: c.id, label: c.label })), { value: 'web' }); const st = select(FLOW.map(([v, l]) => ({ value: v, label: l })));
  const sk = skillPicker({ tax, max: 10, compact: true });
  const rows = [0, 1, 2].map(() => ({ l: input({ placeholder: 'Label (GitHub, Figma...)', maxlength: 40 }), u: input({ placeholder: 'https://...', inputmode: 'url' }) }));
  const body = h('div', {}, field('Title', title, { required: true }), field('Description', desc, { required: true }), counter(desc, 1500), h('div', { class: 'form-grid' }, field('Category', cat), field('Stage', st)),
    h('div', { class: 'label', style: { margin: '6px 0' } }, 'Skills needed'), sk, h('div', { class: 'label', style: { margin: '12px 0 6px' } }, 'Links (optional)'), rows.map((r) => h('div', { class: 'form-grid', style: { gap: '0 10px' } }, field('', r.l), field('', r.u))));
  openModal({ title: tribe ? `New project in ${tribe.name}` : 'Add a project', size: 'lg', body, actions: [{ label: 'Cancel', onClick: (c) => c() }, { label: 'Create project', variant: 'btn-primary', onClick: async (c) => {
    if (cleanText(title.value, 100).length < 4 || cleanText(desc.value, 1500).length < 10) return toast('Add a title (4+ chars) and a description (10+ chars).', 'error');
    try { const id = await createProject(me.uid, { title: title.value, description: desc.value, category: cat.value, status: st.value, skillsNeeded: sk.getValue(), links: rows.map((r) => ({ label: cleanText(r.l.value, 40), url: normalizeUrl(r.u.value) })), tribeId: tribe ? tribe.id : null, tribeName: tribe ? tribe.name : '' }); toast('Project created.', 'success'); c(); if (onDone) onDone(id); } catch (e) { toast(friendlyError(e), 'error'); } } }] });
}
