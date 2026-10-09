import { boot } from './_boot.js';
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { pageHero, skeletonGrid, emptyState, tabs, toast, busy, chip } from '../core/ui.js';
import { tribeCard } from '../components/cards.js';
import { myMemberships, myInvites, myJoinRequests, respondToInvite, cancelJoinRequest, getTribe } from '../services/tribes.js';
import { friendlyError } from '../core/firebase.js';
import { timeAgo } from '../lib/format.js';

boot({ require: 'user' }, async (ctx) => {
  const { main: app, tax, user } = ctx; clear(app);
  const body = h('div', {});
  let mine = []; let invites = []; let reqs = [];
  const load = async () => { [mine, invites, reqs] = await Promise.all([myMemberships(user.uid), myInvites(user.uid), myJoinRequests(user.uid).catch(() => [])]); };
  const names = {}; const nameOf = async (id) => { if (!names[id]) { try { names[id] = (await getTribe(id))?.name || 'Tribe'; } catch (_) { names[id] = 'Private Tribe'; } } return names[id]; };
  let active = location.hash === '#invites' ? 'invites' : location.hash === '#requests' ? 'requests' : 'tribes';
  const t = tabs([{ id: 'tribes', label: 'My Tribes' }, { id: 'invites', label: 'Invitations' }, { id: 'requests', label: 'My requests' }], active, (id) => { active = id; draw(); });
  async function draw() {
    clear(body);
    t.setActive(active);
    if (active === 'tribes') {
      body.append(mine.length ? h('div', { class: 'grid grid-cards-lg' }, mine.map((x) => tribeCard(x, { tax, role: x.myRole, unread: x.lastMessageAt && (!x.lastReadAt || x.lastMessageAt.toMillis() > x.lastReadAt.toMillis()), actions: h('a', { class: 'btn btn-dark btn-sm btn-block', href: `tribe.html?id=${x.id}` }, 'Open workspace', icon('arrowRight', 14)) })))
        : emptyState({ icon: 'users', title: 'You are not in a Tribe yet', text: 'Join one that matches your skills, or start your own.', action: h('div', { class: 'row' }, h('a', { class: 'btn btn-primary', href: 'tribes.html' }, 'Browse Tribes'), h('a', { class: 'btn btn-outline', href: 'create-tribe.html' }, 'Create a Tribe')) }));
    } else if (active === 'invites') {
      body.append(invites.length ? h('div', { class: 'stack' }, invites.map((i) => h('div', { class: 'card row between wrap' }, h('div', {}, h('h3', { style: { margin: 0 } }, i.tribeName), h('p', { class: 'muted small', style: { margin: '4px 0 0' } }, `Invited by ${i.inviterName || 'a student'} ${timeAgo(i.createdAt)}`, i.message ? ` \u2022 "${i.message}"` : '')),
        h('div', { class: 'row' }, h('button', { class: 'btn btn-primary btn-sm', onclick: (e) => answer(e, i, true) }, 'Accept'), h('button', { class: 'btn btn-outline btn-sm', onclick: (e) => answer(e, i, false) }, 'Decline')))))
        : emptyState({ icon: 'inbox', title: 'No invitations', text: 'When a Tribe leader invites you, it will appear here (and in your notifications).' }));
    } else {
      const items = await Promise.all(reqs.map(async (r) => ({ ...r, name: await nameOf(r.tribeId) })));
      body.append(items.length ? h('div', { class: 'stack' }, items.map((r) => h('div', { class: 'card row between wrap' }, h('div', {}, h('h3', { style: { margin: 0 } }, r.name), h('p', { class: 'muted small', style: { margin: '4px 0 0' } }, `Requested ${timeAgo(r.createdAt)}`)),
        h('div', { class: 'row' }, chip(r.status, r.status === 'pending' ? '' : r.status === 'accepted' ? 'chip-red' : ''), r.status === 'pending' ? h('button', { class: 'btn btn-outline btn-sm', onclick: async (e) => { await busy(e.currentTarget, async () => { await cancelJoinRequest(r.tribeId, user.uid); toast('Request cancelled.', 'success'); await load(); draw(); }); } }, 'Cancel') : null))))
        : emptyState({ icon: 'send', title: 'No join requests', text: 'Requests you send to Tribes are tracked here.', action: h('a', { class: 'btn btn-primary', href: 'tribes.html' }, 'Find a Tribe') }));
    }
  }
  async function answer(e, inv, accept) { await busy(e.currentTarget, async () => { const r = await respondToInvite(inv.id, accept); toast(accept ? `Welcome to ${inv.tribeName}!` : 'Invitation declined.', 'success'); if (accept) { location.href = `tribe.html?id=${r.tribeId}`; return; } await load(); draw(); }); }
  app.append(pageHero('My Tribes', 'Your workspaces, invitations and join requests.', { right: h('a', { class: 'btn btn-primary', href: 'create-tribe.html' }, icon('plus', 16), 'Create a Tribe') }), h('div', { class: 'container section-sm stack' }, t, body));
  body.append(skeletonGrid(3));
  try { await load(); invites.length && active === 'tribes' && t.setActive('tribes'); await draw(); } catch (e) { clear(body); toast(friendlyError(e), 'error'); }
});
