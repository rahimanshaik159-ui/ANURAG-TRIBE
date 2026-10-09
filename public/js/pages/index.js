import { boot } from './_boot.js';
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { configured } from '../core/firebase.js';
import { listEvents, listShowcase } from '../services/content.js';
import { eventCard, showcaseCard } from '../components/cards.js';
import { getUser } from '../services/users.js';
import { TRIBE_CATEGORIES } from '../lib/taxonomy.js';

const PILLARS = [['users', 'Connect', 'with students.'], ['compass', 'Discover', 'talent.'], ['layers', 'Build', 'projects.'], ['message', 'Share', 'ideas.'], ['rocket', 'Grow', 'together.']];
// Example Tribes below are ILLUSTRATIONS of what Tribes look like - clearly labelled, never presented as real members.
const EXAMPLES = [
  ['film', 'Filmmakers Tribe', 'Director, editor, cinematographer, writer, actor and music - everything a short film needs.', ['Filmmaking', 'Video Editing', 'Cinematography'], 4],
  ['code', 'Tech Tribe', 'Web, Android, AI/ML, UI/UX and backend students shipping projects together.', ['Web Development', 'App Development', 'AI / ML'], 5],
  ['rocket', 'Startup Tribe', 'Developers, designers and business-minded students turning ideas into ventures.', ['Startup', 'Marketing', 'Management'], 3],
];

boot({ require: 'public' }, async (ctx) => {
  const app = ctx.main; clear(app);
  const signedIn = !!ctx.user;
  app.append(
    h('section', { class: 'hero' }, h('div', { class: 'container hero-in' },
      h('div', {},
        h('div', { class: 'eyebrow' }, 'Connect. Discover. Build. Share. Grow.'),
        h('h1', {}, 'One Campus.', h('br'), 'Many Minds. ', h('em', {}, 'One Tribe.')),
        h('p', { class: 'lead' }, 'ANURAG TRIBE is where students find the right people, form small Tribes, build projects together and get discovered.'),
        h('div', { class: 'hero-ctas' },
          h('a', { class: 'btn btn-primary btn-lg', href: signedIn ? 'dashboard.html' : 'register.html' }, signedIn ? 'Go to dashboard' : 'Join Community', icon('arrowRight', 18)),
          h('a', { class: 'btn btn-outline btn-lg', href: 'about.html' }, 'Explore More'))),
      h('div', { class: 'hero-logo' }, h('img', { src: 'assets/logo/anurag-tribe-logo.png', alt: 'ANURAG TRIBE logo', width: 380, height: 380 })),
      h('div', { class: 'hero-words', 'aria-hidden': 'true' }, h('span', {}, 'IDEAS'), h('span', {}, 'PEOPLE'), h('span', {}, 'PROJECTS'), h('span', {}, 'GROWTH')))),

    h('div', { class: 'container' }, h('div', { class: 'pillars' }, PILLARS.map(([ic, t, s]) => h('div', { class: 'pillar' }, h('div', { class: 'ic' }, icon(ic, 26)), h('h3', {}, t), h('p', {}, s))))),

    h('section', { class: 'section' }, h('div', { class: 'container' },
      h('div', { class: 'section-head' }, h('div', {}, h('h2', {}, 'Why ANURAG TRIBE?'), h('p', {}, 'A student community to connect, collaborate, showcase talent and build together.'))),
      h('div', { class: 'why-grid' }, [
        ['users', 'Find your people', 'Search students by skill, interest, department and year. "Find video editors" actually works.'],
        ['compass', 'Form a Tribe', 'Small teams of about 5-6 students with complementary skills, with their own chat and voice room.'],
        ['folder', 'Build real projects', 'Take an idea from IDEA to PLANNING to IN PROGRESS to COMPLETED, together.'],
        ['award', 'Get recognised', 'Showcase finished work to the whole campus community.'],
      ].map(([ic, t, d]) => h('div', { class: 'why' }, h('div', { class: 'ic' }, icon(ic, 22)), h('div', {}, h('h3', {}, t), h('p', {}, d))))))),

    h('section', { class: 'section section-alt' }, h('div', { class: 'container' },
      h('div', { class: 'section-head' }, h('h2', {}, 'How it works')),
      h('div', { class: 'steps' }, [
        ['Create your profile', 'Pick your skills, interests and goals. Choose an avatar - no photo needed.'],
        ['Discover people', 'Search students or post "I need a video editor" and get matched by skill.'],
        ['Join or start a Tribe', 'Get Tribe recommendations based on you, then chat and meet by voice.'],
        ['Build, share, grow', 'Run projects, share links, send big files directly, and showcase your work.'],
      ].map(([t, d]) => h('div', { class: 'step' }, h('h3', {}, t), h('p', {}, d)))))),

    h('section', { class: 'section' }, h('div', { class: 'container' },
      h('div', { class: 'section-head' }, h('div', {}, h('h2', {}, 'Tribes', h('span', { class: 'demo-tag' }, 'Examples')), h('p', {}, 'Illustrations of the kinds of Tribes students create. Real Tribes appear once you join.')),
        h('a', { class: 'btn btn-outline', href: 'tribes.html' }, 'Browse Tribes', icon('arrowRight', 16))),
      h('div', { class: 'grid grid-cards-lg' }, EXAMPLES.map(([ic, name, desc, chips, n]) => h('article', { class: 'card tribe-card demo' },
        h('div', { class: 'tc-top' }, h('span', { class: 'tc-ic' }, icon(ic, 22)), h('div', {}, h('h3', {}, name), h('span', { class: 'muted small' }, 'Example Tribe'))),
        h('p', {}, desc),
        h('div', { class: 'meter' }, h('span', { class: 'meter-dots' }, Array.from({ length: 6 }, (_, i) => h('i', { class: i < n ? 'on' : '' }))), h('strong', {}, `${n}/6 MEMBERS`)),
        h('div', { class: 'chips' }, chips.map((c) => h('span', { class: 'chip' }, c)))))))),

    h('section', { class: 'section section-alt' }, h('div', { class: 'container' },
      h('div', { class: 'section-head' }, h('div', {}, h('h2', {}, 'Tribe categories'), h('p', {}, 'Creative, technical, entrepreneurial and academic - there is a Tribe for it.'))),
      h('div', { class: 'chips', style: { gap: '10px' } }, TRIBE_CATEGORIES.map((c) => h('a', { class: 'chip chip-dark', href: `tribes.html?category=${c.id}`, style: { padding: '8px 16px', fontSize: '.85rem' } }, icon(c.icon, 14), c.label))))),
  );

  // Live public data (events + approved showcase are publicly readable). Omitted silently if unavailable.
  const live = h('div', {}); app.append(live);
  if (configured) {
    try {
      const [events, show] = await Promise.all([listEvents({ upcoming: true, size: 3 }), listShowcase({ size: 3 })]);
      if (events.length) live.append(h('section', { class: 'section' }, h('div', { class: 'container' }, h('div', { class: 'section-head' }, h('h2', {}, 'Upcoming events'), h('a', { class: 'btn btn-outline btn-sm', href: 'events.html' }, 'All events')), h('div', { class: 'grid grid-cards-lg' }, events.map((e) => eventCard(e))))));
      if (show.items.length) {
        const authors = await Promise.all(show.items.map((s) => getUser(s.authorUid).catch(() => null)));
        live.append(h('section', { class: 'section section-alt' }, h('div', { class: 'container' }, h('div', { class: 'section-head' }, h('h2', {}, 'Featured showcase'), h('a', { class: 'btn btn-outline btn-sm', href: 'showcase.html' }, 'See all')), h('div', { class: 'grid grid-cards-lg' }, show.items.map((s, i) => showcaseCard(s, { author: authors[i] }))))));
      }
    } catch (e) { console.info('Live sections unavailable', e.code || e.message); }
  }
  app.append(h('section', { class: 'section' }, h('div', { class: 'container' }, h('div', { class: 'cta-band' },
    h('div', {}, h('h2', {}, signedIn ? 'Your Tribe is waiting' : 'Join ANURAG TRIBE'), h('p', {}, signedIn ? 'Check your personalised recommendations.' : 'Create your profile, showcase your skills and connect with fellow students.')),
    h('a', { class: 'btn btn-primary btn-lg', href: signedIn ? 'dashboard.html' : 'register.html' }, signedIn ? 'Open dashboard' : 'Create Profile', icon('arrowRight', 18))))));
});
