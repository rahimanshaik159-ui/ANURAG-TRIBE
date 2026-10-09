'use strict';
/**
 * Returns ICE servers to signed-in users. STUN is public. TURN credentials are
 * short-lived (coturn "use-auth-secret" REST scheme) so no TURN secret ever
 * appears in frontend code. If TURN is not configured, only STUN is returned
 * and the client explains that some networks may not connect.
 */
const crypto = require('crypto');
const { onCall } = require('firebase-functions/v2/https');
const C = require('./core');

exports.getIceServers = onCall({ region: C.REGION, secrets: [C.TURN_SHARED_SECRET] }, async (req) => {
  const uid = C.requireVerified(req);
  const servers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  const urls = C.TURN_URLS.value().split(',').map((s) => s.trim()).filter(Boolean);
  const secret = C.TURN_SHARED_SECRET.value();
  let turn = false;
  if (urls.length && secret && secret !== 'unset') {
    const ttl = 3600;
    const username = `${Math.floor(Date.now() / 1000) + ttl}:${uid}`;
    const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');
    servers.push({ urls, username, credential });
    turn = true;
  }
  return { iceServers: servers, turn, ttl: 3600 };
});
