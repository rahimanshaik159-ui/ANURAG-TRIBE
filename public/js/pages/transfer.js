// DIRECT FILE TRANSFER (locked architecture): authenticated, recipient-accepted, WebRTC browser-to-browser.
// Firestore holds session metadata + signaling only. NO file storage, NO fallback to a server.
import { boot } from './_boot.js';
import { h, clear, qs } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { pageHero, skeletonGrid, emptyState, tabs, toast, busy, chip, banner, field, select, errorState, confirmDialog } from '../core/ui.js';
import { avatarEl } from '../components/avatar.js';
import * as TS from '../webrtc/transferSession.js';
import { TransferSender } from '../webrtc/transferSender.js';
import { TransferReceiver, chooseSink, fsAccessSupport } from '../webrtc/transferReceiver.js';
import { rtcSupported } from '../webrtc/ice.js';
import { validateFileSelection, MAX_FILES, MAX_FILE_BYTES, TERMINAL } from '../lib/transferRules.js';
import { formatBytes, formatSpeed, formatEta, timeAgo } from '../lib/format.js';
import { getUser } from '../services/users.js';
import { myRequests } from '../services/helpRequests.js';
import { myMemberships, listMembers } from '../services/tribes.js';
import { friendlyError } from '../core/firebase.js';

const outbox = new Map();   // sessionId -> File[]   (files never leave this tab except over the DataChannel)
const sinks = new Map();    // sessionId -> chosen save destination (receiver)
const ACTIVE = ['accepted', 'connecting', 'transferring'];

boot({ require: 'user' }, async (ctx) => {
  const { main: app, user, profile: me } = ctx; clear(app);
  app.append(pageHero('Direct file transfer', 'Send files straight to another student. Browser to browser. Nothing is stored on ANURAG TRIBE servers.', { eyebrow: 'Up to 500 MB' }));
  const wrap = h('div', { class: 'container section-sm stack' }); app.append(wrap);
  const view = h('div', {}); let current = null; let tab = 'send'; let stop = null;
  if (!rtcSupported()) { wrap.append(banner('This browser does not support WebRTC, which direct transfer needs. Try a recent Chrome, Edge, Firefox or Safari.', 'error')); return; }
  wrap.append(banner('How it works: you pick files, the recipient accepts, then the files travel directly between your two devices. Both of you must keep this page open until it finishes. If a direct connection is impossible on your networks, the transfer fails clearly and you can retry - files are never uploaded anywhere as a fallback.', 'info'));
  const t = tabs([{ id: 'send', label: 'Send files' }, { id: 'history', label: 'Inbox & history' }], tab, (id) => { tab = id; closeSession(); show(); });
  wrap.append(t, view);
  function closeSession() { if (stop) stop(); stop = null; }
  function show() { if (tab === 'send') sendForm(); else history(); }
  const nameOf = async (uid) => (await getUser(uid)).name;

  // ------------------------------------------------------------ new transfer
  async function sendForm() {
    clear(view); view.append(skeletonGrid(1));
    const [helps, tribes] = await Promise.all([myRequests(user.uid).then((r) => r.filter((x) => x.status === 'accepted')).catch(() => []), myMemberships(user.uid).catch(() => [])]);
    clear(view);
    const preH = qs().get('help'); const preT = qs().get('tribe');
    const ctxOpts = [...helps.map((r) => ({ value: `helpRequest:${r.id}`, label: `Help request: ${r.title}` })), ...tribes.map((x) => ({ value: `tribe:${x.id}`, label: `Tribe: ${x.name}` }))];
    if (!ctxOpts.length) { view.append(emptyState({ icon: 'send', title: 'Nobody to send to yet', text: 'Direct transfer works between students who are collaborating: members of the same Tribe, or people on an accepted help request. This keeps files from strangers out.', action: h('div', { class: 'row' }, h('a', { class: 'btn btn-primary', href: 'tribes.html' }, 'Find a Tribe'), h('a', { class: 'btn btn-outline', href: 'help-requests.html' }, 'I need someone')) })); return; }
    const ctxSel = select(ctxOpts); const who = select([{ value: '', label: 'Choose a recipient' }]);
    if (preH && helps.some((r) => r.id === preH)) ctxSel.value = `helpRequest:${preH}`; else if (preT && tribes.some((x) => x.id === preT)) ctxSel.value = `tribe:${preT}`;
    async function fillWho() {
      const [type, id] = ctxSel.value.split(':'); clear(who); who.append(h('option', { value: '' }, 'Loading...'));
      let uids = []; try { uids = type === 'tribe' ? (await listMembers(id)).map((m) => m.uid) : helps.find((r) => r.id === id).participants; } catch (_) { /* ignore */ }
      uids = uids.filter((u) => u !== user.uid); const us = await Promise.all(uids.map(getUser));
      clear(who); who.append(h('option', { value: '' }, 'Choose a recipient'), ...us.map((u) => h('option', { value: u.uid }, u.name))); if (us.length === 1) who.value = us[0].uid;
    }
    ctxSel.addEventListener('change', fillWho); fillWho();
    let files = []; const list = h('div', {}); const errs = h('div', {});
    const input_ = h('input', { type: 'file', multiple: true, hidden: true });
    const setFiles = (fl) => { files = Array.from(fl).slice(0, 10); const v = validateFileSelection(files); clear(list); clear(errs);
      files.forEach((f, i) => list.append(h('div', { class: 'file-row' }, h('span', { class: 'file-ic' }, icon('file', 20)), h('div', { class: 'grow' }, h('strong', { style: { overflowWrap: 'anywhere' } }, f.name), h('div', { class: 'muted small' }, formatBytes(f.size))), h('button', { class: 'icon-btn', 'aria-label': 'Remove file', onclick: () => setFiles(files.filter((_, j) => j !== i)) }, icon('x', 18)))));
      if (files.length) list.append(h('div', { class: 'small muted' }, `${files.length} file${files.length > 1 ? 's' : ''} \u2022 ${formatBytes(v.total)} of 500 MB`));
      if (files.length && !v.ok) v.errors.forEach((e) => errs.append(banner(e, 'error'))); send.disabled = !(v.ok && who.value); };
    input_.addEventListener('change', () => { setFiles([...files, ...input_.files]); input_.value = ''; }); who.addEventListener('change', () => setFiles(files));
    const drop = h('div', { class: 'drop', onclick: () => input_.click(), ondragover: (e) => { e.preventDefault(); drop.classList.add('over'); }, ondragleave: () => drop.classList.remove('over'), ondrop: (e) => { e.preventDefault(); drop.classList.remove('over'); setFiles([...files, ...e.dataTransfer.files]); }, tabindex: 0, role: 'button', onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') input_.click(); } },
      icon('upload', 30), h('p', { style: { margin: '8px 0 2px', fontWeight: '700' } }, 'Tap to choose files or drop them here'), h('p', { class: 'muted small', style: { margin: 0 } }, `Up to ${MAX_FILES} files, 500 MB total. Executable files (.exe, .bat, .msi...) are blocked.`));
    const send = h('button', { class: 'btn btn-primary btn-lg', disabled: true }, icon('send', 18), 'Send request');
    send.onclick = () => busy(send, async () => {
      const v = validateFileSelection(files); if (!v.ok) return; const [type, cid] = ctxSel.value.split(':');
      const id = await TS.createSession({ senderUid: user.uid, recipientUid: who.value, contextType: type, contextId: cid, files }); outbox.set(id, files); history_replace(id); openSession(id);
    });
    view.append(h('div', { class: 'card stack' }, h('div', { class: 'form-grid' }, field('Send in context of', ctxSel), field('To', who)), drop, input_, list, errs, h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, send)));
  }
  const history_replace = (id) => history.replaceState(null, '', `transfer.html?id=${id}`);

  // ------------------------------------------------------------ history
  async function history() {
    clear(view); view.append(skeletonGrid(3));
    try {
      const ss = await TS.listMySessions(user.uid); const us = await Promise.all(ss.map((s) => getUser(s.senderUid === user.uid ? s.recipientUid : s.senderUid))); clear(view);
      view.append(ss.length ? h('div', { class: 'stack' }, ss.map((s, i) => h('a', { class: 'card row between wrap card-hover', href: '#', onclick: (e) => { e.preventDefault(); history_replace(s.id); openSession(s.id); } },
        h('div', { class: 'row grow' }, avatarEl(us[i], 'md'), h('div', {}, h('strong', {}, s.senderUid === user.uid ? `To ${us[i].name}` : `From ${us[i].name}`), h('div', { class: 'muted small' }, `${s.files.map((f) => f.name).join(', ').slice(0, 70)} \u2022 ${formatBytes(s.totalBytes)} \u2022 ${timeAgo(s.createdAt)}`))), h('span', { class: `t-status ${s.status}` }, s.status))))
        : emptyState({ icon: 'send', title: 'No transfers yet', text: 'Transfers you send or receive appear here for a few days, then are cleared.' }));
    } catch (e) { clear(view); view.append(errorState(friendlyError(e), history)); }
  }

  // ------------------------------------------------------------ one session (sender or receiver)
  function openSession(id) {
    closeSession(); clear(view);
    const box = h('div', { class: 'stack' }); view.append(h('button', { class: 'btn btn-ghost btn-sm', style: { alignSelf: 'flex-start', marginBottom: '8px' }, onclick: () => { closeSession(); tab = 'history'; t.setActive('history'); history_replace(''); history(); } }, 'Back to list'), box);
    let session = null; let engine = null; let engineAttempt = 0; let progress = null; let local = { state: '', detail: '' }; let savedFiles = [];
    const unsub = TS.watchSession(id, (s) => { session = s; render(); maybeStart(); }, (e) => { clear(box); box.append(errorState(friendlyError(e))); });
    stop = () => { unsub(); if (engine && !isDone()) { /* leaving the page mid-transfer cancels it */ engine.cancel(); } };
    addEventListener('pagehide', () => { if (engine && !isDone()) engine.cancel(); });
    const isDone = () => ['completed', 'failed', 'cancelled'].includes(local.state);
    const iAmSender = () => session && session.senderUid === user.uid;
    const write = (status, reason) => { if (!session || session.status === status || TERMINAL.includes(session.status)) return; (status === 'cancelled' ? TS.cancelSession(id) : TS.setStatus(id, status, reason)).catch(() => {}); };
    const sigFor = (attempt) => { const s = TS.makeSignaling(id, user.uid, attempt); const l = s.listen.bind(s); s.listen = (fn) => l((m) => (m.attempt === attempt ? fn(m) : undefined)); return s; };

    function onState(st, detail) { local = { state: st, detail }; if (st === 'connecting') write('connecting'); else if (st === 'transferring') write('transferring'); else if (st === 'completed') iAmSender() && write('completed'); else if (st === 'failed') write('failed', detail); else if (st === 'cancelled') write('cancelled'); render(); }
    function onProgress(p) { progress = p; renderProgress(); }

    // Sender starts automatically once the recipient accepted (needs the File objects in memory).
    async function maybeStart() {
      if (!session || !iAmSender() || engine && engineAttempt === session.attempt) return;
      if (session.status !== 'accepted') return;
      const files = outbox.get(id); if (!files) return render();            // page was reloaded: ask to re-select
      engineAttempt = session.attempt; local = { state: 'connecting', detail: '' };
      engine = new TransferSender({ session, files, signaling: sigFor(session.attempt), onState, onProgress });
      try { await engine.start(); } catch (e) { onState('failed', friendlyError(e)); }
    }
    // Receiver: started from the Accept click (user gesture needed for the save picker).
    async function startReceiver(sink) {
      if (engine) { try { engine.cancel(); } catch (_) { /* ignore */ } }
      sinks.set(id, sink); engineAttempt = session.attempt; local = { state: 'connecting', detail: '' }; savedFiles = [];
      engine = new TransferReceiver({ session, sink, signaling: sigFor(session.attempt), onState, onProgress,
        onFileReady: (f) => { savedFiles.push({ ...f, url: URL.createObjectURL(f.blob) }); render(); }, });
      try { await engine.start(); } catch (e) { onState('failed', friendlyError(e)); }
    }
    // Receiver must re-arm when the sender retries (attempt bumped).
    const rearm = setInterval(() => { if (session && !iAmSender() && sinks.has(id) && session.status === 'accepted' && engineAttempt !== session.attempt && !TERMINAL.includes(session.status)) startReceiver(sinks.get(id)); }, 1000);
    const prevStop = stop; stop = () => { clearInterval(rearm); prevStop(); };

    async function accept(e) {
      const btn = e.currentTarget; btn.disabled = true;
      const sink = await chooseSink(session.files);                       // picker runs inside the click gesture
      try { await TS.acceptSession(id); await startReceiver(sink); } catch (er) { toast(friendlyError(er), 'error'); btn.disabled = false; }
    }
    async function resume(e) { const sink = await chooseSink(session.files); await startReceiver(sink); }
    async function retry() { engine = null; local = { state: '', detail: '' }; progress = null; try { await TS.retrySession(id, (session.attempt || 1) + 1); } catch (e) { toast(friendlyError(e), 'error'); } }
    async function cancel() { if (await confirmDialog({ title: 'Cancel this transfer?', message: 'The other student will be told it was cancelled.', confirmLabel: 'Cancel transfer', danger: true })) { if (engine && !isDone()) engine.cancel(); else write('cancelled'); if (session.status === 'pending') TS.cancelSession(id).catch(() => {}); } }

    const progBar = h('i'); const progText = h('div', { class: 'stat-line' }); const progWrap = h('div', { class: 'stack', style: { gap: '8px' } }, h('div', { class: 'progress' }, progBar), progText);
    function renderProgress() { if (!progress) return; const pct = Math.min(100, (progress.confirmed / progress.total) * 100); progBar.style.width = `${pct}%`;
      progText.textContent = ''; progText.append(h('span', {}, `${pct.toFixed(1)}%`), h('span', {}, `${formatBytes(progress.confirmed)} / ${formatBytes(progress.total)}`), h('span', {}, formatSpeed(progress.speed)), h('span', {}, `ETA ${formatEta(progress.eta)}`), h('span', {}, `File ${(progress.fileIndex || 0) + 1}/${session.files.length}`)); }

    async function render() {
      if (!session) return; const other = await getUser(iAmSender() ? session.recipientUid : session.senderUid); clear(box);
      const st = session.status; const live = ACTIVE.includes(st) && !isDone();
      box.append(h('section', { class: 'card stack' },
        h('div', { class: 'row between wrap' }, h('div', { class: 'row' }, avatarEl(other, 'md'), h('div', {}, h('strong', {}, iAmSender() ? `To ${other.name}` : `From ${other.name}`), h('div', { class: 'muted small' }, `${timeAgo(session.createdAt)} \u2022 ${formatBytes(session.totalBytes)}`))), h('span', { class: `t-status ${local.state === 'failed' ? 'failed' : st}` }, local.state === 'failed' ? 'failed' : st)),
        session.files.map((f) => h('div', { class: 'file-row' }, h('span', { class: 'file-ic' }, icon('file', 20)), h('div', { class: 'grow' }, h('strong', { style: { overflowWrap: 'anywhere' } }, f.name), h('div', { class: 'muted small' }, formatBytes(f.size))))), ));
      const card = h('section', { class: 'card stack' }); box.append(card);
      const fail = local.state === 'failed' ? local.detail : (st === 'failed' ? session.failureReason : '');
      if (st === 'pending') {
        if (iAmSender()) card.append(banner(`Waiting for ${other.name} to accept. They have been notified (and emailed if they allow it). Keep this page open.`, 'info'), h('div', {}, h('button', { class: 'btn btn-danger btn-sm', onclick: cancel }, 'Cancel request')));
        else {
          const fs = fsAccessSupport(); const big = session.totalBytes > 200 * 1024 * 1024;
          card.append(h('p', { style: { margin: 0 } }, h('strong', {}, other.name), ` wants to send you ${session.files.length} file${session.files.length > 1 ? 's' : ''}. Only accept files you expect. Files go directly between your devices and are not scanned by ANURAG TRIBE.`),
            (!fs.file && !fs.dir && big) ? banner('Your browser will keep this file in memory/temporary storage before saving. Very large files can fail on phones or low-memory devices. For big files, use Chrome or Edge on a laptop.', 'warn') : (fs.file || fs.dir) ? banner('You will be asked where to save the file(s); the data streams straight to disk.', 'info') : null,
            h('div', { class: 'row wrap' }, h('button', { class: 'btn btn-primary', onclick: accept }, icon('download', 16), 'Accept and choose where to save'), h('button', { class: 'btn btn-outline', onclick: (e) => busy(e.currentTarget, async () => { await TS.rejectSession(id); }) }, 'Decline')));
        }
      } else if (live || local.state === 'connecting' || local.state === 'transferring' || local.state === 'waiting') {
        if (iAmSender() && !engine) card.append(banner('Accepted. To send, re-select the same files (this page was reloaded, so your browser forgot them).', 'warn'), reselect());
        else if (!iAmSender() && !engine) card.append(banner('You accepted, but this page was reloaded. Choose where to save to resume.', 'warn'), h('button', { class: 'btn btn-primary', onclick: resume }, 'Resume and choose where to save'));
        else { card.append(h('p', { class: 'muted', style: { margin: 0 } }, local.detail || (iAmSender() ? 'Connecting...' : 'Waiting for the sender...')), progWrap, h('p', { class: 'small muted', style: { margin: 0 } }, 'Keep this page open on both devices until it finishes.'), h('div', {}, h('button', { class: 'btn btn-danger btn-sm', onclick: cancel }, 'Cancel transfer'))); renderProgress(); }
      } else if (st === 'completed' || local.state === 'completed') {
        card.append(banner(iAmSender() ? 'All files were delivered and verified.' : 'All files received and verified (SHA-256).', 'ok'));
        if (!iAmSender() && savedFiles.length) card.append(h('div', {}, h('h4', {}, 'Save your files'), savedFiles.map((f) => h('div', { class: 'file-row' }, h('span', { class: 'file-ic' }, icon('file', 20)), h('div', { class: 'grow' }, h('strong', {}, f.name), h('div', { class: 'muted small' }, formatBytes(f.size))), h('a', { class: 'btn btn-primary btn-sm', href: f.url, download: f.name }, icon('download', 14), 'Save')))), h('p', { class: 'small muted' }, 'Files exist only in this browser tab until you save them. Leaving this page discards them.'));
        else if (!iAmSender()) card.append(h('p', { class: 'muted small' }, 'The files were written directly to the location you chose.'));
      } else if (st === 'failed' || local.state === 'failed') {
        card.append(banner(fail || 'The transfer failed.', 'error'));
        card.append(iAmSender() ? h('div', { class: 'row wrap' }, h('button', { class: 'btn btn-primary', onclick: retry }, icon('refresh', 16), 'Retry transfer'), h('span', { class: 'small muted' }, 'Ask the recipient to keep the page open, then retry.')) : h('p', { class: 'muted small' }, 'The sender can retry. Keep this page open and you will be reconnected.'));
      } else if (st === 'rejected') card.append(banner(iAmSender() ? `${other.name} declined the files.` : 'You declined these files.', 'info'));
      else if (st === 'cancelled' || local.state === 'cancelled') card.append(banner('This transfer was cancelled.', 'info'));
      else if (st === 'expired') card.append(banner('This request expired. Send a new one.', 'info'));
    }
    function reselect() {
      const inp = h('input', { type: 'file', multiple: true, class: 'input' });
      inp.addEventListener('change', () => { const fl = Array.from(inp.files); const ok = fl.length === session.files.length && session.files.every((m) => fl.some((f) => f.name === m.name && f.size === m.size));
        if (!ok) return toast('Those are not the same files you offered (names and sizes must match).', 'error');
        outbox.set(id, session.files.map((m) => fl.find((f) => f.name === m.name && f.size === m.size))); maybeStart(); });
      return inp;
    }
    render();
  }
  show();
  if (qs().get('id')) { tab = 'history'; t.setActive('history'); openSession(qs().get('id')); }
});
