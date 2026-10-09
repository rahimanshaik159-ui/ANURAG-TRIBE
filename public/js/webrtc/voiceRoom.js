// TRIBE VOICE MEET (V1): audio-only, peer-to-peer MESH. Nothing is recorded or stored;
// Firestore holds only room/participant presence + temporary signaling.
// Mesh is ideal for ~2-8 people (each member sends audio to every other member). Beyond
// APP.voice.softPeerLimit quality drops - an SFU would be the future upgrade path.
//
// Who offers? The member who joined LATER offers to every earlier member (deterministic,
// so two people never offer to each other at once = no "glare").
import { F, db } from '../core/firebase.js';
import { col, withId } from '../services/_util.js';
import { Signaling, CandidateQueue, sleep } from './signaling.js';
import { getIceConfig, rtcSupported } from './ice.js';
import { APP } from '../config/app-config.js';

export async function findActiveRoom(tribeId) {
  const s = await F.getDocs(F.query(col('tribeVoiceRooms'), F.where('tribeId', '==', tribeId), F.where('status', '==', 'active'), F.orderBy('createdAt', 'desc'), F.limit(1)));
  const d = s.docs[0]; if (!d) return null;
  const r = withId(d);
  if (r.expiresAt && r.expiresAt.toMillis() < Date.now()) return null;
  return r;
}
export async function createRoom(tribeId, uid) {
  const ref = await F.addDoc(col('tribeVoiceRooms'), {
    tribeId, createdBy: uid, status: 'active', createdAt: F.serverTimestamp(),
    expiresAt: F.Timestamp.fromMillis(Date.now() + APP.voice.roomTtlHours * 3600 * 1000),
  });
  return ref.id;
}
export function watchRoomParticipantCount(roomId, cb) {
  return F.onSnapshot(col('tribeVoiceRooms', roomId, 'participants'), (s) => cb(s.size), () => cb(0));
}

function micErrorMessage(e) {
  if (!window.isSecureContext) return 'Voice needs a secure (https) connection. Open the site over https.';
  switch (e && e.name) {
    case 'NotAllowedError': case 'SecurityError': return 'Microphone permission was blocked. Allow the microphone for this site in your browser settings, then try again.';
    case 'NotFoundError': return 'No microphone was found on this device.';
    case 'NotReadableError': return 'Your microphone is being used by another app. Close it and try again.';
    default: return 'Could not start your microphone.';
  }
}

export class VoiceRoom {
  /** @param {{tribeId, roomId, uid, onUpdate(state), onEnded()}} o */
  constructor(o) {
    Object.assign(this, o);
    this.peers = new Map(); this.pending = new Map(); this.timers = []; this.unsubs = []; this.levels = new Map();
    this.session = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    this.state = { status: 'idle', error: '', muted: false, participants: [], needsAudioUnlock: false, turn: null };
    this.audioHost = null; this.left = false;
  }
  _set(patch) { Object.assign(this.state, patch); this._publish(); }
  _publish() {
    const parts = (this.parts || []).map((p) => ({ uid: p.uid, self: p.uid === this.uid, muted: p.muted, speaking: !!this.levels.get(p.uid),
      conn: p.uid === this.uid ? 'connected' : (this.peers.get(p.uid) || {}).conn || 'connecting' }));
    this.onUpdate({ ...this.state, participants: parts });
  }

  async join() {
    if (!rtcSupported() || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this._set({ status: 'error', error: window.isSecureContext ? 'This browser does not support voice calls.' : 'Voice needs a secure (https) connection.' }); return false;
    }
    this._set({ status: 'mic' });
    try { this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }); }
    catch (e) { this._set({ status: 'error', error: micErrorMessage(e) }); return false; }
    const ice = await getIceConfig(); this.ice = ice; this.state.turn = ice.turn;

    this.audioHost = document.createElement('div'); this.audioHost.hidden = true; document.body.append(this.audioHost);
    this.sigColl = col('tribeVoiceRooms', this.roomId, 'signaling');
    this.signaling = new Signaling(this.sigColl, this.uid, { session: this.session });
    this.signaling.listen((m) => this._onSignal(m));

    this.partRef = F.doc(db, 'tribeVoiceRooms', this.roomId, 'participants', this.uid);
    try { await F.setDoc(this.partRef, { uid: this.uid, joinedAt: F.serverTimestamp(), lastSeen: F.serverTimestamp(), muted: false, sessionId: this.session }); }
    catch (e) { this._set({ status: 'error', error: 'Could not join the room. It may have ended, or you are not a member.' }); this._cleanupLocal(); return false; }

    this.unsubs.push(F.onSnapshot(col('tribeVoiceRooms', this.roomId, 'participants'), (s) => this._onParticipants(s), () => this._set({ error: 'Lost connection to the room list.' })));
    this.unsubs.push(F.onSnapshot(F.doc(db, 'tribeVoiceRooms', this.roomId), (s) => { if (s.exists() && s.data().status === 'ended' && !this.left) { this.leave(); if (this.onEnded) this.onEnded(); } }));
    this.timers.push(setInterval(() => F.updateDoc(this.partRef, { lastSeen: F.serverTimestamp(), muted: this.state.muted }).catch(() => {}), APP.voice.heartbeatMs));
    this._watchLevel(this.uid, this.stream);
    this._pagehide = () => { try { F.deleteDoc(this.partRef); } catch (_) { /* best effort; scheduled cleanup covers it */ } };
    window.addEventListener('pagehide', this._pagehide);
    this._set({ status: 'connected' });
    return true;
  }

  _onParticipants(snap) {
    const list = snap.docs.map((d) => ({ uid: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
    const maxSeen = Math.max(0, ...list.map((p) => (p.lastSeen && p.lastSeen.toMillis ? p.lastSeen.toMillis() : 0)));
    // Skew-tolerant staleness: compare to the freshest heartbeat in the room, not the local clock.
    this.parts = list.filter((p) => p.uid === this.uid || !p.lastSeen || maxSeen - p.lastSeen.toMillis() < APP.voice.staleMs)
      .sort((a, b) => (a.joinedAt?.toMillis?.() || 0) - (b.joinedAt?.toMillis?.() || 0) || a.uid.localeCompare(b.uid));
    const me = this.parts.find((p) => p.uid === this.uid); if (!me) { this._publish(); return; }
    const ids = new Set(this.parts.map((p) => p.uid));
    for (const [uid, peer] of this.peers) if (!ids.has(uid)) this._closePeer(uid, peer);
    for (const p of this.parts) {
      if (p.uid === this.uid) continue;
      const existing = this.peers.get(p.uid);
      if (existing && existing.session === p.sessionId) continue;       // already connected to this session
      if (existing) this._closePeer(p.uid, existing);                    // they rejoined: new session
      const iOffer = (me.joinedAt?.toMillis?.() || 0) > (p.joinedAt?.toMillis?.() || 0) || ((me.joinedAt?.toMillis?.() || 0) === (p.joinedAt?.toMillis?.() || 0) && this.uid > p.uid);
      this._createPeer(p.uid, p.sessionId, iOffer);
    }
    this._publish();
  }

  _createPeer(uid, session, iOffer) {
    const pc = new RTCPeerConnection({ iceServers: this.ice.iceServers });
    const peer = { uid, session, pc, iOffer, conn: 'connecting', cands: new CandidateQueue(pc), restarts: 0, audio: null };
    this.peers.set(uid, peer);
    this.stream.getTracks().forEach((t) => pc.addTrack(t, this.stream));
    pc.onicecandidate = (e) => { if (e.candidate) this.signaling.send(uid, 'candidate', e.candidate.toJSON()).catch(() => {}); };
    pc.ontrack = (e) => this._attachAudio(peer, e.streams[0]);
    pc.onconnectionstatechange = () => this._onConnState(peer);
    if (iOffer) this._offer(peer, false);
    // replay signals that arrived before we knew this peer's session
    (this.pending.get(uid) || []).filter((m) => m.session === session).forEach((m) => this._onSignal(m));
    this.pending.delete(uid);
    this._publish();
  }
  async _offer(peer, restart) {
    try {
      const offer = await peer.pc.createOffer(restart ? { iceRestart: true } : {});
      await peer.pc.setLocalDescription(offer);
      await this.signaling.send(peer.uid, 'offer', peer.pc.localDescription.toJSON());
    } catch (e) { console.warn('offer failed', e); }
  }
  async _onSignal(m) {
    const peer = this.peers.get(m.from);
    if (!peer || peer.session !== m.session) { // not known yet (participant list lags) - keep briefly
      const arr = this.pending.get(m.from) || []; arr.push(m); this.pending.set(m.from, arr.slice(-60)); return;
    }
    const pc = peer.pc;
    try {
      if (m.kind === 'offer') {
        await pc.setRemoteDescription(m.payload); await peer.cands.flush();
        const ans = await pc.createAnswer(); await pc.setLocalDescription(ans);
        await this.signaling.send(peer.uid, 'answer', pc.localDescription.toJSON());
      } else if (m.kind === 'answer') { await pc.setRemoteDescription(m.payload); await peer.cands.flush(); }
      else if (m.kind === 'candidate') await peer.cands.add(m.payload);
    } catch (e) { console.warn('signal error', m.kind, e.message); }
  }
  _onConnState(peer) {
    const s = peer.pc.connectionState;
    if (s === 'connected') { peer.conn = 'connected'; peer.restarts = 0; }
    else if (s === 'disconnected') {
      peer.conn = 'reconnecting';
      setTimeout(() => { if (this.peers.get(peer.uid) === peer && peer.pc.connectionState === 'disconnected') this._recover(peer); }, 6000);
    } else if (s === 'failed') this._recover(peer);
    this._publish();
  }
  /** Recover a dropped link: the offering side restarts ICE (max 3 tries), then marks it failed with a manual Reconnect. */
  async _recover(peer) {
    if (this.left || this.peers.get(peer.uid) !== peer) return;
    if (peer.iOffer && peer.restarts < 3) { peer.restarts++; peer.conn = 'reconnecting'; peer.pc.restartIce(); await this._offer(peer, true); }
    else if (!peer.iOffer && peer.restarts < 3) { peer.restarts++; peer.conn = 'reconnecting'; /* wait for the other side's restart offer */ await sleep(10000); if (peer.pc.connectionState !== 'connected') peer.conn = 'failed'; }
    else peer.conn = 'failed';
    this._publish();
  }
  /** Manual reconnect button for one participant. */
  reconnect(uid) {
    const peer = this.peers.get(uid); const p = (this.parts || []).find((x) => x.uid === uid); if (!p) return;
    if (peer) this._closePeer(uid, peer);
    const me = this.parts.find((x) => x.uid === this.uid);
    this._createPeer(uid, p.sessionId, (me.joinedAt?.toMillis?.() || 0) >= (p.joinedAt?.toMillis?.() || 0));
  }
  _attachAudio(peer, stream) {
    if (!peer.audio) { peer.audio = document.createElement('audio'); peer.audio.autoplay = true; peer.audio.setAttribute('playsinline', ''); this.audioHost.append(peer.audio); }
    peer.audio.srcObject = stream;
    peer.audio.play().then(() => {}, () => this._set({ needsAudioUnlock: true })); // autoplay blocked -> UI shows "Tap to enable audio"
    this._watchLevel(peer.uid, stream);
  }
  /** Called from a user tap if autoplay was blocked. */
  unlockAudio() { for (const p of this.peers.values()) if (p.audio) p.audio.play().catch(() => {}); this._set({ needsAudioUnlock: false }); }
  _closePeer(uid, peer) {
    try { peer.pc.close(); } catch (_) { /* ignore */ }
    if (peer.audio) { peer.audio.srcObject = null; peer.audio.remove(); }
    this.peers.delete(uid); this.levels.delete(uid);
    if (this._lv && this._lv.has(uid)) { clearInterval(this._lv.get(uid)); this._lv.delete(uid); }
  }
  _watchLevel(uid, stream) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
      this.actx = this.actx || new Ctx(); const src = this.actx.createMediaStreamSource(stream);
      const an = this.actx.createAnalyser(); an.fftSize = 512; src.connect(an); const buf = new Uint8Array(an.fftSize);
      this._lv = this._lv || new Map();
      this._lv.set(uid, setInterval(() => {
        an.getByteTimeDomainData(buf); let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        const speaking = Math.sqrt(sum / buf.length) > 0.04 && !(uid === this.uid && this.state.muted);
        if (speaking !== !!this.levels.get(uid)) { this.levels.set(uid, speaking); this._publish(); }
      }, 200));
    } catch (_) { /* level meter is optional */ }
  }

  setMuted(muted) {
    this.state.muted = muted;
    if (this.stream) this.stream.getAudioTracks().forEach((t) => { t.enabled = !muted; });
    if (this.partRef) F.updateDoc(this.partRef, { muted, lastSeen: F.serverTimestamp() }).catch(() => {});
    this._publish();
  }

  _cleanupLocal() {
    this.timers.forEach(clearInterval); this.timers = [];
    this.unsubs.forEach((u) => u()); this.unsubs = [];
    if (this._lv) { this._lv.forEach(clearInterval); this._lv.clear(); }
    for (const [uid, p] of this.peers) this._closePeer(uid, p);
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.signaling) this.signaling.close();
    if (this.audioHost) this.audioHost.remove();
    if (this.actx) { this.actx.close().catch(() => {}); this.actx = null; }
    window.removeEventListener('pagehide', this._pagehide);
  }
  async leave() {
    if (this.left) return; this.left = true;
    const others = (this.parts || []).filter((p) => p.uid !== this.uid).length;
    this._cleanupLocal();
    try { if (this.partRef) await F.deleteDoc(this.partRef); } catch (_) { /* ignore */ }
    // last one out ends the room (rules allow the creator / Tribe leaders; scheduled cleanup covers everyone else)
    if (others === 0) { try { await F.updateDoc(F.doc(db, 'tribeVoiceRooms', this.roomId), { status: 'ended', endedAt: F.serverTimestamp() }); } catch (_) { /* ignore */ } }
    this._set({ status: 'idle', participants: [] });
  }
}
