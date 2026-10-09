// Non-secret application settings. Secrets (email API key, TURN secret) live in
// Cloud Functions secrets and are NEVER placed in frontend code.
export const APP = {
  name: 'ANURAG TRIBE',
  tagline: 'One Campus. Many Minds. One Tribe.',
  pillars: 'Connect. Discover. Build. Share. Grow.',
  functionsRegion: 'asia-south1',      // must match functions/src/core.js REGION
  appCheckSiteKey: '',                 // optional: reCAPTCHA v3 site key to enable Firebase App Check
  pageSize: 12,
  chatPageSize: 40,
  presenceIntervalMs: 60 * 1000,
  presenceOnlineWindowMs: 150 * 1000,
  voice: { heartbeatMs: 20 * 1000, staleMs: 75 * 1000, roomTtlHours: 4, softPeerLimit: 8 },
  // Used only if the getIceServers function is unreachable: STUN only (no TURN secrets here).
  fallbackIceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};
