// Page shell: header, nav, mobile bottom bar, footer, and ROUTE GUARDS.
// Guards are a UX layer only. Real authorization = Firestore rules + Cloud Functions.
import { h, $, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { initAuth, session, onSession, logout, isAdmin, isSuper } from '../core/auth.js';
import { configured } from '../core/firebase.js';
import { watchUnread } from '../services/content.js';
import { loadTaxonomy } from '../services/users.js';
import { DEFAULT_TAXONOMY } from '../lib/taxonomy.js';
import { avatarEl } from './avatar.js';
import { emptyState, toast, banner } from '../core/ui.js';

const NAV = [
  ['index.html', 'Home', 'home'], ['about.html', 'About'], ['students.html', 'Students'], ['tribes.html', 'Tribes'],
  ['projects.html', 'Projects'], ['events.html', 'Events'], ['resources.html', 'Resources'], ['showcase.html', 'Showcase'],
];
const MENU = [
  ['dashboard.html', 'Dashboard', 'grid'], ['profile.html', 'My profile', 'user'], ['edit-profile.html', 'Edit profile', 'edit'],
  ['my-tribes.html', 'My Tribes', 'users'], ['my-projects.html', 'My projects', 'folder'], ['help-requests.html', 'I need someone', 'message'],
  ['transfer.html', 'File transfers', 'send'], ['ideas.html', 'Ideas & posts', 'zap'], ['notifications.html', 'Notifications', 'bell'],
];

let unwatch = null; let unread = 0;
const here = () => location.pathname.split('/').pop() || 'index.html';

function logoLink() {
  return h('a', { class: 'brand', href: 'index.html', 'aria-label': 'ANURAG TRIBE home' }, h('img', { src: 'assets/logo/anurag-tribe-logo.png', alt: 'ANURAG TRIBE', width: 52, height: 52 }));
}
function navLinks(active, cls = '') {
  const items = session.user ? [['dashboard.html', 'Dashboard'], ...NAV.slice(1)] : NAV;
  return items.map(([href, label]) => h('a', { href, class: `nav-link ${cls} ${(active === href || (active === 'index.html' && href === 'dashboard.html')) ? 'active' : ''}`.trim(), 'aria-current': active === href ? 'page' : null }, label));
}

function drawer(active) {
  const close = () => { d.remove(); document.body.classList.remove('modal-open'); };
  const links = [...NAV.map(([href, label]) => [href, label]), ...(session.user ? MENU.map(([a, b]) => [a, b]) : [])];
  const seen = new Set(); const uniq = links.filter(([hr]) => !seen.has(hr) && seen.add(hr));
  const d = h('div', { class: 'drawer-backdrop', onclick: (e) => { if (e.target === d) close(); } },
    h('nav', { class: 'drawer', 'aria-label': 'Menu' },
      h('div', { class: 'drawer-head' }, logoLink(), h('button', { class: 'icon-btn', 'aria-label': 'Close menu', onclick: close }, icon('x', 22))),
      session.user ? h('a', { class: 'drawer-user', href: 'profile.html' }, avatarEl(session.profile || { name: session.user.displayName }, 'md'), h('div', {}, h('strong', {}, (session.profile && session.profile.name) || session.user.displayName || 'Me'), h('span', { class: 'muted' }, session.profile ? `@${session.profile.username}` : ''))) : null,
      h('div', { class: 'drawer-links' }, uniq.map(([href, label]) => h('a', { href, class: href === active ? 'active' : '' }, label))),
      isAdmin() ? h('a', { class: 'drawer-admin', href: 'admin.html' }, icon('shield', 18), 'Admin console') : null,
      h('div', { class: 'drawer-foot' }, session.user ? h('button', { class: 'btn btn-outline btn-block', onclick: doLogout }, icon('logout', 18), 'Log out')
        : [h('a', { class: 'btn btn-outline btn-block', href: 'login.html' }, 'Login'), h('a', { class: 'btn btn-primary btn-block', href: 'register.html' }, 'Join Now')])));
  document.body.append(d); document.body.classList.add('modal-open');
}
async function doLogout() { await logout(); toast('You have been logged out.', 'success'); setTimeout(() => { location.href = 'index.html'; }, 400); }

function userMenu() {
  const p = session.profile || { name: session.user.displayName || 'Me' };
  const menu = h('div', { class: 'user-menu', hidden: true, role: 'menu' },
    h('div', { class: 'um-head' }, h('strong', {}, p.name), h('span', { class: 'muted' }, p.username ? `@${p.username}` : session.user.email)),
    MENU.map(([href, label, ic]) => h('a', { href, role: 'menuitem' }, icon(ic, 16), label)),
    isAdmin() ? h('a', { href: 'admin.html', role: 'menuitem', class: 'um-admin' }, icon('shield', 16), isSuper() ? 'Super Admin console' : 'Admin console') : null,
    h('button', { role: 'menuitem', onclick: doLogout }, icon('logout', 16), 'Log out'));
  const btn = h('button', { class: 'avatar-btn', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-label': 'Account menu', onclick: (e) => { e.stopPropagation(); const open = menu.hidden; menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); } }, avatarEl(p, 'sm'), icon('chevronDown', 14));
  document.addEventListener('click', () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); });
  return h('div', { class: 'user-menu-wrap' }, btn, menu);
}

function header(active) {
  const bell = session.user ? h('a', { class: 'icon-btn bell', href: 'notifications.html', 'aria-label': 'Notifications' }, icon('bell', 22), h('span', { class: 'badge-dot', id: 'bell-badge', hidden: unread === 0 }, unread > 9 ? '9+' : unread)) : null;
  return h('header', { class: 'site-header' }, h('div', { class: 'container header-in' },
    logoLink(),
    h('nav', { class: 'main-nav', 'aria-label': 'Main' }, navLinks(active)),
    h('div', { class: 'header-actions' },
      h('a', { class: 'icon-btn', href: 'students.html#search', 'aria-label': 'Search students' }, icon('search', 22)),
      bell,
      session.user ? userMenu() : [h('a', { class: 'btn btn-outline btn-sm hide-sm', href: `login.html${active === 'login.html' ? '' : `?next=${encodeURIComponent(location.pathname.split('/').pop() + location.search)}`}` }, 'Login'), h('a', { class: 'btn btn-primary btn-sm', href: 'register.html' }, 'Join Now')],
      h('button', { class: 'icon-btn menu-btn', 'aria-label': 'Open menu', onclick: () => drawer(active) }, icon('menu', 24)))));
}

function bottomNav(active) {
  if (!session.user) return null;
  const items = [['dashboard.html', 'Home', 'home'], ['students.html', 'People', 'users'], ['my-tribes.html', 'Tribes', 'compass'], ['notifications.html', 'Alerts', 'bell']];
  return h('nav', { class: 'bottom-nav', 'aria-label': 'Quick navigation' },
    items.map(([href, label, ic]) => h('a', { href, class: (active === href || (href === 'my-tribes.html' && active === 'tribe.html')) ? 'active' : '' }, icon(ic, 22), h('span', {}, label))),
    h('button', { onclick: () => drawer(active) }, icon('menu', 22), h('span', {}, 'More')));
}

function footer() {
  return h('footer', { class: 'site-footer' }, h('div', { class: 'container footer-in' },
    h('div', { class: 'foot-brand' }, h('img', { src: 'assets/logo/anurag-tribe-logo.png', alt: 'ANURAG TRIBE', width: 72, height: 72, loading: 'lazy' }), h('p', {}, 'One Campus. Many Minds. One Tribe.'), h('p', { class: 'muted' }, 'Connect. Discover. Build. Share. Grow.')),
    h('div', { class: 'foot-col' }, h('h4', {}, 'Explore'), ...[['students.html', 'Students'], ['tribes.html', 'Tribes'], ['projects.html', 'Projects'], ['events.html', 'Events']].map(([a, b]) => h('a', { href: a }, b))),
    h('div', { class: 'foot-col' }, h('h4', {}, 'Community'), ...[['about.html', 'About'], ['resources.html', 'Resources'], ['showcase.html', 'Showcase'], ['ideas.html', 'Ideas']].map(([a, b]) => h('a', { href: a }, b))),
    h('div', { class: 'foot-col' }, h('h4', {}, 'Information'), ...[['contact.html', 'Contact Us'], ['privacy.html', 'Privacy Policy'], ['terms.html', 'Terms of Service'], ['guidelines.html', 'Community Guidelines']].map(([a, b]) => h('a', { href: a }, b))),
    h('div', { class: 'foot-col foot-note' }, h('h4', {}, 'Your files, your control'), h('p', { class: 'muted' }, 'Large files move directly from student to student after the recipient accepts. ANURAG TRIBE never stores them.'))),
    h('div', { class: 'container foot-copy' }, `© ${new Date().getFullYear()} ANURAG TRIBE`));
}

function setupNotice(app) {
  clear(app);
  app.append(h('div', { class: 'container section' }, emptyState({ icon: 'settings', title: 'Firebase is not configured yet',
    text: 'Add your Firebase web config to public/js/config/firebase-config.js, then deploy rules and functions. The README has the 10-minute setup.' })));
}

/**
 * mountShell({page, require}) -> ctx | {blocked:true}
 * require: 'public' | 'user' | 'admin' | 'super'
 */
export async function mountShell({ require = 'public' } = {}) {
  const active = here();
  const headerHost = $('#site-header'); const footerHost = $('#site-footer'); const app = $('#app');
  const draw = () => { document.body.classList.toggle('has-bottom', !!session.user); if (headerHost) { clear(headerHost); headerHost.append(header(active)); } const bn = $('#bottom-nav'); if (bn) { clear(bn); const n = bottomNav(active); if (n) bn.append(n); } };
  if (footerHost) footerHost.append(footer());
  draw();
  await initAuth();
  if (!configured && require !== 'public') { draw(); setupNotice(app); return { blocked: true }; }
  const next = encodeURIComponent(location.pathname.split('/').pop() + location.search + location.hash);
  if (require !== 'public') {
    if (!session.user) { location.replace(`login.html?next=${next}`); return { blocked: true }; }
    if (!session.verified) { location.replace('verify-email.html'); return { blocked: true }; }
    if (!session.profile) { draw(); clear(app); app.append(h('div', { class: 'container section' }, emptyState({ icon: 'user', title: 'Your profile is missing', text: 'Registration did not finish saving your profile. Please log out and register again, or contact an admin.', action: h('button', { class: 'btn btn-primary', onclick: doLogout }, 'Log out') }))); return { blocked: true }; }
    if (require === 'admin' && !isAdmin()) { draw(); clear(app); app.append(h('div', { class: 'container section' }, emptyState({ icon: 'lock', title: 'Admins only', text: 'You do not have access to this page.', action: h('a', { class: 'btn btn-primary', href: 'dashboard.html' }, 'Back to dashboard') }))); return { blocked: true }; }
    if (require === 'super' && !isSuper()) { draw(); clear(app); app.append(h('div', { class: 'container section' }, emptyState({ icon: 'lock', title: 'Super Admin only', text: 'This area is limited to the Super Admin.', action: h('a', { class: 'btn btn-primary', href: 'dashboard.html' }, 'Back') }))); return { blocked: true }; }
  }
  draw();
  if (configured && session.user && session.verified) {
    if (unwatch) unwatch();
    unwatch = watchUnread(session.user.uid, (n) => { unread = n; const b = $('#bell-badge'); if (b) { b.hidden = n === 0; b.textContent = n > 9 ? '9+' : n; } });
  }
  onSession(() => draw());
  const tax = configured && session.user ? await loadTaxonomy() : DEFAULT_TAXONOMY;
  return { user: session.user, profile: session.profile, role: session.role, tax, main: app, session };
}
export { banner };
