import { boot } from './_boot.js';
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { pageHero } from '../core/ui.js';

boot({ require: 'public' }, async (ctx) => {
  const app = ctx.main; clear(app);
  app.append(
    pageHero('About ANURAG TRIBE', 'A student community built for ideas, innovation and growth.', { eyebrow: 'One Campus \u2022 Many Minds \u2022 One Tribe' }),
    h('section', { class: 'section' }, h('div', { class: 'container grid grid-2', style: { alignItems: 'center', gap: '36px' } },
      h('div', { class: 'hero-logo' }, h('img', { src: 'assets/logo/anurag-tribe-logo.png', alt: 'ANURAG TRIBE', width: 300, height: 300, style: { width: 'min(300px, 70%)' } })),
      h('div', {}, h('h2', {}, 'Our Story'),
        h('p', {}, 'ANURAG TRIBE is a student-driven community created to connect students, discover talent, build innovative projects, share ideas and grow together.'),
        h('p', {}, 'We believe every student has a unique talent and an idea that can make a difference - and that great things happen when the right people find each other.'),
        h('a', { class: 'btn btn-primary', href: ctx.user ? 'dashboard.html' : 'register.html' }, ctx.user ? 'Open dashboard' : 'Join Our Community', icon('arrowRight', 16))))),
    h('section', { class: 'section section-alt' }, h('div', { class: 'container' }, h('h2', {}, 'Our Mission'),
      h('div', { class: 'pillars', style: { marginTop: '18px' } }, [
        ['users', 'Connect', 'Bring students together and build a strong community.'], ['compass', 'Discover', 'Identify and nurture talent and new opportunities.'],
        ['layers', 'Build', 'Turn ideas into real-world projects and solutions.'], ['message', 'Share', 'Exchange knowledge, creativity and experiences.'],
        ['rocket', 'Grow', 'Develop skills and achieve success together.'],
      ].map(([ic, t, d]) => h('div', { class: 'pillar' }, h('div', { class: 'ic' }, icon(ic, 26)), h('h3', {}, t), h('p', {}, d)))))),
    h('section', { class: 'section' }, h('div', { class: 'container' }, h('h2', {}, 'Our Vision'),
      h('blockquote', { class: 'card', style: { fontSize: '1.25rem', borderLeft: '5px solid var(--red)', margin: 0, fontFamily: 'var(--font-head)' } }, '\u201CTo create a connected campus where students learn, collaborate, innovate and grow together, turning ideas into opportunities.\u201D'))),
    h('section', { class: 'section section-alt' }, h('div', { class: 'container' }, h('h2', {}, 'What is a Tribe?'),
      h('p', { style: { maxWidth: '760px' } }, 'A Tribe is a small collaborative group - ideally 5 to 6 students, though it can grow when it needs to - formed around shared interests, complementary skills or a project. Every Tribe has its own private chat, a voice room and a project space. Big files never sit on a server: members send them directly to each other, browser to browser, after the receiver accepts.'),
      h('div', { class: 'grid grid-3' }, [['film', 'Filmmakers Tribe', 'Filmmaker, editor, cinematographer, script writer, actor, music.'], ['code', 'Tech Tribe', 'Web, Android, AI/ML, UI/UX, backend, hardware.'], ['rocket', 'Startup Tribe', 'Developer, designer, marketing, sales, business, management.']]
        .map(([ic, t, d]) => h('div', { class: 'card' }, h('div', { class: 'tc-ic', style: { marginBottom: '10px' } }, icon(ic, 22)), h('h3', {}, t), h('p', { class: 'muted' }, d)))))),
    h('section', { class: 'section' }, h('div', { class: 'container' }, h('h2', {}, 'Our Values'),
      h('div', { class: 'pillars', style: { marginTop: '12px' } }, [['zap', 'Innovation'], ['users', 'Collaboration'], ['star', 'Creativity'], ['book', 'Learning'], ['heart', 'Community']].map(([ic, t]) => h('div', { class: 'pillar' }, h('div', { class: 'ic', style: { background: 'var(--ink)', color: '#fff' } }, icon(ic, 24)), h('h3', { style: { color: 'var(--ink)' } }, t)))))),
  );
});
