import { boot } from './_boot.js';
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { pageHero, field, input, select, textarea, counter, toast, busy, banner } from '../core/ui.js';
import { skillPicker } from '../components/skillPicker.js';
import { validateTribe } from '../lib/validators.js';
import { createTribe } from '../services/tribes.js';
import { friendlyError } from '../core/firebase.js';

boot({ require: 'user' }, async (ctx) => {
  const { main: app, tax, profile: me } = ctx; clear(app);
  const name = input({ maxlength: 40, placeholder: 'e.g. Filmmakers Tribe' }); const desc = textarea({ rows: 4, placeholder: 'What is this Tribe about? Who should join? What will you build?' });
  const goal = input({ maxlength: 200, placeholder: 'e.g. Produce one short film this semester' }); const focus = input({ maxlength: 100, placeholder: 'e.g. Short films, reels (optional)' });
  const cat = select([{ value: '', label: 'Choose a category' }, ...tax.categories.map((c) => ({ value: c.id, label: c.label }))]);
  const size = select([2, 3, 4, 5, 6, 7, 8, 10, 12].map((n) => ({ value: n, label: n === 6 ? '6 (recommended: 5-6)' : String(n) })), { value: 6 });
  const skills = skillPicker({ tax, max: 12, value: [] }); const interests = skillPicker({ tax, max: 12, value: [], compact: true });
  const fN = field('Tribe name', name, { required: true }), fD = field('Description', desc, { required: true }), fG = field('Goal', goal), fC = field('Category', cat, { required: true }), fS = field('Ideal size', size, { hint: 'A target, not a limit. The Tribe can grow if it needs to.' });
  const priv = (v, t, d, on) => h('label', { class: 'card', style: { display: 'flex', gap: '10px', cursor: 'pointer', padding: '12px' } }, h('input', { type: 'radio', name: 'priv', value: v, checked: on, style: { accentColor: 'var(--red)' } }), h('span', {}, h('strong', {}, t), h('br'), h('span', { class: 'muted small' }, d)));
  const err = h('div', {}); const submit = h('button', { class: 'btn btn-primary btn-lg', type: 'submit' }, 'Create Tribe');
  const form = h('form', { novalidate: true, class: 'stack-lg stack', onsubmit: async (e) => {
    e.preventDefault(); clear(err);
    const v = validateTribe({ name: name.value, description: desc.value, goal: goal.value, category: cat.value, skills: skills.getValue(), interests: interests.getValue(), privacy: document.querySelector('input[name=priv]:checked').value, idealMemberCount: size.value, projectFocus: focus.value }, tax);
    fN.setError(v.errors.name || ''); fD.setError(v.errors.description || ''); fC.setError(v.errors.category || '');
    if (!v.ok) { (document.querySelector('.has-error') || submit).scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    await busy(submit, async () => { try { const r = await createTribe(v.value); toast('Tribe created!', 'success'); location.href = `tribe.html?id=${r.tribeId}`; } catch (er) { err.append(banner(friendlyError(er), 'error')); } });
  } },
    h('section', { class: 'card' }, h('h3', {}, 'The basics'), fN, fD, fG, h('div', { class: 'form-grid' }, fC, fS), fieldWrap(focus)),
    h('section', { class: 'card' }, h('h3', {}, 'Skills this Tribe needs'), h('p', { class: 'muted small' }, 'Students with these skills will be recommended to join. e.g. a Filmmakers Tribe: Filmmaking, Video Editing, Cinematography, Script Writing, Acting, Music.'), skills),
    h('section', { class: 'card' }, h('h3', {}, 'Interests (optional)'), interests),
    h('section', { class: 'card' }, h('h3', {}, 'Visibility'), h('div', { class: 'grid grid-cards' }, priv('public', 'Public', 'Listed for discovery. Students request to join; you approve.', true), priv('private', 'Private', 'Hidden. Members join only by your invitation.', false))),
    err, h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('a', { class: 'btn btn-ghost', href: 'my-tribes.html' }, 'Cancel'), submit));
  function fieldWrap(el) { return field('Project focus', el); }
  app.append(pageHero('Create a Tribe', 'Gather the right mix of skills. You will be the owner and can add moderators.'), h('div', { class: 'container section-sm' }, h('div', { class: 'form-card' }, form)));
});
