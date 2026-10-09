// Reusable cards styled after the prototype (rounded white cards, red accents).
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { avatarEl } from './avatar.js';
import { skillChips, chip } from '../core/ui.js';
import { yearLabel, PROJECT_STATUSES, PROJECT_CATEGORIES } from '../lib/taxonomy.js';
import { formatDate, timeAgo } from '../lib/format.js';

const socialIcon = (u) => { const s = u.social || {}; const k = ['linkedin', 'github', 'portfolio', 'instagram'].find((x) => s[x]); return k ? h('a', { class: 'pc-social', href: s[k], target: '_blank', rel: 'noopener noreferrer nofollow', 'aria-label': `${u.name} on ${k}` }, icon(k === 'portfolio' ? 'globe' : k, 16)) : null; };

/** Student card (prototype: avatar, name, "CSE • 3rd Year", chips, View Profile). */
export function personCard(u, { tax, reasons = [], actions = null, highlight = [] } = {}) {
  return h('article', { class: 'card person-card' },
    socialIcon(u),
    h('a', { class: 'pc-avatar', href: `profile.html?id=${u.uid || u.id}`, 'aria-label': `View ${u.name}` }, avatarEl(u, 'xl')),
    h('h3', { class: 'pc-name' }, h('a', { href: `profile.html?id=${u.uid || u.id}` }, u.name)),
    h('p', { class: 'pc-meta' }, [u.department, yearLabel(u.year)].filter(Boolean).join(' \u2022 ')),
    u.availability === 'open' ? h('span', { class: 'avail' }, h('i'), 'Open to collaborate') : null,
    skillChips(u.skills || [], tax, { max: 3, highlight }),
    reasons.length ? h('p', { class: 'reason' }, icon('zap', 14), reasons[0]) : null,
    actions || h('a', { class: 'btn btn-outline btn-sm btn-block', href: `profile.html?id=${u.uid || u.id}` }, 'View Profile', icon('arrowRight', 14)));
}

/** "4/6 MEMBERS" meter. 5-6 is the IDEAL size, not a limit, so overflow shows as "+n". */
export function memberMeter(t) {
  const ideal = t.idealMemberCount || 6; const n = t.memberCount || 0;
  const dots = Array.from({ length: Math.max(ideal, n) }, (_, i) => h('i', { class: i < n ? (i >= ideal ? 'on over' : 'on') : '' }));
  return h('div', { class: 'meter', title: `Ideal size: ${ideal}` }, h('span', { class: 'meter-dots' }, dots), h('strong', {}, `${n}/${ideal} MEMBERS`));
}
export function tribeCard(t, { tax, reasons = [], actions = null, role = '', unread = false } = {}) {
  const cat = tax.catById[t.category] || { label: t.category, icon: 'users' };
  return h('article', { class: 'card tribe-card' },
    h('div', { class: 'tc-top' }, h('span', { class: 'tc-ic' }, icon(cat.icon || 'users', 22)), h('div', {},
      h('h3', {}, h('a', { href: `tribe.html?id=${t.id}` }, t.name), unread ? h('span', { class: 'unread-dot', title: 'New messages' }) : null),
      h('span', { class: 'muted small' }, cat.label, t.privacy === 'private' ? ' \u2022 Private' : ''))),
    h('p', { class: 'clamp-2' }, t.description),
    memberMeter(t),
    skillChips(t.skills || [], tax, { max: 4 }),
    reasons.length ? h('p', { class: 'reason' }, icon('zap', 14), reasons[0]) : null,
    role ? h('span', { class: 'chip chip-dark' }, role) : null,
    actions || h('a', { class: 'btn btn-primary btn-sm btn-block', href: `tribe.html?id=${t.id}` }, 'View Tribe', icon('arrowRight', 14)));
}

export const statusLabel = (id) => (PROJECT_STATUSES.find((s) => s.id === id) || { label: id }).label;
export const categoryLabel = (id) => (PROJECT_CATEGORIES.find((s) => s.id === id) || { label: id }).label;
export function projectCard(p, { tax, reasons = [], owner = null } = {}) {
  return h('article', { class: 'card project-card' },
    h('div', { class: 'pj-thumb' }, icon(p.category === 'film' ? 'film' : p.category === 'mobile' ? 'cpu' : p.category === 'photography' ? 'camera' : 'code', 34), p.tribeId ? h('span', { class: 'pj-tribe' }, icon('users', 12), p.tribeName || 'Tribe') : null),
    h('div', { class: 'pj-body' },
      h('div', { class: 'row between' }, h('span', { class: `status status-${p.status}` }, statusLabel(p.status)), h('span', { class: 'muted small' }, categoryLabel(p.category))),
      h('h3', {}, h('a', { href: `projects.html?id=${p.id}` }, p.title)),
      h('p', { class: 'clamp-2 muted' }, p.description),
      skillChips(p.skillsNeeded || [], tax, { max: 3 }),
      reasons.length ? h('p', { class: 'reason' }, icon('zap', 14), reasons[0]) : null,
      h('div', { class: 'pj-foot muted small' }, owner ? h('span', {}, `by ${owner.name}`) : null, h('span', {}, icon('heart', 13), ` ${p.likeCount || 0}`), h('span', {}, icon('users', 13), ` ${(p.memberUids || []).length}`))));
}

export function eventCard(e, { action } = {}) {
  const d = e.startAt && e.startAt.toDate ? e.startAt.toDate() : null;
  return h('article', { class: 'card event-card' },
    h('div', { class: 'ev-date' }, h('span', {}, d ? d.toLocaleString(undefined, { month: 'short' }).toUpperCase() : ''), h('strong', {}, d ? d.getDate() : '')),
    h('div', { class: 'ev-body' }, h('h3', {}, e.title), h('p', { class: 'muted small' }, [d ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '', e.location].filter(Boolean).join(' \u2022 ')),
      h('p', { class: 'clamp-2' }, e.description), h('div', { class: 'chips' }, (e.tags || []).slice(0, 0), chip(e.category || 'event', 'chip-dark')),
      h('div', { class: 'row between ev-foot' }, h('span', { class: 'muted small' }, icon('users', 14), ` ${e.registrationCount || 0} registered`), action || null)));
}
export function resourceCard(r, { tax, reasons = [] } = {}) {
  return h('article', { class: 'card resource-card' }, h('div', { class: 'row between' }, chip(r.type || 'resource', 'chip-dark'), r.deadline ? h('span', { class: 'muted small' }, `Deadline ${formatDate(r.deadline)}`) : null),
    h('h3', {}, r.title), h('p', { class: 'clamp-3 muted' }, r.description), skillChips(r.tags || [], tax, { max: 3 }),
    reasons.length ? h('p', { class: 'reason' }, icon('zap', 14), reasons[0]) : null,
    h('a', { class: 'btn btn-outline btn-sm', href: r.url, target: '_blank', rel: 'noopener noreferrer nofollow' }, 'Open', icon('arrowRight', 14)));
}
export function showcaseCard(s, { author, tax } = {}) {
  return h('article', { class: 'card showcase-card' }, h('div', { class: 'sc-thumb' }, icon('award', 30)),
    h('div', { class: 'pj-body' }, h('span', { class: 'muted small' }, categoryLabel(s.category)), h('h3', {}, s.title), h('p', { class: 'clamp-3 muted' }, s.description),
      h('div', { class: 'chips' }, (s.links || []).slice(0, 3).map((l) => h('a', { class: 'chip chip-link', href: l.url, target: '_blank', rel: 'noopener noreferrer nofollow' }, icon('link', 12), l.label || new URL(l.url).hostname.replace(/^www\./, '')))),
      author ? h('div', { class: 'row small muted sc-by' }, avatarEl(author, 'xs'), `by ${author.name}`, s.tribeId ? ' \u2022 Tribe project' : '') : null));
}
export { timeAgo };
