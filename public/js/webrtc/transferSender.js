// SENDER side of the direct P2P transfer. LOCKED ARCHITECTURE:
//   Firestore = signaling + status only.  Bytes = WebRTC DataChannel, browser to browser.
//   No Storage, no permanent URLs, no silent fallback if WebRTC fails.
//
// Protocol over one reliable, ordered DataChannel (see lib/transferRules.js MSG):
//   S: hello{files}  R: ready
//   for each file: S: file-start, <binary chunks>, file-end{sha256}   R: ack... , file-ok | file-bad
//   S: done
// Flow control (two layers, so slow receivers/disks can't blow up memory):
//   1) bufferedAmount backpressure on the local DataChannel
//   2) an application window: never run more than WINDOW bytes ahead of what the
//      receiver has CONFIRMED written (ack). Progress shown = confirmed bytes (real, not simulated).
import { getIceConfig } from './ice.js';
import { CandidateQueue, sleep } from './signaling.js';
import { Sha256 } from '../lib/sha256.js';
import { CHUNK_SIZE, READ_BLOCK, BUFFER_HIGH, BUFFER_LOW, CONNECT_TIMEOUT_MS, STALL_TIMEOUT_MS, MSG } from '../lib/transferRules.js';

const WINDOW = 16 * 1024 * 1024;

export class TransferSender {
  /**
   * @param {{session, files:File[], signaling:Signaling, onState(state,detail), onProgress({confirmed,total,speed,eta,fileIndex})}} o
   * states: connecting | waiting | transferring | completed | failed | cancelled
   */
  constructor(o) {
    Object.assign(this, o);
    this.total = this.session.totalBytes; this.confirmedBase = 0; this.confirmedInFile = 0; this.sentInFile = 0;
    this.aborted = null; this.finished = false; this.wakers = []; this.fileResults = new Map(); this.lastAckAt = Date.now();
    this.t0 = 0; this.peer = this.session.recipientUid;
  }
  _emit(s, d) { if (this.onState) this.onState(s, d); }
  _wake() { this.wakers.splice(0).forEach((r) => r()); }
  _sleepWake(ms) { return Promise.race([new Promise((r) => this.wakers.push(r)), sleep(ms)]); }
  _fail(reason, state = 'failed') {
    if (this.finished) return; this.finished = true; this.aborted = { reason, state };
    clearTimeout(this.connTimer); this._wake(); this._emit(state, reason); this._teardown();
  }

  async start() {
    this._emit('connecting', 'Contacting the recipient...');
    const { iceServers } = await getIceConfig();
    const pc = this.pc = new RTCPeerConnection({ iceServers });
    this.cands = new CandidateQueue(pc);
    const dc = this.dc = pc.createDataChannel('transfer', { ordered: true });
    dc.binaryType = 'arraybuffer'; dc.bufferedAmountLowThreshold = BUFFER_LOW;
    dc.onbufferedamountlow = () => this._wake();
    dc.onclose = () => { if (!this.finished) this._fail('The connection closed before the transfer finished.'); };
    dc.onerror = () => { if (!this.finished) this._fail('The data connection hit an error.'); };
    dc.onopen = () => { clearTimeout(this.connTimer); this._emit('waiting', 'Connected. Waiting for the recipient to be ready...'); this._hello(); };
    dc.onmessage = (e) => this._onControl(e.data);

   
pc.onicecandidate = (e) => {
  if (e.candidate) {
    this.signaling
      .send(this.peer, 'candidate', e.candidate.toJSON())
      .catch((err) => {
        console.error('[Transfer] Failed to send ICE candidate:', err);
      });
  } else {
    console.log('[Transfer] ICE candidate gathering complete');
  }
};

    pc.oniceconnectionstatechange = () => {
  console.log('[Transfer] ICE state:', pc.iceConnectionState);
};

pc.onicegatheringstatechange = () => {
  console.log('[Transfer] ICE gathering:', pc.iceGatheringState);
};

pc.onconnectionstatechange = () => {
  console.log('[Transfer] Connection state:', pc.connectionState);

  if (pc.connectionState === 'failed') {
    this._fail(
      'Direct connection failed. Check both devices and networks, then retry. This setup does not use a TURN relay.'
    );
  }
};
    this.signaling.listen(async (m) => {
      if (m.kind === 'answer') { await pc.setRemoteDescription(m.payload); await this.cands.flush(); }
      else if (m.kind === 'candidate') await this.cands.add(m.payload);
      else if (m.kind === 'bye') this._fail('The recipient cancelled the transfer.', 'cancelled');
    });
    this.connTimer = setTimeout(() => this._fail('Timed out connecting. The recipient may have gone offline or closed the transfer page. Ask them to open it and retry.'), CONNECT_TIMEOUT_MS);
    const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
    await this.signaling.send(this.peer, 'offer', pc.localDescription.toJSON());
  }

  _send(obj) { this.dc.send(JSON.stringify(obj)); }
  _hello() { this._send({ t: MSG.HELLO, v: 1, files: this.files.map((f, i) => ({ index: i, name: f.name, size: f.size, type: f.type })) }); }

  _onControl(data) {
    if (typeof data !== 'string') return;
    let m; try { m = JSON.parse(data); } catch (_) { return; }
    this.lastAckAt = Date.now();
    switch (m.t) {
      case MSG.READY: if (!this.sending) { this.sending = true; this._run().catch((e) => this._fail(e.message || 'Transfer error.')); } break;
      case MSG.ACK: this.confirmedInFile = Math.min(m.received, this.files[m.index]?.size || 0); this._progress(); this._wake(); break;
      case MSG.FILE_OK: case MSG.FILE_BAD: this.fileResults.set(m.index, m.t === MSG.FILE_OK); this._wake(); break;
      case MSG.CANCEL: this._fail('The recipient cancelled the transfer.', 'cancelled'); break;
      case MSG.ERROR: this._fail(m.message || 'The recipient reported an error.'); break;
      default: break;
    }
  }
  _progress() {
    const confirmed = this.confirmedBase + this.confirmedInFile;
    const dt = (Date.now() - this.t0) / 1000; const speed = dt > 0.5 ? confirmed / dt : 0;
    if (this.onProgress) this.onProgress({ confirmed, total: this.total, speed, eta: speed ? (this.total - confirmed) / speed : Infinity, fileIndex: this.curIndex });
  }
  _check() { if (this.aborted) throw new Error(this.aborted.reason); }

  async _drain() {
    for (;;) {
      this._check();
      if (this.dc.readyState !== 'open') throw new Error('The connection closed unexpectedly.');
      if (this.dc.bufferedAmount > BUFFER_HIGH || this.sentInFile - this.confirmedInFile > WINDOW) {
        await this._sleepWake(250);
        // Stall detection: bytes are outstanding but the receiver has confirmed nothing for a long time.
        if (Date.now() - this.lastAckAt > STALL_TIMEOUT_MS) throw new Error('The transfer stalled (no progress from the recipient for 30 seconds). Retry when both of you are online.');
        continue;
      }
      return;
    }
  }

  async _run() {
    this.t0 = Date.now(); this._emit('transferring', 'Sending...');
    for (let i = 0; i < this.files.length; i++) {
      this.curIndex = i; const file = this.files[i];
      this.sentInFile = 0; this.confirmedInFile = 0;
      this._send({ t: MSG.FILE_START, index: i, name: file.name, size: file.size, type: file.type });
      const hash = new Sha256();
      for (let off = 0; off < file.size; off += READ_BLOCK) {
        this._check();
        const buf = new Uint8Array(await file.slice(off, Math.min(off + READ_BLOCK, file.size)).arrayBuffer());
        if (buf.length === 0) throw new Error(`"${file.name}" could not be read (it may have changed or been moved).`);
        hash.update(buf);
        for (let o = 0; o < buf.length; o += CHUNK_SIZE) {
          await this._drain();
          this.dc.send(buf.subarray(o, Math.min(o + CHUNK_SIZE, buf.length)));
          this.sentInFile += Math.min(CHUNK_SIZE, buf.length - o);
        }
      }
      this._send({ t: MSG.FILE_END, index: i, size: file.size, sha256: hash.hex() });
      // wait for the receiver to confirm the written file + hash
      while (!this.fileResults.has(i)) { this._check(); await this._sleepWake(250); if (Date.now() - this.lastAckAt > STALL_TIMEOUT_MS * 2) throw new Error('The recipient did not confirm the file.'); }
      if (!this.fileResults.get(i)) throw new Error(`Integrity check failed for "${file.name}". The file was corrupted in transit - retry the transfer.`);
      this.confirmedBase += file.size; this.confirmedInFile = 0; this._progress();
    }
    this._send({ t: MSG.DONE });
    this.finished = true; clearTimeout(this.connTimer); this._emit('completed', 'All files delivered.');
    setTimeout(() => this._teardown(), 1500); // let the DONE frame flush
  }

  /** User pressed Cancel. */
  cancel() {
    if (this.finished) return;
    try { if (this.dc && this.dc.readyState === 'open') this._send({ t: MSG.CANCEL }); } catch (_) { /* ignore */ }
    this.signaling.send(this.peer, 'bye', {}).catch(() => {});
    this._fail('You cancelled the transfer.', 'cancelled');
  }
  _teardown() {
    clearTimeout(this.connTimer);
    try { if (this.dc) this.dc.close(); } catch (_) { /* ignore */ }
    try { if (this.pc) this.pc.close(); } catch (_) { /* ignore */ }
    if (this.signaling) this.signaling.close();
  }
}
