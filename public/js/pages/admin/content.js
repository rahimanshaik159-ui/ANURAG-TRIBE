// Admin: Tribes, projects, posts, showcase, announcements, events, resources, taxonomy.
import { h, clear } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { toast, busy, chip, input, field, textarea, select, confirmDialog, skeletonGrid, errorState, tabs, openModal, counter } from '../../core/ui.js';
import { dataTable, askText, fmt } from './_ui.js';
import { F, db, callFn, friendlyError } from '../../core/firebase.js';
import { col, withId, getOne } from '../../services/_util.js';
import { skillPicker } from '../../components/skillPicker.js';
import { EVENT_CATEGORIES, RESOURCE_TYPES, SKILL_GROUPS } from '../../lib/taxonomy.js';
import { normalizeUrl, cleanText } from '../../lib/validators.js';
import { getUser } from '../../services/users.js';

const list = async (name, order, n = 50) => (await F.getDocs(F.query(col(name), F.orderBy(order, 'desc'), F.limit(n)))).docs.map(withId);
async function section(el, title, load, render) { const out = h('div', {}); el.append(h('div', { class: 'stack' }, h('h2', {}, title), out)); const run = async () => { clear(out); out.append(skeletonGrid(1)); try { const rows = await load(); clear(out); out.append(render(rows, run)); } catch (e) { clear(out); out.append(errorState(friendlyError(e), run)); } }; run(); }
const act = (label, fn, cls = 'btn-outline') => h('button', { class: `btn btn-sm ${cls}`, onclick: (e) => busy(e.currentTarget, fn) }, label);

export const tribes = (el) => section(
  el,
  'Tribes',
  () => list('tribes', 'createdAt'),
  (rows, reload) => dataTable([
    {
      label: 'Tribe',
      render: (t) =>
        h(
          'a',
          { href: `tribe.html?id=${t.id}` },
          h('strong', {}, t.name || 'Untitled tribe')
        )
    },
    {
      label: 'Category',
      render: (t) => t.category || '—'
    },
    {
      label: 'Members',
      render: (t) =>
        `${t.memberCount || 0}/${t.idealMemberCount || 6}`
    },
    {
      label: 'Visibility',
      render: (t) => t.privacy || '—'
    },
    {
      label: 'Status',
      render: (t) =>
        chip(t.status || 'unknown', t.status === 'active' ? '' : 'chip-dark')
    },
    {
      label: 'Actions',
      render: (t) =>
        h(
          'span',
          { class: 'muted small' },
          'Moderation unavailable without a trusted backend'
        )
    }
  ], rows)
);

export const projects = (el) => section(el, 'Projects', () => list('projects', 'updatedAt'), (rows, reload) => dataTable([
  { label: 'Project', render: (p) => h('a', { href: `projects.html?id=${p.id}` }, h('strong', {}, p.title)) }, { label: 'Type', render: (p) => (p.tribeId ? `Tribe: ${p.tribeName}` : 'Campus') }, { label: 'Status', render: (p) => p.status },
  { label: 'Actions', render: (p) => h('div', { class: 'row' }, act('Archive', async () => { await F.updateDoc(F.doc(db, 'projects', p.id), { status: 'archived', updatedAt: F.serverTimestamp() }); reload(); }), act('Delete', async () => { if (await confirmDialog({ title: 'Delete project?', message: p.title, confirmLabel: 'Delete', danger: true })) { await F.deleteDoc(F.doc(db, 'projects', p.id)); reload(); } }, 'btn-danger')) },
], rows));


export const posts = (el) => section(
  el,
  'Posts & ideas',
  () => list('posts', 'createdAt'),
  (rows, reload) => dataTable([
    {
      label: 'Post',
      render: (p) =>
        h(
          'div',
          {
            style: {
              maxWidth: '420px',
              overflowWrap: 'anywhere'
            }
          },
          (p.text || '').slice(0, 140)
        )
    },
    {
      label: 'Category',
      render: (p) => p.category
    },
    {
      label: 'Status',
      render: (p) =>
        chip(
          p.status,
          p.status === 'visible' ? '' : 'chip-dark'
        )
    },
    {
      label: 'Actions',
      render: (p) =>
        h(
          'div',
          { class: 'row' },
          act(
            p.status === 'visible' ? 'Hide' : 'Unhide',
            async (e) => {
              await busy(e, async () => {
                await F.updateDoc(
                  F.doc(db, 'posts', p.id),
                  {
                    status:
                      p.status === 'visible'
                        ? 'hidden'
                        : 'visible'
                  }
                );
                toast('Post status updated.', 'success');
                reload();
              });
            }
          ),
          act(
            'Delete',
            async (e) => {
              if (
                await confirmDialog({
                  title: 'Delete post?',
                  message: 'This action is permanent.',
                  confirmLabel: 'Delete',
                  danger: true
                })
              ) {
                await busy(e, async () => {
                  await F.deleteDoc(
                    F.doc(db, 'posts', p.id)
                  );
                  toast('Post deleted.', 'success');
                  reload();
                });
              }
            },
            'btn-danger'
          )
        )
    }
  ], rows)
);


export function showcase(el) {
  let status = 'pending'; const body = h('div', {});
  const t = tabs([{ id: 'pending', label: 'Pending review' }, { id: 'approved', label: 'Approved' }, { id: 'rejected', label: 'Rejected' }], status, (s) => { status = s; draw(); });
  async function draw() { clear(body); body.append(skeletonGrid(1)); try {
    const rows = (await F.getDocs(F.query(col('showcase'), F.where('status', '==', status), F.orderBy('createdAt', 'desc'), F.limit(40)))).docs.map(withId); const us = await Promise.all(rows.map((r) => getUser(r.authorUid))); clear(body);
    body.append(dataTable([{ label: 'Work', render: (s, i) => h('div', {}, h('strong', {}, s.title), h('div', { class: 'muted small', style: { maxWidth: '380px' } }, s.description.slice(0, 120))) }, { label: 'By', render: (s) => us[rows.indexOf(s)].name },
      { label: 'Links', render: (s) => h('div', { class: 'chips' }, s.links.map((l) => h('a', { class: 'chip chip-link', href: l.url, target: '_blank', rel: 'noopener noreferrer nofollow' }, l.label || 'link'))) }, { label: 'Social OK', render: (s) => (s.featureConsent ? chip('Consent given', 'chip-red') : chip('No consent')) },
      { label: 'Actions', render: (s) => h('div', { class: 'row' }, status !== 'approved' ? act('Approve', async () => { const note = await askText('Approve', 'Note to the student (optional)'); if (note === null) return; await F.updateDoc(F.doc(db, 'showcase', s.id), { status: 'approved', adminNote: note, updatedAt: F.serverTimestamp() }); draw(); }, 'btn-primary') : null, status !== 'rejected' ? act('Reject', async () => { const note = await askText('Reject', 'Reason for the student', { required: true }); if (note === null) return; await F.updateDoc(F.doc(db, 'showcase', s.id), { status: 'rejected', adminNote: note, updatedAt: F.serverTimestamp() }); draw(); }, 'btn-danger') : null) }], rows, 'Nothing here.'));
  } catch (e) { clear(body); body.append(errorState(friendlyError(e), draw)); } }
  el.append(h('div', { class: 'stack' }, h('h2', {}, 'Showcase review'), h('p', { class: 'muted' }, 'Social promotion is manual and only for entries where the student gave consent. Nothing is posted automatically.'), t, body)); draw();
}


export function announcements(el) {
  const title = input({ maxlength: 100 });
  const body_ = textarea({ rows: 3, maxlength: 400 });
  const out = h('div', {});
  const send = h(
    'button',
    { class: 'btn btn-primary' },
    'Publish announcement'
  );

  send.onclick = () => busy(send, async () => {
    if (
      title.value.trim().length < 3 ||
      body_.value.trim().length < 3
    ) {
      return toast('Add a title and message.', 'error');
    }

    await F.addDoc(col('announcements'), {
      title: cleanText(title.value, 100),
      body: cleanText(body_.value, 400),
      notifyEmail: false,
      createdAt: F.serverTimestamp()
    });

    title.value = '';
    body_.value = '';
    toast('Announcement published successfully.', 'success');
    await load();
  });

  async function load() {
    clear(out);
    try {
      const rows = await list('announcements', 'createdAt', 20);

      out.append(dataTable([
        {
          label: 'Announcement',
          render: (a) => h(
            'div',
            {},
            h('strong', {}, a.title),
            h('div', { class: 'muted small' }, a.body)
          )
        },
        {
          label: 'When',
          render: (a) => fmt(a.createdAt)
        },
        {
          label: 'Email',
          render: () => 'Not sent'
        },
        {
          label: '',
          render: (a) => act('Delete', async () => {
            if (!(await confirmDialog({
              title: 'Delete announcement?',
              message: 'This action is permanent.',
              confirmLabel: 'Delete',
              danger: true
            }))) return;

            await F.deleteDoc(F.doc(db, 'announcements', a.id));
            toast('Announcement deleted.', 'success');
            await load();
          }, 'btn-danger')
        }
      ], rows));
    } catch (e) {
      out.append(errorState(friendlyError(e), load));
    }
  }

  el.append(
    h(
      'div',
      { class: 'stack-lg stack' },
      h('h2', {}, 'Announcements'),
      h(
        'p',
        { class: 'muted' },
        'Announcements are published in the app. Email delivery is unavailable without a trusted backend.'
      ),
      h(
        'div',
        { class: 'card stack' },
        field('Title', title),
        field('Message', body_),
        h('div', {}, send)
      ),
      out
    )
  );

  load();
}

function toLocalInput(ts) { const d = ts && ts.toDate ? ts.toDate() : new Date(Date.now() + 7 * 86400000); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
export function events(el, ctx) {
  const out = h('div', {});
  function edit(ev = {}) {
    const title = input({ value: ev.title || '', maxlength: 120 }); const desc = textarea({ value: ev.description || '', rows: 3, maxlength: 600 }); const when = input({ type: 'datetime-local', value: toLocalInput(ev.startAt) }); const loc = input({ value: ev.location || '', maxlength: 120 });
    const cat = select(EVENT_CATEGORIES.map((c) => ({ value: c, label: c })), { value: ev.category || 'workshop' }); const open = h('input', { type: 'checkbox', checked: ev.registrationOpen !== false }); const tags = skillPicker({ tax: ctx.tax, value: ev.tags || [], max: 6, compact: true });
    openModal({ title: ev.id ? 'Edit event' : 'New event', size: 'lg', body: h('div', {}, field('Title', title, { required: true }), field('Description', desc), h('div', { class: 'form-grid' }, field('Start', when, { required: true }), field('Location', loc)), field('Category', cat), h('div', { class: 'label', style: { margin: '6px 0' } }, 'Relevant skills (personalises who sees it)'), tags, h('label', { class: 'check', style: { marginTop: '10px' } }, open, h('span', {}, 'Registration open'))),
      actions: [{ label: 'Cancel', onClick: (c) => c() }, { label: 'Save', variant: 'btn-primary', onClick: async (c) => { if (title.value.trim().length < 3 || !when.value) return toast('Title and start time are required.', 'error'); const data = { title: cleanText(title.value, 120), description: cleanText(desc.value, 600, { multiline: true }), location: cleanText(loc.value, 120), category: cat.value, startAt: F.Timestamp.fromDate(new Date(when.value)), registrationOpen: open.checked, tags: tags.getValue() };
        try { if (ev.id) await F.updateDoc(F.doc(db, 'events', ev.id), data); else await F.addDoc(col('events'), { ...data, registrationCount: 0, createdBy: ctx.user.uid, createdAt: F.serverTimestamp() }); c(); load(); } catch (e) { toast(friendlyError(e), 'error'); } } }] });
  }
  async function load() { clear(out); try { const rows = await list('events', 'startAt', 50); out.append(dataTable([{ label: 'Event', render: (e) => h('strong', {}, e.title) }, { label: 'Starts', render: (e) => fmt(e.startAt) }, { label: 'Registered', render: (e) => e.registrationCount || 0 }, { label: 'Actions', render: (e) => h('div', { class: 'row' }, act('Edit', async () => edit(e)), act('Delete', async () => { if (await confirmDialog({ title: 'Delete event?', message: e.title, confirmLabel: 'Delete', danger: true })) { await F.deleteDoc(F.doc(db, 'events', e.id)); load(); } }, 'btn-danger')) }], rows)); } catch (e) { out.append(errorState(friendlyError(e), load)); } }
  el.append(h('div', { class: 'stack' }, h('div', { class: 'row between' }, h('h2', { style: { margin: 0 } }, 'Events'), h('button', { class: 'btn btn-primary', onclick: () => edit() }, icon('plus', 16), 'New event')), out)); load();
}

export function resources(el, ctx) {
  const out = h('div', {});
  function edit() {
    const title = input({ maxlength: 120 }); const desc = textarea({ rows: 3, maxlength: 400 }); const url = input({ placeholder: 'https://...', inputmode: 'url' }); const type = select(RESOURCE_TYPES.map((r) => ({ value: r.id, label: `${r.label} (${r.area})` }))); const dl = input({ type: 'date' }); const tags = skillPicker({ tax: ctx.tax, max: 6, compact: true });
    openModal({ title: 'New resource', size: 'lg', body: h('div', {}, field('Title', title, { required: true }), field('Description', desc), field('Link', url, { required: true }), h('div', { class: 'form-grid' }, field('Type', type), field('Deadline (optional)', dl)), h('div', { class: 'label', style: { margin: '6px 0' } }, 'Relevant skills'), tags),
      actions: [{ label: 'Cancel', onClick: (c) => c() }, { label: 'Publish', variant: 'btn-primary', onClick: async (c) => { const u = normalizeUrl(url.value); if (title.value.trim().length < 3 || !u) return toast('Title and a valid link are required.', 'error'); const r = RESOURCE_TYPES.find((x) => x.id === type.value);
        try { await F.addDoc(col('resources'), { title: cleanText(title.value, 120), description: cleanText(desc.value, 400), url: u, type: type.value, area: r.area, tags: tags.getValue(), deadline: dl.value ? F.Timestamp.fromDate(new Date(dl.value)) : null, createdBy: ctx.user.uid, createdAt: F.serverTimestamp() }); c(); load(); } catch (e) { toast(friendlyError(e), 'error'); } } }] });
  }
  async function load() { clear(out); try { const rows = await list('resources', 'createdAt', 60); out.append(dataTable([{ label: 'Resource', render: (r) => h('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer nofollow' }, h('strong', {}, r.title)) }, { label: 'Type', render: (r) => r.type },{
  label: '',
  render: (r) => act('Delete', async () => {
    const confirmed = await confirmDialog({
      title: 'Delete resource?',
      message: `Delete "${r.title}" permanently?`,
      confirmLabel: 'Delete',
      danger: true
    });

    if (!confirmed) return;

    try {
      await F.deleteDoc(F.doc(db, 'resources', r.id));
      toast('Resource deleted successfully.', 'success');
      await load();
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  }, 'btn-danger')
}], rows)); } catch (e) { out.append(errorState(friendlyError(e), load)); } }
  el.append(h('div', { class: 'stack' }, h('div', { class: 'row between' }, h('h2', { style: { margin: 0 } }, 'Resources'), h('button', { class: 'btn btn-primary', onclick: edit }, icon('plus', 16), 'New resource')), out)); load();
}

export async function taxonomy(el) {
  const cur = (await getOne('settings', 'taxonomy').catch(() => null)) || {}; const skills = [...(cur.extraSkills || [])]; const cats = [...(cur.extraCategories || [])];
  const box = h('div', { class: 'stack' }); const slug = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const sk = input({ placeholder: 'New skill, e.g. Drone Piloting', maxlength: 40 }); const grp = select(SKILL_GROUPS.map((g) => ({ value: g.id, label: g.label }))); const ct = input({ placeholder: 'New Tribe category, e.g. Robotics', maxlength: 30 });
  const persist = async () => { await F.setDoc(F.doc(db, 'settings', 'taxonomy'), { extraSkills: skills, extraCategories: cats }); toast('Saved.', 'success'); draw(); };
  function draw() { clear(box); box.append(h('div', { class: 'card stack' }, h('h3', { style: { margin: 0 } }, 'Extra skills / interests'), h('div', { class: 'chips' }, skills.map((s, i) => h('span', { class: 'chip' }, s.label, h('button', { class: 'icon-btn', style: { width: '20px', height: '20px' }, 'aria-label': 'Remove', onclick: () => { skills.splice(i, 1); persist(); } }, icon('x', 12))))), h('div', { class: 'row wrap' }, h('div', { class: 'grow' }, sk), grp, h('button', { class: 'btn btn-primary', onclick: () => { const id = slug(sk.value); if (id.length < 2) return; if (skills.some((s) => s.id === id)) return toast('Already added.', 'error'); skills.push({ id, label: cleanText(sk.value, 40), group: grp.value }); sk.value = ''; persist(); } }, 'Add'))),
    h('div', { class: 'card stack' }, h('h3', { style: { margin: 0 } }, 'Extra Tribe categories'), h('div', { class: 'chips' }, cats.map((s, i) => h('span', { class: 'chip' }, s.label, h('button', { class: 'icon-btn', style: { width: '20px', height: '20px' }, 'aria-label': 'Remove', onclick: () => { cats.splice(i, 1); persist(); } }, icon('x', 12))))), h('div', { class: 'row wrap' }, h('div', { class: 'grow' }, ct), h('button', { class: 'btn btn-primary', onclick: () => { const id = slug(ct.value); if (id.length < 2) return; if (cats.some((s) => s.id === id)) return; cats.push({ id, label: cleanText(ct.value, 30) }); ct.value = ''; persist(); } }, 'Add')))); }
  draw(); el.append(h('div', { class: 'stack' }, h('h2', {}, 'Skills & categories'), h('p', { class: 'muted' }, 'Skills are matching labels only; they never grant permissions. Built-in skills cannot be removed.'), box));
}
