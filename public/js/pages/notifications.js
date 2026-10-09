import { boot } from './_boot.js';
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { pageHero, skeletonGrid, emptyState, errorState, toast, busy } from '../core/ui.js';
import { listNotifications, markNotificationRead, markAllRead, deleteNotification } from '../services/content.js';
import { friendlyError } from '../core/firebase.js';
import { timeAgo } from '../lib/format.js';

const IC = { help_request: 'message', help_update: 'message', help_message: 'message', transfer_request: 'send', transfer_update: 'send', tribe_invite: 'users', tribe_join_request: 'users', tribe_join_decision: 'users', tribe_removed: 'users', tribe_reply: 'reply', voice_started: 'mic', tribe_project_created: 'folder', tribe_project_updated: 'folder', project_application: 'folder', project_update: 'folder', showcase_decision: 'award', announcement: 'bell', admin_action: 'shield', tribe_role: 'shield' };
const safeLink = (l) => (/^[a-z0-9-]+\.html([?#][\w=&%.,#-]*)?$/i.test(l || '') ? l : 'dashboard.html');
boot({ require: 'user' }, async (ctx) => {
  const { main: app, user } = ctx; clear(app); const list = h('div', { class: 'stack' });
  const markAll = h('button', { class: 'btn btn-outline btn-sm' }, icon('check', 14), 'Mark all read'); markAll.onclick = () => busy(markAll, async () => { await markAllRead(user.uid); toast('All caught up.', 'success'); load(); });
  async function load() {
    clear(list); list.append(skeletonGrid(3));
    try {
      const ns = await listNotifications(user.uid); clear(list);
      if (!ns.length) { list.append(emptyState({ icon: 'bell', title: 'No notifications yet', text: 'Invitations, requests, replies and announcements will appear here.' })); return; }
      ns.forEach((n) => list.append(h('div', { class: `notif ${n.read ? '' : 'unread'}` }, h('span', { class: 'tc-ic', style: { width: '40px', height: '40px', flex: 'none' } }, icon(IC[n.type] || 'bell', 18)),
        h('div', { class: 'grow' }, h('h4', {}, h('a', { href: safeLink(n.link), onclick: () => { if (!n.read) markNotificationRead(n.id).catch(() => {}); } }, n.title)), n.body ? h('p', { class: 'muted', style: { margin: '0 0 4px' } }, n.body) : null, h('span', { class: 'muted small' }, timeAgo(n.createdAt))),
        h('button', { class: 'icon-btn', 'aria-label': 'Dismiss notification', onclick: async () => { await deleteNotification(n.id); load(); } }, icon('x', 18)))));
    } catch (e) { clear(list); list.append(errorState(friendlyError(e), load)); }
  }
  app.append(pageHero('Notifications', 'Everything that needs your attention.', { right: markAll }), h('div', { class: 'container section-sm', style: { maxWidth: '760px' } }, list)); load();
});
