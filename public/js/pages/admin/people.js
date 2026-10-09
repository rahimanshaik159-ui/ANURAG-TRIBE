// Admin: users, admin management (super admin), platform settings (super admin).
import { h, clear, debounce } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { toast, busy, chip, input, field, confirmDialog, skeletonGrid, errorState, select } from '../../core/ui.js';
import { avatarEl } from '../../components/avatar.js';
import { dataTable, askText } from './_ui.js';
import { F, db, friendlyError } from '../../core/firebase.js';
import { col, withId, getOne } from '../../services/_util.js';
import { isSuper } from '../../core/auth.js';

const roleChip = (u) => chip(u.role === 'superAdmin' ? 'Super Admin' : u.role === 'admin' ? 'Admin' : 'Member', u.role === 'superAdmin' ? 'chip-dark' : u.role === 'admin' ? 'chip-red' : '');

export async function users(el, ctx) {
  const q = input({
    type: 'search',
    placeholder: 'Search by name (starts with)...'
  });

  const out = h('div', {});

  async function load() {
    clear(out);
    out.append(skeletonGrid(1));

    try {
      const t = q.value.trim().toLowerCase();

      const query = t.length >= 2
        ? F.query(
            col('users'),
            F.where('nameLower', '>=', t),
            F.where('nameLower', '<=', t + '\uf8ff'),
            F.orderBy('nameLower'),
            F.limit(40)
          )
        : F.query(
            col('users'),
            F.orderBy('createdAt', 'desc'),
            F.limit(40)
          );

      const snap = await F.getDocs(query);
      const rows = snap.docs.map(withId);

      clear(out);

      out.append(dataTable([
        {
          label: 'Student',
          render: (u) => h(
            'a',
            { class: 'row', href: `profile.html?id=${u.id}` },
            avatarEl(u, 'sm'),
            h(
              'div',
              {},
              h('strong', {}, u.name || 'Unnamed user'),
              h('div', { class: 'muted small' }, `@${u.username || ''}`)
            )
          )
        },
        {
          label: 'Dept / Year',
          render: (u) => `${u.department || ''} \u2022 ${u.year || ''}`
        },
        {
          label: 'Role',
          render: roleChip
        },
        {
          label: 'Status',
          render: (u) => chip(
            u.accountStatus === 'suspended' ? 'Suspended' : 'Active',
            u.accountStatus === 'suspended' ? 'chip-dark' : ''
          )
        },
        {
          label: 'Actions',
          render: () => h(
            'span',
            { class: 'muted small' },
            '—'
          )
        }
      ], rows, 'No users found.'));
    } catch (e) {
      clear(out);
      out.append(errorState(friendlyError(e), load));
    }
  }

  q.addEventListener('input', debounce(load, 450));

  el.append(
    h(
      'div',
      { class: 'stack' },
      h('h2', {}, 'Users'),
      h(
        'div',
        { class: 'filters' },
        h('div', { class: 'search grow' }, icon('search', 18), q)
      ),
      out
    )
  );

  load();
}


export async function admins(el, ctx) {
  const out = h('div', {}); const un = input({ placeholder: 'username of the student', autocapitalize: 'none' });
  async function load() {
    clear(out); out.append(skeletonGrid(1));
    try {
      const s = await F.getDocs(F.query(col('users'), F.where('role', 'in', ['admin', 'superAdmin']), F.limit(50))); const rows = s.docs.map(withId); clear(out);
      out.append(dataTable([{ label: 'Admin', render: (u) => h('div', { class: 'row' }, avatarEl(u, 'sm'), h('strong', {}, u.name), h('span', { class: 'muted small' }, `@${u.username}`)) }, { label: 'Role', render: roleChip },
        { label: 'Actions', render: (u) => u.role === 'admin' && u.id !== ctx.user.uid ? h('button', { class: 'btn btn-danger btn-sm', onclick: (e) => change(e, u, 'user') }, 'Remove admin') : '' }], rows));
    } catch (e) { clear(out); out.append(errorState(friendlyError(e), load)); }
  }
  
async function change(e, u, role) {
  if (u.id === ctx.user.uid || u.role === 'superAdmin') {
    return toast('You cannot change this account’s role here.', 'error');
  }

  if (!['admin', 'user'].includes(role)) {
    return toast('Invalid role.', 'error');
  }

  if (!(await confirmDialog({
    title: role === 'admin'
      ? `Make ${u.name} an Admin?`
      : `Remove admin rights from ${u.name}?`,
    message: role === 'admin'
      ? 'Admins can moderate permitted content, but cannot change roles or read private Tribe chat.'
      : 'This account will become a regular member.',
    confirmLabel: 'Confirm',
    danger: role !== 'admin'
  }))) return;

  await busy(e.target, async () => {
    await F.updateDoc(F.doc(db, 'users', u.id), {
      role
    });

    toast('Role updated successfully.', 'success');
    await load();
  });
}

  const add = h('button', { class: 'btn btn-primary' }, 'Make admin');
  add.onclick = () => busy(add, async () => {
    const name = un.value.trim().toLowerCase(); if (!name) return;
    const rec = await getOne('usernames', name); if (!rec) return toast('No student with that username.', 'error');
    const prof = await getOne('users', rec.uid);
    await change({ target: add }, { id: rec.uid, name: prof ? prof.name : name }, 'admin'); un.value = '';
  });
  el.append(h('div', { class: 'stack-lg stack' }, h('h2', {}, 'Admins'), h('p', { class: 'muted' }, 'Only the Super Admin can grant or remove admin rights. Roles are enforced by Firebase custom claims - nobody can promote themselves.'),
    h('div', { class: 'card stack' }, h('h3', { style: { margin: 0 } }, 'Add an admin'), h('div', { class: 'row wrap' }, h('div', { class: 'grow' }, un), add), h('p', { class: 'hint', style: { margin: 0 } }, 'The student must have a verified email.')), out)); load();
}

export async function settings(el) {
  const cur = (await getOne('settings', 'platform').catch(() => null)) || {}; const mk = (v, d) => input({ type: 'number', value: v ?? d, min: 1 });
  const a = mk(cur.maxTribesPerUser, 3), b = mk(cur.tribeHardCap, 30), c = mk(cur.emailsPerUserPerHour, 10); const save = h('button', { class: 'btn btn-primary' }, 'Save settings');
  save.onclick = () => busy(save, async () => { await F.setDoc(F.doc(db, 'settings', 'platform'), { maxTribesPerUser: Math.max(1, +a.value), tribeHardCap: Math.max(6, +b.value), emailsPerUserPerHour: Math.max(1, +c.value) }, { merge: true }); toast('Saved. Functions pick this up within a minute.', 'success'); });
  el.append(h('div', { class: 'card stack', style: { maxWidth: '560px' } }, h('h2', {}, 'Platform settings'), field('Max active Tribes one student can own', a), field('Hard member cap per Tribe', b, { hint: 'The ideal size (5-6) is only a guide. This is the absolute ceiling.' }), field('Max emails per user per hour', c), save));
}
