import { boot } from './_boot.js';
import { h, clear, qs } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { pageHero, emptyState, chip, openModal, toast, field, select, textarea, confirmDialog } from '../core/ui.js';
import { avatarEl } from '../components/avatar.js';
import { socialIcons } from '../components/socialLinks.js';
import { showcaseCard } from '../components/cards.js';
import { getUser } from '../services/users.js';
import { myMemberships, inviteToTribe } from '../services/tribes.js';
import { reportContent } from '../services/content.js';
import { F, db, friendlyError } from '../core/firebase.js';
import { col, withId } from '../services/_util.js';
import { openHelpModal } from '../components/helpModal.js';
import { yearLabel, REPORT_REASONS } from '../lib/taxonomy.js';

const AVAIL = { open: 'Open to collaborate', busy: 'Busy right now', none: '' };

boot({ require: 'user' }, async (ctx) => {
  const { main: app, tax, user: me } = ctx; clear(app);
  const id = qs().get('id') || me.uid; const mine = id === me.uid;
  const u = mine ? ctx.profile : await getUser(id);
  if (!u || u._missing) { app.append(h('div', { class: 'container section' }, emptyState({ icon: 'user', title: 'Profile not available', text: 'This student may have hidden their profile or does not exist.', action: h('a', { class: 'btn btn-primary', href: 'students.html' }, 'Back to directory') }))); return; }
  const list = (ids, red) => ids && ids.length ? h('div', { class: 'chips' }, ids.map((s) => chip(tax.label(s), red ? 'chip-red' : ''))) : h('p', { class: 'muted small' }, 'Nothing added yet.');
  const actions = h('div', { class: 'stack', style: { minWidth: '190px' } });
  if (mine) actions.append(h('a', { class: 'btn btn-primary', href: 'edit-profile.html' }, icon('edit', 16), 'Edit profile'));
  else {
    actions.append(h('button', { class: 'btn btn-primary', onclick: () => openHelpModal({ me: ctx.profile, target: u, tax, skills: (u.skills || []).slice(0, 2) }) }, icon('message', 16), 'Request help'),
      h('button', { class: 'btn btn-outline', onclick: () => inviteFlow(u) }, icon('users', 16), 'Invite to a Tribe'),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => reportFlow(u) }, icon('flag', 14), 'Report'));
  }
  async function inviteFlow(target) {
    const mineT = (await myMemberships(me.uid)).filter((t) => ['owner', 'moderator'].includes(t.myRole));
    if (!mineT.length) { openModal({ title: 'Invite to a Tribe', body: h('div', {}, h('p', {}, 'You don\'t lead a Tribe yet. Create one first, then invite people you want to build with.'), h('a', { class: 'btn btn-primary', href: 'create-tribe.html' }, 'Create a Tribe')), actions: [{ label: 'Close', onClick: (c) => c() }] }); return; }
    const sel = select(mineT.map((t) => ({ value: t.id, label: t.name }))); const msg = textarea({ placeholder: 'Say why you think they would be great in your Tribe (optional)', rows: 3, maxlength: 200 });
    openModal({ title: `Invite ${target.name}`, body: h('div', {}, field('Tribe', sel), field('Message', msg)), actions: [{ label: 'Cancel', onClick: (c) => c() }, { label: 'Send invitation', variant: 'btn-primary', onClick: async (c) => { try { await inviteToTribe(sel.value, target.uid || target.id, msg.value); toast('Invitation sent.', 'success'); c(); } catch (e) { toast(friendlyError(e), 'error'); } } }] });
  }
  function reportFlow(target) {
    const sel = select(REPORT_REASONS.map((r) => ({ value: r.id, label: r.label }))); const det = textarea({ placeholder: 'Add details (optional)', rows: 3, maxlength: 500 });
    openModal({ title: 'Report profile', size: 'sm', body: h('div', {}, field('Reason', sel), field('Details', det)), actions: [{ label: 'Cancel', onClick: (c) => c() }, { label: 'Submit report', variant: 'btn-danger', onClick: async (c) => { try { await reportContent(me.uid, { targetType: 'user', targetId: target.uid || target.id, reason: sel.value, details: det.value }); toast('Thanks - an admin will review this.', 'success'); c(); } catch (e) { toast(friendlyError(e), 'error'); } } }] });
  }
  app.append(pageHero(' ', ''), h('div', { class: 'container', style: { paddingBottom: '48px' } },
    h('div', { class: 'profile-head' }, avatarEl(u, '2xl'), h('div', {}, h('h1', {}, u.name), h('p', { class: 'muted', style: { margin: '2px 0' } }, `@${u.username}`),
      h('p', { style: { margin: '6px 0 0' } }, [u.department, yearLabel(u.year), u.section && `Section ${u.section}`].filter(Boolean).join(' \u2022 ')),
      AVAIL[u.availability] ? h('span', { class: 'avail', style: { marginTop: '6px' } }, h('i'), AVAIL[u.availability]) : null, socialIcons(u.social)), actions),
    h('div', { class: 'profile-cols' },
      h('div', { class: 'stack-lg stack' },
        u.bio ? h('section', { class: 'card' }, h('h3', {}, 'About'), h('p', { style: { margin: 0, whiteSpace: 'pre-wrap' } }, u.bio)) : null,
        h('section', { class: 'card' }, h('h3', {}, 'Skills'), list(u.skills, true)), h('section', { class: 'card' }, h('h3', {}, 'Interests'), list(u.interests)),
        (u.currentProjects || []).length ? h('section', { class: 'card' }, h('h3', {}, 'Currently working on'), h('ul', { style: { margin: 0, paddingLeft: '20px' } }, u.currentProjects.map((p) => h('li', {}, p)))) : null,
        h('div', { id: 'show' })),
      h('aside', { class: 'stack-lg stack' }, h('section', { class: 'card' }, h('h3', {}, 'Looking for'), list(u.lookingFor)), h('section', { class: 'card' }, h('h3', {}, 'Wants to learn'), list(u.learning)),
        mine ? h('section', { class: 'card' }, h('h3', {}, 'Privacy'), h('p', { class: 'small muted' }, u.visibility === 'hidden' ? 'Your profile is hidden from the directory.' : 'Your profile is visible to verified students. Your email and phone number are never shown.')) : null))));
  // approved showcase by this student (public data)
  try {
    const s = await F.getDocs(F.query(col('showcase'), F.where('authorUid', '==', id), F.where('status', '==', 'approved'), F.orderBy('createdAt', 'desc'), F.limit(4)));
    const items = s.docs.map(withId); if (items.length) document.getElementById('show').append(h('section', {}, h('h3', {}, 'Showcase'), h('div', { class: 'grid grid-cards-lg' }, items.map((x) => showcaseCard(x, { author: u, tax })))));
  } catch (e) { console.info('showcase unavailable', e.code); }
});
