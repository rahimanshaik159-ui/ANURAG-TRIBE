import { boot } from './_boot.js';
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { pageHero, skeletonGrid, emptyState, errorState, tabs, toast, busy } from '../core/ui.js';
import { eventCard } from '../components/cards.js';
import { listEvents, isRegistered, registerForEvent, unregisterEvent } from '../services/content.js';
import { friendlyError } from '../core/firebase.js';

boot({ require: 'public' }, async (ctx) => {
  const { main: app, user } = ctx; clear(app);
  app.append(pageHero('Events & Activities', 'Workshops, hackathons, competitions and campus events.', { eyebrow: 'Participate' }));
  const body = h('div', {}); let active = 'upcoming';
  const items = [{ id: 'upcoming', label: 'Upcoming events' }, { id: 'past', label: 'Past events' }, ...(user ? [{ id: 'mine', label: 'My registrations' }] : [])];
  const t = tabs(items, active, (id) => { active = id; draw(); });
  async function draw() {
    clear(body); body.append(skeletonGrid(4));
    try {
      let evs = active === 'past' ? await listEvents({ upcoming: false }) : await listEvents({ upcoming: true, size: 50 });
      let reg = {}; if (user) { const flags = await Promise.all(evs.map((e) => isRegistered(e.id, user.uid).catch(() => false))); evs.forEach((e, i) => { reg[e.id] = flags[i]; }); }
      if (active === 'mine') evs = evs.filter((e) => reg[e.id]);
      clear(body);
      if (!evs.length) { body.append(emptyState({ icon: 'calendar', title: active === 'mine' ? 'No registrations yet' : 'No events here yet', text: active === 'upcoming' ? 'Admins publish events here. Check back soon.' : '' })); return; }
      body.append(h('div', { class: 'grid grid-cards-lg' }, evs.map((e) => {
        const btn = h('div', {}); const dr = () => { clear(btn); const open = e.registrationOpen !== false && active !== 'past';
          if (!user) btn.append(open ? h('a', { class: 'btn btn-primary btn-sm', href: 'login.html?next=events.html' }, 'Log in to register') : null);
          else if (reg[e.id]) btn.append(h('button', { class: 'btn btn-outline btn-sm', onclick: (ev) => busy(ev.currentTarget, async () => { await unregisterEvent(e.id, user.uid); reg[e.id] = false; e.registrationCount = Math.max(0, (e.registrationCount || 1) - 1); toast('Registration cancelled.', 'success'); draw(); }) }, icon('check', 14), 'Registered \u2022 cancel'));
          else if (open) btn.append(h('button', { class: 'btn btn-primary btn-sm', onclick: (ev) => busy(ev.currentTarget, async () => { await registerForEvent(e.id, user.uid); reg[e.id] = true; toast('You are registered!', 'success'); draw(); }) }, 'Register'));
          else btn.append(h('span', { class: 'chip' }, 'Registration closed')); }; dr();
        return eventCard(e, { action: btn }); })));
    } catch (e) { clear(body); body.append(errorState(friendlyError(e), draw)); }
  }
  app.append(h('div', { class: 'container section-sm stack' }, t, body)); draw();
});
