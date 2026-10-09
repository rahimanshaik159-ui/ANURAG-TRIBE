import { boot } from './_boot.js';
import { h, clear } from '../core/dom.js';
import { pageHero, skeletonGrid, emptyState, errorState, tabs } from '../core/ui.js';
import { resourceCard } from '../components/cards.js';
import { listResources } from '../services/content.js';
import { scoreTagged } from '../lib/recommend.js';
import { RESOURCE_TYPES } from '../lib/taxonomy.js';
import { friendlyError } from '../core/firebase.js';

boot({ require: 'public' }, async (ctx) => {
  const { main: app, tax, profile: me } = ctx; clear(app);
  app.append(pageHero('Resources', 'Study material, career guidance and opportunities - curated by ANURAG TRIBE admins.', { eyebrow: 'Grow' }));
  const body = h('div', {}); let area = ''; let type = '';
  const t = tabs([{ id: '', label: 'All' }, { id: 'study', label: 'Study' }, { id: 'career', label: 'Career' }, { id: 'opportunity', label: 'Opportunities' }], area, (id) => { area = id; type = ''; draw(); });
  const chips = h('div', { class: 'quick-chips' });
  async function draw() {
    clear(chips); RESOURCE_TYPES.filter((r) => !area || r.area === area).forEach((r) => chips.append(h('button', { type: 'button', style: type === r.id ? { background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' } : null, onclick: () => { type = type === r.id ? '' : r.id; draw(); } }, r.label)));
    clear(body); body.append(skeletonGrid(6));
    try {
      let rs = await listResources({ area }); if (type) rs = rs.filter((r) => r.type === type); clear(body);
      if (me) rs = rs.map((r) => ({ r, s: scoreTagged(me, r, tax) })).sort((a, b) => b.s.score - a.s.score);
      else rs = rs.map((r) => ({ r, s: { reasons: [] } }));
      if (!rs.length) { body.append(emptyState({ icon: 'book', title: 'No resources yet', text: 'Admins add study, career and opportunity links here.' })); return; }
      body.append(h('div', { class: 'grid grid-cards-lg' }, rs.map(({ r, s }) => resourceCard(r, { tax, reasons: s.reasons }))));
    } catch (e) { clear(body); body.append(errorState(friendlyError(e), draw)); }
  }
  app.append(h('div', { class: 'container section-sm stack' }, t, chips, body)); draw();
});
