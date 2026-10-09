import { boot } from './_boot.js';
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { pageHero, skeletonGrid, emptyState, errorState, tabs, chip, toast } from '../core/ui.js';
import { showcaseCard } from '../components/cards.js';
import { openShowcaseModal } from '../components/showcaseModal.js';
import { listShowcase, myShowcase, deleteShowcase } from '../services/content.js';
import { getUser } from '../services/users.js';
import { PROJECT_CATEGORIES } from '../lib/taxonomy.js';
import { friendlyError } from '../core/firebase.js';

boot({ require: 'public' }, async (ctx) => {
  const { main: app, tax, user, profile: me } = ctx; clear(app);
  app.append(pageHero('Showcase', 'Finished work by ANURAG TRIBE students - reviewed and approved by admins.', { eyebrow: 'Recognition', right: user ? h('button', { class: 'btn btn-primary btn-lg', onclick: () => openShowcaseModal({ me: { uid: user.uid }, onDone: () => { active = 'mine'; t.setActive('mine'); draw(); } }) }, icon('plus', 18), 'Submit your work') : h('a', { class: 'btn btn-primary btn-lg', href: 'register.html' }, 'Join to showcase') }));
  const body = h('div', {}); let active = 'all'; let category = '';
  const t = tabs([{ id: 'all', label: 'Featured' }, ...(user ? [{ id: 'mine', label: 'My submissions' }] : [])], active, (id) => { active = id; draw(); });
  const chips = h('div', { class: 'quick-chips' });
  async function draw() {
    clear(chips); if (active === 'all') [{ id: '', label: 'All' }, ...PROJECT_CATEGORIES].forEach((c) => chips.append(h('button', { type: 'button', style: category === c.id ? { background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' } : null, onclick: () => { category = c.id; draw(); } }, c.label)));
    clear(body); body.append(skeletonGrid(3));
    try {
      if (active === 'mine') {
        const ms = await myShowcase(user.uid); clear(body);
        body.append(ms.length ? h('div', { class: 'grid grid-cards-lg' }, ms.map((s) => { const c = showcaseCard(s, { author: me, tax }); c.querySelector('.pj-body').prepend(chip(s.status, s.status === 'approved' ? 'chip-red' : s.status === 'rejected' ? '' : 'chip-dark')); if (s.adminNote) c.querySelector('.pj-body').append(h('p', { class: 'small muted' }, `Admin note: ${s.adminNote}`)); c.querySelector('.pj-body').append(h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => { await deleteShowcase(s.id); toast('Removed.', 'success'); draw(); } }, icon('trash', 14), 'Remove')); return c; }))
          : emptyState({ icon: 'award', title: 'Nothing submitted yet', text: 'Finished a project or a film? Submit it for review.' }));
      } else {
        const r = await listShowcase({ category }); const authors = user ? await Promise.all(r.items.map((s) => getUser(s.authorUid))) : []; clear(body);
        body.append(r.items.length ? h('div', { class: 'grid grid-cards-lg' }, r.items.map((s, i) => showcaseCard(s, { author: authors[i], tax }))) : emptyState({ icon: 'award', title: 'No showcase entries yet', text: 'Approved student work appears here.' }));
      }
    } catch (e) { clear(body); body.append(errorState(friendlyError(e), draw)); }
  }
  app.append(h('div', { class: 'container section-sm stack' }, t, chips, body)); draw();
});
