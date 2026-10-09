import { boot } from './_boot.js';
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { field, input, select, textarea, toast, banner, busy } from '../core/ui.js';
import { register } from '../core/auth.js';
import { friendlyError, configured } from '../core/firebase.js';
import { validateEmail, validateUsername, passwordIssues, validateProfile } from '../lib/validators.js';
import { DEPARTMENTS, YEARS } from '../lib/taxonomy.js';
import { avatarPicker } from '../components/avatar.js';
import { skillPicker } from '../components/skillPicker.js';
import { debounce } from '../core/dom.js';
import { usernameAvailable } from '../services/users.js';

boot({ require: 'public' }, async (ctx) => {
  const app = ctx.main; clear(app);
  if (ctx.user) { location.replace(ctx.session.verified ? 'dashboard.html' : 'verify-email.html'); return; }
  const tax = ctx.tax;
  const d = { avatar: { type: 'none' } };
  let step = 0;

  // ---- step 1: account
  const name = input({ autocomplete: 'name', placeholder: 'Your full name', maxlength: 60 });
  const username = input({ autocomplete: 'username', placeholder: 'e.g. ravi_k', maxlength: 20, autocapitalize: 'none' });
  const email = input({ type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'you@example.com' });
  const pw = input({ type: 'password', autocomplete: 'new-password', placeholder: 'At least 8 characters, letters + numbers' });
  const meter = h('div', { class: 'pw-meter' }, h('i'));
  const fName = field('Full name', name, { required: true }); const fUser = field('Username', username, { required: true, hint: 'Lowercase letters, numbers and _ . This is how people find you.' });
  const fEmail = field('Email', email, { required: true }); const fPw = field('Password', pw, { required: true });
  pw.addEventListener('input', () => { const n = 4 - passwordIssues(pw.value).length * 1.5 - (pw.value.length < 12 ? 1 : 0); meter.firstChild.style.width = `${Math.max(0, Math.min(100, (pw.value.length / 12) * 60 + (passwordIssues(pw.value).length ? 0 : 40)))}%`; });
  username.addEventListener('input', debounce(async () => {
    username.value = username.value.toLowerCase().replace(/[^a-z0-9_]/g, ''); const e = validateUsername(username.value);
    if (e) return fUser.setError(username.value ? e : '');
    try { fUser.setError((await usernameAvailable(username.value)) ? '' : 'That username is taken.'); } catch (_) { /* check again on submit */ }
  }, 400));
  const s1 = h('div', {}, fName, fUser, fEmail, fPw, meter);

  // ---- step 2: academic + avatar
  const dept = select([{ value: '', label: 'Select department' }, ...DEPARTMENTS]); const year = select([{ value: '', label: 'Select year' }, ...YEARS.map((y) => ({ value: y.value, label: y.label }))]);
  const section = input({ placeholder: 'e.g. A', maxlength: 4 });
  const fDept = field('Department', dept, { required: true }); const fYear = field('Year', year, { required: true }); const fSec = field('Section (optional)', section);
  const picker = avatarPicker({ name: 'You', onChange: (v) => { d.avatar = v; } });
  name.addEventListener('input', () => picker.setName(name.value));
  const s2 = h('div', {}, h('div', { class: 'form-grid' }, fDept, fYear), fSec, h('h3', { style: { marginTop: '10px' } }, 'Choose your avatar'), h('p', { class: 'muted small' }, 'Pick one of the ANURAG TRIBE avatars, or just use your initials. You can change it any time.'), picker);

  // ---- step 3: skills, interests
  const skills = skillPicker({ tax, max: 15 }); const interests = skillPicker({ tax, max: 15 });
  const notify = h('input', { type: 'checkbox', checked: true });
  const s3 = h('div', { class: 'stack-lg stack' }, h('div', {}, h('h3', {}, 'Your skills'), h('p', { class: 'muted small' }, 'What can you do? These power "Find video editors", Tribe matches and recommendations.'), skills),
    h('div', {}, h('h3', {}, 'Your interests'), h('p', { class: 'muted small' }, 'What do you want to be part of or learn about?'), interests),
    h('label', { class: 'check' }, notify, h('span', {}, 'Email me about help requests, Tribe invitations and replies. (You can change this later.)')));

  const steps = [['Account', s1], ['Campus & avatar', s2], ['Skills & interests', s3]];
  const bar = h('div', { class: 'steps-bar', 'aria-hidden': 'true' }); const body = h('div', {}); const err = h('div', {});
  const back = h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => go(step - 1) }, 'Back'); const next = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Continue');
  const title = h('h1', { style: { fontSize: '1.8rem' } }, '');
  function go(n) { step = n; clear(bar); steps.forEach((_, i) => bar.append(h('i', { class: i <= n ? 'on' : '' }))); clear(body); body.append(steps[n][1]); title.textContent = `${steps[n][0]} (${n + 1}/3)`; back.hidden = n === 0; next.textContent = n === 2 ? 'Create my account' : 'Continue'; clear(err); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function validateStep() {
    if (step === 0) {
      let ok = true; const chk = (f, m) => { f.setError(m || ''); if (m) ok = false; };
      chk(fName, name.value.trim().length < 2 ? 'Enter your full name.' : ''); chk(fUser, validateUsername(username.value) || fUser.querySelector('.field-error').textContent);
      chk(fEmail, validateEmail(email.value)); const pi = passwordIssues(pw.value); chk(fPw, pi.length ? `Password needs ${pi.join(' and ')}.` : '');
      return ok;
    }
    if (step === 1) { let ok = true; fDept.setError(dept.value ? '' : 'Choose your department.'); fYear.setError(year.value ? '' : 'Choose your year.'); ok = !!dept.value && !!year.value; if (picker.hasError()) { toast('Fix your image link or choose an avatar.', 'error'); ok = false; } return ok; }
    return true;
  }
  const form = h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); if (!validateStep()) return;
    if (step < 2) return go(step + 1);
    clear(err);
    const profile = { name: name.value, username: username.value, department: dept.value, year: Number(year.value), section: section.value, avatar: picker.getValue(), skills: skills.getValue(), interests: interests.getValue(), learning: [], lookingFor: [], currentProjects: [], availability: 'none', visibility: 'campus', social: {}, bio: '' };
    await busy(next, async () => {
      try { await register({ email: email.value, password: pw.value, profile, emailNotifications: notify.checked }); location.href = 'verify-email.html'; }
      catch (er) {
        if (er.fields && er.fields.username) { go(0); fUser.setError(er.fields.username); }
        else err.append(banner(friendlyError(er), 'error'));
      }
    });
  } }, bar, body, err, h('div', { class: 'row between' }, back, next));
  go(0);
  app.append(h('div', { class: 'auth-wrap' },
    h('aside', { class: 'auth-side' }, h('img', { src: 'assets/logo/anurag-tribe-logo.png', alt: 'ANURAG TRIBE' }), h('h2', {}, 'Join the Tribe.'),
      h('ul', {}, ['Showcase your skills to the whole campus', 'Get matched with students and Tribes', 'Collaborate on projects with chat and voice', 'Free for students'].map((t) => h('li', {}, t)))),
    h('div', { class: 'auth-main' }, h('div', { class: 'auth-card' }, !configured ? banner('Firebase is not configured yet (see README). Registration will not work until it is.', 'warn') : null, title, h('p', { class: 'muted' }, 'It takes about a minute.'), form,
      h('p', { class: 'center muted', style: { marginTop: '18px' } }, 'Already a member? ', h('a', { class: 'red', href: 'login.html', style: { fontWeight: '700' } }, 'Log in'))))));
});
