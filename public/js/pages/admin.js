// Admin console shell. Role gate here is UX only: Firestore rules + callables enforce the real checks.
import { boot } from './_boot.js';
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { isSuper } from '../core/auth.js';
import * as people from './admin/people.js';
import * as content from './admin/content.js';
import * as rep from './admin/reports.js';

const SECTIONS = [
  ['overview', 'Overview', 'grid', rep.overview], ['reports', 'Reports', 'flag', rep.reports], ['users', 'Users', 'users', people.users], ['tribes', 'Tribes', 'compass', content.tribes],
  ['projects', 'Projects', 'folder', content.projects], ['posts', 'Posts', 'zap', content.posts], ['showcase', 'Showcase', 'award', content.showcase], ['announcements', 'Announcements', 'bell', content.announcements],
  ['events', 'Events', 'calendar', content.events], ['resources', 'Resources', 'book', content.resources], ['taxonomy', 'Skills & categories', 'layers', content.taxonomy],
  ['admins', 'Admins', 'shield', people.admins, true], ['settings', 'Settings', 'settings', people.settings, true],
];
boot({ require: 'admin' }, async (ctx) => {
  const { main: app } = ctx; clear(app);
  const items = SECTIONS.filter((s) => !s[4] || isSuper()); const main = h('div', { style: { minWidth: 0 } }); const nav = h('nav', { class: 'admin-nav', 'aria-label': 'Admin sections' });
  const route = () => { const id = location.hash.slice(1) || 'overview'; const s = items.find((x) => x[0] === id) || items[0]; clear(nav);
    items.forEach(([k, l, ic]) => nav.append(h('a', { href: `#${k}`, class: k === s[0] ? 'active' : '' }, icon(ic, 18), l))); clear(main); s[3](main, ctx); };
  app.append(h('section', { class: 'page-hero' }, h('div', { class: 'container page-hero-in' }, h('div', {}, h('div', { class: 'eyebrow' }, isSuper() ? 'Super Admin' : 'Admin'), h('h1', {}, 'Admin console'), h('p', {}, 'Moderate users, Tribes and content. Private Tribe chat is out of scope by design.')))),
    h('div', { class: 'container admin-layout' }, nav, main));
  addEventListener('hashchange', route); route();
});
