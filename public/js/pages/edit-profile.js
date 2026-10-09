import { boot } from './_boot.js';
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { pageHero, field, input, select, textarea, counter, toast, busy, banner } from '../core/ui.js';
import { avatarPicker } from '../components/avatar.js';
import { skillPicker } from '../components/skillPicker.js';
import { socialEditor } from '../components/socialLinks.js';
import { validateProfile } from '../lib/validators.js';
import { saveProfile, getPrefs, savePrefs } from '../services/users.js';
import { refreshProfile } from '../core/auth.js';
import { friendlyError } from '../core/firebase.js';
import { DEPARTMENTS, YEARS } from '../lib/taxonomy.js';

boot({ require: 'user' }, async (ctx) => {
  const { main: app, profile: p, tax, user } = ctx; clear(app);
  const prefs = await getPrefs(user.uid).catch(() => ({ emailNotifications: true, emailAnnouncements: true }));
  const name = input({ value: p.name, maxlength: 60, autocomplete: 'name' }); const username = input({ value: p.username, maxlength: 20, autocapitalize: 'none' });
  const dept = select([...new Set([...DEPARTMENTS, p.department])], { value: p.department }); const year = select(YEARS.map((y) => ({ value: y.value, label: y.label })), { value: p.year });
  const section = input({ value: p.section || '', maxlength: 4 }); const bio = textarea({ value: p.bio || '', rows: 4, placeholder: 'A short intro: what you do, what you love, what you want to build.' });
  const fN = field('Full name', name, { required: true }), fU = field('Username', username, { required: true, hint: 'Changing your username changes your profile search handle.' }), fD = field('Department', dept, { required: true }), fY = field('Year', year, { required: true }), fS = field('Section', section), fB = field('Bio', bio);
  const picker = avatarPicker({ value: p.avatar || { type: 'none' }, name: p.name }); name.addEventListener('input', () => picker.setName(name.value));
  const skills = skillPicker({ tax, value: p.skills || [], max: 15 }), interests = skillPicker({ tax, value: p.interests || [], max: 15 }), learning = skillPicker({ tax, value: p.learning || [], max: 10 }), looking = skillPicker({ tax, value: p.lookingFor || [], max: 10 });
  const projects = [...(p.currentProjects || [])]; const projBox = h('div', { class: 'stack', style: { gap: '8px' } });
  const drawProj = () => { clear(projBox); projects.forEach((v, i) => projBox.append(h('div', { class: 'row' }, h('input', { class: 'input', value: v, maxlength: 80, placeholder: 'e.g. Short film "Midnight Chai"', 'aria-label': `Project ${i + 1}`, oninput: (e) => { projects[i] = e.target.value; } }), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remove', onclick: () => { projects.splice(i, 1); drawProj(); } }, icon('trash', 18))))); if (projects.length < 5) projBox.append(h('button', { class: 'btn btn-outline btn-sm', type: 'button', style: { alignSelf: 'flex-start' }, onclick: () => { projects.push(''); drawProj(); } }, icon('plus', 16), 'Add project')); };
  drawProj();
  const avail = (v, t, d) => h('label', { class: 'card', style: { display: 'flex', gap: '10px', cursor: 'pointer', padding: '12px' } }, h('input', { type: 'radio', name: 'avail', value: v, checked: (p.availability || 'none') === v, style: { accentColor: 'var(--red)' } }), h('span', {}, h('strong', {}, t), h('br'), h('span', { class: 'muted small' }, d)));
  const availBox = h('div', { class: 'grid grid-cards' }, avail('open', 'Open to collaborate', 'Show a green badge'), avail('busy', 'Busy right now', 'Visible but not highlighted'), avail('none', 'Not specified', 'No status shown'));
  const social = socialEditor(p.social || {});
  const hidden = h('input', { type: 'checkbox', checked: p.visibility === 'hidden' }); const emailN = h('input', { type: 'checkbox', checked: prefs.emailNotifications !== false }); const emailA = h('input', { type: 'checkbox', checked: prefs.emailAnnouncements !== false });
  const err = h('div', {});
  const save = h('button', { class: 'btn btn-primary', type: 'submit' }, icon('check', 18), 'Save changes');
  const sec = (title, id, ...kids) => h('section', { class: 'form-section card', id }, h('h3', {}, title), ...kids);
  const form = h('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); clear(err);
    const input_ = { name: name.value, username: username.value, department: dept.value, year: year.value, section: section.value, bio: bio.value, avatar: picker.getValue(), skills: skills.getValue(), interests: interests.getValue(), learning: learning.getValue(), lookingFor: looking.getValue(), currentProjects: projects, availability: (document.querySelector('input[name=avail]:checked') || {}).value, visibility: hidden.checked ? 'hidden' : 'campus', social: social.getValue() };
    const v = validateProfile(input_, tax);
    [['name', fN], ['username', fU], ['department', fD], ['year', fY]].forEach(([k, f]) => f.setError(v.errors[k] || '')); social.setErrors(v.errors);
    if (picker.hasError()) v.errors.avatar = 'Fix your image link or pick an avatar.';
    if (!v.ok || v.errors.avatar) { err.append(banner(Object.values(v.errors)[0], 'error')); const first = document.querySelector('.has-error, .field-error:not(:empty)'); if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    await busy(save, async () => {
      try {
        await saveProfile(user.uid, p.username, v.value);
        await savePrefs(user.uid, { emailNotifications: emailN.checked, emailAnnouncements: emailA.checked });
        await refreshProfile(); toast('Profile updated.', 'success'); setTimeout(() => { location.href = 'profile.html'; }, 600);
      } catch (er) { if (er.fields && er.fields.username) fU.setError(er.fields.username); else err.append(banner(friendlyError(er), 'error')); }
    });
  } },
    sec('Basics', 'basics', h('div', { class: 'form-grid' }, fN, fU, fD, fY), fS, fB, counter(bio, 300)),
    sec('Profile avatar', 'avatar', h('p', { class: 'muted small' }, 'Choose a supplied ANURAG TRIBE avatar, use your initials, or link a photo you host elsewhere. We never store profile photos.'), picker),
    sec('Skills', 'skills', h('p', { class: 'muted small' }, 'What you can do. Used for people search and Tribe matching.'), skills),
    sec('Interests', 'interests', interests), sec('Learning interests', 'learning', h('p', { class: 'muted small' }, 'What you want to learn.'), learning),
    sec('What I\'m looking for', 'looking', h('p', { class: 'muted small' }, 'Skills you want in collaborators. Powers "students you may want to meet".'), looking),
    sec('Current projects', 'projects', projBox), sec('Availability', 'availability', availBox),
    sec('Social links', 'social', h('p', { class: 'muted small' }, 'All optional. Handles like @name work for Instagram, X, YouTube and GitHub. Your email and phone are never shown.'), social),
    sec('Privacy & notifications', 'privacy', h('label', { class: 'check' }, hidden, h('span', {}, 'Hide my profile from the student directory and recommendations')), h('div', { class: 'divider' }),
      h('label', { class: 'check' }, emailN, h('span', {}, 'Email me about help requests, invitations, transfers and replies')), h('label', { class: 'check', style: { marginTop: '10px' } }, emailA, h('span', {}, 'Email me admin announcements'))),
    err, h('div', { class: 'sticky-save' }, h('a', { class: 'btn btn-ghost', href: 'profile.html' }, 'Cancel'), save));
  app.append(pageHero('Edit profile', 'Keep your skills and interests current for better matches.'), h('div', { class: 'container section-sm' }, h('div', { class: 'form-card stack-lg stack' }, form)));
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
});
