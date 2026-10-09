// Avatars: 50 supplied ANURAG TRIBE avatars (assets/avatars/avatarN.png), initials, or an
// external https image link. We never upload or host profile photos (no Firebase Storage).
import { h, clear, append } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { avatarIds } from '../lib/taxonomy.js';
import { initials } from '../lib/format.js';
import { normalizeUrl } from '../lib/validators.js';

export const avatarPath = (id) => `assets/avatars/${id}.png`;
export function avatarSrc(a) {
  if (!a) return '';
  if (a.type === 'preset' && /^avatar\d+$/.test(a.id)) return avatarPath(a.id);
  if (a.type === 'url' && a.url && a.url.startsWith('https://')) return a.url;
  return '';
}
/** Render an avatar. `size`: xs|sm|md|lg|xl. Falls back to initials if no/broken image. */
export function avatarEl(user, size = 'md') {
  const name = (user && user.name) || '?';
  const el = h('span', { class: `avatar avatar-${size}`, title: name });
  const fallback = () => { clear(el); el.classList.add('avatar-initials'); el.append(initials(name)); };
  const src = avatarSrc(user && user.avatar);
  if (src) {
    const img = h('img', { src, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', fallback); el.append(img);
  } else fallback();
  return el;
}

/**
 * Avatar picker used on Register and Edit Profile.
 * Returns an element; el.getValue() -> {type:'preset',id} | {type:'url',url} | {type:'none'}
 */
export function avatarPicker({ value = { type: 'none' }, name = 'You', onChange } = {}) {
  let mode = value.type === 'url' ? 'url' : value.type === 'none' ? 'initials' : 'preset';
  let selected = value.type === 'preset' ? value.id : null;
  let url = value.type === 'url' ? value.url : '';
  const preview = h('div', { class: 'ap-preview' });
  const body = h('div', { class: 'ap-body' });
  const tabsEl = h('div', { class: 'ap-tabs', role: 'tablist' });
  const urlInput = h('input', { class: 'input', type: 'url', placeholder: 'https://example.com/my-photo.jpg', value: url, inputmode: 'url', autocomplete: 'off' });
  const urlErr = h('div', { class: 'field-error' });

  const current = () => (mode === 'preset' && selected ? { type: 'preset', id: selected } : mode === 'url' && url ? { type: 'url', url } : { type: 'none' });
  const emit = () => { drawPreview(); if (onChange) onChange(current()); };
  const drawPreview = () => {
    clear(preview);
    const cur = current();
    append(preview, avatarEl({ name, avatar: cur }, 'xl'), h('div', { class: 'ap-preview-text' },
      h('strong', {}, cur.type === 'preset' ? 'Supplied avatar selected' : cur.type === 'url' ? 'Using your image link' : 'Using your initials'),
      h('span', { class: 'muted' }, cur.type === 'none' ? 'You can change this any time.' : 'Looks good!')));
  };
  const drawTabs = () => {
    clear(tabsEl);
    append(tabsEl, [['preset', 'Choose avatar'], ['initials', 'Use initials'], ['url', 'Image link']].map(([id, label]) =>
      h('button', { type: 'button', role: 'tab', class: 'ap-tab', 'aria-selected': String(mode === id), onclick: () => { mode = id; drawTabs(); drawBody(); emit(); } }, label)));
  };
  const drawBody = () => {
    clear(body);
    if (mode === 'preset') {
      const grid = h('div', { class: 'ap-grid', role: 'radiogroup', 'aria-label': 'Choose an avatar' }, avatarIds().map((id, i) =>
        h('button', { type: 'button', class: 'ap-item' + (selected === id ? ' selected' : ''), role: 'radio', 'aria-checked': String(selected === id), 'aria-label': `Avatar ${i + 1}`, onclick: (e) => {
          selected = id; grid.querySelectorAll('.ap-item').forEach((b) => { b.classList.remove('selected'); b.setAttribute('aria-checked', 'false'); });
          e.currentTarget.classList.add('selected'); e.currentTarget.setAttribute('aria-checked', 'true'); emit();
        } }, h('img', { src: avatarPath(id), alt: '', loading: 'lazy', width: 64, height: 64 }), h('span', { class: 'ap-check' }, icon('check', 14)))));
      body.append(grid);
    } else if (mode === 'initials') {
      body.append(h('p', { class: 'muted' }, 'No photo needed. Your profile will show your initials in a clean circle.'));
    } else {
      body.append(h('label', { class: 'label' }, 'Link to an image you host elsewhere'), urlInput, urlErr,
        h('p', { class: 'hint' }, 'ANURAG TRIBE does not store photos. Paste a public https:// link (for example from Imgur, GitHub or your portfolio). If the link breaks, your initials are shown.'));
    }
  };
  urlInput.addEventListener('input', () => {
    const n = normalizeUrl(urlInput.value);
    if (!urlInput.value.trim()) { url = ''; urlErr.textContent = ''; }
    else if (!n || !n.startsWith('https://')) { url = ''; urlErr.textContent = 'Enter a valid https:// link.'; }
    else { url = n; urlErr.textContent = ''; }
    emit();
  });
  const el = h('div', { class: 'avatar-picker' }, preview, tabsEl, body);
  el.getValue = current; el.hasError = () => mode === 'url' && urlInput.value.trim() && !url;
  el.setName = (n) => { name = n || 'You'; drawPreview(); };
  drawTabs(); drawBody(); drawPreview();
  return el;
}
