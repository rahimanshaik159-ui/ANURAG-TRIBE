import { boot } from './_boot.js';
import { h, clear, qs } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { field, input, passwordToggle, toast, banner, busy } from '../core/ui.js';
import { login, resetPassword, session } from '../core/auth.js';
import { friendlyError, configured } from '../core/firebase.js';
import { validateEmail } from '../lib/validators.js';

// Only allow redirects to our own pages (prevents open-redirect via ?next=).
const safeNext = (n) => (/^[a-z0-9-]+\.html([?#][\w=&%.,#-]*)?$/i.test(n || '') ? n : 'dashboard.html');

boot({ require: 'public' }, async (ctx) => {
  const app = ctx.main; clear(app);
  if (ctx.user && ctx.session.verified) { location.replace(safeNext(qs().get('next'))); return; }
  if (ctx.user && !ctx.session.verified) { location.replace('verify-email.html'); return; }
  const email = input({ type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'you@example.com' });
  const pw = input({ type: 'password', autocomplete: 'current-password', placeholder: 'Your password' });
  const fe = field('Email', email, { required: true }); const fp = field('Password', pw, { required: true });
  const pwWrap = h('div', { class: 'password-wrap' }, passwordToggle(pw)); pw.replaceWith(pwWrap); pwWrap.prepend(pw);
  const msg = h('div', {});
  if (qs().get('verified')) msg.append(banner('Thanks! If you confirmed your email, you can log in now.', 'ok'));
  if (!configured) msg.append(banner('Firebase is not configured yet (see README). Login will not work until it is.', 'warn'));
  const submit = h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'submit' }, 'Log in');
  const forgot = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: async (e) => {
    const err = validateEmail(email.value); if (err) { fe.setError('Enter your email above first.'); email.focus(); return; }
    await busy(e.currentTarget, async () => { await resetPassword(email.value); toast('If an account exists for that email, a reset link is on its way.', 'success', 7000); });
  } }, 'Forgot password?');
  const form = h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); fe.setError(''); fp.setError('');
    const err = validateEmail(email.value); if (err) { fe.setError(err); return; } if (!pw.value) { fp.setError('Enter your password.'); return; }
    await busy(submit, async () => {
      try {
        const u = await login(email.value, pw.value);
        location.href = u.emailVerified ? safeNext(qs().get('next')) : 'verify-email.html';
      } catch (er) { fp.setError(friendlyError(er)); }
    });
  } }, fe, fp, h('div', { class: 'row between' }, h('span', {}), forgot), submit);
  app.append(h('div', { class: 'auth-wrap' },
    h('aside', { class: 'auth-side' }, h('img', { src: 'assets/logo/anurag-tribe-logo.png', alt: 'ANURAG TRIBE' }), h('h2', {}, 'Welcome back to your Tribe.'),
      h('ul', {}, ['Pick up your Tribe chats and projects', 'See students and Tribes matched to your skills', 'Send big files directly - never stored on a server'].map((t) => h('li', {}, t)))),
    h('div', { class: 'auth-main' }, h('div', { class: 'auth-card stack-lg stack' }, h('div', {}, h('h1', { style: { fontSize: '2rem' } }, 'Log in'), h('p', { class: 'muted' }, 'Use the email you registered with.')), msg, form,
      h('p', { class: 'center muted' }, 'New here? ', h('a', { class: 'red', href: 'register.html', style: { fontWeight: '700' } }, 'Join ANURAG TRIBE'))))));
});
