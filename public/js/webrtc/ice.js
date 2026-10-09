// ICE servers come from the getIceServers Cloud Function so TURN credentials are
// short-lived and never appear in frontend code. If TURN isn't configured, STUN only:
// many home/mobile networks still connect, but some (symmetric NAT, strict firewalls) won't.
import { callFn, configured } from '../core/firebase.js';
import { APP } from '../config/app-config.js';

let cache = null;
export async function getIceConfig() {
  if (cache && cache.exp > Date.now()) return cache.value;
  let value = { iceServers: APP.fallbackIceServers, turn: false, fallback: true };
  if (configured) {
    try { const r = await callFn('getIceServers'); value = { iceServers: r.iceServers, turn: !!r.turn, fallback: false }; cache = { value, exp: Date.now() + (r.ttl || 3600) * 800 }; return value; }
    catch (e) { console.warn('getIceServers failed, using STUN only', e.message); }
  }
  return value;
}
export const rtcSupported = () => typeof RTCPeerConnection !== 'undefined';
