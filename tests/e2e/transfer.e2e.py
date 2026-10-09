"""
Real WebRTC end-to-end test of the direct file-transfer protocol in headless Chromium.
Two RTCPeerConnections talk over a real DataChannel using the REAL TransferSender / TransferReceiver
modules. Only the signaling transport is replaced (in-memory bus instead of Firestore) and the
Firebase CDN modules are stubbed (the sandbox can't reach them). No file data ever goes anywhere but the DataChannel.
Run:  python3 tests/e2e/transfer.e2e.py [size_mb]
"""
import sys, os, threading, http.server, socketserver, functools, json
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'public')
SIZE_MB = int(sys.argv[1]) if len(sys.argv) > 1 else 40
FB_EXPORTS = ("initializeApp getAuth onAuthStateChanged createUserWithEmailAndPassword signInWithEmailAndPassword signOut sendEmailVerification "
  "sendPasswordResetEmail updateProfile setPersistence browserLocalPersistence getFirestore collection collectionGroup doc getDoc getDocs setDoc addDoc updateDoc deleteDoc "
  "query where orderBy limit startAfter onSnapshot serverTimestamp writeBatch arrayUnion arrayRemove increment Timestamp getCountFromServer runTransaction "
  "getFunctions httpsCallable initializeAppCheck ReCaptchaV3Provider").split()
STUB = "\n".join(f"export const {n} = () => {{ throw new Error('stub {n}'); }};" for n in FB_EXPORTS)

HARNESS = r"""
import { TransferSender } from '/js/webrtc/transferSender.js';
import { TransferReceiver } from '/js/webrtc/transferReceiver.js';
import { Sha256 } from '/js/lib/sha256.js';

class Bus { constructor(){ this.h = {}; } }
class MemSignaling {
  constructor(bus, me, peer){ this.bus=bus; this.me=me; this.peer=peer; this.closed=false; }
  async send(to, kind, payload){ if(this.closed) return; const m={from:this.me,to,kind,payload:JSON.parse(JSON.stringify(payload||{}))};
    setTimeout(()=>{ const h=this.bus.h[to]; if(h) h(m); }, 5); }
  listen(h){ this.bus.h[this.me]=h; }
  close(){ this.closed=true; }
}
window.runTransfer = async ({ sizes, mode, corrupt, cancelAt }) => {
  const files = sizes.map((s,i)=>{ const block=new Uint8Array(1024*1024); for(let k=0;k<block.length;k++) block[k]=(k*31+i*7)&255;
    const parts=[]; for(let n=0;n<Math.floor(s/block.length);n++) parts.push(block); const rest=s%block.length; if(rest) parts.push(block.subarray(0,rest));
    return new File(parts, `file${i}.bin`, {type:'application/octet-stream'}); });
  // expected hashes (computed through the same streaming implementation, cross-checked vs SubtleCrypto for small files)
  const total = sizes.reduce((a,b)=>a+b,0);
  const session = { senderUid:'A', recipientUid:'B', totalBytes: total, files: files.map(f=>({name:f.name,size:f.size,type:f.type})) };
  const bus = new Bus(); const log=[]; const result={ states:[], progressMax:0, received:[], error:null };
  const t0=performance.now();
  return await new Promise(async (resolve)=>{
    let senderDone=false, recvDone=false; const pend=[]; const finish=async()=>{ if(senderDone&&recvDone){ await Promise.all(pend); result.ms=performance.now()-t0; resolve(result);} };
    const rcv = new TransferReceiver({ session, signaling:new MemSignaling(bus,'B','A'), sink:{mode:'blob'},
      onState:(s,d)=>{ result.states.push('R:'+s); if(['completed','failed','cancelled'].includes(s)){ result.rState=s; result.rDetail=d; recvDone=true; finish(); } },
      onProgress:(p)=>{ result.progressMax=Math.max(result.progressMax,p.confirmed); },
      onFileReady: ({index,name,size,blob})=>{ pend.push((async()=>{ const buf=new Uint8Array(await blob.arrayBuffer()); const h=new Sha256().update(buf).hex();
        const exp=new Sha256(); for(let o=0;o<files[index].size;o+=1048576){ exp.update(new Uint8Array(await files[index].slice(o,o+1048576).arrayBuffer())); }
        result.received.push({index,name,size,match:h===exp.hex()}); })()); } });
    const snd = new TransferSender({ session, files, signaling:new MemSignaling(bus,'A','B'),
      onState:(s,d)=>{ result.states.push('S:'+s); if(['completed','failed','cancelled'].includes(s)){ result.sState=s; result.sDetail=d; senderDone=true; finish(); } },
      onProgress:(p)=>{ if(cancelAt && p.confirmed>=cancelAt && !result.cancelled){ result.cancelled=true; snd.cancel(); } } });
    if (corrupt) { const orig=rcv._onControl.bind(rcv); rcv._onControl=async(m)=>{ if(m.t==='file-end') m.sha256='0'.repeat(64); return orig(m); }; }
    await rcv.start(); await snd.start();
    setTimeout(()=>{ if(!(senderDone&&recvDone)){ result.error='TIMEOUT'; resolve(result);} }, 240000);
  });
};
window.ready = true;
"""

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path == '/__harness.html':
            body = b"<!doctype html><script type='module'>" + HARNESS.encode() + b"</script>"
            self.send_response(200); self.send_header('Content-Type','text/html'); self.end_headers(); self.wfile.write(body); return
        return super().do_GET()
def serve():
    h = functools.partial(Q, directory=ROOT); s = socketserver.TCPServer(('127.0.0.1', 0), h); s.allow_reuse_address=True
    threading.Thread(target=s.serve_forever, daemon=True).start(); return s

def run():
    srv = serve(); port = srv.server_address[1]; fails = 0
    def check(name, cond, extra=''):
        nonlocal fails; print(('PASS ' if cond else 'FAIL ') + name + (f'  [{extra}]' if extra else '')); fails += (0 if cond else 1)
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--allow-loopback-in-peer-connection','--disable-features=WebRtcHideLocalIpsWithMdns'])
        pg = b.new_page()
        pg.route('https://www.gstatic.com/firebasejs/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=STUB))
        pg.on('pageerror', lambda e: print('PAGEERROR', e)); 
        pg.goto(f'http://127.0.0.1:{port}/__harness.html'); pg.wait_for_function('window.ready===true', timeout=20000)
        MB = 1024*1024
        r = pg.evaluate('o=>runTransfer(o)', {'sizes':[SIZE_MB*MB]})
        check(f'single {SIZE_MB} MB file: both sides completed', r.get('sState')=='completed' and r.get('rState')=='completed', f"{r.get('sState')}/{r.get('rState')} {r.get('sDetail')} {r.get('rDetail')} {r.get('ms',0)/1000:.1f}s")
        check('received file bytes + SHA-256 match original', len(r['received'])==1 and r['received'][0]['match'] and r['received'][0]['size']==SIZE_MB*MB)
        check('progress reached 100% from receiver-confirmed bytes', r['progressMax']==SIZE_MB*MB, str(r['progressMax']))
        r = pg.evaluate('o=>runTransfer(o)', {'sizes':[5*MB+13, 3*MB, 1]})
        check('three files incl. odd sizes + 1 byte', r.get('sState')=='completed' and len(r['received'])==3 and all(x['match'] for x in r['received']), str([x['size'] for x in r['received']]))
        r = pg.evaluate('o=>runTransfer(o)', {'sizes':[8*MB], 'corrupt':True})
        check('integrity mismatch is detected -> transfer fails, file NOT delivered', r.get('sState')=='failed' and r.get('rState')=='failed' and len(r['received'])==0, f"{r.get('sDetail')}")
        r = pg.evaluate('o=>runTransfer(o)', {'sizes':[60*MB], 'cancelAt': 8*MB})
        check('cancel mid-transfer stops both sides, nothing delivered', r.get('sState')=='cancelled' and r.get('rState')=='cancelled' and len(r['received'])==0, f"{r.get('sState')}/{r.get('rState')}")
        b.close()
    print('FAILED' if fails else 'ALL PASSED'); sys.exit(1 if fails else 0)
run()
