'use strict';
/**
 * Scheduled cleanup of TEMPORARY data. Nothing here touches file contents
 * (files are never stored). It removes stale signaling, expired transfer
 * metadata, dead voice participants/rooms.
 */
const { onSchedule } = require('firebase-functions/v2/scheduler');
const C = require('./core');
const { retryFailed } = require('./email');
const { db, Timestamp, FieldValue } = C;

async function del(path) {
  for (;;) {
    const s = await db.collection(path).limit(300).get();
    if (s.empty) return;
    const b = db.batch(); s.docs.forEach((d) => b.delete(d.ref)); await b.commit();
  }
}

async function cleanTransfers() {
  const now = Timestamp.now();
  const live = ['pending', 'accepted', 'connecting', 'transferring', 'failed'];
  // 1) past their expiry
  for (const st of live) {
    const s = await db.collection('transferSessions').where('status', '==', st).where('expiresAt', '<=', now).limit(100).get();
    for (const d of s.docs) { await d.ref.update({ status: 'expired', updatedAt: FieldValue.serverTimestamp() }); await del(`transferSessions/${d.id}/signaling`); }
  }
  // 2) stuck mid-transfer for > 2h
  const stale = Timestamp.fromMillis(Date.now() - 2 * 3600 * 1000);
  for (const st of ['connecting', 'transferring']) {
    const s = await db.collection('transferSessions').where('status', '==', st).where('updatedAt', '<=', stale).limit(100).get();
    for (const d of s.docs) { await d.ref.update({ status: 'failed', failureReason: 'Timed out', updatedAt: FieldValue.serverTimestamp() }); await del(`transferSessions/${d.id}/signaling`); }
  }
  // 3) drop finished metadata after 7 days
  const old = Timestamp.fromMillis(Date.now() - 7 * 86400 * 1000);
  for (const st of ['completed', 'rejected', 'cancelled', 'expired', 'failed']) {
    const s = await db.collection('transferSessions').where('status', '==', st).where('updatedAt', '<=', old).limit(100).get();
    for (const d of s.docs) { await del(`transferSessions/${d.id}/signaling`); await d.ref.delete(); }
  }
}

async function cleanVoice() {
  const rooms = await db.collection('tribeVoiceRooms').where('status', '==', 'active').get();
  const deadBefore = Date.now() - 90 * 1000;
  for (const r of rooms.docs) {
    const parts = await r.ref.collection('participants').get();
    let alive = 0;
    for (const p of parts.docs) {
      const ls = p.data().lastSeen;
      if (ls && ls.toMillis() < deadBefore) await p.ref.delete(); else alive++;
    }
    const expired = r.data().expiresAt && r.data().expiresAt.toMillis() < Date.now();
    const emptyAndOld = alive === 0 && r.data().createdAt && r.data().createdAt.toMillis() < Date.now() - 2 * 60 * 1000;
    if (expired || emptyAndOld) {
      await r.ref.update({ status: 'ended', endedAt: FieldValue.serverTimestamp() });
      await del(`tribeVoiceRooms/${r.id}/signaling`);
      const rest = await r.ref.collection('participants').get();
      await Promise.all(rest.docs.map((d) => d.ref.delete()));
    }
  }
  // ended rooms older than 1h are removed entirely
  const old = Timestamp.fromMillis(Date.now() - 3600 * 1000);
  const ended = await db.collection('tribeVoiceRooms').where('status', '==', 'ended').where('createdAt', '<=', old).limit(50).get();
  for (const r of ended.docs) { await del(`tribeVoiceRooms/${r.id}/signaling`); await del(`tribeVoiceRooms/${r.id}/participants`); await r.ref.delete(); }
}

exports.cleanupTemporaryData = onSchedule({ region: C.REGION, schedule: 'every 5 minutes', timeoutSeconds: 300 }, async () => {
  await cleanVoice();
  await cleanTransfers();
});
exports.retryFailedEmails = onSchedule({ region: C.REGION, schedule: 'every 15 minutes', secrets: [C.RESEND_API_KEY] }, async () => { await retryFailed(); });
