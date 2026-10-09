import { boot } from './_boot.js';
import { h, clear, qs } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { pageHero, skeletonGrid, emptyState, errorState, select, toast, openModal, field, textarea, counter, busy, chip, banner, input } from '../core/ui.js';
import { projectCard, statusLabel, categoryLabel } from '../components/cards.js';
import { avatarEl } from '../components/avatar.js';
import { openProjectModal } from '../components/projectModal.js';
import { listCampusProjects, getProject, applyToProject, hasLiked, toggleLike, listComments, addComment, deleteComment, updateProject } from '../services/projects.js';
import { reportContent } from '../services/content.js';
import { getUser } from '../services/users.js';
import { PROJECT_CATEGORIES } from '../lib/taxonomy.js';
import { friendlyError } from '../core/firebase.js';
import { timeAgo } from '../lib/format.js';

boot({ require: 'public' }, async (ctx) => {
  const { main: app, tax, user, profile: me } = ctx; clear(app);
  app.append(pageHero('Projects Hub', 'Explore innovative projects by students. Get inspired, collaborate and build together.', { eyebrow: 'Ideas into reality', right: user ? h('button', { class: 'btn btn-primary btn-lg', onclick: () => openProjectModal({ me: { uid: user.uid }, tax, onDone: (id) => { location.href = `projects.html?id=${id}`; } }) }, icon('plus', 18), 'Add Project') : h('a', { class: 'btn btn-primary btn-lg', href: 'register.html' }, 'Join to add projects') }));
  if (!user) { app.append(h('div', { class: 'container section' }, emptyState({ icon: 'lock', title: 'Log in to explore projects', text: 'Projects are visible to verified ANURAG TRIBE students.', action: h('a', { class: 'btn btn-primary', href: 'login.html?next=projects.html' }, 'Log in') }))); return; }
  const pid = qs().get('id'); if (pid) return detail(pid);

  let category = ''; let cursor = null; let reqId = 0;
  const skill = select([{ value: '', label: 'Any skill needed' }, ...tax.skills.map((s) => ({ value: s.id, label: s.label }))]);
  const chips = h('div', { class: 'quick-chips' }); const grid = h('div', {}); const more = h('div', { class: 'load-more' });
  const drawChips = () => { clear(chips); [{ id: '', label: 'All Projects' }, ...PROJECT_CATEGORIES].forEach((c) => chips.append(h('button', { type: 'button', style: category === c.id ? { background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' } : null, onclick: () => { category = c.id; drawChips(); run(true); } }, c.label))); };
  async function run(reset) {
    const my = ++reqId; if (reset) { cursor = null; clear(grid); grid.append(skeletonGrid(6)); clear(more); }
    try {
      const r = await listCampusProjects({ category, skillId: skill.value, cursor }); if (my !== reqId) return; if (reset) clear(grid);
      const owners = await Promise.all(r.items.map((p) => getUser(p.ownerUid))); const list = grid.querySelector('.grid') || grid.appendChild(h('div', { class: 'grid grid-cards-lg' }));
      r.items.forEach((p, i) => list.append(projectCard(p, { tax, owner: owners[i] })));
      if (!list.children.length) { clear(grid); grid.append(emptyState({ icon: 'folder', title: 'No projects yet', text: 'Start the first one and invite collaborators.', action: h('button', { class: 'btn btn-primary', onclick: () => openProjectModal({ me: { uid: user.uid }, tax, onDone: (id) => { location.href = `projects.html?id=${id}`; } }) }, 'Add a project') })); }
      cursor = r.cursor; clear(more); if (r.hasMore) more.append(h('button', { class: 'btn btn-outline', onclick: () => run(false) }, 'Load more'));
    } catch (e) { if (my !== reqId) return; clear(grid); grid.append(errorState(friendlyError(e), () => run(true))); }
  }
  skill.addEventListener('change', () => run(true)); drawChips();
  app.append(h('div', { class: 'container section-sm' }, h('div', { class: 'filters' }, h('div', { class: 'sel' }, skill), h('a', { class: 'btn btn-outline btn-sm', href: 'my-projects.html' }, icon('folder', 16), 'My projects')), chips, grid, more));
  run(true);

  async function detail(id) {
    clear(app); app.append(pageHero('Project', ''));
    const wrap = h('div', { class: 'container section-sm' }); app.append(wrap);
    let p; try { p = await getProject(id); } catch (e) { p = null; }
    if (!p) { wrap.append(emptyState({ icon: 'lock', title: 'Project not available', text: 'It may be private to a Tribe or no longer exist.', action: h('a', { class: 'btn btn-primary', href: 'projects.html' }, 'Back to projects') })); return; }
    const owner = await getUser(p.ownerUid); const team = await Promise.all((p.memberUids || []).map(getUser)); const isOwner = p.ownerUid === user.uid; const isMember = (p.memberUids || []).includes(user.uid);
    let liked = await hasLiked('projects', id, user.uid).catch(() => false); let likes = p.likeCount || 0;
    const likeBtn = h('button', { class: 'btn btn-outline btn-sm' }); const drawLike = () => { clear(likeBtn); likeBtn.append(icon('heart', 16), ` ${likes}`, liked ? ' Liked' : ' Like'); likeBtn.style.background = liked ? 'var(--red-soft)' : ''; };
    drawLike(); likeBtn.onclick = async () => { try { liked = await toggleLike('projects', id, user.uid, liked); likes += liked ? 1 : -1; drawLike(); } catch (e) { toast(friendlyError(e), 'error'); } };
    const comments = h('div', { class: 'stack' }); const box = textarea({ rows: 2, maxlength: 500, placeholder: 'Write a comment...' });
    async function loadComments() { clear(comments); const cs = await listComments('project', id).catch(() => []); const us = await Promise.all(cs.map((c) => getUser(c.authorUid))); cs.forEach((c, i) => comments.append(h('div', { class: 'list-item', style: { alignItems: 'flex-start' } }, avatarEl(us[i], 'sm'), h('div', { class: 'grow' }, h('strong', {}, us[i].name), h('span', { class: 'muted small' }, ` ${timeAgo(c.createdAt)}`), h('div', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, c.text)), c.authorUid === user.uid ? h('button', { class: 'icon-btn', 'aria-label': 'Delete comment', onclick: async () => { await deleteComment(c.id); loadComments(); } }, icon('trash', 16)) : null))); if (!cs.length) comments.append(h('p', { class: 'muted small' }, 'No comments yet.')); }
    const apply = () => { const msg = textarea({ rows: 3, maxlength: 500, placeholder: 'Tell the team how you can help (skills, availability).' }); openModal({ title: `Apply to ${p.title}`, size: 'sm', body: h('div', {}, field('Message', msg), counter(msg, 500)), actions: [{ label: 'Cancel', onClick: (c) => c() }, { label: 'Send application', variant: 'btn-primary', onClick: async (c) => { try { await applyToProject(p, user.uid, msg.value); toast('Application sent.', 'success'); c(); } catch (e) { toast(e.code ? friendlyError(e) : e.message, 'error'); } } }] }); };
    wrap.append(h('div', { class: 'dash-grid' },
      h('div', { class: 'stack-lg stack' }, h('section', { class: 'card stack' }, h('div', { class: 'row between wrap' }, h('span', { class: `status status-${p.status}` }, statusLabel(p.status)), h('span', { class: 'muted small' }, categoryLabel(p.category), p.tribeName ? ` \u2022 Tribe: ${p.tribeName}` : '')),
        h('h1', { style: { fontSize: '1.8rem', margin: 0 } }, p.title), h('p', { style: { whiteSpace: 'pre-wrap', margin: 0 } }, p.description),
        h('div', {}, h('h4', {}, 'Skills needed'), h('div', { class: 'chips' }, (p.skillsNeeded || []).map((s) => chip(tax.label(s), 'chip-red')))),
        (p.links || []).length ? h('div', {}, h('h4', {}, 'Links'), h('div', { class: 'chips' }, p.links.map((l) => h('a', { class: 'chip chip-link', href: l.url, target: '_blank', rel: 'noopener noreferrer nofollow' }, icon('link', 12), l.label || new URL(l.url).hostname)))) : null,
        h('div', { class: 'row wrap' }, likeBtn, !isOwner && !isMember && p.visibility === 'campus' ? h('button', { class: 'btn btn-primary btn-sm', onclick: apply }, 'Apply to join') : null, p.tribeId ? h('a', { class: 'btn btn-outline btn-sm', href: `tribe.html?id=${p.tribeId}#projects` }, 'Open in Tribe workspace') : null, !isOwner ? h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => { try { await reportContent(user.uid, { targetType: 'project', targetId: id, reason: 'inappropriate', details: '' }); toast('Reported. An admin will review it.', 'success'); } catch (e) { toast(friendlyError(e), 'error'); } } }, icon('flag', 14), 'Report') : null)),
        h('section', { class: 'card' }, h('h3', {}, 'Comments'), comments, h('div', { style: { marginTop: '12px' } }, box, h('button', { class: 'btn btn-primary btn-sm', style: { marginTop: '8px' }, onclick: async (e) => { if (!box.value.trim()) return; await busy(e.currentTarget, async () => { await addComment('project', id, user.uid, box.value); box.value = ''; loadComments(); }); } }, 'Post comment')))),
      h('aside', { class: 'stack-lg stack' }, h('section', { class: 'card' }, h('h3', {}, 'Owner'), h('a', { class: 'member-row', href: `profile.html?id=${owner.uid}` }, avatarEl(owner, 'md'), h('div', { class: 'grow' }, h('strong', {}, owner.name), h('span', { class: 'muted small' }, owner.department || '')))),
        h('section', { class: 'card' }, h('h3', {}, `Team (${team.length})`), team.map((u) => h('a', { class: 'member-row', href: `profile.html?id=${u.uid}` }, avatarEl(u, 'sm'), h('strong', {}, u.name)))),
        isOwner ? h('a', { class: 'btn btn-outline', href: 'my-projects.html#applications' }, 'Review applications') : null)));
    loadComments();
  }
});
