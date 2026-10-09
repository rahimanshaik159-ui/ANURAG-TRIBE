// Multi-select skill/interest picker grouped by CREATIVE / TECHNOLOGY / BUSINESS / EDUCATION.
import { h, clear, append } from '../core/dom.js';

/** skillPicker({tax, value:[ids], max, label}) -> element with getValue()/setValue(ids). */
export function skillPicker({ tax, value = [], max = 15, onChange, compact = false } = {}) {
  let sel = new Set(value);
  const count = h('div', { class: 'sp-count' });
  const root = h('div', { class: 'skill-picker' });
  const draw = () => {
    clear(root);
    const groups = tax.groups.map((g) => {
      const items = tax.skills.filter((s) => s.group === g.id);
      if (!items.length) return null;
      return h('fieldset', { class: 'sp-group' }, h('legend', {}, g.label),
        h('div', { class: 'sp-chips' }, items.map((s) => {
          const on = sel.has(s.id);
          return h('button', { type: 'button', class: 'sp-chip' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick: () => {
            if (sel.has(s.id)) sel.delete(s.id); else if (sel.size < max) sel.add(s.id); else return;
            draw(); if (onChange) onChange([...sel]);
          } }, s.label);
        })));
    });
    count.textContent = `${sel.size}/${max} selected`;
    append(root, compact ? null : count, groups);
  };
  root.getValue = () => [...sel];
  root.setValue = (v) => { sel = new Set(v); draw(); };
  draw();
  return root;
}
