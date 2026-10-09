// Tribe workspace: Chat | Voice | Projects | Members | About. Tabs via URL hash.
import { boot } from './_boot.js';
import { h, clear, qs } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { emptyState, tabs, toast, busy, field, input, textarea, select, counter, banner, openModal, chip } from '../core/ui.js';
import { memberMeter } from '../components/cards.js';
import { avatarEl } from '../components/avatar.js';
import { skillPicker } from '../components/skillPicker.js';
import { mountChat } from '../components/tribeChatUI.js';
import { mountVoice } from '../components/voiceUI.js';
import { mountProjects } from '../components/tribeProjectsUI.js';
import { mountMembers } from '../components/tribeMembersUI.js';
import { getTribe, myMembership, listMembers, myJoinRequest, requestToJoin, cancelJoinRequest, updateTribe, startPresence, watchPresence, pendingJoinRequests } from '../services/tribes.js';
import { getUser } from '../services/users.js';
import { validateTribe } from '../lib/validators.js';
import { friendlyError } from '../core/firebase.js';

boot({ require: 'user' }, async (ctx) => {
  const { main: app, tax, user, profile: me } = ctx; clear(app);
  const id = qs().get('id');
  const notFound = (t, x) => { clear(app); app.append(h('div', { class: 'container section' }, emptyState({ icon: 'lock', title: t, text: x, action: h('a', { class: 'btn btn-primary', href: 'tribes.html' }, 'Browse Tribes') }))); };
  if (!id) return notFound('No Tribe selected', 'Open a Tribe from the list.');
  let tribe; try { tribe = await getTribe(id); } catch (e) { return notFound('Tribe not available', 'It may be private, or you may not have access.'); }
  if (!tribe) return notFound('Tribe not found', 'It may have been removed.');
  const mem = await myMembership(id, user.uid); const isMember = !!mem;
  const myRole = mem ? mem.role : null; const isLeader = ['owner', 'moderator'].includes(myRole);
  let members = []; try { members = await listMembers(id); } catch (_) { /* hidden for non-members of private tribes */ }
  const cat = tax.catById[tribe.category] || { label: tribe.category, icon: 'users' };

  // ---- header
  const actions = h('div', { class: 'row wrap' });
  const header = h('section', { class: 'page-hero' }, h('div', { class: 'container page-hero-in' },
    h('div', { class: 'tribe-head' }, h('span', { class: 'tc-ic' }, icon(cat.icon || 'users', 30)), h('div', {}, h('div', { class: 'eyebrow' }, cat.label, tribe.privacy === 'private' ? ' \u2022 Private' : ''), h('h1', {}, tribe.name), h('div', { style: { color: '#d3d3da', marginTop: '6px' } }, memberMeter(tribe)))), actions));
  app.append(header);
  if (tribe.status !== 'active') app.append(h('div', { class: 'container', style: { marginTop: '14px' } }, banner(tribe.status === 'suspended' ? 'This Tribe has been suspended by an admin. Chat, voice and project creation are disabled.' : 'This Tribe is archived and read-only.', 'warn')));

  // ---- non-member overview
  if (!isMember) {
    const jr = await myJoinRequest(id, user.uid); let pending = jr && jr.status === 'pending';
    const joinBtn = h('div', {});
    const drawJoin = () => { clear(joinBtn); joinBtn.append(pending ? h('button', { class: 'btn btn-light', onclick: async (e) => { await busy(e.currentTarget, async () => { await cancelJoinRequest(id, user.uid); pending = false; toast('Request cancelled.', 'success'); drawJoin(); }); } }, 'Requested \u2022 tap to cancel')
      : tribe.status === 'active' ? h('button', { class: 'btn btn-primary btn-lg', onclick: () => { const msg = textarea({ rows: 3, maxlength: 300, placeholder: 'What can you bring to this Tribe?' }); openModal({ title: `Join ${tribe.name}`, size: 'sm', body: h('div', {}, field('Message (optional)', msg)), actions: [{ label: 'Cancel', onClick: (c) => c() }, { label: 'Send request', variant: 'btn-primary', onClick: async (c) => { try { await requestToJoin(id, user.uid, msg.value.trim()); pending = true; toast('Request sent.', 'success'); c(); drawJoin(); } catch (er) { toast(friendlyError(er), 'error'); } } }] }); } }, 'JOIN TRIBE') : null); };
    drawJoin(); actions.append(joinBtn);
    const mUsers = await Promise.all(members.map((m) => getUser(m.uid)));
    app.append(h('div', { class: 'container section-sm' }, h('div', { class: 'dash-grid' }, h('div', { class: 'stack-lg stack' }, h('section', { class: 'card' }, h('h3', {}, 'About this Tribe'), h('p', {}, tribe.description), tribe.goal ? h('p', {}, h('strong', {}, 'Goal: '), tribe.goal) : null, h('div', { class: 'chips' }, (tribe.skills || []).map((s) => chip(tax.label(s), 'chip-red')))),
      h('p', { class: 'muted small' }, 'Chat, voice meets and projects are private to members.')), h('aside', { class: 'card' }, h('h3', {}, 'Members'), mUsers.map((u) => h('a', { class: 'member-row', href: `profile.html?id=${u.uid}` }, avatarEl(u, 'md'), h('div', { class: 'grow' }, h('strong', {}, u.name), h('span', { class: 'muted small' }, u.department || ''))))))));
    return;
  }

  // ---- member workspace
  const stopPresence = startPresence(id, user.uid); addEventListener('pagehide', stopPresence);
  let online = new Set(); const body = h('div', {}); let current = null; let membersUI = null;
  const side = h('aside', { class: 'ws-side' });
  const unsubPresence = watchPresence(id, (s) => { online = s; drawSide(); if (membersUI) membersUI.setPresence(s); });
  async function drawSide() {
    const users = await Promise.all(members.map((m) => getUser(m.uid))); clear(side);
    side.append(h('div', { class: 'card' }, h('h3', {}, 'About'), h('p', { class: 'small' }, tribe.description), tribe.goal ? h('p', { class: 'small' }, h('strong', {}, 'Goal: '), tribe.goal) : null, h('div', { class: 'chips' }, (tribe.skills || []).slice(0, 8).map((s) => chip(tax.label(s), 'chip-red')))),
      h('div', { class: 'card' }, h('div', { class: 'row between' }, h('h3', { style: { margin: 0 } }, `Members \u2022 ${online.size} online`), h('a', { class: 'small red', href: '#members', onclick: () => go('members') }, 'Manage')), members.slice(0, 12).map((m, i) => h('a', { class: 'member-row', href: `profile.html?id=${m.uid}` }, h('span', { class: `presence ${online.has(m.uid) ? 'online' : ''}` }, avatarEl(users[i], 'sm')), h('div', { class: 'grow' }, h('strong', {}, users[i].name), h('span', { class: 'muted small' }, m.role !== 'member' ? m.role : (users[i].department || '')))))),
      h('div', { class: 'card' }, h('h3', {}, 'Send a file'), h('p', { class: 'small muted' }, 'Need to share a real file? It goes directly from your device to a member after they accept. Never stored.'), h('a', { class: 'btn btn-outline btn-sm btn-block', href: `transfer.html?tribe=${id}` }, icon('send', 16), 'Direct file transfer')));
  }
  const tabItems = [{ id: 'chat', label: 'Chat' }, { id: 'voice', label: 'Voice' }, { id: 'projects', label: 'Projects' }, { id: 'members', label: 'Members' }, ...(isLeader ? [{ id: 'settings', label: 'Settings' }] : [])];
  const valid = tabItems.map((t) => t.id); let active = valid.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'chat';
  const tabBar = tabs(tabItems, active, (t) => go(t), { label: 'Tribe sections' });
  async function reloadMembers() { members = await listMembers(id); drawSide(); }
  function go(tab) {
    if (current && current.destroy) current.destroy(); current = null; membersUI = null; clear(body); active = tab; history.replaceState(null, '', `#${tab}`); tabBar.setActive(tab);
    if (tab === 'chat') current = mountChat({ tribe, me: { uid: user.uid }, isLeader, container: body });
    else if (tab === 'voice') current = mountVoice({ tribe, me: { uid: user.uid }, container: body });
    else if (tab === 'projects') current = mountProjects({ tribe, me: { uid: user.uid }, memberUids: members.map((m) => m.uid), isLeader, tax, container: body });
    else if (tab === 'members') { membersUI = mountMembers({ tribe, me: { uid: user.uid }, myRole, members, container: body, tax, onChanged: async () => { await reloadMembers(); tribe = await getTribe(id); go('members'); } }); membersUI.setPresence(online); current = membersUI; }
    else if (tab === 'settings') current = settingsTab();
  }
  function settingsTab() {
    const name = input({ value: tribe.name, maxlength: 40 }); const desc = textarea({ value: tribe.description, rows: 4 }); const goal = input({ value: tribe.goal || '', maxlength: 200 }); const focus = input({ value: tribe.projectFocus || '', maxlength: 100 });
    const cat_ = select(tax.categories.map((c) => ({ value: c.id, label: c.label })), { value: tribe.category }); const size = select([2, 3, 4, 5, 6, 7, 8, 10, 12].map((n) => ({ value: n, label: String(n) })), { value: tribe.idealMemberCount });
    const skills = skillPicker({ tax, value: tribe.skills || [], max: 12 }); const priv = select([{ value: 'public', label: 'Public (discoverable, join by request)' }, { value: 'private', label: 'Private (invitation only)' }], { value: tribe.privacy });
    const fN = field('Tribe name', name, { required: true }), fD = field('Description', desc, { required: true });
    const save = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save Tribe settings');
    const el = h('form', { class: 'card stack', novalidate: true, onsubmit: async (e) => { e.preventDefault();
      const v = validateTribe({ name: name.value, description: desc.value, goal: goal.value, category: cat_.value, skills: skills.getValue(), interests: tribe.interests || [], privacy: priv.value, idealMemberCount: size.value, projectFocus: focus.value }, tax);
      fN.setError(v.errors.name || ''); fD.setError(v.errors.description || ''); if (!v.ok) return;
      await busy(save, async () => { await updateTribe(id, v.value); Object.assign(tribe, v.value); toast('Tribe updated.', 'success'); setTimeout(() => location.reload(), 500); }); } },
      h('h3', {}, 'Tribe settings'), fN, fD, field('Goal', goal), h('div', { class: 'form-grid' }, field('Category', cat_), field('Ideal size', size, { hint: 'A target, not a limit.' })), field('Project focus', focus), field('Visibility', priv), h('div', { class: 'label' }, 'Skills this Tribe needs'), skills, h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, save));
    body.append(el); return { destroy: () => el.remove() };
  }
  addEventListener('hashchange', () => { const t = location.hash.slice(1); if (valid.includes(t) && t !== active) go(t); });
  addEventListener('pagehide', () => { unsubPresence(); });
  drawSide();
  // leaders get a badge on Members when join requests are waiting
  if (isLeader) pendingJoinRequests(id).then((r) => { if (r.length) { tabItems.find((t) => t.id === 'members').badge = r.length; tabBar.setActive(active); } }).catch(() => {});
  app.append(h('div', { class: 'container' }, h('div', { style: { paddingTop: '16px' } }, tabBar), h('div', { class: 'workspace' }, body, side)));
  go(active);
});
