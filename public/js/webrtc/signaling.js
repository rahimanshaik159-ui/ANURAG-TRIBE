// Firestore-backed WebRTC signaling. Used by BOTH direct file transfer and Tribe voice.
// Documents carry only the temporary handshake (SDP offers/answers, ICE candidates).
// Each doc is addressed to ONE recipient (`to`), consumed once, then deleted.
// Rules ensure only participants can read/write; Cloud Functions + schedulers sweep leftovers.
import { F } from '../core/firebase.js';

export class Signaling {
  /** @param coll Firestore CollectionReference  @param myUid current user  @param extra fields added to each doc */
  constructor(coll, myUid, extra = {}) { this.coll = coll; this.me = myUid; this.extra = extra; this.unsub = null; this.closed = false; }
  async send(to, kind, payload, extra = {}) {
    if (this.closed) return;
    await F.addDoc(this.coll, { from: this.me, to, kind, payload: JSON.stringify(payload || {}), ...this.extra, ...extra, createdAt: F.serverTimestamp() });
  }
  /** handler(msg:{from,kind,payload,attempt?,session?}) is awaited sequentially, in createdAt order. */
  listen(handler) {
    let chain = Promise.resolve();
    this.unsub = F.onSnapshot(F.query(this.coll, F.where('to', '==', this.me)), (snap) => {
      const added = snap.docChanges().filter((c) => c.type === 'added').map((c) => c.doc)
        .sort((a, b) => (a.data().createdAt?.toMillis?.() || 0) - (b.data().createdAt?.toMillis?.() || 0));
      for (const d of added) {
        chain = chain.then(async () => {
          if (this.closed) return;
          const data = d.data(); let payload = {};
          try { payload = JSON.parse(data.payload); } catch (_) { /* ignore malformed */ }
          try { await handler({ ...data, payload }); } catch (e) { console.error('signaling handler error', e); }
          F.deleteDoc(d.ref).catch(() => {}); // consumed
        });
      }
    }, (err) => console.error('signaling listen error', err));
  }
  close() { this.closed = true; if (this.unsub) this.unsub(); this.unsub = null; }
}

/** Buffers ICE candidates until the remote description exists. */
export class CandidateQueue {
  constructor(pc) { this.pc = pc; this.q = []; this.ready = false; }
  async add(c) { if (this.ready) { try { await this.pc.addIceCandidate(c); } catch (e) { console.warn('addIceCandidate', e.message); } } else this.q.push(c); }
  async flush() { this.ready = true; for (const c of this.q.splice(0)) { try { await this.pc.addIceCandidate(c); } catch (e) { console.warn('addIceCandidate', e.message); } } }
  reset() { this.q = []; this.ready = false; }
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
