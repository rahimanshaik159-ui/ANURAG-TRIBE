import { boot } from './_boot.js';
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { skeletonGrid, emptyState, banner } from '../core/ui.js';
import { avatarEl } from '../components/avatar.js';
import { personCard, tribeCard, projectCard, eventCard, resourceCard } from '../components/cards.js';
import { rankTribes, rankPeople, rankBy, scoreProject, scoreTagged, profileNeedsSkills } from '../lib/recommend.js';
import { myMemberships, tribeCandidates, myInvites, myJoinRequests } from '../services/tribes.js';
import { peopleWithSkills, getUser } from '../services/users.js';
import { projectCandidates } from '../services/projects.js';
import { listEvents, listResources, listAnnouncements } from '../services/content.js';
import { myRequests } from '../services/helpRequests.js';
import { listMySessions } from '../webrtc/transferSession.js';
import { timeAgo } from '../lib/format.js';

const safe = async (fn, fallback) => { try { return await fn(); } catch (e) { console.warn('dashboard section failed:', e.code || e.message); return fallback; } };

boot({ require: 'user' }, async (ctx) => {
  const { main: app, profile: me, tax } = ctx; clear(app);
  const first = (me.name || '').split(' ')[0];
  const terms = [...new Set([...(me.skills || []), ...(me.interests || []), ...(me.learning || [])])];
  const needs = profileNeedsSkills(me);

  const attention = h('div', {}); const tribesBox = h('div', {}); const recT = h('div', {}); const recP = h('div', {}); const recPr = h('div', {}); const recE = h('div', {}); const recR = h('div', {}); const ann = h('div', {});
  app.append(h('div', { class: 'container section-sm' },
    h('div', { class: 'welcome' }, avatarEl(me, 'xl'), h('div', { class: 'grow' }, h('h1', {}, `Hi ${first}, welcome back`), h('p', {}, [me.department, `Year ${me.year}`].filter(Boolean).join(' \u2022 ') + (me.skills?.length ? ` \u2022 ${me.skills.length} skills` : ''))), h('a', { class: 'btn btn-light btn-sm', href: 'edit-profile.html' }, icon('edit', 16), 'Edit profile')),
    ann,
    needs ? h('div', { style: { marginTop: '14px' } }, banner('Add your skills and interests to get personalised Tribe, people and project recommendations.', 'warn'), h('a', { class: 'btn btn-primary btn-sm', style: { marginTop: '10px' }, href: 'edit-profile.html#skills' }, 'Add skills')) : null,
    h('div', { class: 'quick-actions' }, [['students.html', 'users', 'Find people'], ['tribes.html', 'compass', 'Browse Tribes'], ['create-tribe.html', 'plus', 'Create Tribe'], ['help-requests.html?new=1', 'message', 'I need someone'], ['transfer.html', 'send', 'Send a file'], ['ideas.html', 'zap', 'Share an idea']].map(([hr, ic, t]) => h('a', { class: 'qa', href: hr }, icon(ic, 24), t))),
    attention,
    h('div', { class: 'dash-grid' },
      h('div', { class: 'stack-lg stack' },
        h('section', {}, h('div', { class: 'section-head' }, h('h2', {}, 'Tribes for you'), h('a', { class: 'btn btn-outline btn-sm', href: 'tribes.html' }, 'Browse all')), recT),
        h('section', {}, h('div', { class: 'section-head' }, h('h2', {}, 'Students you may want to meet'), h('a', { class: 'btn btn-outline btn-sm', href: 'students.html' }, 'Discover')), recP),
        h('section', {}, h('div', { class: 'section-head' }, h('h2', {}, 'Projects that need your skills'), h('a', { class: 'btn btn-outline btn-sm', href: 'projects.html' }, 'All projects')), recPr)),
      h('aside', { class: 'stack-lg stack' },
        h('section', { class: 'card' }, h('div', { class: 'row between' }, h('h3', { style: { margin: 0 } }, 'My Tribes'), h('a', { class: 'small red', href: 'my-tribes.html' }, 'Manage')), tribesBox),
        h('section', {}, h('h3', {}, 'Upcoming for you'), recE), h('section', {}, h('h3', {}, 'Resources for you'), recR)))));
  for (const b of [recT, recP, recPr]) b.append(skeletonGrid(2));

  // each section loads independently so one failure never blanks the dashboard
  const mine = await safe(() => myMemberships(me.uid), []);
  const myIds = new Set(mine.map((t) => t.id));
  clear(tribesBox); tribesBox.append(mine.length ? h('div', { class: 'stack', style: { gap: '4px', marginTop: '8px' } }, mine.slice(0, 5).map((t) => h('a', { class: 'list-item', href: `tribe.html?id=${t.id}`, style: { padding: '10px 0' } }, h('span', { class: 'tc-ic', style: { width: '38px', height: '38px' } }, icon('users', 18)), h('div', { class: 'grow' }, h('strong', {}, t.name), h('div', { class: 'muted small' }, `${t.memberCount} members \u2022 ${t.myRole}`)), (t.lastMessageAt && (!t.lastReadAt || t.lastMessageAt.toMillis() > t.lastReadAt.toMillis())) ? h('span', { class: 'unread-dot' }) : null))) : h('p', { class: 'muted small', style: { margin: '10px 0 0' } }, "You haven't joined a Tribe yet. Start with the recommendations."));

  safe(() => listAnnouncements(2), []).then((a) => { a.forEach((x) => ann.append(h('div', { class: 'banner', style: { marginTop: '12px' } }, icon('bell', 18), h('span', {}, h('strong', {}, x.title), ' \u2014 ', x.body)))); });

  Promise.all([safe(() => myInvites(me.uid), []), safe(() => myRequests(me.uid), []), safe(() => listMySessions(me.uid), []), safe(() => myJoinRequests(me.uid), [])]).then(([inv, reqs, sess]) => {
    const items = [];
    inv.forEach((i) => items.push(['users', `${i.inviterName || 'A student'} invited you to ${i.tribeName}`, 'my-tribes.html#invites', 'Review invitation']));
    reqs.filter((r) => r.targetUid === me.uid && r.status === 'open').forEach((r) => items.push(['message', `Help request: ${r.title}`, `help-requests.html?id=${r.id}`, 'Respond']));
    sess.filter((s) => s.recipientUid === me.uid && s.status === 'pending').forEach((s) => items.push(['send', `Incoming file transfer (${s.files.length} file${s.files.length > 1 ? 's' : ''})`, `transfer.html?id=${s.id}`, 'Accept or decline']));
    if (items.length) attention.append(h('section', { class: 'card', style: { marginBottom: '18px', borderLeft: '4px solid var(--red)' } }, h('h3', {}, 'Needs your attention'), items.map(([ic, t, hr, cta]) => h('div', { class: 'list-item' }, icon(ic, 20), h('div', { class: 'grow' }, t), h('a', { class: 'btn btn-outline btn-sm', href: hr }, cta)))));
  });

  safe(async () => rankTribes(me, await tribeCandidates(terms), { exclude: myIds, limit: 4 }, tax), []).then((r) => { clear(recT); recT.append(r.length ? h('div', { class: 'grid grid-cards-lg' }, r.map((x) => tribeCard(x.tribe, { tax, reasons: x.reasons }))) : emptyState({ icon: 'compass', title: 'No Tribe matches yet', text: needs ? 'Add skills and interests to see Tribes that fit you.' : 'Be the first - create a Tribe around your skills and others will find it.', action: h('a', { class: 'btn btn-primary', href: 'create-tribe.html' }, 'Create a Tribe') })); });

  safe(async () => { const ids = [...(me.lookingFor || []), ...(me.interests || []), ...(me.skills || [])]; return rankPeople(me, await peopleWithSkills(ids), { limit: 4 }, tax); }, []).then((r) => { clear(recP); recP.append(r.length ? h('div', { class: 'grid grid-cards' }, r.map((x) => personCard(x.person, { tax, reasons: x.reasons }))) : emptyState({ icon: 'users', title: 'No suggestions yet', text: 'Set "what I\'m looking for" on your profile, or search the directory.', action: h('a', { class: 'btn btn-outline', href: 'students.html' }, 'Open directory') })); });

  safe(async () => { const ps = await projectCandidates([...(me.skills || []), ...(me.learning || [])]); return rankBy(scoreProject, me, ps.filter((p) => p.ownerUid !== me.uid), 4, tax); }, []).then(async (r) => { const owners = await Promise.all(r.map((x) => getUser(x.item.ownerUid))); clear(recPr); recPr.append(r.length ? h('div', { class: 'grid grid-cards-lg' }, r.map((x, i) => projectCard(x.item, { tax, reasons: x.reasons, owner: owners[i] }))) : emptyState({ icon: 'folder', title: 'No matching projects right now', text: 'Start your own project and invite collaborators.', action: h('a', { class: 'btn btn-outline', href: 'projects.html' }, 'Browse projects') })); });

  safe(async () => { const ev = await listEvents({ upcoming: true, size: 20 }); const ranked = rankBy(scoreTagged, me, ev, 2, tax); return ranked.length ? ranked.map((x) => x.item) : ev.slice(0, 2); }, []).then((ev) => { ev.forEach((e) => recE.append(h('div', { style: { marginBottom: '12px' } }, eventCard(e)))); if (!ev.length) recE.append(h('p', { class: 'muted small' }, 'No upcoming events yet.')); });
  safe(async () => { const rs = await listResources({ size: 40 }); const ranked = rankBy(scoreTagged, me, rs, 3, tax); return ranked; }, []).then((r) => { r.forEach((x) => recR.append(h('div', { style: { marginBottom: '12px' } }, resourceCard(x.item, { tax, reasons: x.reasons })))); if (!r.length) recR.append(h('p', { class: 'muted small' }, 'Resources matching your interests will show here.')); });
});
