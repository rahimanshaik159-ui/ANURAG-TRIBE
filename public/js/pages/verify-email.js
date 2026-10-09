import { boot } from './_boot.js';
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, busy, banner } from '../core/ui.js';
import { resendVerification, refreshUser, logout, session } from '../core/auth.js';
import { friendlyError } from '../core/firebase.js';

boot({ require: 'public' }, async (ctx) => {
  const app = ctx.main; clear(app);
  if (!ctx.user) { location.replace('login.html'); return; }
  if (ctx.session.verified) { location.replace('dashboard.html'); return; }
  let cooldown = 0; const status = h('div', {});
  const resend = h('button', { class: 'btn btn-outline', onclick: async () => {
    if (cooldown > 0) return;
    await busy(resend, async () => { await resendVerification(); toast('Verification email sent. Check your inbox and spam folder.', 'success'); cooldown = 60; tick(); });
  } }, 'Resend email');
  const tick = () => { if (cooldown > 0) { resend.disabled = true; resend.textContent = `Resend in ${cooldown}s`; cooldown--; setTimeout(tick, 1000); } else { resend.disabled = false; resend.textContent = 'Resend email'; } };
  const check = async (manual) => {
    try { const s = await refreshUser(); if (s.verified) { toast('Email verified. Welcome!', 'success'); setTimeout(() => { location.href = 'dashboard.html'; }, 500); return; } if (manual) toast('Not verified yet. Open the link in the email we sent.', 'info'); }
    catch (e) { if (manual) toast(friendlyError(e), 'error'); }
  };
  const poll = setInterval(() => { if (!document.hidden) check(false); }, 6000);
  app.append(h('div', { class: 'container section' }, h('div', { class: 'card stack', style: { maxWidth: '560px', margin: '0 auto', textAlign: 'center', alignItems: 'center' } },
    h('div', { class: 'empty-ic' }, icon('inbox', 30)), h('h1', { style: { fontSize: '1.7rem' } }, 'Verify your email'),
    h('p', { class: 'muted' }, 'We sent a verification link to ', h('strong', {}, ctx.user.email), '. Open it, then come back here. Verification keeps ANURAG TRIBE safe and lets us send you important updates.'),
    status, h('div', { class: 'row wrap', style: { justifyContent: 'center' } }, h('button', { class: 'btn btn-primary', onclick: (e) => busy(e.currentTarget, () => check(true)) }, "I've verified - continue"), resend),
    h('p', { class: 'small muted' }, "Can't find it? Check spam/promotions, or resend. Wrong address? Log out and register again."),
    h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => { clearInterval(poll); await logout(); location.href = 'login.html'; } }, 'Log out'))));
});
