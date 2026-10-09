import { boot } from './_boot.js';
import { h, clear, qs, debounce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { pageHero, skeletonGrid, emptyState, errorState, input, select, toast } from '../core/ui.js';
import { personCard } from '../components/cards.js';
import { searchStudents } from '../services/users.js';
import { friendlyError } from '../core/firebase.js';
import { DEPARTMENTS, YEARS } from '../lib/taxonomy.js';
import { openHelpModal } from '../components/helpModal.js';
import { parseDiscoveryQuery } from '../lib/discovery.js';

boot({ require: 'public' }, async (ctx) => {
  const { main: app, tax } = ctx; clear(app);
  app.append(pageHero('Student Directory', 'Connect with talented students. Explore skills, interests and collaborate.', { eyebrow: 'Discover' }));
  if (!ctx.user) {
    app.append(h('div', { class: 'container section' }, emptyState({ icon: 'lock', title: 'Log in to browse students', text: 'The student directory is only visible to verified ANURAG TRIBE members, to protect everyone\'s privacy.', action: h('div', { class: 'row' }, h('a', { class: 'btn btn-primary', href: 'login.html?next=students.html' }, 'Log in'), h('a', { class: 'btn btn-outline', href: 'register.html' }, 'Join Now')) })));
    return;
  }
  const params = qs();
  const q = input({ type: 'search', placeholder: 'Search by name, username, or try "video editors"...', value: params.get('q') || '', id: 'search', autocomplete: 'off' });
  const dept = select([{ value: '', label: 'All departments' }, ...DEPARTMENTS]); const year = select([{ value: '', label: 'All years' }, ...YEARS.map((y) => ({ value: y.value, label: y.label }))]);
  const skill = select([{ value: '', label: 'Any skill' }, ...tax.skills.map((s) => ({ value: s.id, label: s.label }))]); skill.value = params.get('skill') || '';
  const grid = h('div', {}); const more = h('div', { class: 'load-more' }); const info = h('p', { class: 'muted small' }); const needBtn = h('div', {});
  let cursor = null; let reqId = 0;

  async function run(reset = true) {
    const my = ++reqId; if (reset) { cursor = null; clear(grid); grid.append(skeletonGrid(8)); clear(more); }
    try {
      const r = await searchStudents({ text: q.value, department: dept.value, year: Number(year.value) || 0, skillId: skill.value, cursor }, tax);
      if (my !== reqId) return; if (reset) clear(grid);
      let list = grid.querySelector('.grid') || grid.appendChild(h('div', { class: 'grid grid-cards' }));
      r.items.filter((u) => u.uid !== ctx.user.uid || true).forEach((u) => list.append(personCard(u, { tax, highlight: r.applied.skill ? [r.applied.skill] : [] })));
      if (!list.children.length) { clear(grid); grid.append(emptyState({ icon: 'search', title: 'No students found', text: 'Try fewer filters, a different skill, or post an "I need someone" request so people can find you.', action: h('button', { class: 'btn btn-primary', onclick: () => openHelpModal({ me: ctx.profile, tax, skills: r.applied.skill ? [r.applied.skill] : [] }) }, 'I need someone') })); }
      cursor = r.cursor; clear(more); if (r.hasMore) more.append(h('button', { class: 'btn btn-outline', onclick: () => run(false) }, 'Load more'));
      const a = r.applied; const bits = [a.skill && `skill: ${tax.label(a.skill)}`, a.department && `dept: ${a.department}`, a.year && `year ${a.year}`, a.text && `name starts with "${a.text}"`].filter(Boolean);
      info.textContent = bits.length ? `Showing: ${bits.join(' \u2022 ')}` : '';
      clear(needBtn); if (a.skill) needBtn.append(h('button', { class: 'btn btn-outline btn-sm', onclick: () => openHelpModal({ me: ctx.profile, tax, skills: [a.skill] }) }, icon('message', 16), `Post "I need ${tax.label(a.skill)}" request`));
    } catch (e) { if (my !== reqId) return; clear(grid); grid.append(errorState(friendlyError(e), () => run(true))); }
  }
  const go = debounce(() => run(true), 450);
  [q].forEach((el) => el.addEventListener('input', go)); [dept, year, skill].forEach((el) => el.addEventListener('change', () => run(true)));
  const quick = [['Find Video Editors', 'video editors'], ['Find Filmmakers', 'filmmakers'], ['Find Python Developers', 'python developers'], ['Find AI Students', 'ai students'], ['Find UI/UX Designers', 'ui/ux designers'], ['Find Startup Students', 'startup students']];
  app.append(h('div', { class: 'container section-sm' },
    h('div', { class: 'filters', id: 'search' }, h('div', { class: 'search' }, icon('search', 18), q), h('div', { class: 'sel' }, dept), h('div', { class: 'sel' }, year), h('div', { class: 'sel' }, skill)),
    h('div', { class: 'quick-chips' }, quick.map(([l, v]) => h('button', { type: 'button', onclick: () => { q.value = v; skill.value = ''; run(true); } }, l))),
    h('div', { class: 'row between wrap' }, info, needBtn), grid, more));
  if (location.hash === '#search') q.focus();
  run(true);
});
