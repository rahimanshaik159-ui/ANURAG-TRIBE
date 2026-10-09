// "I NEED SOMEONE": find people by needed skill -> view profile -> request help -> chat -> collaborate -> optionally invite to a Tribe.
import { boot } from './_boot.js';
import { h, clear, qs } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { pageHero, skeletonGrid, emptyState, tabs, toast, busy, chip, banner, field, select, textarea, openModal, errorState } from '../core/ui.js';
import { personCard } from '../components/cards.js';
import { avatarEl } from '../components/avatar.js';
import { skillPicker } from '../components/skillPicker.js';
import { openHelpModal } from '../components/helpModal.js';
import { rankPeople } from '../lib/recommend.js';
import { peopleWithSkills, getUser } from '../services/users.js';
import * as HR from '../services/helpRequests.js';
import { myMemberships, inviteToTribe } from '../services/tribes.js';
import { friendlyError } from '../core/firebase.js';
import { timeAgo, formatTime } from '../lib/format.js';

const STATUS_CHIP = { open: '', accepted: 'chip-red', declined: '', completed: 'chip-dark', cancelled: '' };

boot({ require: 'user' }, async (ctx) => {
  const { main: app, tax, user, profile: me } = ctx; clear(app);
  const rid = qs().get('id');
  app.append(pageHero('I need someone', 'Find a person with the skill you need, request help, chat, collaborate - and optionally bring them into your Tribe.', { eyebrow: 'Collaborate', right: h('button', { class: 'btn btn-primary btn-lg', onclick: () => openHelpModal({ me, tax, target: null }) }, icon('plus', 18), 'Post a request') }));
  const wrap = h('div', { class: 'container section-sm stack' }); app.append(wrap);
  if (rid) return detail(rid);
  let active = 'find'; const body = h('div', {});
  const t = tabs([{ id: 'find', label: 'Find someone' }, { id: 'mine', label: 'My requests' }, { id: 'board', label: 'Open board' }], active, (id) => { active = id; draw(); });
  wrap.append(t, body);
  if (qs().get('new')) openHelpModal({ me, tax, target: null, skills: qs().get('skill') ? [qs().get('skill')] : [] });

  async function draw() {
    clear(body);
    if (active === 'find') return findTab();
    body.append(skeletonGrid(3));
    try {
      if (active === 'mine') {
        const rs = await HR.myRequests(user.uid); const others = await Promise.all(rs.map((r) => getUser(r.participants.find((p) => p !== user.uid)))); clear(body);
        body.append(rs.length ? h('div', { class: 'stack' }, rs.map((r, i) => h('a', { class: 'card row between wrap card-hover', href: `help-requests.html?id=${r.id}` }, h('div', { class: 'grow' }, h('strong', {}, r.title), h('p', { class: 'muted small', style: { margin: '4px 0 0' } }, r.requesterUid === user.uid ? (r.targetUid ? `To ${others[i].name}` : (r.helperUid ? `Helper: ${others[i].name}` : 'Open board')) : `From ${others[i].name}`, ` \u2022 ${timeAgo(r.updatedAt)}`)), chip(r.status, STATUS_CHIP[r.status]))))
          : emptyState({ icon: 'message', title: 'No requests yet', text: 'Post a request or find someone by skill.' }));
      } else {
        const rs = await HR.openBoard(me.skills || []); const mine = rs.filter((r) => r.requesterUid !== user.uid); const us = await Promise.all(mine.map((r) => getUser(r.requesterUid))); clear(body);
        body.append(banner('Showing open requests that match your skills. Offer help and the requester can chat with you right away.', 'info'));
        body.append(mine.length ? h('div', { class: 'stack', style: { marginTop: '14px' } }, mine.map((r, i) => h('div', { class: 'card stack' }, h('div', { class: 'row between wrap' }, h('div', { class: 'row' }, avatarEl(us[i], 'md'), h('div', {}, h('strong', {}, r.title), h('div', { class: 'muted small' }, `${us[i].name} \u2022 ${timeAgo(r.createdAt)}`))), h('button', { class: 'btn btn-primary btn-sm', onclick: (e) => busy(e.currentTarget, async () => { await HR.volunteer(r, user.uid); toast('You offered help. Opening the conversation...', 'success'); location.href = `help-requests.html?id=${r.id}`; }) }, 'I can help')), h('p', { style: { margin: 0 } }, r.description), h('div', { class: 'chips' }, (r.skillsNeeded || []).map((s) => chip(tax.label(s), (me.skills || []).includes(s) ? 'chip-red' : ''))))))
          : emptyState({ icon: 'inbox', title: 'Nothing on the board for your skills', text: 'Check back later, or add more skills to your profile.', action: h('a', { class: 'btn btn-outline', href: 'edit-profile.html#skills' }, 'Update skills') }));
      }
    } catch (e) { clear(body); body.append(errorState(friendlyError(e), draw)); }
  }
  function findTab() {
    const picker = skillPicker({ tax, max: 3, value: qs().get('skill') ? [qs().get('skill')] : [], compact: true }); const results = h('div', {});
    const go = h('button', { class: 'btn btn-primary', onclick: async (e) => { const need = picker.getValue(); if (!need.length) return toast('Pick at least one skill you need.', 'error');
      await busy(e.currentTarget, async () => { clear(results); results.append(skeletonGrid(3)); const people = await peopleWithSkills(need, { size: 40 }); const ranked = rankPeople(me, people, { need, limit: 12 }, tax); clear(results);
        results.append(ranked.length ? h('div', { class: 'grid grid-cards' }, ranked.map((r) => personCard(r.person, { tax, reasons: r.reasons, highlight: need, actions: h('div', { class: 'stack', style: { width: '100%', gap: '8px' } }, h('button', { class: 'btn btn-primary btn-sm btn-block', onclick: () => openHelpModal({ me, target: r.person, tax, skills: need }) }, 'Request help'), h('a', { class: 'btn btn-outline btn-sm btn-block', href: `profile.html?id=${r.person.uid}` }, 'View profile')) })))
          : emptyState({ icon: 'users', title: 'Nobody matches yet', text: 'Post your request on the Open Board so people with this skill can find you.', action: h('button', { class: 'btn btn-primary', onclick: () => openHelpModal({ me, tax, target: null, skills: need }) }, 'Post to Open Board') })); }); } }, icon('search', 18), 'Find people');
    body.append(h('div', { class: 'card stack' }, h('h3', { style: { margin: 0 } }, 'What kind of person do you need?'), h('p', { class: 'muted small', style: { margin: 0 } }, 'e.g. a Video Editor, an Actor, a Python Developer, a UI/UX Designer, an AI student.'), picker, h('div', {}, go)), results);
    if (qs().get('skill')) go.click();
  }
  draw();

  async function detail(id) {
    clear(wrap); wrap.append(h('a', { class: 'btn btn-ghost btn-sm', style: { alignSelf: 'flex-start' }, href: 'help-requests.html' }, icon('arrowRight', 14), 'All requests'));
    let r; try { r = await HR.getRequest(id); } catch (_) { r = null; }
    if (!r) { wrap.append(emptyState({ icon: 'lock', title: 'Request not available', text: 'It may be private to its participants.' })); return; }
    const box = h('div', { class: 'stack-lg stack' }); wrap.append(box);
    const refresh = async () => { r = await HR.getRequest(id); render(); };
    const isReq = r.requesterUid === user.uid; const isTarget = r.targetUid === user.uid || r.helperUid === user.uid;
    const msgs = h('div', { class: 'chat-list', style: { minHeight: '220px', maxHeight: '420px', borderRadius: '14px' } }); const ta = h('textarea', { class: 'input', rows: 2, maxlength: 1500, placeholder: 'Write a message...' });
    let unsub = null;
    async function render() {
      clear(box); const other = await getUser(r.participants.find((p) => p !== user.uid) || r.requesterUid);
      const canChat = ['open', 'accepted'].includes(r.status) && r.participants.includes(user.uid);
      box.append(h('section', { class: 'card stack' }, h('div', { class: 'row between wrap' }, h('h2', { style: { margin: 0 } }, r.title), chip(r.status, STATUS_CHIP[r.status])), h('p', { style: { whiteSpace: 'pre-wrap', margin: 0 } }, r.description), h('div', { class: 'chips' }, (r.skillsNeeded || []).map((s) => chip(tax.label(s), 'chip-red'))),
        r.participants.length > 1 ? h('a', { class: 'member-row', href: `profile.html?id=${other.uid}` }, avatarEl(other, 'md'), h('div', { class: 'grow' }, h('strong', {}, other.name), h('span', { class: 'muted small' }, isReq ? 'Helper' : 'Requester'))) : h('p', { class: 'muted small' }, 'Waiting for someone to offer help on the Open Board.'),
        h('div', { class: 'row wrap' },
          isTarget && r.status === 'open' && r.targetUid === user.uid ? [h('button', { class: 'btn btn-primary', onclick: (e) => busy(e.currentTarget, async () => { await HR.acceptRequest(id); toast('Accepted. You can chat now.', 'success'); refresh(); }) }, 'Accept'), h('button', { class: 'btn btn-outline', onclick: (e) => busy(e.currentTarget, async () => { await HR.declineRequest(id); refresh(); }) }, 'Decline')] : null,
          isReq && ['open', 'accepted'].includes(r.status) ? h('button', { class: 'btn btn-danger btn-sm', onclick: (e) => busy(e.currentTarget, async () => { await HR.cancelRequest(id); refresh(); }) }, 'Cancel request') : null,
          isReq && r.status === 'accepted' ? h('button', { class: 'btn btn-dark btn-sm', onclick: (e) => busy(e.currentTarget, async () => { await HR.completeRequest(id); toast('Marked as completed.', 'success'); refresh(); }) }, icon('check', 14), 'Mark completed') : null,
          r.status === 'accepted' ? h('a', { class: 'btn btn-outline btn-sm', href: `transfer.html?help=${id}` }, icon('send', 14), 'Send a file directly') : null,
          isReq && r.status === 'accepted' ? h('button', { class: 'btn btn-outline btn-sm', onclick: () => inviteFlow(other) }, icon('users', 14), 'Invite to my Tribe') : null)));
      if (canChat) box.append(h('section', { class: 'card stack' }, h('h3', { style: { margin: 0 } }, 'Conversation'), msgs, h('div', { class: 'compose-row' }, ta, h('button', { class: 'btn btn-primary', 'aria-label': 'Send', onclick: send }, icon('send', 20)))));
    }
    async function send() { const v = ta.value.trim(); if (!v) return; ta.value = ''; try { await HR.sendMessage(id, user.uid, v); } catch (e) { ta.value = v; toast(friendlyError(e), 'error'); } }
    async function inviteFlow(target) {
      const lead = (await myMemberships(user.uid)).filter((x) => ['owner', 'moderator'].includes(x.myRole));
      if (!lead.length) return openModal({ title: 'Invite to a Tribe', body: h('div', {}, h('p', {}, 'You do not lead a Tribe yet.'), h('a', { class: 'btn btn-primary', href: 'create-tribe.html' }, 'Create a Tribe')), actions: [{ label: 'Close', onClick: (c) => c() }] });
      const sel = select(lead.map((x) => ({ value: x.id, label: x.name })));
      openModal({ title: `Invite ${target.name}`, size: 'sm', body: field('Tribe', sel), actions: [{ label: 'Cancel', onClick: (c) => c() }, { label: 'Send invitation', variant: 'btn-primary', onClick: async (c) => { try { await inviteToTribe(sel.value, target.uid, `Great working with you on "${r.title}"`); toast('Invitation sent.', 'success'); c(); } catch (e) { toast(friendlyError(e), 'error'); } } }] });
    }
    await render();
    unsub = HR.watchMessages(id, async (list) => { const us = await Promise.all(list.map((m) => getUser(m.senderUid))); clear(msgs); list.forEach((m, i) => msgs.append(h('div', { class: `msg ${m.senderUid === user.uid ? 'mine' : ''}` }, m.senderUid === user.uid ? null : avatarEl(us[i], 'sm'), h('div', { class: 'msg-body' }, h('span', { class: 'msg-text' }, m.text), h('div', { class: 'msg-meta' }, formatTime(m.createdAt)))))); if (!list.length) msgs.append(h('p', { class: 'muted small center' }, 'No messages yet - say hello.')); msgs.scrollTop = msgs.scrollHeight; }, () => {});
    addEventListener('pagehide', () => unsub && unsub());
  }
});
