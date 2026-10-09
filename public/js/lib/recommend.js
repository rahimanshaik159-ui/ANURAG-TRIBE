// Deterministic, explainable recommendations (no ML). Every result carries the
// human-readable reasons shown in the UI ("You share: Video Editing, Filmmaking").
import { DEFAULT_TAXONOMY } from './taxonomy.js';

const inter = (a = [], b = []) => { const s = new Set(b); return [...new Set(a)].filter((x) => s.has(x)); };
const L = (tax, ids) => ids.map((i) => tax.label(i));
const myTerms = (u) => ({
  skills: u.skills || [], interests: u.interests || [], learning: u.learning || [], looking: u.lookingFor || [],
  all: [...new Set([...(u.skills || []), ...(u.interests || []), ...(u.learning || [])])],
});

/** Score a Tribe for a student. Higher = better. Returns {score, reasons, matched}. */
export function scoreTribe(user, tribe, tax = DEFAULT_TAXONOMY) {
  const t = myTerms(user); const reasons = []; let score = 0;
  const tribeTerms = [...new Set([...(tribe.skills || []), ...(tribe.interests || [])])];
  const canContribute = inter(t.skills, tribe.skills);
  const sharedInterest = inter(t.interests, tribeTerms);
  const learn = inter(t.learning, tribeTerms);
  const wanted = inter(t.looking, tribe.skills);
  if (canContribute.length) { score += canContribute.length * 3; reasons.push(`Your skills fit: ${L(tax, canContribute).join(', ')}`); }
  if (sharedInterest.length) { score += sharedInterest.length * 2; reasons.push(`You share interests: ${L(tax, sharedInterest).join(', ')}`); }
  if (learn.length) { score += learn.length * 1.5; reasons.push(`You want to learn: ${L(tax, learn).join(', ')}`); }
  if (wanted.length) { score += wanted.length; reasons.push(`Matches what you're looking for`); }
  const ideal = tribe.idealMemberCount || 6;
  // Capacity only breaks ties between genuine matches; it never creates a match on its own.
  if (score > 0 && (tribe.memberCount || 0) < ideal) score += 1;
  if (score > 0 && (tribe.memberCount || 0) >= ideal) reasons.push('Already at ideal size - the owner decides');
  return { score, reasons, matched: [...new Set([...canContribute, ...sharedInterest, ...learn])] };
}

export function rankTribes(user, tribes, { limit = 6, minScore = 1, exclude = new Set() } = {}, tax = DEFAULT_TAXONOMY) {
  return tribes.filter((t) => !exclude.has(t.id) && t.status !== 'suspended')
    .map((t) => ({ tribe: t, ...scoreTribe(user, t, tax) }))
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score || (b.tribe.memberCount || 0) - (a.tribe.memberCount || 0))
    .slice(0, limit);
}

/**
 * Score a student as a potential collaborator.
 * `need` = skill ids the searcher needs right now (the "I NEED SOMEONE" flow).
 */
export function scorePerson(me, other, { need = [] } = {}, tax = DEFAULT_TAXONOMY) {
  const t = myTerms(me); const reasons = []; let score = 0;
  const hasNeeded = inter(other.skills, need);
  if (hasNeeded.length) { score += hasNeeded.length * 6; reasons.push(`Has the skill you need: ${L(tax, hasNeeded).join(', ')}`); }
  const wanted = inter(other.skills, t.looking);
  if (wanted.length) { score += wanted.length * 3; reasons.push(`Matches what you're looking for: ${L(tax, wanted).join(', ')}`); }
  const shared = inter(other.interests, t.interests);
  if (shared.length) { score += shared.length; reasons.push(`Shared interests: ${L(tax, shared).join(', ')}`); }
  const theyNeedMe = inter(me.skills, other.lookingFor);
  if (theyNeedMe.length) { score += theyNeedMe.length * 2; reasons.push(`They are looking for: ${L(tax, theyNeedMe).join(', ')}`); }
  if (other.availability === 'open' && score > 0) { score += 1; reasons.push('Open to collaborate'); }
  if (me.department && other.department === me.department && score > 0) score += 0.5;
  return { score, reasons };
}
export function rankPeople(me, people, opts = {}, tax = DEFAULT_TAXONOMY) {
  return people.filter((p) => p.uid !== me.uid)
    .map((p) => ({ person: p, ...scorePerson(me, p, opts, tax) }))
    .filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, opts.limit || 6);
}

export function scoreProject(user, project, tax = DEFAULT_TAXONOMY) {
  const t = myTerms(user);
  const fit = inter(t.skills, project.skillsNeeded);
  const grow = inter(t.learning, project.skillsNeeded);
  const reasons = [];
  if (fit.length) reasons.push(`Needs your skills: ${L(tax, fit).join(', ')}`);
  if (grow.length) reasons.push(`Helps you learn: ${L(tax, grow).join(', ')}`);
  return { score: fit.length * 3 + grow.length * 1.5, reasons };
}
/** Generic tag matcher for events/resources/showcase items with a `tags` array. */
export function scoreTagged(user, item, tax = DEFAULT_TAXONOMY) {
  const t = myTerms(user); const hit = inter(t.all, item.tags || []);
  return { score: hit.length * 2, reasons: hit.length ? [`Relevant to: ${L(tax, hit).join(', ')}`] : [] };
}
export function rankBy(scorer, user, items, limit = 6, tax = DEFAULT_TAXONOMY) {
  return items.map((it) => ({ item: it, ...scorer(user, it, tax) })).filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}
/** Interest-profile completeness, used to nudge users to add skills for better matches. */
export const profileNeedsSkills = (u) => !(u.skills && u.skills.length) && !(u.interests && u.interests.length);
