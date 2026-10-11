// Pure Tribe-membership logic (no Firebase imports, unit-tested in tests/unit/tribeLogic.test.js).
//
// IMPORTANT: this is a UX layer only. It gives students clear error messages BEFORE a write is
// attempted. The security boundary is firestore.rules, which re-checks every one of these rules.
import { cleanText } from './validators.js';

export const DEFAULT_HARD_CAP = 30;
const SLUG = /^[a-z0-9-]{2,40}$/;

/** Firestore document id of the single invitation allowed per (Tribe, student). */
export const inviteDocId = (tribeId, uid) => `${tribeId}_${uid}`;

/** Platform member ceiling from settings/platform (rules apply the same default). */
export function hardCap(settings) {
  const n = Number(settings && settings.tribeHardCap);
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_HARD_CAP;
}

/** Who may remove whom. Owner: anyone but an owner. Moderator: plain members only. */
export function canRemove(actorRole, targetRole) {
  if (actorRole === 'owner') return targetRole !== 'owner';
  if (actorRole === 'moderator') return targetRole === 'member';
  return false;
}

/** Owner-only role changes. 'owner' means an ownership transfer. */
export function roleChangeKind(actorRole, targetRole, newRole) {
  if (actorRole !== 'owner') return null;
  if (!['member', 'moderator', 'owner'].includes(newRole)) return null;
  if (targetRole === 'owner' || targetRole === newRole) return null;
  return newRole === 'owner' ? 'transfer' : 'role';
}

/** The marker the rules require on the Tribe document for every membership change. */
export const membershipMarker = (uid, kind, at) => ({ uid, kind, at });

/** Same normalisation the original createTribe function applied, plus slug filtering. */
export function normalizeTribeInput(d = {}) {
  const ids = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && SLUG.test(x)).slice(0, 12) : []);
  const name = cleanText(d.name, 40);
  const description = cleanText(d.description, 500, { multiline: true });
  const category = typeof d.category === 'string' ? d.category : '';
  const errors = {};
  if (name.length < 3) errors.name = 'Tribe name must be at least 3 characters.';
  if (description.length < 10) errors.description = 'Please describe the Tribe (10+ characters).';
  if (category.length < 2 || category.length > 30) errors.category = 'Choose a category.';
  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: {
      name,
      nameLower: name.toLowerCase(),
      description,
      goal: cleanText(d.goal, 200),
      category,
      skills: ids(d.skills),
      interests: ids(d.interests),
      privacy: d.privacy === 'private' ? 'private' : 'public',
      idealMemberCount: Math.min(12, Math.max(2, parseInt(d.idealMemberCount, 10) || 6)),
      projectFocus: cleanText(d.projectFocus, 100),
    },
  };
}
