// Submit finished work to the Showcase. Needs explicit consent for any promotion; admins review manually.
import { h } from '../core/dom.js';
import { field, input, textarea, select, openModal, toast, counter } from '../core/ui.js';
import { submitShowcase } from '../services/content.js';
import { PROJECT_CATEGORIES } from '../lib/taxonomy.js';
import { friendlyError } from '../core/firebase.js';

export function openShowcaseModal({ me, prefill = {}, onDone }) {
  const title = input({ value: prefill.title || '', maxlength: 100 }); const desc = textarea({ value: prefill.description || '', rows: 4 });
  const cat = select(PROJECT_CATEGORIES.map((c) => ({ value: c.id, label: c.label })), { value: prefill.category || 'creative' });
  const links = [0, 1, 2].map((i) => ({ label: input({ placeholder: 'Label (e.g. Watch on YouTube)', maxlength: 40, value: (prefill.links || [])[i]?.label || '' }), url: input({ placeholder: 'https://...', inputmode: 'url', value: (prefill.links || [])[i]?.url || '' }) }));
  const consent = h('input', { type: 'checkbox' });
  const body = h('div', {}, h('p', { class: 'muted small' }, 'Showcase entries are links to your work hosted elsewhere (YouTube, GitHub, Behance, your site). We do not host files. An admin reviews every submission before it appears.'),
    field('Title', title, { required: true }), field('About this work', desc, { required: true }), counter(desc, 1000), field('Category', cat),
    h('div', { class: 'label', style: { margin: '6px 0' } }, 'Links to your work (at least one)'), links.map((l) => h('div', { class: 'form-grid', style: { gap: '0 10px' } }, field('', l.label), field('', l.url))),
    h('label', { class: 'check', style: { marginTop: '8px' } }, consent, h('span', {}, 'I give permission for ANURAG TRIBE admins to consider featuring this work on ANURAG TRIBE social channels. (Optional. Nothing is posted automatically.)')));
  openModal({ title: 'Submit to Showcase', size: 'lg', body, actions: [{ label: 'Cancel', onClick: (c) => c() }, { label: 'Submit for review', variant: 'btn-primary', onClick: async (c) => {
    try { await submitShowcase(me.uid, { title: title.value, description: desc.value, category: cat.value, links: links.map((l) => ({ label: l.label.value, url: l.url.value })), tribeId: prefill.tribeId || null, projectId: prefill.projectId || null, featureConsent: consent.checked }); toast('Submitted. You will be notified when it is reviewed.', 'success'); c(); if (onDone) onDone(); }
    catch (e) { toast(e.code ? friendlyError(e) : e.message, 'error'); } } }] });
}
