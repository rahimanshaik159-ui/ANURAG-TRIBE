// Tribe chat UI. TEXT + LINKS ONLY by design (no media upload, no file storage).
// Real files -> direct WebRTC transfer (transfer.html).
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { openModal, toast, field, select, textarea, confirmDialog, banner, emptyState } from '../core/ui.js';
import { avatarEl } from './avatar.js';
import { watchMessages, loadOlder, sendMessage, editMessage, deleteOwnMessage, hideMessageAsLeader, reportMessage } from '../services/tribeChat.js';
import { markRead } from '../services/tribes.js';
import { getUser } from '../services/users.js';
import { tokenizeLinks } from '../lib/validators.js';
import { formatTime, formatDate } from '../lib/format.js';
import { REPORT_REASONS } from '../lib/taxonomy.js';
import { friendlyError } from '../core/firebase.js';

const PROVIDER_ICON = { youtube: 'youtube', github: 'github', figma: 'layers', drive: 'folder', instagram: 'instagram', linkedin: 'linkedin', behance: 'layers', notion: 'book', link: 'link' };
const PROVIDER_NAME = { youtube: 'YouTube', github: 'GitHub', figma: 'Figma', drive: 'Google Drive', instagram: 'Instagram', linkedin: 'LinkedIn', behance: 'Behance', notion: 'Notion', link: 'Link' };
const dayKey = (m) => { const d = m.createdAt?.toDate?.() || new Date(); return d.toDateString(); };

/** mountChat({tribe, me, isLeader, container}) -> {destroy} */
export function mountChat({ tribe, me, isLeader, container }) {
  let replyTo = null; let msgs = []; let hasMore = false; let older = []; let destroyed = false; let lastSend = 0; let lastRead = 0;
  const list = h('div', { class: 'chat-list', role: 'log', 'aria-live': 'polite', 'aria-label': 'Tribe chat messages' });
  const replyBar = h('div', { class: 'reply-bar', hidden: true });
  const ta = h('textarea', { class: 'input', rows: 1, placeholder: tribe.status === 'active' ? 'Message your Tribe...' : 'This Tribe is not active', maxlength: 2000, disabled: tribe.status !== 'active', 'aria-label': 'Message' });
  const sendBtn = h('button', { class: 'btn btn-primary', type: 'button', 'aria-label': 'Send message', disabled: tribe.status !== 'active' }, icon('send', 20));
  const fine = matchMedia('(pointer:fine)').matches;
  const compose = h('div', { class: 'chat-compose' }, replyBar, h('div', { class: 'compose-row' }, ta, sendBtn),
    h('div', { class: 'chat-hint' }, 'Chat is for messages and links (GitHub, YouTube, Figma...). To send an actual file, ', h('a', { class: 'red', href: `transfer.html?tribe=${tribe.id}` }, 'use direct transfer'), ' - it goes straight to the recipient and is never stored.'));
  const root = h('div', { class: 'card chat' }, list, compose);
  container.append(root);

  const grow = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`; };
  ta.addEventListener('input', grow);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && fine) { e.preventDefault(); doSend(); } });
  sendBtn.addEventListener('click', doSend);
  async function doSend() {
    const text = ta.value.trim(); if (!text) return;
    if (Date.now() - lastSend < 600) return; // client-side throttle; rules cap size, not rate
    lastSend = Date.now(); const keep = ta.value; const rp = replyTo; ta.value = ''; grow(); setReply(null);
    try { await sendMessage(tribe.id, me.uid, text, rp); }
    catch (e) { ta.value = keep; grow(); toast(e.code === 'permission-denied' ? 'You can no longer post here (are you still a member?).' : friendlyError(e), 'error'); }
    ta.focus();
  }
  function setReply(m) {
    replyTo = m; clear(replyBar); replyBar.hidden = !m; if (!m) return;
    getUser(m.senderUid).then((u) => { replyBar.append(h('div', { class: 'grow' }, h('strong', {}, `Replying to ${u.name}`), h('div', { class: 'small muted clamp-2' }, m.text)), h('button', { class: 'icon-btn', 'aria-label': 'Cancel reply', onclick: () => setReply(null) }, icon('x', 18))); }); ta.focus();
  }

  function renderText(text) {
    return h('span', { class: 'msg-text' }, tokenizeLinks(text).map((t) => t.t === 'url' ? h('a', { href: t.v, target: '_blank', rel: 'noopener noreferrer nofollow ugc' }, t.v) : t.v));
  }
  function row(m, prev, user) {
    const mine = m.senderUid === me.uid; const els = [];
    if (!prev || dayKey(prev) !== dayKey(m)) els.push(h('div', { class: 'day-sep' }, m.createdAt ? formatDate(m.createdAt, { weekday: 'short', day: 'numeric', month: 'short' }) : 'Today'));
    const showName = !mine && (!prev || prev.senderUid !== m.senderUid || dayKey(prev) !== dayKey(m));
    let inner;
    if (m.deleted) inner = h('span', { class: 'msg-text msg-deleted' }, m.deletedBy && m.deletedBy !== m.senderUid ? 'Message removed by a Tribe leader' : 'Message deleted');
    else {
      inner = [m.replyTo ? h('div', { class: 'msg-reply' }, h('strong', {}, 'Reply'), ' ', m.replyTo.snippet) : null, renderText(m.text),
        m.type === 'link' && m.linkUrl ? h('a', { class: 'link-card', href: m.linkUrl, target: '_blank', rel: 'noopener noreferrer nofollow ugc' }, icon(PROVIDER_ICON[m.linkProvider] || 'link', 18), h('span', {}, h('strong', {}, PROVIDER_NAME[m.linkProvider] || 'Link'), h('br'), h('span', { class: 'small' }, m.linkHost || ''))) : null];
    }
    const acts = m.deleted ? null : h('div', { class: 'msg-actions' },
      h('button', { class: 'icon-btn', 'aria-label': 'Reply', title: 'Reply', onclick: () => setReply(m) }, icon('reply', 16)),
      mine ? [h('button', { class: 'icon-btn', 'aria-label': 'Edit', title: 'Edit', onclick: () => editFlow(m) }, icon('edit', 16)), h('button', { class: 'icon-btn', 'aria-label': 'Delete', title: 'Delete', onclick: () => delFlow(m, false) }, icon('trash', 16))]
        : [h('button', { class: 'icon-btn', 'aria-label': 'Report', title: 'Report', onclick: () => reportFlow(m) }, icon('flag', 16)), isLeader ? h('button', { class: 'icon-btn', 'aria-label': 'Remove message', title: 'Remove (leader)', onclick: () => delFlow(m, true) }, icon('trash', 16)) : null]);
    els.push(h('div', { class: `msg ${mine ? 'mine' : ''} ${m.pending ? 'pending' : ''}`, dataset: { id: m.id } },
      mine ? null : avatarEl(user, 'sm'),
      h('div', { class: 'msg-body' }, showName ? h('span', { class: 'msg-name' }, user.name) : null, inner, h('div', { class: 'msg-meta' }, m.editedAt && !m.deleted ? 'edited' : null, m.pending ? 'sending...' : formatTime(m.createdAt))), acts));
    return els;
  }
  async function render() {
    const all = [...older, ...msgs]; const users = await Promise.all([...new Set(all.map((m) => m.senderUid))].map(getUser)); const map = Object.fromEntries(users.map((u) => [u.uid, u]));
    if (destroyed) return;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 140; const prevH = list.scrollHeight;
    clear(list);
    if (hasMore) list.append(h('button', { class: 'btn btn-ghost btn-sm', style: { alignSelf: 'center' }, onclick: loadMore }, 'Load earlier messages'));
    if (!all.length) list.append(emptyState({ icon: 'message', title: 'Say hello', text: 'This is the start of your Tribe chat. Share ideas, plans and links.' }));
    all.forEach((m, i) => list.append(...row(m, all[i - 1], map[m.senderUid])));
    if (nearBottom) list.scrollTop = list.scrollHeight; else list.scrollTop += list.scrollHeight - prevH;
  }
  async function loadMore() {
    const first = (older[0] || msgs[0]); if (!first) return;
    try { const r = await loadOlder(tribe.id, first._doc); older = [...r.items, ...older]; hasMore = r.hasMore; const keep = list.scrollHeight; await render(); list.scrollTop = list.scrollHeight - keep; } catch (e) { toast(friendlyError(e), 'error'); }
  }
  async function editFlow(m) {
    const t = textarea({ value: m.text, rows: 4, maxlength: 2000 });
    openModal({ title: 'Edit message', body: t, actions: [{ label: 'Cancel', onClick: (c) => c() }, { label: 'Save', variant: 'btn-primary', onClick: async (c) => { if (!t.value.trim()) return; try { await editMessage(tribe.id, m.id, t.value); c(); } catch (e) { toast(friendlyError(e), 'error'); } } }] });
  }
  async function delFlow(m, leader) {
    if (!(await confirmDialog({ title: leader ? 'Remove this message?' : 'Delete your message?', message: leader ? 'It will be hidden for everyone in the Tribe.' : 'This cannot be undone.', confirmLabel: leader ? 'Remove' : 'Delete', danger: true }))) return;
    try { await (leader ? hideMessageAsLeader(tribe.id, m.id, me.uid) : deleteOwnMessage(tribe.id, m.id)); } catch (e) { toast(friendlyError(e), 'error'); }
  }
  function reportFlow(m) {
    const sel = select(REPORT_REASONS.map((r) => ({ value: r.id, label: r.label }))); const det = textarea({ rows: 3, maxlength: 500, placeholder: 'Details (optional)' });
    openModal({ title: 'Report message', size: 'sm', body: h('div', {}, h('p', { class: 'muted small' }, 'Only this message is shared with ANURAG TRIBE admins for review. They cannot read the rest of your Tribe chat.'), field('Reason', sel), field('Details', det)),
      actions: [{ label: 'Cancel', onClick: (c) => c() }, { label: 'Submit report', variant: 'btn-danger', onClick: async (c) => { try { await reportMessage(tribe.id, m, me.uid, sel.value, det.value); toast('Reported. Thank you.', 'success'); c(); } catch (e) { toast(friendlyError(e), 'error'); } } }] });
  }

  const unsub = watchMessages(tribe.id, (m, more) => {
    msgs = m; if (!older.length) hasMore = more; render();
    if (!document.hidden && Date.now() - lastRead > 5000) { lastRead = Date.now(); markRead(tribe.id, me.uid); }
  }, (e) => { clear(list); list.append(e.code === 'permission-denied' ? emptyState({ icon: 'lock', title: 'Chat unavailable', text: 'Only active members can read this chat.' }) : banner(friendlyError(e), 'error')); });
  return { destroy() { destroyed = true; unsub(); root.remove(); }, focus: () => ta.focus() };
}
