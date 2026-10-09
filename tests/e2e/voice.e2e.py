"""
Real WebRTC test of Tribe voice (audio-only mesh) using the REAL VoiceRoom module.
Three members join in one Chromium (fake microphone). Signaling/participants go through the TEST-ONLY in-memory Firestore stand-in.
Checks: mesh connects (every pair), remote audio tracks arrive, mute updates presence, leaving tears peers down, late joiner connects to all.
"""
import sys, os, importlib.util, json
from playwright.sync_api import sync_playwright
spec = importlib.util.spec_from_file_location('ui', os.path.join(os.path.dirname(__file__), 'ui.e2e.py')); ui = importlib.util.module_from_spec(spec); spec.loader.exec_module(ui)
SCRIPT = r"""
async (n) => {
  const { VoiceRoom } = await import('/js/webrtc/voiceRoom.js');
  window.__FB.seed({ 'tribeVoiceRooms/r1': { tribeId: 't1', status: 'active', createdBy: 'u1', createdAt: { __ms: Date.now() }, expiresAt: { __ms: Date.now() + 3600000 } } });
  window.rooms = {}; window.states = {};
  window.joinAs = async (uid) => { const r = new VoiceRoom({ tribeId: 't1', roomId: 'r1', uid, onUpdate: (s) => { window.states[uid] = s; }, onEnded: () => {} }); window.rooms[uid] = r; return await r.join(); };
  return true;
}
"""
def main():
    srv = ui.serve(); base = f"http://127.0.0.1:{srv.server_address[1]}"; fails = 0
    def check(name, cond, extra=''):
        nonlocal fails; print(('PASS ' if cond else 'FAIL ') + name + (f'  [{extra}]' if extra else '')); fails += (0 if cond else 1)
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--allow-loopback-in-peer-connection', '--disable-features=WebRtcHideLocalIpsWithMdns'])
        ctx = b.new_context(permissions=['microphone']); ui.setup(ctx); pg = ctx.new_page(); pg.on('pageerror', lambda e: print('PAGEERROR', e))
        pg.goto(f'{base}/about.html'); pg.wait_for_function('window.__FB && window.__FB.user'); pg.evaluate(SCRIPT, 0)
        conn = lambda uid: pg.evaluate(f"(window.states['{uid}']||{{participants:[]}}).participants.filter(p=>!p.self).map(p=>p.conn)")
        def wait_all(uids, expect_peers, timeout=20000):
            pg.wait_for_function("([u,n])=>u.every(id=>{const s=window.states[id];if(!s)return false;const o=s.participants.filter(p=>!p.self);return o.length===n&&o.every(p=>p.conn==='connected')})", arg=[uids, expect_peers], timeout=timeout)
        ok1 = pg.evaluate("window.joinAs('uA')"); check('member A joins (mic granted)', ok1 is True)
        pg.evaluate("window.joinAs('uB')"); wait_all(['uA', 'uB'], 1); check('A<->B audio connection established (real RTCPeerConnection)', True)
        audio = pg.evaluate("window.rooms.uA.peers.get('uB').audio && window.rooms.uA.peers.get('uB').audio.srcObject.getAudioTracks().length")
        check('A receives B\'s remote audio track', audio == 1, str(audio))
        pg.evaluate("window.joinAs('uC')"); wait_all(['uA', 'uB', 'uC'], 2); check('late joiner C meshes to BOTH A and B (3-way)', True)
        pg.evaluate("window.rooms.uB.setMuted(true)"); pg.wait_for_timeout(300)
        muted = pg.evaluate("window.states.uA.participants.find(p=>p.uid==='uB').muted"); check('B mutes: others see muted=true via presence', muted is True)
        tr = pg.evaluate("window.rooms.uB.stream.getAudioTracks()[0].enabled"); check('B local mic track disabled while muted', tr is False)
        pg.evaluate("window.rooms.uC.leave()"); pg.wait_for_function("window.states.uA.participants.length===2", timeout=8000)
        peers = pg.evaluate("[...window.rooms.uA.peers.keys()]"); check('C leaves: A closes the peer and drops C from the list', peers == ['uB'] and pg.evaluate("document.querySelectorAll('audio').length") >= 1, str(peers))
        gone = pg.evaluate("![...window.__FB.store.keys()].some(k=>k.startsWith('tribeVoiceRooms/r1/participants/uC'))"); check('C participant doc removed (no stale presence)', gone)
        pg.evaluate("window.rooms.uA.leave(); window.rooms.uB.leave()"); pg.wait_for_timeout(500)
        st = pg.evaluate("window.__FB.store.get('tribeVoiceRooms/r1').status"); check('last member leaving ends the room', st == 'ended', st)
        left = pg.evaluate("[...window.__FB.store.keys()].filter(k=>k.includes('/signaling/')).length"); check('no signaling docs left behind', left == 0, str(left))
        b.close()
    print('FAILED' if fails else 'ALL PASSED'); sys.exit(1 if fails else 0)
main()
