// Social links: display on profiles + editor on Edit Profile.
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { SOCIAL_PLATFORMS } from '../lib/taxonomy.js';
import { normalizeSocial } from '../lib/validators.js';

/** Professional icon row. Only shows platforms the user filled in. */
export function socialIcons(social = {}) {
  const items = SOCIAL_PLATFORMS.filter((p) => social[p.id]);
  if (!items.length) return null;
  return h('div', { class: 'social-row' }, items.map((p) => h('a', { class: `social-btn social-${p.id}`, href: social[p.id], target: '_blank', rel: 'noopener noreferrer nofollow', 'aria-label': p.label, title: p.label }, icon(p.icon, 20))));
}
/** Editor: one optional, validated input per platform; clearing an input removes the link. */
export function socialEditor(value = {}) {
  const inputs = {}; const errs = {};
  const rows = SOCIAL_PLATFORMS.map((p) => {
    const inp = h('input', { class: 'input', type: 'text', value: value[p.id] || '', placeholder: p.placeholder, autocomplete: 'off', inputmode: 'url', 'aria-label': p.label });
    const err = h('div', { class: 'field-error' });
    inp.addEventListener('blur', () => { const r = normalizeSocial(p.id, inp.value); err.textContent = r.ok ? '' : r.error; if (r.ok && r.value) inp.value = r.value; });
    inputs[p.id] = inp; errs[p.id] = err;
    return h('div', { class: 'social-edit-row' }, h('span', { class: 'se-ic' }, icon(p.icon, 20)), h('div', { class: 'se-main' }, h('label', { class: 'label' }, p.label, h('span', { class: 'muted' }, ' (optional)')), inp, err));
  });
  const el = h('div', { class: 'social-editor' }, rows);
  el.getValue = () => Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p.id, inputs[p.id].value.trim()]));
  el.setErrors = (map) => SOCIAL_PLATFORMS.forEach((p) => { errs[p.id].textContent = map[`social.${p.id}`] || ''; });
  return el;
}
