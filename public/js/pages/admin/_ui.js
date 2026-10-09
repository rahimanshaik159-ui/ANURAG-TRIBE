import { h } from '../../core/dom.js';
import { openModal, textarea, field, input } from '../../core/ui.js';
export function dataTable(cols, rows, empty = 'Nothing here.') {
  return h('div', { class: 'table-wrap' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, cols.map((c) => h('th', {}, c.label)))),
    h('tbody', {}, rows.length ? rows.map((r) => h('tr', {}, cols.map((c) => h('td', {}, c.render(r))))) : h('tr', {}, h('td', { colspan: cols.length, class: 'muted center' }, empty)))));
}
/** Ask for a short reason/note. Resolves to the string, or null if cancelled. */
export function askText(title, label, { required = false, placeholder = '' } = {}) {
  return new Promise((resolve) => {
    let done = false; const t = textarea({ rows: 3, maxlength: 300, placeholder }); const f = field(label, t);
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    openModal({ title, size: 'sm', body: f, onClose: () => fin(null), actions: [{ label: 'Cancel', onClick: (c) => { fin(null); c(); } }, { label: 'Confirm', variant: 'btn-primary', onClick: (c) => { if (required && !t.value.trim()) return f.setError('Required'); fin(t.value.trim()); c(); } }] });
  });
}
export const fmt = (ts) => (ts && ts.toDate ? ts.toDate().toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
