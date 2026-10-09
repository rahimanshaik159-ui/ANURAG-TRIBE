// Validation + sanitising for user-provided data. All rendering also uses
// textContent (never innerHTML) - these helpers are an additional layer.
import { SOCIAL_PLATFORMS, DEFAULT_TAXONOMY } from './taxonomy.js';

/** Remove control characters, collapse whitespace, cap length. */
export function cleanText(s, max = 500, { multiline = false } = {}) {
  let v = String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  v = multiline ? v.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n') : v.replace(/\s+/g, ' ');
  return v.trim().slice(0, max);
}

export function isHttpUrl(v) {
  try { const u = new URL(v); return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.') && v.length <= 500 && !/\s/.test(v); }
  catch { return false; }
}
/** Accept "example.com/x" and prepend https://. Returns '' if invalid. */
export function normalizeUrl(input) {
  let v = String(input || '').trim();
  if (!v) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = `https://${v}`;
  return isHttpUrl(v) ? v : '';
}

/** Normalise one social link. Handles (@name) are expanded for known platforms. */
export function normalizeSocial(platformId, input) {
  const p = SOCIAL_PLATFORMS.find((x) => x.id === platformId);
  let v = String(input || '').trim();
  if (!p) return { ok: false, error: 'Unknown platform' };
  if (!v) return { ok: true, value: '' };
  // '@name' is always a handle (handles may contain dots); bare words without dots are handles too.
  if (p.hosts && (/^@[A-Za-z0-9._-]{1,40}$/.test(v) || /^[A-Za-z0-9_-]{1,40}$/.test(v))) v = p.base + v.replace(/^@/, '');
  const url = normalizeUrl(v);
  if (!url) return { ok: false, error: `${p.label}: enter a valid link` };
  if (p.hosts) {
    const host = new URL(url).hostname.replace(/^www\.|^m\./, '');
    if (!p.hosts.some((h) => host === h || host.endsWith(`.${h}`))) return { ok: false, error: `${p.label}: link must be on ${p.hosts[0]}` };
  }
  return { ok: true, value: url };
}

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export const validateUsername = (u) => (USERNAME_RE.test(u) ? null : 'Use 3-20 lowercase letters, numbers or underscores.');
export const validateEmail = (e) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e).trim()) ? null : 'Enter a valid email address.');
export function passwordIssues(pw) {
  const out = [];
  if (pw.length < 8) out.push('at least 8 characters');
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) out.push('letters and numbers');
  return out;
}

const uniq = (a) => [...new Set(a)];
const pickIds = (list, max, tax) => uniq((list || []).filter((id) => tax.byId[id])).slice(0, max);

/** Validate + normalise profile form data. Returns {ok, errors:{field:msg}, value}. */
export function validateProfile(input, tax = DEFAULT_TAXONOMY) {
  const errors = {};
  const v = {
    name: cleanText(input.name, 60),
    username: String(input.username || '').trim().toLowerCase(),
    department: cleanText(input.department, 40),
    year: Number(input.year),
    section: cleanText(input.section, 4).toUpperCase(),
    bio: cleanText(input.bio, 300, { multiline: true }),
    skills: pickIds(input.skills, 15, tax),
    interests: pickIds(input.interests, 15, tax),
    learning: pickIds(input.learning, 10, tax),
    lookingFor: pickIds(input.lookingFor, 10, tax),
    currentProjects: uniq((input.currentProjects || []).map((p) => cleanText(p, 80)).filter(Boolean)).slice(0, 5),
    availability: ['open', 'busy', 'none'].includes(input.availability) ? input.availability : 'none',
    visibility: input.visibility === 'hidden' ? 'hidden' : 'campus',
    avatar: { type: 'none' },
    social: {},
  };
  if (v.name.length < 2) errors.name = 'Enter your full name.';
  const un = validateUsername(v.username); if (un) errors.username = un;
  if (!v.department) errors.department = 'Choose your department.';
  if (!(v.year >= 1 && v.year <= 5)) errors.year = 'Choose your year.';
  const a = input.avatar || { type: 'none' };
  if (a.type === 'preset' && /^avatar([1-9]|[1-4][0-9]|50)$/.test(a.id)) v.avatar = { type: 'preset', id: a.id };
  else if (a.type === 'url') {
    const url = normalizeUrl(a.url);
    if (!url || !url.startsWith('https://')) errors.avatar = 'Enter a valid https:// image link, or pick an avatar.';
    else v.avatar = { type: 'url', url };
  }
  for (const p of SOCIAL_PLATFORMS) {
    const r = normalizeSocial(p.id, (input.social || {})[p.id]);
    if (!r.ok) errors[`social.${p.id}`] = r.error; else if (r.value) v.social[p.id] = r.value;
  }
  return { ok: Object.keys(errors).length === 0, errors, value: v };
}

export function validateTribe(input, tax = DEFAULT_TAXONOMY) {
  const errors = {};
  const v = {
    name: cleanText(input.name, 40),
    description: cleanText(input.description, 500, { multiline: true }),
    goal: cleanText(input.goal, 200),
    category: input.category,
    skills: pickIds(input.skills, 12, tax),
    interests: pickIds(input.interests, 12, tax),
    privacy: input.privacy === 'private' ? 'private' : 'public',
    idealMemberCount: Math.min(12, Math.max(2, parseInt(input.idealMemberCount, 10) || 6)),
    projectFocus: cleanText(input.projectFocus, 100),
  };
  if (v.name.length < 3) errors.name = 'Give your Tribe a name (3+ characters).';
  if (v.description.length < 10) errors.description = 'Describe the Tribe in a sentence or two (10+ characters).';
  if (!tax.catById[v.category]) errors.category = 'Choose a category.';
  return { ok: Object.keys(errors).length === 0, errors, value: v };
}

// ------------------------------------------------------------- links in chat
const PROVIDERS = [
  ['youtube', ['youtube.com', 'youtu.be']], ['github', ['github.com', 'gist.github.com']], ['figma', ['figma.com']],
  ['drive', ['drive.google.com', 'docs.google.com']], ['instagram', ['instagram.com']], ['linkedin', ['linkedin.com']],
  ['behance', ['behance.net']], ['notion', ['notion.so', 'notion.site']],
];
export function classifyLink(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const hit = PROVIDERS.find(([, hosts]) => hosts.some((h) => host === h || host.endsWith(`.${h}`)));
    return { host, provider: hit ? hit[0] : 'link' };
  } catch { return { host: '', provider: 'link' }; }
}
const URL_SRC = 'https?:\\/\\/[^\\s<>"\']+';
export function extractFirstUrl(text) {
  const m = String(text).match(new RegExp(URL_SRC, 'i'));
  if (!m) return '';
  const u = m[0].replace(/[).,;!?]+$/, '');
  return isHttpUrl(u) ? u : '';
}
/** Split text into [{t:'text'|'url', v}] for safe DOM rendering (no innerHTML). */
export function tokenizeLinks(text) {
  const src = String(text); const out = [];
  const re = new RegExp(URL_SRC, 'ig'); let last = 0; let m;
  while ((m = re.exec(src))) {
    const raw = m[0]; const clean = raw.replace(/[).,;!?]+$/, '');
    if (m.index > last) out.push({ t: 'text', v: src.slice(last, m.index) });
    if (isHttpUrl(clean)) { out.push({ t: 'url', v: clean }); if (clean.length < raw.length) out.push({ t: 'text', v: raw.slice(clean.length) }); }
    else out.push({ t: 'text', v: raw });
    last = m.index + raw.length;
  }
  if (last < src.length) out.push({ t: 'text', v: src.slice(last) });
  return out;
}
