import { boot } from './_boot.js';
import { h, clear, qs, debounce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { pageHero, skeletonGrid, emptyState, errorState, input, select, openModal, field, textarea, toast, counter } from '../core/ui.js';
import { tribeCard } from '../components/cards.js';
import { listTribes, tribeCandidates, myMemberships, myJoinRequests, requestToJoin, cancelJoinRequest } from '../services/tribes.js';
import { rankTribes } from '../lib/recommend.js';
import { friendlyError } from '../core/firebase.js';

boot({ require: 'public' }, async (ctx) => {
  const { main: app, tax, user, profile: me } = ctx; clear(app);
  app.append(pageHero('Tribes', 'Small collaborative groups of students - ideally 5 to 6 - built around shared interests and complementary skills.', { eyebrow: 'Build together', right: h('a', { class: 'btn btn-primary btn-lg', href: user ? 'create-tribe.html' : 'register.html' }, icon('plus', 18), user ? 'Create a Tribe' : 'Join to create a Tribe') }));
  if (!user) {
    app.append(h('div', { class: 'container section' }, emptyState({ icon: 'lock', title: 'Log in to explore Tribes', text: 'Tribes are for verified ANURAG TRIBE students. Log in to see Tribes matched to your skills, request to join, or start your own.', action: h('div', { class: 'row' }, h('a', { class: 'btn btn-primary', href: 'login.html?next=tribes.html' }, 'Log in'), h('a', { class: 'btn btn-outline', href: 'register.html' }, 'Join Now')) })));
    return;
  }
  const params = qs(); let category = params.get('category') || ''; let cursor = null; let reqId = 0;
  const [mine, reqs] = await Promise.all([myMemberships(user.uid).catch(() => []), myJoinRequests(user.uid).catch(() => [])]);
  const myIds = new Set(mine.map((t) => t.id)); const pending = new Set(reqs.filter((r) => r.status === 'pending').map((r) => r.tribeId));

  const q = input({ type: 'search', placeholder: 'Search Tribes by name...', value: params.get('q') || '' });
  const skill = select([{ value: '', label: 'Any skill needed' }, ...tax.skills.map((s) => ({ value: s.id, label: s.label }))]);
  const chips = h('div', { class: 'quick-chips' }); const recBox = h('div', {}); const grid = h('div', {}); const more = h('div', { class: 'load-more' });

  function joinAction(t) {
    if (myIds.has(t.id)) return h('a', { class: 'btn btn-dark btn-sm btn-block', href: `tribe.html?id=${t.id}` }, 'Open Tribe', icon('arrowRight', 14));
    if (pending.has(t.id)) return h('button', { class: 'btn btn-outline btn-sm btn-block', onclick: async (e) => { try { await cancelJoinRequest(t.id, user.uid); pending.delete(t.id); toast('Request cancelled.', 'success'); e.target.replaceWith(joinAction(t)); } catch (er) { toast(friendlyError(er), 'error'); } } }, 'Requested \u2022 tap to cancel');
    return h('button', { class: 'btn btn-primary btn-sm btn-block', onclick: () => joinModal(t) }, 'JOIN TRIBE');
  }
  function joinModal(t) {
    const msg = textarea({ placeholder: 'Introduce yourself: what can you bring to this Tribe?', rows: 3, maxlength: 300 });
    openModal({ title: `Join ${t.name}`, size: 'sm', body: h('div', {}, h('p', { class: 'muted' }, 'The Tribe owner will review your request.'), field('Message (optional)', msg), counter(msg, 300)), actions: [{ label: 'Cancel', onClick: (c) => c() }, { label: 'Send request', variant: 'btn-primary', onClick: async (c) => {
      try { await requestToJoin(t.id, user.uid, msg.value.trim()); pending.add(t.id); toast('Request sent. You will be notified.', 'success'); c(); run(true); } catch (e) { toast(friendlyError(e), 'error'); } } }] });
  }
  const card = (t, reasons) => tribeCard(t, { tax, reasons, actions: joinAction(t) });

  const drawChips = () => { clear(chips); [{ id: '', label: 'All Tribes' }, ...tax.categories].forEach((c) => chips.append(h('button', { type: 'button', class: category === c.id ? 'active' : '', style: category === c.id ? { background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' } : null, onclick: () => { category = c.id; drawChips(); run(true); } }, c.label))); };
  async function run(reset) {
    const my = ++reqId; if (reset) { cursor = null; clear(grid); grid.append(skeletonGrid(6)); clear(more); }
    try {
      const r = await listTribes({ category, skillId: skill.value, text: q.value, cursor });
      if (my !== reqId) return; if (reset) clear(grid);
      let list = grid.querySelector('.grid') || grid.appendChild(h('div', { class: 'grid grid-cards-lg' }));
      r.items.forEach((t) => list.append(card(t)));
      if (!list.children.length) { clear(grid); grid.append(emptyState({ icon: 'compass', title: 'No Tribes here yet', text: 'Be the first to start one for this topic.', action: h('a', { class: 'btn btn-primary', href: 'create-tribe.html' }, 'Create a Tribe') })); }
      cursor = r.cursor; clear(more); if (r.hasMore) more.append(h('button', { class: 'btn btn-outline', onclick: () => run(false) }, 'Load more'));
    } catch (e) { if (my !== reqId) return; clear(grid); grid.append(errorState(friendlyError(e), () => run(true))); }
  }
  q.addEventListener('input', debounce(() => run(true), 450)); skill.addEventListener('change', () => run(true));
  drawChips();
  app.append(h('div', { class: 'container section-sm' }, recBox,
    h('div', { class: 'filters' }, h('div', { class: 'search' }, icon('search', 18), q), h('div', { class: 'sel' }, skill)), chips, grid, more));
  run(true);
  // recommendations (explainable)
  try {
    const terms = [...new Set([...(me.skills || []), ...(me.interests || []), ...(me.learning || [])])];
    const rec = rankTribes(me, await tribeCandidates(terms), { exclude: new Set([...myIds, ...pending]), limit: 3 }, tax);
    if (rec.length) recBox.append(h('section', { style: { marginBottom: '26px' } }, h('div', { class: 'section-head' }, h('div', {}, h('h2', {}, 'Recommended for you'), h('p', {}, 'Based on your skills, interests and goals'))), h('div', { class: 'grid grid-cards-lg' }, rec.map((x) => card(x.tribe, x.reasons)))));
  } catch (e) { console.info('recs unavailable', e.code || e.message); }
});
