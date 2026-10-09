// Turns "Find Video Editors", "python developers in ECE", "2nd year designers"
// into structured filters. Deterministic keyword matching, not AI.
import { DEFAULT_TAXONOMY } from './taxonomy.js';

// department keyword -> canonical department name (as stored on profiles)
const DEPT_PATTERNS = [
  ['CSE', /(^|\s)cse(\s|$)/], ['IT', /(^|\s)it dept(\s|$)|(^|\s)it department(\s|$)/],
  ['ECE', /(^|\s)ece(\s|$)/], ['EEE', /(^|\s)eee(\s|$)/],
  ['ME', /(^|\s)(mechanical|mech)(\s|$)/], ['CE', /(^|\s)civil(\s|$)/], ['Pharmacy', /(^|\s)pharmacy(\s|$)/],
];

const FILLER = /^(find|show|search|look for|looking for|i need|need|get me|any)\s+/i;
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9/+&. -]/g, ' ').replace(/\s+/g, ' ').trim();

function phrases(tax) {
  const out = [];
  for (const s of tax.skills) {
    out.push([norm(s.label), s.id]);
    for (const a of s.aliases || []) out.push([norm(a), s.id]);
  }
  return out.sort((a, b) => b[0].length - a[0].length); // longest phrase first
}

export function parseDiscoveryQuery(text, tax = DEFAULT_TAXONOMY) {
  let q = norm(text).replace(FILLER, '').replace(/^(a|an|the|some)\s+/, '');
  const result = { skillIds: [], department: '', year: 0, residual: '' };
  if (!q) return result;
  const yr = q.match(/\b([1-5])(?:st|nd|rd|th)?\s*(?:year|yr)\b|\byear\s*([1-5])\b/);
  if (yr) { result.year = Number(yr[1] || yr[2]); q = q.replace(yr[0], ' '); }
  for (const [dept, re] of DEPT_PATTERNS) {
    if (re.test(q)) { result.department = dept; q = q.replace(re, ' '); break; }
  }
  q = q.replace(/\b(students?|people|persons?|members?|guys|folks)\b/g, ' ').replace(/\b(in|from|of|who|know|knows|with)\b/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [phrase, id] of phrases(tax)) {
    const re = new RegExp(`(^|\\s)${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);
    if (re.test(q)) { if (!result.skillIds.includes(id)) result.skillIds.push(id); q = q.replace(re, ' ').trim(); }
  }
  result.residual = q.replace(/\s+/g, ' ').trim();
  return result;
}
