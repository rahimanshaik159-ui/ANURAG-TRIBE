import { boot } from './_boot.js';
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { pageHero, skeletonGrid, emptyState, errorState, tabs, toast, busy, field, select, textarea, input, counter, openModal, confirmDialog, chip } from '../core/ui.js';
import { avatarEl } from '../components/avatar.js';
import { listPosts, createPost, deletePost, isSaved, toggleSave, savedPostIds, reportContent, getOne } from '../services/content.js';
import { toggleLike, hasLiked, listComments, addComment, deleteComment } from '../services/projects.js';
import { getUser } from '../services/users.js';
import { POST_CATEGORIES, REPORT_REASONS } from '../lib/taxonomy.js';
import { friendlyError } from '../core/firebase.js';
import { timeAgo } from '../lib/format.js';
import { tokenizeLinks } from '../lib/validators.js';

const label = (c) => c.charAt(0).toUpperCase() + c.slice(1);
boot({ require: 'user' }, async (ctx) => {
  const { main: app, user, profile: me } = ctx; clear(app);
  app.append(pageHero('Ideas & posts', 'Share ideas, announce what you are building and find collaborators.', { eyebrow: 'Share' }));
  const cat = select(POST_CATEGORIES.map((c) => ({ value: c, label: label(c) })), { value: 'idea' }); const text = textarea({ rows: 3, maxlength: 1500, placeholder: 'What are you thinking about, building, or looking for?' }); const link = input({ placeholder: 'Optional link (GitHub, YouTube, Figma...)', inputmode: 'url' });
  const post = h('button', { class: 'btn btn-primary' }, icon('send', 16), 'Post');
  post.onclick = () => busy(post, async () => { if (text.value.trim().length < 3) return toast('Write a little more.', 'error'); try { await createPost(user.uid, { category: cat.value, text: text.value, linkUrl: link.value }); text.value = ''; link.value = ''; toast('Posted.', 'success'); load(true); } catch (e) { toast(e.code ? friendlyError(e) : e.message, 'error'); } });
  const feed = h('div', { class: 'stack' }); const more = h('div', { class: 'load-more' }); let category = ''; let cursor = null; let mode = 'feed';
  const t = tabs([{ id: 'feed', label: 'Feed' }, { id: 'saved', label: 'Saved' }], mode, (id) => { mode = id; load(true); });
  const chips = h('div', { class: 'quick-chips' }); const drawChips = () => { clear(chips); ['', ...POST_CATEGORIES].forEach((c) => chips.append(h('button', { type: 'button', style: category === c ? { background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' } : null, onclick: () => { category = c; drawChips(); load(true); } }, c ? label(c) : 'All'))); }; drawChips();

  async function card(p) {
    const a = await getUser(p.authorUid); let liked = await hasLiked('posts', p.id, user.uid).catch(() => false); let saved = await isSaved(user.uid, p.id).catch(() => false); let likes = p.likeCount || 0;
    const likeB = h('button', { class: 'btn btn-ghost btn-sm' }); const saveB = h('button', { class: 'btn btn-ghost btn-sm' }); const cmts = h('div', { class: 'stack', hidden: true });
    const dl = () => { clear(likeB); likeB.append(icon('heart', 16), ` ${likes}`); likeB.style.color = liked ? 'var(--red)' : ''; clear(saveB); saveB.append(icon('bookmark', 16), saved ? ' Saved' : ' Save'); saveB.style.color = saved ? 'var(--red)' : ''; }; dl();
    likeB.onclick = async () => { try { liked = await toggleLike('posts', p.id, user.uid, liked); likes += liked ? 1 : -1; dl(); } catch (e) { toast(friendlyError(e), 'error'); } };
    saveB.onclick = async () => { try { saved = await toggleSave(user.uid, p.id, saved); dl(); } catch (e) { toast(friendlyError(e), 'error'); } };
    const loadC = async () => { clear(cmts); const cs = await listComments('post', p.id).catch(() => []); const us = await Promise.all(cs.map((c) => getUser(c.authorUid)));
      cs.forEach((c, i) => cmts.append(h('div', { class: 'list-item', style: { alignItems: 'flex-start', padding: '8px 0' } }, avatarEl(us[i], 'xs'), h('div', { class: 'grow' }, h('strong', {}, us[i].name), h('span', { class: 'muted small' }, ` ${timeAgo(c.createdAt)}`), h('div', { style: { overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' } }, c.text)), c.authorUid === user.uid ? h('button', { class: 'icon-btn', 'aria-label': 'Delete', onclick: async () => { await deleteComment(c.id); loadC(); } }, icon('trash', 14)) : null)));
      const box = input({ placeholder: 'Write a comment...', maxlength: 500 }); const go = async () => { if (!box.value.trim()) return; try { await addComment('post', p.id, user.uid, box.value); loadC(); } catch (e) { toast(friendlyError(e), 'error'); } }; box.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); }); cmts.append(h('div', { class: 'row' }, box, h('button', { class: 'btn btn-primary btn-sm', onclick: go }, 'Send'))); };
    const cmtB = h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { cmts.hidden = !cmts.hidden; if (!cmts.hidden) loadC(); } }, icon('message', 16), ` ${p.commentCount || 0}`);
    const share = h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => { const url = `${location.origin}/ideas.html#${p.id}`; try { if (navigator.share) await navigator.share({ title: 'ANURAG TRIBE idea', text: p.text.slice(0, 100), url }); else { await navigator.clipboard.writeText(url); toast('Link copied.', 'success'); } } catch (_) { /* cancelled */ } } }, icon('share', 16), ' Share');
    return h('article', { class: 'card stack', id: p.id }, h('div', { class: 'row between' }, h('a', { class: 'row', href: `profile.html?id=${a.uid}` }, avatarEl(a, 'md'), h('div', {}, h('strong', {}, a.name), h('div', { class: 'muted small' }, `${a.department || ''} \u2022 ${timeAgo(p.createdAt)}`))), chip(label(p.category), 'chip-red')),
      h('p', { style: { margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, tokenizeLinks(p.text).map((x) => x.t === 'url' ? h('a', { class: 'red', href: x.v, target: '_blank', rel: 'noopener noreferrer nofollow ugc' }, x.v) : x.v)),
      p.linkUrl ? h('a', { class: 'chip chip-link', style: { alignSelf: 'flex-start' }, href: p.linkUrl, target: '_blank', rel: 'noopener noreferrer nofollow ugc' }, icon('link', 12), new URL(p.linkUrl).hostname.replace(/^www\./, '')) : null,
      h('div', { class: 'row wrap' }, likeB, cmtB, saveB, share, p.authorUid === user.uid ? h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => { if (await confirmDialog({ title: 'Delete post?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true })) { await deletePost(p.id); load(true); } } }, icon('trash', 16)) : h('button', { class: 'btn btn-ghost btn-sm', 'aria-label': 'Report post', onclick: () => { const sel = select(REPORT_REASONS.map((r) => ({ value: r.id, label: r.label }))); openModal({ title: 'Report post', size: 'sm', body: field('Reason', sel), actions: [{ label: 'Cancel', onClick: (c) => c() }, { label: 'Report', variant: 'btn-danger', onClick: async (c) => { try { await reportContent(user.uid, { targetType: 'post', targetId: p.id, reason: sel.value }); toast('Reported. Thank you.', 'success'); c(); } catch (e) { toast(friendlyError(e), 'error'); } } }] }); } }, icon('flag', 16))), cmts);
  }
  async function load(reset) {
    if (reset) { cursor = null; clear(feed); feed.append(skeletonGrid(2)); clear(more); }
    try {
      let items = []; let hasMore = false;
      if (mode === 'saved') { const ids = await savedPostIds(user.uid); items = (await Promise.all(ids.map((i) => getOne('posts', i).catch(() => null)))).filter((p) => p && p.status === 'visible'); }
      else { const r = await listPosts({ category, cursor }); items = r.items; cursor = r.cursor; hasMore = r.hasMore; }
      if (reset) clear(feed); const cards = await Promise.all(items.map(card)); cards.forEach((c) => feed.append(c));
      if (!feed.children.length) feed.append(emptyState({ icon: 'zap', title: mode === 'saved' ? 'Nothing saved yet' : 'No posts yet', text: mode === 'saved' ? 'Save ideas to find them later.' : 'Be the first to share an idea.' }));
      clear(more); if (hasMore) more.append(h('button', { class: 'btn btn-outline', onclick: () => load(false) }, 'Load more'));
    } catch (e) { clear(feed); feed.append(errorState(friendlyError(e), () => load(true))); }
  }
  app.append(h('div', { class: 'container section-sm', style: { maxWidth: '760px' } }, h('div', { class: 'card stack', style: { marginBottom: '18px' } }, h('div', { class: 'row' }, avatarEl(me, 'md'), h('strong', {}, `Share with the community, ${me.name.split(' ')[0]}`)), text, counter(text, 1500), h('div', { class: 'form-grid' }, field('Category', cat), field('Link', link)), h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, post)), h('div', { class: 'stack' }, t, chips, feed, more)));
  load(true);
});
