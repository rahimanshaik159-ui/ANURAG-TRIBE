// Small pure formatting helpers.
export function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '-';
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}
export function formatSpeed(bps) { return Number.isFinite(bps) && bps > 0 ? `${formatBytes(bps)}/s` : '-'; }
export function timeAgo(date, now = Date.now()) {
  const t = date && date.toMillis ? date.toMillis() : date instanceof Date ? date.getTime() : Number(date);
  if (!t) return '';
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
export function formatTime(date) {
  const d = date && date.toDate ? date.toDate() : date;
  return d ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
}
export function formatDate(date, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const d = date && date.toDate ? date.toDate() : date;
  return d ? d.toLocaleDateString(undefined, opts) : '';
}
export function initials(name = '') {
  const p = String(name).trim().split(/\s+/).filter(Boolean);
  return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
export const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
export function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '-';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
}
