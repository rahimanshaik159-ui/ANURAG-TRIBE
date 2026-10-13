// Shared UI primitives: toasts, modals, empty/loading/error states, form fields, chips.
import { h, clear, append } from './dom.js';
import { icon } from './icons.js';

// ---------------------------------------------------------------- toasts
export function toast(message, type = 'info', ms = 4200) {
  let wrap = document.getElementById('toast-wrap');
  if (!wrap) { wrap = h('div', { id: 'toast-wrap', class: 'toast-wrap', role: 'status', 'aria-live': 'polite' }); document.body.append(wrap); }
  const ic = { success: 'check', error: 'alert', info: 'info' }[type] || 'info';
  const t = h('div', { class: `toast toast-${type}` }, icon(ic, 18), h('span', {}, message));
  wrap.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250); }, ms);
}

// ---------------------------------------------------------------- modal
let openCount = 0;
/** openModal({title, body: Node, actions:[{label, variant, onClick(close)}], size:'sm'|'md'|'lg'}) */
export function openModal({ title, body, actions = [], size = 'md', onClose } = {}) {
  const prevFocus = document.activeElement;
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); if (--openCount <= 0) document.body.classList.remove('modal-open'); if (prevFocus && prevFocus.focus) prevFocus.focus(); if (onClose) onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const footer = actions.length ? h('div', { class: 'modal-actions' }, actions.map((a) =>
    h('button', { class: `btn ${a.variant || 'btn-outline'}`, type: 'button', onclick: async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { await a.onClick(close); } finally { if (b.isConnected) b.disabled = false; }
    } }, a.label))) : null;
  const dialog = h('div', { class: `modal modal-${size}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'modal-head' }, h('h3', {}, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: close }, icon('x', 20))),
    h('div', { class: 'modal-body' }, body), footer);
  const back = h('div', { class: 'modal-backdrop', onmousedown: (e) => { if (e.target === back) close(); } }, dialog);
  document.body.append(back); document.body.classList.add('modal-open'); openCount++;
  document.addEventListener('keydown', onKey);
  const first = dialog.querySelector('input,select,textarea,button.btn'); if (first) setTimeout(() => first.focus(), 30);
  return { close, dialog };
}
export function confirmDialog({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false; const fin = (v) => { if (!done) { done = true; resolve(v); } };
    openModal({ title, size: 'sm', body: h('p', { class: 'muted' }, message), onClose: () => fin(false), actions: [
      { label: 'Cancel', onClick: (c) => { fin(false); c(); } },
      { label: confirmLabel, variant: danger ? 'btn-danger' : 'btn-primary', onClick: (c) => { fin(true); c(); } },
    ] });
  });
}

// ---------------------------------------------------------------- states
export function emptyState({ icon: ic = 'inbox', title, text, action } = {}) {
  return h('div', { class: 'empty' }, h('div', { class: 'empty-ic' }, icon(ic, 28)), h('h4', {}, title), text ? h('p', { class: 'muted' }, text) : null, action || null);
}
export function skeletonGrid(n = 6, cls = '') {
  return h('div', { class: `grid grid-cards ${cls}`, 'aria-busy': 'true', 'aria-label': 'Loading' }, Array.from({ length: n }, () => h('div', { class: 'card skeleton-card' }, h('div', { class: 'skeleton sk-line w60' }), h('div', { class: 'skeleton sk-line' }), h('div', { class: 'skeleton sk-line w80' }))));
}
export function errorState(message, onRetry) {
  return h('div', { class: 'empty empty-error' }, h('div', { class: 'empty-ic' }, icon('alert', 28)), h('h4', {}, 'Something went wrong'), h('p', { class: 'muted' }, message),
    onRetry ? h('button', { class: 'btn btn-outline', type: 'button', onclick: onRetry }, icon('refresh', 16), 'Try again') : null);
}
export function banner(text, type = 'info') { return h('div', { class: `banner banner-${type}`, role: type === 'error' ? 'alert' : 'status' }, icon(type === 'error' ? 'alert' : 'info', 18), h('span', {}, text)); }

/** Run an async action while disabling a button; surfaces errors as toasts. */
export async function busy(button, fn, { error = true } = {}) {
  const old = button.textContent; button.disabled = true; button.classList.add('is-busy');
  try { return await fn(); }
  catch (e) { if (error) { const { friendlyError } = await import('./firebase.js'); toast(friendlyError(e), 'error'); } else throw e; }
  finally { button.disabled = false; button.classList.remove('is-busy'); if (!button.children.length && button.textContent !== old) button.textContent = old; }
}

// ---------------------------------------------------------------- forms
let uid = 0;
export function field(label, control, { hint, error, required } = {}) {
  const id = control.id || `f${++uid}`; control.id = id;
  const err = h('div', { class: 'field-error', id: `${id}-err`, role: 'alert' }, error || '');
  control.setAttribute('aria-describedby', `${id}-err`);
  const wrap = h('div', { class: 'field' + (error ? ' has-error' : '') }, h('label', { for: id, class: 'label' }, label, required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null), control, hint ? h('div', { class: 'hint' }, hint) : null, err);
  wrap.setError = (m) => { err.textContent = m || ''; wrap.classList.toggle('has-error', !!m); };
  return wrap;
}
export const input = (props = {}) => h('input', { class: 'input', ...props });
export function passwordToggle(control) {
  const button = h('button', { class: 'password-toggle', type: 'button', 'aria-label': 'Show password', title: 'Show password', 'aria-pressed': 'false' }, icon('eye', 18));
  button.addEventListener('click', () => {
    const visible = control.type === 'password';
    control.type = visible ? 'text' : 'password';
    button.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
    button.setAttribute('title', visible ? 'Hide password' : 'Show password');
    button.setAttribute('aria-pressed', String(visible));
  });
  return button;
}
export const textarea = (props = {}) => h('textarea', { class: 'input textarea', rows: 3, ...props });
export function select(options, { value, ...props } = {}) {
  const s = h('select', { class: 'input select', ...props }, options.map((o) => { const v = typeof o === 'object' ? o.value : o; const l = typeof o === 'object' ? o.label : o; return h('option', { value: v }, l); }));
  if (value != null) s.value = value; return s;
}
/** Character counter under a textarea/input. */
export function counter(el, max) {
  const c = h('div', { class: 'counter' }); const upd = () => { c.textContent = `${el.value.length}/${max}`; };
  el.maxLength = max; el.addEventListener('input', upd); upd(); return c;
}

// ---------------------------------------------------------------- chips & tabs
export const chip = (text, variant = '') => h('span', { class: `chip ${variant}`.trim() }, text);
export function skillChips(ids = [], tax, { max = 4, highlight = [] } = {}) {
  const hl = new Set(highlight);
  const shown = ids.slice(0, max).map((id) => chip(tax.label(id), hl.has(id) ? 'chip-red' : ''));
  if (ids.length > max) shown.push(chip(`+${ids.length - max}`, 'chip-more'));
  return h('div', { class: 'chips' }, shown);
}
/** tabs([{id,label,badge?}], activeId, onChange) -> element with setActive(id) */
export function tabs(items, active, onChange, { label = 'Sections' } = {}) {
  const el = h('div', { class: 'tabs', role: 'tablist', 'aria-label': label });
  const draw = () => { clear(el); append(el, items.map((t) => h('button', { class: 'tab', type: 'button', role: 'tab', 'aria-selected': String(t.id === active), onclick: () => { active = t.id; draw(); onChange(t.id); } }, t.label, t.badge ? h('span', { class: 'tab-badge' }, t.badge) : null))); };
  draw(); el.setActive = (id) => { active = id; draw(); }; return el;
}
export const pageHero = (title, sub, { eyebrow, right } = {}) => h('section', { class: 'page-hero' }, h('div', { class: 'container page-hero-in' }, h('div', {}, eyebrow ? h('div', { class: 'eyebrow' }, eyebrow) : null, h('h1', {}, title), sub ? h('p', {}, sub) : null), right || null));
