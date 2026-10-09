// Tribe voice meet UI (audio only). Wraps webrtc/voiceRoom.js.
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, banner, emptyState, confirmDialog } from '../core/ui.js';
import { avatarEl } from './avatar.js';
import { getUser } from '../services/users.js';
import { VoiceRoom, createRoom, watchRoomParticipantCount } from '../webrtc/voiceRoom.js';
import { F, db, friendlyError } from '../core/firebase.js';
import { col, withId } from '../services/_util.js';
import { APP } from '../config/app-config.js';

const CONN = { connecting: 'Connecting...', connected: 'Connected', reconnecting: 'Reconnecting...', failed: 'Connection failed' };

/** mountVoice({tribe, me, container}) -> {destroy} */
export function mountVoice({ tribe, me, container }) {
  let room = null; let active = null; let roomState = null; let count = 0; let unCount = null; let destroyed = false;
  const box = h('div', { class: 'card voice-panel' }); container.append(box);

  const unsubRooms = F.onSnapshot(F.query(col('tribeVoiceRooms'), F.where('tribeId', '==', tribe.id), F.where('status', '==', 'active'), F.orderBy('createdAt', 'desc'), F.limit(1)), (s) => {
    const r = s.docs[0] ? withId(s.docs[0]) : null; const expired = r && r.expiresAt && r.expiresAt.toMillis() < Date.now();
    const nextActive = expired ? null : r;
    if ((nextActive && nextActive.id) !== (active && active.id)) { if (unCount) unCount(); unCount = nextActive ? watchRoomParticipantCount(nextActive.id, (n) => { count = n; if (!room) draw(); }) : null; count = 0; }
    active = nextActive; if (!room) draw();
  }, (e) => { if (!room) { clear(box); box.append(banner(friendlyError(e), 'error')); } });

  async function start() {
    if (tribe.status !== 'active') return toast('This Tribe is not active.', 'error');
    try { const id = active ? active.id : await createRoom(tribe.id, me.uid); await joinRoom(id); } catch (e) { toast(friendlyError(e), 'error'); }
  }
  async function joinRoom(roomId) {
    room = new VoiceRoom({ tribeId: tribe.id, roomId, uid: me.uid, onUpdate: (st) => { roomState = st; drawCall(); }, onEnded: () => { toast('The voice meet ended.', 'info'); } });
    window.addEventListener('beforeunload', warn);
    const ok = await room.join();
    if (!ok) { const err = roomState && roomState.error; room = null; window.removeEventListener('beforeunload', warn); draw(err); }
  }
  const warn = (e) => { if (room) { e.preventDefault(); e.returnValue = ''; } };
  async function leave() { if (room) { const r = room; room = null; window.removeEventListener('beforeunload', warn); await r.leave(); } draw(); }

  function draw(error) {
    if (destroyed) return; clear(box);
    if (error) box.append(banner(error, 'error'));
    if (active) box.append(h('div', { class: 'row between wrap' }, h('div', {}, h('span', { class: 'live-pill' }, h('i'), 'Voice meet in progress'), h('p', { class: 'muted small', style: { margin: '6px 0 0' } }, `${count} ${count === 1 ? 'person' : 'people'} in the room`)), h('button', { class: 'btn btn-primary btn-lg', onclick: start }, icon('mic', 20), 'Join voice meet')));
    else box.append(emptyState({ icon: 'mic', title: 'No voice meet right now', text: 'Start a voice-only meeting for this Tribe. Members get notified and can join with one tap. Nothing is recorded.', action: h('button', { class: 'btn btn-primary btn-lg', onclick: start }, icon('mic', 20), 'START TRIBE VOICE MEET') }));
    box.append(h('p', { class: 'small muted' }, 'Audio only \u2022 peer-to-peer \u2022 works best with headphones \u2022 ideal for up to ' + APP.voice.softPeerLimit + ' people.'));
  }
  async function drawCall() {
    if (!roomState || destroyed || !room) return; const st = roomState;
    const users = await Promise.all(st.participants.map((p) => getUser(p.uid))); if (!room) return;
    clear(box);
    if (st.status === 'mic') { box.append(banner('Waiting for microphone permission... choose "Allow" in your browser prompt.', 'info')); return; }
    if (st.error) box.append(banner(st.error, 'error'));
    if (st.turn === false) box.append(banner('No relay (TURN) server is configured. Voice works on most networks, but some strict or mobile networks may fail to connect.', 'warn'));
    if (st.needsAudioUnlock) box.append(h('button', { class: 'btn btn-dark btn-block', onclick: () => room.unlockAudio() }, icon('volume', 18), 'Tap to enable audio'));
    box.append(h('div', { class: 'row between wrap' }, h('span', { class: 'live-pill' }, h('i'), 'You are in the voice meet'), h('span', { class: 'muted small' }, `${st.participants.length} in room`)));
    box.append(h('div', { class: 'voice-grid' }, st.participants.map((p, i) => {
      const u = users[i];
      return h('div', { class: `vp ${p.speaking ? 'speaking' : ''}` }, p.muted ? h('span', { class: 'vp-mic', title: 'Muted' }, icon('micOff', 16)) : null, avatarEl(u, 'lg'), h('div', { class: 'vp-name' }, p.self ? `${u.name} (you)` : u.name),
        h('div', { class: `vp-state ${p.conn === 'failed' ? 'bad' : ''}` }, p.self ? (st.muted ? 'Muted' : 'Mic on') : CONN[p.conn] || p.conn),
        !p.self && p.conn === 'failed' ? h('button', { class: 'btn btn-outline btn-sm', style: { marginTop: '6px' }, onclick: () => room.reconnect(p.uid) }, icon('refresh', 14), 'Reconnect') : null);
    })));
    box.append(h('div', { class: 'voice-controls' },
      h('button', { class: `btn ${st.muted ? 'btn-dark' : 'btn-outline'} btn-lg`, 'aria-pressed': String(st.muted), onclick: () => room.setMuted(!st.muted) }, icon(st.muted ? 'micOff' : 'mic', 20), st.muted ? 'Unmute' : 'Mute'),
      h('button', { class: 'btn btn-danger btn-lg', onclick: leave }, icon('phoneOff', 20), 'Leave')));
  }
  draw();
  return { destroy() { destroyed = true; unsubRooms(); if (unCount) unCount(); if (room) room.leave(); window.removeEventListener('beforeunload', warn); box.remove(); } };
}
