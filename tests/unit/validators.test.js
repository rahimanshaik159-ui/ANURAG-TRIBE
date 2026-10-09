import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSocial, normalizeUrl, validateProfile, validateTribe, extractFirstUrl, tokenizeLinks, classifyLink, cleanText, passwordIssues } from '../../public/js/lib/validators.js';

test('social handles expand; wrong host rejected; javascript: rejected', () => {
  assert.equal(normalizeSocial('instagram', '@anurag.tribe').value, 'https://instagram.com/anurag.tribe');
  assert.equal(normalizeSocial('github', 'octocat').value, 'https://github.com/octocat');
  assert.ok(!normalizeSocial('github', 'https://evil.com/x').ok);
  assert.ok(!normalizeSocial('portfolio', 'javascript:alert(1)').ok);
  assert.equal(normalizeSocial('portfolio', 'my-site.dev/work').value, 'https://my-site.dev/work');
  assert.equal(normalizeSocial('twitter', '').value, '');
});
test('normalizeUrl', () => { assert.equal(normalizeUrl('data:text/html,hi'), ''); assert.equal(normalizeUrl('ftp://x.com'), ''); });
test('profile validation', () => {
  const ok = validateProfile({ name: ' Ravi  Kumar ', username: 'Ravi_K', department: 'CSE', year: 2, skills: ['python', 'nope'], social: { github: 'ravik' }, avatar: { type: 'preset', id: 'avatar12' } });
  assert.ok(ok.ok, JSON.stringify(ok.errors));
  assert.equal(ok.value.name, 'Ravi Kumar'); assert.equal(ok.value.username, 'ravi_k');
  assert.deepEqual(ok.value.skills, ['python']); assert.equal(ok.value.social.github, 'https://github.com/ravik');
  assert.ok(!validateProfile({ name: 'R', username: 'x', department: '', year: 9 }).ok);
  assert.ok(!validateProfile({ name: 'Ravi', username: 'ravi', department: 'CSE', year: 1, avatar: { type: 'url', url: 'http://insecure.com/a.png' } }).ok);
  assert.equal(validateProfile({ name: 'Ravi', username: 'ravi', department: 'CSE', year: 1, avatar: { type: 'preset', id: 'avatar99' } }).value.avatar.type, 'none');
});
test('tribe validation', () => {
  assert.ok(validateTribe({ name: 'Filmmakers Tribe', description: 'We make short films together.', category: 'filmmaking', idealMemberCount: 6 }).ok);
  assert.ok(!validateTribe({ name: 'ab', description: 'x', category: 'zzz' }).ok);
  assert.equal(validateTribe({ name: 'Big Tribe', description: 'A bigger group here', category: 'tech', idealMemberCount: 99 }).value.idealMemberCount, 12);
});
test('chat link handling', () => {
  assert.equal(extractFirstUrl('see https://github.com/a/b, thanks'), 'https://github.com/a/b');
  assert.equal(extractFirstUrl('no link'), ''); assert.equal(extractFirstUrl('javascript:alert(1)'), '');
  const t = tokenizeLinks('hi https://youtu.be/xyz. ok');
  assert.deepEqual(t.map((x) => x.t), ['text', 'url', 'text', 'text'].slice(0, t.length)); assert.equal(t[1].v, 'https://youtu.be/xyz');
  assert.equal(classifyLink('https://www.figma.com/file/1').provider, 'figma');
  assert.equal(classifyLink('https://youtu.be/abc').provider, 'youtube');
  assert.equal(classifyLink('https://example.com').provider, 'link');
});
test('cleanText/password', () => {
  assert.equal(cleanText('a\u0000b   c\n d', 10), 'ab c d');
  assert.ok(passwordIssues('abc').length > 0); assert.equal(passwordIssues('abcdef12').length, 0);
});
