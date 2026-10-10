
import { APP } from '../config/app-config.js';

// Direct WebRTC only: STUN, no Cloud Functions and no TURN.
export async function getIceConfig() {
  return {
    iceServers: APP.fallbackIceServers,
    turn: false,
    fallback: true
  };
}

export const rtcSupported = () =>
  typeof RTCPeerConnection !== 'undefined';
