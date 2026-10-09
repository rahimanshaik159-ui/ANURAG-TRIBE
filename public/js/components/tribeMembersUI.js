// Members tab: roster, roles, join requests, invitations, leave.
import { h, clear, debounce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog, chip, emptyState, input, busy } from '../core/ui.js';
import { avatarEl } from './avatar.js';
import { getUser } from '../services/users.js';
import { searchStudents } from '../services/users.js';
import { pendingJoinRequests, respondToJoinRequest, removeMember, setMemberRole, inviteToTribe, leaveTribe, archiveTribe } from '../services/tribes.js';
import { friendlyError } from '../core/firebase.js';
import { timeAgo } from '../lib/format.js';

const ROLE = { owner: 'Owner', moderator: 'Moderator', member: 'Member' };

/** mountMembers({tribe, me, myRole, members, container, tax, onChanged}) */
export function mountMembers({ tribe, me, myRole, members, container, tax, onChanged }) {
  const box = h('div', { class: 'stack-lg stack' }); container.append(box); const isLeader = ['owner', 'moderator'].includes(myRole); let online = new Set();
  const done = (msg) => { toast(msg, 'success'); onChanged(); };
  const act = (fn, msg) => async (e) => { await busy(e.currentTarget, async () => { await fn(); done(msg); }); };
  let tok = 0;
  async function draw() {
    const my = ++tok; const parts = [];
    const users = await Promise.all(members.map((m) => getUser(m.uid)));
    if (my !== tok) return;
    const ideal = tribe.idealMemberCount || 6;
    parts.push(h('div', { class: 'card' }, h('div', { class: 'row between wrap' }, h('h3', { style: { margin: 0 } }, `Members (${members.length})`), h('span', { class: 'muted small' }, `Ideal size ${ideal} - a guide, not a limit`)),
      members.map((m, i) => { const u = users[i];
        return h('div', { class: 'member-row' }, h('a', { href: `profile.html?id=${m.uid}`, class: `presence ${online.has(m.uid) ? 'online' : ''}` }, avatarEl(u, 'md')),
          h('div', { class: 'grow' }, h('strong', {}, u.name, m.uid === me.uid ? ' (you)' : ''), h('span', { class: 'muted small' }, `${(u.skills || []).slice(0, 3).map((s) => tax.label(s)).join(', ') || u.department || ''}`)), chip(ROLE[m.role], m.role === 'owner' ? 'chip-dark' : m.role === 'moderator' ? 'chip-red' : ''),
          m.uid !== me.uid && (myRole === 'owner' || (myRole === 'moderator' && m.role === 'member')) && m.role !== 'owner' ? h('div', { class: 'row' },
            myRole === 'owner' ? h('button', { class: 'btn btn-ghost btn-sm', onclick: act(() => setMemberRole(tribe.id, m.uid, m.role === 'moderator' ? 'member' : 'moderator'), 'Role updated') }, m.role === 'moderator' ? 'Make member' : 'Make moderator') : null,
            myRole === 'owner' ? h('button', { class: 'btn btn-ghost btn-sm', onclick: async (e) => { if (await confirmDialog({ title: `Make ${u.name} the owner?`, message: 'You will become a moderator. This is how ownership is handed over.', confirmLabel: 'Transfer ownership' })) act(() => setMemberRole(tribe.id, m.uid, 'owner'), 'Ownership transferred')({ currentTarget: e.target }); } }, 'Transfer ownership') : null,
            h('button', { class: 'btn btn-danger btn-sm', onclick: async (e) => { if (await confirmDialog({ title: `Remove ${u.name}?`, message: 'They will lose access to the Tribe chat, voice and projects.', confirmLabel: 'Remove', danger: true })) act(() => removeMember(tribe.id, m.uid), 'Member removed')({ currentTarget: e.target }); } }, 'Remove')) : null); })));
    if (isLeader) {
      const reqs = await pendingJoinRequests(tribe.id).catch(() => []); const ru = await Promise.all(reqs.map((r) => getUser(r.uid)));
      parts.push(h('div', { class: 'card', id: 'requests' }, h('h3', {}, `Join requests (${reqs.length})`), reqs.length ? reqs.map((r, i) => h('div', { class: 'member-row' }, h('a', { href: `profile.html?id=${r.uid}` }, avatarEl(ru[i], 'md')), h('div', { class: 'grow' }, h('strong', {}, ru[i].name), h('span', { class: 'muted small' }, `${timeAgo(r.createdAt)}${r.message ? ` \u2022 "${r.message}"` : ''}`)),
        h('button', { class: 'btn btn-primary btn-sm', onclick: act(() => respondToJoinRequest(tribe.id, r.uid, true), `${ru[i].name} joined`) }, 'Accept'), h('button', { class: 'btn btn-outline btn-sm', onclick: act(() => respondToJoinRequest(tribe.id, r.uid, false), 'Request declined') }, 'Decline'))) : h('p', { class: 'muted' }, 'No pending requests.')));
      const q = input({ type: 'search', placeholder: 'Search students by name, username or skill (e.g. "video editors")', 'aria-label': 'Search students to invite' }); const res = h('div', {});
      q.addEventListener('input', debounce(async () => {
        clear(res); if (q.value.trim().length < 2) return;
        try { const r = await searchStudents({ text: q.value, size: 8 }, tax); const have = new Set(members.map((m) => m.uid));
          res.append(r.items.filter((u) => !have.has(u.uid || u.id)).length ? r.items.filter((u) => !have.has(u.uid || u.id)).map((u) => h('div', { class: 'member-row' }, avatarEl(u, 'md'), h('div', { class: 'grow' }, h('strong', {}, u.name), h('span', { class: 'muted small' }, (u.skills || []).slice(0, 3).map((s) => tax.label(s)).join(', '))), h('button', { class: 'btn btn-outline btn-sm', onclick: async (e) => { await busy(e.currentTarget, async () => { await inviteToTribe(tribe.id, u.uid || u.id); toast(`Invited ${u.name}.`, 'success'); e.target.disabled = true; e.target.textContent = 'Invited'; }); } }, 'Invite'))) : h('p', { class: 'muted small' }, 'No students found.')); } catch (e) { res.append(h('p', { class: 'muted small' }, friendlyError(e))); }
      }, 450));
      parts.push(h('div', { class: 'card' }, h('h3', {}, 'Invite students'), h('p', { class: 'muted small' }, 'Invited students get a notification and decide for themselves.'), q, res));
    }
    parts.push(h('div', { class: 'card' }, h('h3', {}, 'Leave this Tribe'),
      myRole === 'owner' && members.length > 1 ? h('p', { class: 'muted' }, 'As the owner, transfer ownership to another member before leaving.') : h('p', { class: 'muted' }, myRole === 'owner' ? 'You are the only member. Leaving archives the Tribe.' : 'You can rejoin later by requesting again.'),
      h('div', { class: 'row wrap' }, h('button', { class: 'btn btn-danger', disabled: myRole === 'owner' && members.length > 1, onclick: async (e) => { if (await confirmDialog({ title: 'Leave this Tribe?', message: 'You will lose access to its chat, voice room and projects.', confirmLabel: 'Leave', danger: true })) await busy(e.target, async () => { await leaveTribe(tribe.id); toast('You left the Tribe.', 'success'); location.href = 'my-tribes.html'; }); } }, 'Leave Tribe'),
        myRole === 'owner' ? h('button', { class: 'btn btn-ghost', onclick: async (e) => { if (await confirmDialog({ title: 'Archive this Tribe?', message: 'It will be closed for everyone. Chat history stays hidden.', confirmLabel: 'Archive', danger: true })) await busy(e.target, async () => { await archiveTribe(tribe.id); toast('Tribe archived.', 'success'); location.href = 'my-tribes.html'; }); } }, 'Archive Tribe') : null)));
      if (my !== tok) return;
    clear(box); parts.forEach((p) => box.append(p));
  }
  draw();
  return { setPresence(s) { online = s; draw(); }, destroy() { box.remove(); } };
}
