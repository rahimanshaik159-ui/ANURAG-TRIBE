"""
UI smoke test + screenshots using a TEST-ONLY in-memory Firebase stand-in (tests/e2e/fake-firebase.js).
Verifies: every page renders without JS errors (signed-out + signed-in + admin), mobile has no horizontal overflow,
and key flows work (chat send, tribe join request UI, avatar picker, skill picker, social-link validation).
Usage: python3 tests/e2e/ui.e2e.py [outdir]
"""
import sys, os, json, threading, http.server, socketserver, functools, re
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..', '..', 'public'); OUT = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/shots'
os.makedirs(OUT, exist_ok=True)
FAKE = open(os.path.join(HERE, 'fake-firebase.js')).read()
def mod(names, ns): return '\n'.join(f"export const {n} = (...a) => window.__FB.mods.{ns}.{n}(...a);" if n[0].islower() and n not in ('browserLocalPersistence','Timestamp','ReCaptchaV3Provider') else f"export const {n} = window.__FB.mods.{ns}.{n};" for n in names)
MODS = {
 'firebase-app.js': mod(['initializeApp'], 'app'),
 'firebase-auth.js': mod('getAuth onAuthStateChanged createUserWithEmailAndPassword signInWithEmailAndPassword signOut sendEmailVerification sendPasswordResetEmail updateProfile setPersistence browserLocalPersistence'.split(), 'auth'),
 'firebase-firestore.js': mod('getFirestore collection collectionGroup doc getDoc getDocs setDoc addDoc updateDoc deleteDoc query where orderBy limit startAfter onSnapshot serverTimestamp writeBatch arrayUnion arrayRemove increment Timestamp getCountFromServer runTransaction'.split(), 'fs'),
 'firebase-functions.js': mod(['getFunctions', 'httpsCallable'], 'fns'),
 'firebase-app-check.js': mod(['initializeAppCheck', 'ReCaptchaV3Provider'], 'check'),
}
CONFIG = "export const firebaseConfig = { apiKey: 'test-key', authDomain: 't.firebaseapp.com', projectId: 'test-project', appId: 't', messagingSenderId: '1' };"
import time
H = 3600_000; now_ms = int(time.time() * 1000)
def ts(off=0): return {'__ms': now_ms + off}
def user(uid, name, uname, dept, yr, skills, interests=(), looking=(), av=None, role='user', social=None, avail='open'):
    return {'uid': uid, 'name': name, 'nameLower': name.lower(), 'username': uname, 'department': dept, 'year': yr, 'section': 'A', 'bio': 'Student at Anurag. Loves building things with good people.', 'avatar': av or {'type': 'preset', 'id': f'avatar{(hash(uid)%50)+1}'},
      'skills': list(skills), 'interests': list(interests), 'learning': ['ai-ml'], 'lookingFor': list(looking), 'currentProjects': ['Short film: Midnight Chai'], 'availability': avail, 'social': social or {}, 'visibility': 'campus', 'role': role, 'createdAt': ts(-10*H), 'updatedAt': ts(-10*H)}
SEED = {
 'users/u1': user('u1', 'Rahul Verma', 'rahul_v', 'CSE', 3, ['video-editing', 'filmmaking'], ['photography'], ['acting', 'cinematography'], {'type': 'preset', 'id': 'avatar5'}, social={'github': 'https://github.com/rahulv', 'instagram': 'https://instagram.com/rahul'}),
 'users/u2': user('u2', 'Sneha Reddy', 'sneha_r', 'ECE', 2, ['acting', 'script-writing'], ['filmmaking'], ['video-editing'], {'type': 'preset', 'id': 'avatar6'}, social={'linkedin': 'https://linkedin.com/in/sneha'}),
 'users/u3': user('u3', 'Arjun Kumar', 'arjun_k', 'CSE', 3, ['web-development', 'python', 'ai-ml'], ['startup'], ['ui-ux-design'], {'type': 'preset', 'id': 'avatar4'}),
 'users/u4': user('u4', 'Priya Sharma', 'priya_s', 'IT', 2, ['ui-ux-design', 'graphic-design'], ['web-development'], ['web-development'], {'type': 'none'}, avail='busy'),
 'users/u5': user('u5', 'Karthik Sai', 'karthik_s', 'CSE', 1, ['programming', 'java'], [], [], {'type': 'preset', 'id': 'avatar9'}),
 'tribes/t1': {'name': 'Filmmakers Tribe', 'nameLower': 'filmmakers tribe', 'description': 'A Tribe for students who want to make short films together: writing, shooting, editing and music.', 'goal': 'Produce one short film this semester', 'category': 'filmmaking', 'skills': ['filmmaking', 'video-editing', 'cinematography', 'acting', 'script-writing'], 'interests': [], 'creatorUid': 'u2', 'privacy': 'public', 'idealMemberCount': 6, 'memberCount': 3, 'status': 'active', 'projectFocus': 'Short films', 'createdAt': ts(-5*H), 'updatedAt': ts(-1*H), 'lastActivityAt': ts(-1*H), 'lastMessageAt': ts(-1*H)},
 'tribes/t2': {'name': 'Tech Tribe', 'nameLower': 'tech tribe', 'description': 'Web, Android and AI students shipping real projects and preparing for hackathons together.', 'goal': '', 'category': 'tech', 'skills': ['web-development', 'app-development', 'ai-ml', 'ui-ux-design'], 'interests': [], 'creatorUid': 'u3', 'privacy': 'public', 'idealMemberCount': 6, 'memberCount': 2, 'status': 'active', 'projectFocus': '', 'createdAt': ts(-4*H), 'updatedAt': ts(-2*H), 'lastActivityAt': ts(-2*H)},
 'tribes/t1/members/u1': {'uid': 'u1', 'role': 'moderator', 'status': 'active', 'joinedAt': ts(-4*H), 'lastReadAt': ts(-3*H)},
 'tribes/t1/members/u2': {'uid': 'u2', 'role': 'owner', 'status': 'active', 'joinedAt': ts(-5*H), 'lastReadAt': ts(-1*H)},
 'tribes/t1/members/u4': {'uid': 'u4', 'role': 'member', 'status': 'active', 'joinedAt': ts(-3*H), 'lastReadAt': ts(-1*H)},
 'tribes/t2/members/u3': {'uid': 'u3', 'role': 'owner', 'status': 'active', 'joinedAt': ts(-4*H)},
 'tribes/t2/members/u5': {'uid': 'u5', 'role': 'member', 'status': 'active', 'joinedAt': ts(-3*H)},
 'tribes/t1/messages/m1': {'senderUid': 'u2', 'text': 'Welcome to the Filmmakers Tribe! Drop ideas for the short film here.', 'type': 'text', 'createdAt': ts(-3*H)},
 'tribes/t1/messages/m2': {'senderUid': 'u4', 'text': 'Reference reel for the colour grade: https://www.youtube.com/watch?v=abc123', 'type': 'link', 'linkUrl': 'https://www.youtube.com/watch?v=abc123', 'linkHost': 'youtube.com', 'linkProvider': 'youtube', 'createdAt': ts(-2*H)},
 'tribes/t1/messages/m3': {'senderUid': 'u1', 'text': 'I can edit in DaVinci. Script draft is on GitHub https://github.com/rahulv/midnight-chai', 'type': 'link', 'linkUrl': 'https://github.com/rahulv/midnight-chai', 'linkHost': 'github.com', 'linkProvider': 'github', 'replyTo': {'id': 'm1', 'senderUid': 'u2', 'snippet': 'Welcome to the Filmmakers Tribe!'}, 'createdAt': ts(-1*H)},
 'projects/p1': {'ownerUid': 'u2', 'title': 'Short Film: Midnight Chai', 'description': 'A 10 minute drama shot on campus over two weekends. We need a sound designer and a colourist.', 'category': 'film', 'skillsNeeded': ['video-editing', 'music'], 'links': [{'label': 'Script', 'url': 'https://github.com/rahulv/midnight-chai'}], 'assignments': [{'uid': 'u2', 'task': 'Director'}, {'uid': 'u1', 'task': 'Editor'}], 'visibility': 'tribe', 'tribeId': 't1', 'tribeName': 'Filmmakers Tribe', 'memberUids': ['u2', 'u1', 'u4'], 'status': 'planning', 'likeCount': 2, 'commentCount': 0, 'applicationCount': 0, 'createdAt': ts(-3*H), 'updatedAt': ts(-2*H)},
 'projects/p2': {'ownerUid': 'u3', 'title': 'Smart Campus Management System', 'description': 'A web application to manage college events, notices and activities for students and staff.', 'category': 'web', 'skillsNeeded': ['web-development', 'ui-ux-design', 'backend'], 'links': [], 'assignments': [], 'visibility': 'campus', 'tribeId': None, 'tribeName': '', 'memberUids': ['u3'], 'status': 'in_progress', 'likeCount': 12, 'commentCount': 3, 'applicationCount': 1, 'createdAt': ts(-6*H), 'updatedAt': ts(-5*H)},
 'projects/p3': {'ownerUid': 'u5', 'title': 'IoT Based Smart Irrigation', 'description': 'Automated irrigation system using sensors and IoT for smart farming demos.', 'category': 'iot', 'skillsNeeded': ['iot', 'hardware', 'python'], 'links': [], 'assignments': [], 'visibility': 'campus', 'tribeId': None, 'tribeName': '', 'memberUids': ['u5'], 'status': 'idea', 'likeCount': 4, 'commentCount': 0, 'applicationCount': 0, 'createdAt': ts(-7*H), 'updatedAt': ts(-6*H)},
 'events/e1': {'title': 'Tech Innovators Hackathon', 'description': '24-hour hackathon to build smart solutions for real-world problems.', 'category': 'hackathon', 'startAt': ts(40*H), 'location': 'Anurag Campus', 'registrationOpen': True, 'registrationCount': 12, 'tags': ['web-development', 'ai-ml'], 'createdAt': ts(-1*H)},
 'events/e2': {'title': 'Photography Contest', 'description': 'Showcase your creativity through photography. Open for all students.', 'category': 'competition', 'startAt': ts(90*H), 'location': 'Main Ground', 'registrationOpen': True, 'registrationCount': 5, 'tags': ['photography'], 'createdAt': ts(-1*H)},
 'resources/r1': {'title': 'GATE CSE previous papers', 'description': 'Collected previous year papers with solutions.', 'url': 'https://example.com/gate', 'type': 'papers', 'area': 'study', 'tags': ['competitive-exams'], 'createdAt': ts(-2*H)},
 'resources/r2': {'title': 'Open call: Short film festival', 'description': 'Submit your student short film. Deadline in two weeks.', 'url': 'https://example.com/fest', 'type': 'competition', 'area': 'opportunity', 'tags': ['filmmaking', 'video-editing'], 'createdAt': ts(-1*H)},
 'showcase/s1': {'authorUid': 'u2', 'title': 'Monsoon Diaries (short film)', 'description': 'A 6 minute documentary on campus life during the monsoon.', 'category': 'film', 'links': [{'label': 'Watch on YouTube', 'url': 'https://youtube.com/watch?v=x'}], 'tribeId': 't1', 'projectId': None, 'status': 'approved', 'featureConsent': True, 'adminNote': '', 'createdAt': ts(-9*H), 'updatedAt': ts(-9*H)},
 'announcements/a1': {'title': 'Welcome to ANURAG TRIBE', 'body': 'Create your profile, join a Tribe and start building.', 'notifyEmail': False, 'createdAt': ts(-1*H)},
 'notifications/n1': {'uid': 'u1', 'type': 'tribe_invite', 'title': 'Arjun Kumar invited you to Tech Tribe', 'body': 'Open the invitation to accept or decline.', 'link': 'my-tribes.html#invites', 'read': False, 'createdAt': ts(-1*H)},
 'tribeInvites/t2_u1': {'tribeId': 't2', 'tribeName': 'Tech Tribe', 'inviteeUid': 'u1', 'inviterUid': 'u3', 'inviterName': 'Arjun Kumar', 'message': 'We could use your editing skills for demo videos', 'status': 'pending', 'createdAt': ts(-1*H)},
 'posts/po1': {'authorUid': 'u3', 'category': 'idea', 'text': 'Idea: a campus carpool app. Looking for an Android dev and a designer! https://github.com/example/carpool', 'status': 'visible', 'likeCount': 3, 'commentCount': 0, 'createdAt': ts(-2*H)},
}
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
def serve():
    s = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); s.allow_reuse_address = True
    threading.Thread(target=s.serve_forever, daemon=True).start(); return s

PAGES_PUBLIC = ['index', 'about', 'login', 'register', 'students', 'tribes', 'projects', 'events', 'resources', 'showcase']
PAGES_USER = ['dashboard', 'students', 'profile', 'edit-profile', 'tribes', 'create-tribe', 'my-tribes', 'tribe?id=t1', 'projects', 'projects?id=p2', 'my-projects', 'help-requests', 'transfer', 'ideas', 'events', 'resources', 'showcase', 'notifications', 'profile?id=u2']
def setup(ctx, mode='user', role='user'):
    ctx.route('https://www.gstatic.com/firebasejs/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=MODS.get(r.request.url.split('/')[-1].split('?')[0], '')))
    ctx.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(status=200, content_type='text/css', body=''))
    ctx.route('**/js/config/firebase-config.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=CONFIG))
    ctx.add_init_script(FAKE + f"\nwindow.__FB.auth.mode={json.dumps(mode)}; window.__FB.auth.role={json.dumps(role)}; window.__FB.seed({json.dumps(SEED)});")
def run():
    srv = serve(); base = f"http://127.0.0.1:{srv.server_address[1]}"; fails = 0; errs = []
    def check(name, cond, extra=''):
        nonlocal fails; print(('PASS ' if cond else 'FAIL ') + name + (f'  [{extra}]' if extra else '')); fails += (0 if cond else 1)
    with sync_playwright() as p:
        b = p.chromium.launch()
        def sweep(label, mode, role, pages, vp, tag):
            ctx = b.new_context(viewport=vp, device_scale_factor=1, has_touch=vp['width'] < 600, is_mobile=vp['width'] < 600); setup(ctx, mode, role); pg = ctx.new_page()
            logs = []; pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}')); pg.on('console', lambda m: logs.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)
            for pth in pages:
                logs.clear(); pg.goto(f"{base}/{pth.split('?')[0]}.html" + ('?' + pth.split('?')[1] if '?' in pth else ''), wait_until='load'); pg.wait_for_timeout(500)
                name = pth.replace('?id=', '-').replace('/', '_'); pg.screenshot(path=f'{OUT}/{tag}-{name}.png', full_page=True)
                over = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth"); bad = [l for l in logs if 'Failed to load resource' not in l]
                ok = not bad and (over <= 1 or vp['width'] > 600)
                if not ok: errs.append((label, pth, bad[:2], over))
                print(('  ok   ' if ok else '  FAIL ') + f'{label}:{pth}' + (f' overflow={over}' if over > 1 else '') + (f' {bad[:1]}' if bad else ''))
            ctx.close()
        D = {'width': 1280, 'height': 900}; M = {'width': 390, 'height': 844}
        sweep('anon-desktop', 'none', 'user', PAGES_PUBLIC, D, 'd-anon'); sweep('anon-mobile', 'none', 'user', PAGES_PUBLIC, M, 'm-anon')
        sweep('user-desktop', 'user', 'user', PAGES_USER, D, 'd-user'); sweep('user-mobile', 'user', 'user', PAGES_USER, M, 'm-user')
        sweep('admin-desktop', 'user', 'superAdmin', ['admin', 'admin#users', 'admin#reports', 'admin#tribes', 'admin#showcase', 'admin#settings', 'admin#admins', 'admin#taxonomy', 'admin#events'], D, 'd-admin')
        check('all pages render with no JS errors and no mobile overflow', not errs, str(errs[:3]))
        # ---- flows
        ctx = b.new_context(viewport=D); setup(ctx); pg = ctx.new_page(); pg.on('pageerror', lambda e: print('PAGEERROR', e))
        pg.goto(f'{base}/tribe.html?id=t1#chat'); pg.wait_for_selector('.msg', timeout=5000)
        check('tribe chat shows seeded messages incl. link card and reply', pg.locator('.msg').count() >= 3 and pg.locator('.link-card').count() >= 2 and pg.locator('.msg-reply').count() == 1)
        pg.fill('.chat-compose textarea', 'Shot list: https://www.figma.com/file/abc <script>alert(1)</script>'); pg.click('.chat-compose .btn-primary'); pg.wait_for_timeout(500)
        check('sent message appears, link is an anchor, script tag is inert text', pg.locator('.msg.mine').count() >= 2 and pg.locator('.msg.mine .msg-text a[href*="figma"]').count() == 1 and pg.locator('.msg-list script, .chat-list script').count() == 0 and 'script' in pg.locator('.msg.mine').last.inner_text())
        stored = pg.evaluate("[...window.__FB.store.entries()].filter(([k])=>k.startsWith('tribes/t1/messages/auto')).map(([,v])=>v)")
        check('message persisted as type=link with provider=figma', len(stored) == 1 and stored[0]['type'] == 'link' and stored[0]['linkProvider'] == 'figma')
        pg.goto(f'{base}/tribe.html?id=t1#voice'); pg.wait_for_selector('text=START TRIBE VOICE MEET', timeout=5000); check('voice tab shows START TRIBE VOICE MEET', True)
        pg.goto(f'{base}/tribe.html?id=t1#projects'); pg.wait_for_selector('.project-card', timeout=5000); check('projects tab lists Tribe project from shared projects collection', pg.locator('.project-card').count() == 1)
        pg.goto(f'{base}/tribe.html?id=t1#members'); pg.wait_for_selector('text=Invite students', timeout=5000); check('members tab (leader) shows roster, join requests and invite', pg.locator('h3:has-text("Join requests")').count() == 1 and pg.locator('.member-row').count() >= 3, str(pg.locator('h3').all_inner_texts()))
        pg.goto(f'{base}/tribe.html?id=t2'); pg.wait_for_selector('text=JOIN TRIBE', timeout=5000); check('non-member sees overview + JOIN TRIBE and NO chat', pg.locator('.chat').count() == 0)
        pg.goto(f'{base}/edit-profile.html'); pg.wait_for_selector('.avatar-picker'); pg.click('.ap-item >> nth=11'); check('avatar picker selects a supplied avatar', 'selected' in pg.locator('.ap-item').nth(11).get_attribute('class'))
        pg.click('text=Use initials'); check('initials option works (no photo needed)', 'initials' in pg.locator('.ap-preview-text strong').inner_text().lower())
        pg.fill('input[placeholder="https://your-site.com"]', 'javascript:alert(1)'); pg.locator('input[placeholder="https://your-site.com"]').blur(); pg.wait_for_timeout(200)
        check('invalid social link is rejected inline', pg.locator('.social-edit-row .field-error:not(:empty)').count() >= 1)
        pg.fill('input[placeholder="@username or link"] >> nth=0', '@rahul.v'); pg.locator('input[placeholder="@username or link"]').first.blur(); check('Instagram handle expands to a full URL', 'instagram.com/rahul.v' in pg.locator('input[placeholder="@username or link"]').first.input_value())
        pg.goto(f'{base}/students.html'); pg.wait_for_selector('.person-card'); pg.fill('#search input, input[type=search]', 'video editors'); pg.wait_for_timeout(900)
        names = pg.locator('.pc-name').all_inner_texts(); check('"video editors" search returns video editors', names == ['Rahul Verma'], str(names))
        pg.goto(f'{base}/dashboard.html'); pg.wait_for_selector('.welcome'); pg.wait_for_timeout(900)
        rec = pg.locator('.tribe-card:has-text("Tech Tribe")'); check('dashboard recommends Tech Tribe with explainable reason; excludes my own Filmmakers Tribe', rec.count() == 1 and 'want to learn' in rec.inner_text() and pg.locator('section:has(h2:has-text("Tribes for you")) .tribe-card:has-text("Filmmakers")').count() == 0)
        txt = pg.locator('main').inner_text(); check('dashboard shows personalised sections + attention item', 'Tribes for you' in txt and 'Needs your attention' in txt and 'invited you to Tech Tribe' in txt)
        ctx.close(); b.close()
    print('FAILED' if fails else 'ALL PASSED'); sys.exit(1 if fails else 0)
if __name__ == '__main__':
    run()
