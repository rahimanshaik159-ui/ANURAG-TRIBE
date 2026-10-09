import test from 'node:test';
import assert from 'node:assert/strict';
import { rankTribes, rankPeople, scorePerson } from '../../public/js/lib/recommend.js';
import { parseDiscoveryQuery } from '../../public/js/lib/discovery.js';
import { buildTaxonomy } from '../../public/js/lib/taxonomy.js';

const me = { uid: 'me', skills: ['video-editing', 'filmmaking'], interests: ['photography'], learning: [], lookingFor: ['acting'], department: 'ECE' };
const tribes = [
  { id: 'film', name: 'Filmmakers Tribe', skills: ['video-editing', 'filmmaking', 'photography', 'acting'], interests: [], memberCount: 4, idealMemberCount: 6 },
  { id: 'ai', name: 'AI Builders', skills: ['ai-ml', 'web-development'], interests: [], memberCount: 3, idealMemberCount: 6 },
  { id: 'sus', name: 'Bad', skills: ['video-editing'], interests: [], memberCount: 1, idealMemberCount: 6, status: 'suspended' },
];
test('video editing + filmmaking user gets the Filmmakers Tribe first, with reasons', () => {
  const r = rankTribes(me, tribes);
  assert.equal(r[0].tribe.id, 'film'); assert.ok(r[0].reasons[0].includes('Video Editing'));
  assert.ok(!r.some((x) => x.tribe.id === 'ai')); assert.ok(!r.some((x) => x.tribe.id === 'sus'));
});
test('already-full Tribes are still recommended but flagged (ideal size is soft)', () => {
  const r = rankTribes(me, [{ ...tribes[0], memberCount: 8 }]);
  assert.equal(r.length, 1); assert.ok(r[0].reasons.some((x) => x.includes('ideal size')));
});
test('"I need someone" ranks people with the needed skill first', () => {
  const people = [{ uid: 'a', skills: ['python'], interests: [], lookingFor: [] }, { uid: 'b', skills: ['acting'], interests: [], lookingFor: [], availability: 'open' }];
  const r = rankPeople(me, people, { need: ['python'] });
  assert.equal(r[0].person.uid, 'a'); assert.ok(r[0].reasons[0].includes('Python'));
  assert.ok(scorePerson(me, people[1]).score > 0); // acting matches lookingFor
});
test('discovery query parsing', () => {
  assert.deepEqual(parseDiscoveryQuery('Find Video Editors').skillIds, ['video-editing']);
  assert.deepEqual(parseDiscoveryQuery('Python developers').skillIds, ['python']);
  const q = parseDiscoveryQuery('2nd year UI/UX designers in ECE');
  assert.equal(q.year, 2); assert.equal(q.department, 'ECE'); assert.ok(q.skillIds.includes('ui-ux-design'));
  assert.deepEqual(parseDiscoveryQuery('AI students').skillIds, ['ai-ml']);
  const n = parseDiscoveryQuery('ravi'); assert.deepEqual(n.skillIds, []); assert.equal(n.residual, 'ravi');
  assert.deepEqual(parseDiscoveryQuery('find filmmakers').skillIds, ['filmmaking']);
});
test('admin-extended taxonomy', () => {
  const t = buildTaxonomy({ extraSkills: [{ id: 'drone-pilot', label: 'Drone Piloting', group: 'creative' }, { id: 'BAD ID', label: 'x' }] });
  assert.ok(t.byId['drone-pilot']); assert.ok(!t.byId['BAD ID']);
});
