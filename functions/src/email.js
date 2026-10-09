'use strict';
/**
 * Email notifications. Provider: Resend (REST). To switch provider, replace
 * `sendViaProvider` only. Emails carry secure links, NEVER file attachments.
 * Anti-abuse: per-user hourly cap, delivery log (emailLogs), scheduled retries.
 */
const C = require('./core');
const { db, FieldValue, Timestamp, admin } = C;

// Only these notification types ever trigger email (chat/voice never do).
const EMAIL_TYPES = new Set(['help_request', 'help_update', 'transfer_request', 'transfer_update', 'tribe_invite',
  'tribe_join_request', 'tribe_join_decision', 'tribe_removed', 'project_application', 'project_update',
  'tribe_project_created', 'showcase_decision', 'announcement', 'admin_action']);

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function render(n, url) {
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f6;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
  <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden">
   <tr><td style="background:#0b0b0c;color:#fff;padding:18px 24px;font-weight:700;font-size:18px">ANURAG <span style="color:#e10613">TRIBE</span></td></tr>
   <tr><td style="padding:28px 24px">
     <h2 style="margin:0 0 10px;color:#0b0b0c;font-size:20px">${esc(n.title)}</h2>
     <p style="margin:0 0 22px;color:#444;font-size:15px;line-height:1.5">${esc(n.body)}</p>
     <a href="${esc(url)}" style="background:#e10613;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:700;display:inline-block">Open in ANURAG TRIBE</a>
   </td></tr>
   <tr><td style="padding:14px 24px;color:#888;font-size:12px;border-top:1px solid #eee">One Campus. Many Minds. One Tribe.<br>
     You get this because of your ANURAG TRIBE notification settings. Files are never sent by email - they transfer directly between students after acceptance.</td></tr>
  </table></td></tr></table></body></html>`;
  return { html, text: `${n.title}\n\n${n.body}\n\nOpen: ${url}` };
}

async function sendViaProvider({ to, subject, html, text }) {
  const key = C.RESEND_API_KEY.value();
  if (!key || key === 'unset') throw new Error('EMAIL_NOT_CONFIGURED');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: C.EMAIL_FROM.value(), to: [to], subject, html, text }),
  });
  if (!res.ok) throw new Error(`PROVIDER_${res.status}: ${(await res.text()).slice(0, 200)}`);
}

function abs(link) {
  const base = C.APP_URL.value().replace(/\/$/, '');
  return `${base}/${String(link || '').replace(/^\//, '')}`;
}

/** Called from the notifications onCreate trigger. Never throws. */
async function maybeEmail(notifId, n) {
  try {
    if (!EMAIL_TYPES.has(n.type)) return;
    if (n.type === 'announcement' && !(n.meta && n.meta.email)) return;
    const [priv, user] = await Promise.all([db.doc(`userPrivate/${n.uid}`).get(), admin.auth().getUser(n.uid).catch(() => null)]);
    if (!user || !user.email || !user.emailVerified || user.disabled) return;
    const p = priv.exists ? priv.data() : {};
    if (p.emailNotifications === false) return;
    if (n.type === 'announcement' && p.emailAnnouncements === false) return;

    const settings = await C.getSettings();
    const since = Timestamp.fromMillis(Date.now() - 3600 * 1000);
    const recent = await db.collection('emailLogs').where('uid', '==', n.uid).where('createdAt', '>', since).count().get();
    if (recent.data().count >= settings.emailsPerUserPerHour) {
      await db.collection('emailLogs').add({ uid: n.uid, notificationId: notifId, type: n.type, status: 'rate_limited', attempts: 0, createdAt: FieldValue.serverTimestamp() });
      return;
    }
    const logRef = db.collection('emailLogs').doc();
    await logRef.set({ uid: n.uid, notificationId: notifId, type: n.type, status: 'queued', attempts: 0, createdAt: FieldValue.serverTimestamp() });
    await attempt(logRef, user.email, n);
  } catch (e) { console.error('maybeEmail failed', e); }
}

async function attempt(logRef, to, n) {
  const { html, text } = render(n, abs(n.link));
  try {
    await sendViaProvider({ to, subject: n.title, html, text });
    await logRef.update({ status: 'sent', sentAt: FieldValue.serverTimestamp(), attempts: FieldValue.increment(1) });
  } catch (e) {
    const notConfigured = e.message === 'EMAIL_NOT_CONFIGURED';
    await logRef.update({
      status: notConfigured ? 'not_configured' : 'failed', error: String(e.message).slice(0, 300),
      attempts: FieldValue.increment(1),
      nextRetryAt: Timestamp.fromMillis(Date.now() + 15 * 60 * 1000),
      to,
    });
  }
}

/** Scheduled: retry failed sends (max 4 attempts). */
async function retryFailed() {
  const due = await db.collection('emailLogs').where('status', '==', 'failed').where('nextRetryAt', '<=', Timestamp.now()).limit(25).get();
  for (const d of due.docs) {
    const l = d.data();
    if (l.attempts >= 4) { await d.ref.update({ status: 'gave_up' }); continue; }
    const nd = await db.doc(`notifications/${l.notificationId}`).get();
    if (nd.exists && l.to) await attempt(d.ref, l.to, nd.data());
  }
}

module.exports = { maybeEmail, retryFailed };
