// RECEIVER side of the direct P2P transfer (see transferSender.js for the protocol).
// Memory-conscious saving, best option first:
//   fs-dir / fs-file : File System Access API streams straight to disk (desktop Chromium: no big RAM use)
//   blob             : in-browser chunks consolidated into Blobs (browser may page these to disk),
//                      then a "Save" button. Phones/Firefox/Safari use this: very large files can fail
//                      on low-memory devices - the UI warns about it.
// The destination is chosen in the Accept click (a user gesture, which pickers require).
import { getIceConfig } from './ice.js';
import { CandidateQueue } from './signaling.js';
import { Sha256 } from '../lib/sha256.js';
import { ACK_EVERY, MSG, safeFileName } from '../lib/transferRules.js';

const CONSOLIDATE_AT = 64 * 1024 * 1024;
export const fsAccessSupport = () => ({ file: typeof window.showSaveFilePicker === 'function', dir: typeof window.showDirectoryPicker === 'function' });

/** Must be called synchronously from the Accept click. Returns a sink descriptor. */
export async function chooseSink(files) {
  const s = fsAccessSupport();
  try {
    if (files.length === 1 && s.file) {
      const handle = await window.showSaveFilePicker({ suggestedName: safeFileName(files[0].name) });
      return { mode: 'fs-file', handle };
    }
    if (files.length > 1 && s.dir) return { mode: 'fs-dir', dir: await window.showDirectoryPicker({ mode: 'readwrite' }) };
  } catch (e) { if (e.name !== 'AbortError') console.warn('picker failed', e); /* user cancelled: fall back to in-browser save */ }
  return { mode: 'blob' };
}

export class TransferReceiver {
  /**
   * @param {{session, signaling, sink, onState(state,detail), onProgress(p), onFileReady({index,name,size,blob})}} o
   * states: connecting | transferring | completed | failed | cancelled
   */
  constructor(o) {
    Object.assign(this, o);
    this.peer = this.session.senderUid; this.total = this.session.totalBytes;
    this.finished = false; this.q = Promise.resolve(); this.doneBytes = 0; this.cur = null; this.usedNames = new Set(); this.t0 = 0;
  }
  _emit(s, d) { if (this.onState) this.onState(s, d); }
  _fail(reason, state = 'failed', notifyPeer = true) {
    if (this.finished) return; this.finished = true;
    if (notifyPeer) { try { if (this.dc && this.dc.readyState === 'open') this.dc.send(JSON.stringify({ t: state === 'cancelled' ? MSG.CANCEL : MSG.ERROR, message: reason })); } catch (_) { /* ignore */ } }
    this._abortCurrent(); this._emit(state, reason); this._teardown();
  }
  async _abortCurrent() { if (this.cur && this.cur.writable) { try { await this.cur.writable.abort(); } catch (_) { /* ignore */ } } this.cur = null; }

  async start() {
    this._emit('connecting', 'Waiting for the sender to connect...');
    const { iceServers } = await getIceConfig();
    const pc = this.pc = new RTCPeerConnection({ iceServers });
    this.cands = new CandidateQueue(pc);
    pc.onicecandidate = (e) => { if (e.candidate) this.signaling.send(this.peer, 'candidate', e.candidate.toJSON()).catch(() => {}); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') this._fail('Could not establish a direct connection. Your networks may block peer-to-peer links. Ask the sender to retry.'); };
    pc.ondatachannel = (e) => {
      const dc = this.dc = e.channel; dc.binaryType = 'arraybuffer';
      dc.onclose = () => { if (!this.finished) this._fail('The connection closed before the transfer finished.', 'failed', false); };
      dc.onmessage = (ev) => { this.q = this.q.then(() => this._onMessage(ev.data)).catch((err) => this._fail(err.message || 'Could not save the file.')); };
    };
    this.signaling.listen(async (m) => {
      if (m.kind === 'offer') {
        await pc.setRemoteDescription(m.payload); await this.cands.flush();
        const ans = await pc.createAnswer(); await pc.setLocalDescription(ans);
        await this.signaling.send(this.peer, 'answer', pc.localDescription.toJSON());
      } else if (m.kind === 'candidate') await this.cands.add(m.payload);
      else if (m.kind === 'bye') this._fail('The sender cancelled the transfer.', 'cancelled', false);
    });
  }

  async _onMessage(data) {
    if (this.finished) return;
    if (typeof data === 'string') return this._onControl(JSON.parse(data));
    const f = this.cur; if (!f) throw new Error('Unexpected data from the sender.');
    const chunk = new Uint8Array(data);
    if (f.received + chunk.length > f.size) throw new Error('Received more data than announced. Transfer stopped.');
    f.hash.update(chunk);
    if (f.writable) await f.writable.write(chunk);
    else { f.parts.push(chunk); f.partBytes += chunk.length; if (f.partBytes >= CONSOLIDATE_AT) { f.parts = [new Blob(f.parts)]; f.partBytes = 0; } }
    f.received += chunk.length;
    if (f.received - f.lastAck >= ACK_EVERY) { f.lastAck = f.received; this.dc.send(JSON.stringify({ t: MSG.ACK, index: f.index, received: f.received })); }
    this._progress();
  }
  _progress() {
    const confirmed = this.doneBytes + (this.cur ? this.cur.received : 0);
    const dt = (Date.now() - this.t0) / 1000; const speed = dt > 0.5 ? confirmed / dt : 0;
    if (this.onProgress) this.onProgress({ confirmed, total: this.total, speed, eta: speed ? (this.total - confirmed) / speed : Infinity, fileIndex: this.cur ? this.cur.index : 0 });
  }

  async _onControl(m) {
    if (m.t === MSG.HELLO) {
      // Trust the Firestore-approved metadata, not whatever the peer claims.
      const ok = Array.isArray(m.files) && m.files.length === this.session.files.length && m.files.every((f, i) => f.size === this.session.files[i].size && f.name === this.session.files[i].name);
      if (!ok) throw new Error('The sender announced different files than the ones you accepted. Transfer stopped.');
      this.t0 = Date.now(); this._emit('transferring', 'Receiving...');
      this.dc.send(JSON.stringify({ t: MSG.READY }));
    } else if (m.t === MSG.FILE_START) {
      const meta = this.session.files[m.index];
      if (!meta || m.size !== meta.size) throw new Error('File details do not match what you accepted.');
      this.cur = { index: m.index, name: meta.name, size: meta.size, type: meta.type, received: 0, lastAck: 0, hash: new Sha256(), parts: [], partBytes: 0, writable: null };
      await this._openWritable(this.cur);
    } else if (m.t === MSG.FILE_END) {
      const f = this.cur; if (!f || f.index !== m.index) throw new Error('Unexpected end of file.');
      const good = f.received === f.size && f.hash.hex() === m.sha256;
      if (f.writable) { if (good) await f.writable.close(); else await f.writable.abort(); }
      this.dc.send(JSON.stringify({ t: good ? MSG.FILE_OK : MSG.FILE_BAD, index: f.index }));
      if (!good) { this.cur = null; throw new Error(`Integrity check failed for "${f.name}". The file was not saved - ask the sender to retry.`); }
      this.doneBytes += f.size;
      if (!f.writable && this.onFileReady) this.onFileReady({ index: f.index, name: safeFileName(f.name), size: f.size, blob: new Blob(f.parts, { type: f.type || 'application/octet-stream' }) });
      else if (this.onFileSaved) this.onFileSaved({ index: f.index, name: f.name });
      f.parts = []; this.cur = null; this._progress();
    } else if (m.t === MSG.DONE) {
      this.finished = true; this._emit('completed', 'All files received.'); setTimeout(() => this._teardown(), 1000);
    } else if (m.t === MSG.CANCEL) this._fail('The sender cancelled the transfer.', 'cancelled', false);
    else if (m.t === MSG.ERROR) this._fail(m.message || 'The sender reported an error.', 'failed', false);
  }

  async _openWritable(f) {
    const s = this.sink || { mode: 'blob' };
    if (s.mode === 'fs-file') f.writable = await s.handle.createWritable();
    else if (s.mode === 'fs-dir') {
      let name = safeFileName(f.name); let n = 1;
      while (this.usedNames.has(name)) name = safeFileName(f.name).replace(/(\.[^.]*)?$/, ` (${n++})$1`);
      this.usedNames.add(name);
      f.writable = await (await s.dir.getFileHandle(name, { create: true })).createWritable();
    }
  }

  cancel() { this.signaling.send(this.peer, 'bye', {}).catch(() => {}); this._fail('You cancelled the transfer.', 'cancelled'); }
  _teardown() {
    try { if (this.dc) this.dc.close(); } catch (_) { /* ignore */ }
    try { if (this.pc) this.pc.close(); } catch (_) { /* ignore */ }
    if (this.signaling) this.signaling.close();
  }
}
