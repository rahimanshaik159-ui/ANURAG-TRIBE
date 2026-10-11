# ANURAG TRIBE

**One Campus. Many Minds. One Tribe.** — *Connect. Discover. Build. Share. Grow.*

A student collaboration platform: profiles → people discovery → **Tribes** (small collaborative groups, ideal size 5–6) → chat + voice → projects → showcase. Vanilla HTML/CSS/JS (ES modules), Firebase Auth + Firestore + Cloud Functions, and WebRTC. No framework, no bundler, no build step.

---

## 1. Verification status — read this first

| Status | What |
|---|---|
| ✅ **Implemented and tested here** | 500 MB direct WebRTC file transfer (exactly 524,288,000 bytes, SHA-256 verified, multi-file, corruption detection, cancel) · Tribe voice mesh (3 members, real audio tracks, mute, leave/cleanup) · SHA-256, validators, recommendations, "Find video editors" query parsing, transfer limits (22 unit tests) · every page renders signed-out / signed-in / admin on desktop + mobile with zero JS errors and no horizontal overflow · Tribe chat send/link detection/XSS-inertness · avatar picker, social-link validation, directory search, personalised dashboard · static integrity (400 imports resolve, 50 avatars present, no storage SDKs) · all 33 Cloud Functions load under the real `firebase-functions` SDK |
| ⚠️ **Implemented, needs external configuration** | Firebase project + config · Cloud Functions deploy (needs Blaze plan) · email (Resend API key + verified domain) · Super Admin bootstrap email · optional TURN server · optional App Check |
| 🔬 **Written but NOT executed in the build sandbox** | `firestore.rules` (mechanically linted, not run against the emulator) and `tests/rules/*` (needs the Firestore emulator, which the sandbox could not download). **Run `npm run test:rules` before going live.** Also: Cloud Functions *behaviour* (they load, but weren't run against emulators), live email delivery, composite-index completeness for every filter combination |
| 🌐 **Limited by browser / network / service** | Direct transfer and voice need a WebRTC path between the two networks (STUN works for most; strict/symmetric NAT and some mobile carriers need a TURN server) · tests ran on loopback in a single browser, **not across real networks or phones** · file-streaming-to-disk needs desktop Chromium (File System Access API); other browsers buffer in memory/temp storage, so very large files can fail on low-RAM phones · iOS Safari background tabs suspend WebRTC · voice mesh is meant for ≤ ~8 people |

Everything under `tests/e2e` that touches the UI uses a **test-only in-memory Firebase stand-in** (`tests/e2e/fake-firebase.js`). It is not part of the product and does not evaluate security rules.

---

## 2. Quick start

```bash
npm install                      # root dev tools (firebase-tools, rules-unit-testing)
npm test                         # 22 unit tests (no network needed)
npm run check                    # static integrity check
cd functions && npm install && cd ..
```

### Firebase setup (≈10 min)
1. Create a Firebase project. Upgrade to **Blaze** (Cloud Functions, Scheduler and Secret Manager need it; usage at campus scale is tiny).
2. **Authentication → Sign-in method → Email/Password: enable.** Customise the verification/reset email templates (Auth → Templates). Add your hosting domain under *Authorized domains*.
3. **Firestore Database → Create** in production mode, location **`asia-south1`** (Mumbai).
4. **Project settings → Your apps → Web app** → copy the config into `public/js/config/firebase-config.js`.
5. `cp .firebaserc.example .firebaserc` and put your project id in it.
6. If you pick a region other than `asia-south1`, change it in **both** `functions/src/core.js` (`REGION`) and `public/js/config/app-config.js` (`functionsRegion`).

### Functions configuration
```bash
cp functions/.env.example functions/.env      # APP_URL, SUPER_ADMIN_UID, EMAIL_FROM
firebase functions:secrets:set RESEND_API_KEY        # or enter:  unset   (emails are then logged as not_configured)
```

### Deploy
```bash
firebase deploy --only firestore        # rules + indexes (indexes take a few minutes to build)
firebase deploy --only functions
firebase deploy --only hosting
```
The **Super Admin** is the single UID set in `isSuper()` (`firestore.rules`), `SUPER_ADMIN_UID` (`public/js/core/roles.js`) and `SUPER_ADMIN_UID` (`functions/.env`); keep the three identical. Register that account, verify its email and sign in.

### Run locally with emulators
```bash
npm run serve        # Auth :9099, Functions :5001, Firestore :8080, Hosting :5000, UI :4000
```
The web SDK talks to production unless you add `connectAuthEmulator`/`connectFirestoreEmulator`/`connectFunctionsEmulator` in `core/firebase.js` for local dev. Or just open `public/` with any static server (`npx serve public`) pointed at a dev Firebase project.

### Tests
| Command | What it runs |
|---|---|
| `npm test` | unit tests (SHA-256 vs Node crypto, validators, recommendations, transfer limits) |
| `npm run check` | import/export/link/asset integrity + "no permanent storage" guard |
| `python3 tests/e2e/transfer.e2e.py 500` | real WebRTC transfer test at the full 500 MB limit (needs Playwright + Chromium) |
| `python3 tests/e2e/voice.e2e.py` | real WebRTC 3-member voice mesh test |
| `python3 tests/e2e/ui.e2e.py` | renders all pages ×3 roles ×2 viewports + flow checks, writes screenshots |
| `npm run test:rules` | **security rules** against the Firestore emulator (run this!) |

---

## 3. Architecture

### Tribes (the heart)
```
Student → Skills → People → TRIBE → Chat/Voice → Project → Showcase → Recognition
```
* **Create / manage (no Cloud Functions):** every membership change is a direct Firestore transaction/batch from `public/js/services/tribes.js`, validated by `firestore.rules`: create Tribe, join (leader accepts a request, or invitee accepts an invitation), remove, leave, roles, ownership transfer, archive. `memberCount` can only move by exactly ±1 together with the matching member document, and `tribes/{id}.lastMembershipChange` (`{uid, kind, at}`) names who changed, which is how the rules cross-check the two writes. Not enforced any more (cannot be done by rules without extra documents): unique Tribe names and the per-user `maxTribesPerUser` cap.
* **Join:** student writes `tribes/{id}/joinRequests/{uid}` (rules: self only, public+active Tribe) → leaders get a notification (trigger) → a leader accepts in one atomic write. **Invitations:** `tribeInvites/{tribeId}_{inviteeUid}` (one per student per Tribe; leader creates, invitee answers). Notifications for all of these are sent by Firestore triggers, never by clients.
* **Ideal size ≠ limit.** `idealMemberCount` (default 6) is only displayed as `4/6 MEMBERS`; overflow shows as extra dots. The only hard ceiling is the admin-configurable `tribeHardCap` (default 30).
* **Recommendations** (`lib/recommend.js`) are deterministic and explainable (“Your skills fit: Video Editing”, “You want to learn: AI / ML”), scored from skills, interests, learning goals, looking-for, with capacity only as a tie-breaker.
* **Chat** = text + links only (`tribes/{id}/messages`). Links get provider labels (YouTube/GitHub/Figma/…); nothing is fetched or embedded. Replies, edit, delete, leader-hide, report, unread dots, presence dots. **No media upload exists.**
* **Voice** = audio-only WebRTC mesh (`webrtc/voiceRoom.js`): later joiner offers to earlier members (no glare), ICE restart ×3 then manual *Reconnect*, heartbeat + scheduled cleanup, mute/speaking indicators, “tap to enable audio” for blocked autoplay.
* **Projects:** Tribe projects are rows in the **same** `projects` collection with `tribeId` set (`visibility: 'tribe'`). IDEA → PLANNING → IN PROGRESS → COMPLETED, assignments, links, “open to campus collaborators” (→ appears in Projects Hub and accepts applications), and “Submit to Showcase”.

### Direct file transfer (locked architecture — unchanged by Tribes)
```
SENDER → recipient accepts → WebRTC DataChannel → recipient saves locally
```
* **Firestore holds only:** session metadata (file names/sizes, status), WebRTC signaling (SDP/ICE, deleted once consumed), nothing else. **No Firebase Storage, no S3/Cloudinary, no permanent URLs, no file bytes in Firestore, no fallback.** `npm run check` fails the build if a storage SDK appears.
* **Limits:** ≤ 3 files and ≤ 500 MB per transfer are enforced in the UI, in `lib/transferRules.js`, **and** in Firestore rules (`filesOk`). Blocking executable file types (.exe, .bat, .msi …) is client-side only (UI + `transferRules.js`).
* **Authenticated & contextual:** you can only send inside a Tribe you share or an accepted help request (rules check this). The recipient must **accept** (and picks where to save in that click).
* **Protocol:** 16 KiB chunks; `bufferedAmount` backpressure; a 16 MB application window gated by **receiver-confirmed** acks (progress shown is real, not simulated); streaming SHA-256 computed on both sides (no 500 MB buffer needed to hash); per-file `ok/bad` verdict; 45 s connect timeout; 30 s stall detection; cancel from either side; clear failure messages with **Retry** (attempt counter in the session).
* **Cleanup:** signaling docs are deleted on consumption and on terminal status (trigger); a 5-minute scheduler expires stale sessions and removes finished metadata after 7 days.

### Firestore model
`users` (+`usernames` reservation, `userPrivate` prefs) · `tribes/{id}` → `members`, `joinRequests`, `messages`, `presence` · `tribeInvites` · `tribeVoiceRooms/{id}` → `participants`, `signaling` · `transferSessions/{id}` → `signaling` · `helpRequests/{id}` → `messages` · `projects` (+`likes`) · `applications` · `posts` (+`likes`) · `comments` · `showcase` · `events` → `registrations` · `resources` · `announcements` · `notifications` · `reports` · `settings/{platform,taxonomy}` · backend-only: `emailLogs`, `adminLog`.

### Roles, admin and the privacy boundary
* **Admin** is `users/{uid}.role == 'admin'`, editable only by the **Super Admin** (a fixed UID) through `firestore.rules`; nobody can promote themselves. **Suspension** is a Firebase Auth custom claim (`suspended`) plus a disabled account, written only by the `setUserSuspended` Cloud Function, and rules read it from `request.auth.token`.
* **Super Admin** (fixed UID): manage admins, platform settings, everything an admin can. **Admin:** moderate users (suspend), Tribes (suspend/reinstate), projects, posts, showcase review, announcements, events, resources, skills/categories, reports. Console: `admin.html#…`.
* **Admins cannot read private Tribe chat or help-request conversations.** A reported message carries a snapshot that **rules verify against the real message**, so reviewers see exactly what was reported and nothing else.

### Email notifications
Notifications are created **only by functions** (clients can't spam). `onNotificationCreated` emails when the type is whitelisted, the user hasn't opted out, and the hourly cap isn't exceeded; every attempt is logged in `emailLogs` with a 15-min retry schedule (max 4). Chat messages and voice invites never email. **No attachments, ever** — only a link back to the app. Verification and reset emails are Firebase Auth's own.

### Profiles, avatars, social links
Edit Profile covers name, username (atomic reservation), department, year, section, bio, skills, interests, learning, looking-for, current projects, availability, avatar, social links, visibility, email prefs. **Avatars:** the 50 supplied images (`public/assets/avatars/avatar1–50.png`, taken verbatim from `avatarfortrbie.zip`), **or** initials, **or** a link to an image hosted elsewhere (https only; falls back to initials if it breaks). **Nothing is uploaded or stored.** Social links (Instagram, YouTube, X, LinkedIn, GitHub, portfolio, other) are optional, normalised (`@name` → URL), host-checked and validated again in rules. Emails/phones are never displayed.

---

## 4. Project structure
```
anurag-tribe/
├─ firebase.json · firestore.rules · firestore.indexes.json · .firebaserc.example · package.json
├─ functions/            index.js, src/{core,admin,tribes,triggers,email,cleanup,ice}.js, .env.example
├─ public/
│  ├─ *.html             23 pages (shared template)
│  ├─ css/               base · components · pages
│  ├─ assets/            logo/ (official logo variants) · avatars/ (50) · img/
│  └─ js/
│     ├─ config/         firebase-config(.example).js · app-config.js
│     ├─ lib/            pure logic: taxonomy, validators, sha256, recommend, discovery, transferRules, format
│     ├─ core/           fb.js (SDK pin), firebase.js, auth.js, ui.js, dom.js, icons.js
│     ├─ services/       users, tribes, tribeChat, projects, helpRequests, content
│     ├─ webrtc/         ice, signaling, transferSession, transferSender, transferReceiver, voiceRoom
│     ├─ components/     shell, cards, avatar, skillPicker, socialLinks, tribe{Chat,Members,Projects}UI, voiceUI, modals
│     └─ pages/          one module per page · admin/{people,content,reports,_ui}.js
├─ scripts/static-check.mjs
└─ tests/  unit/ · rules/ · e2e/
```

## 5. Notes & known limits
* **Deviations from the suggested file list:** one `admin.html` with hash sections (users, tribes, reports, …) instead of many `admin-*.html`; Tribe workspace is one `tribe.html` with tabs; profile edit is `edit-profile.html`.
* **Images:** the prototype's campus photography was not supplied as separate files, so heroes use CSS/SVG motifs and the official logo. Drop photos into `public/assets/img/` and reference them in `css/pages.css` (`.hero`, `.page-hero`) if you want them.
* **Demo content:** the only demo content is the three *example Tribes* on the landing page, labelled “Examples”. No fake statistics anywhere.
* **Search:** Firestore has no full-text search. Search = skill-aware filters + name/username **prefix**. Admins can extend the vocabulary in *Skills & categories*. If a rarely used filter combination errors with “needs an index”, click the link in the console error once (or add it to `firestore.indexes.json`).
* **Announcements** fan out to ≤ 5,000 users per publish (V1 ceiling); emails to announcements are rate-limited per user.
* **Rate limiting:** chat has a client throttle and server-side size limits; Firestore rules can't rate-limit. Enable **App Check** (`appCheckSiteKey` in `app-config.js`) for abuse resistance.
* **Existing codebase:** no earlier code was supplied, so “existing” features (auth, roles, help requests, projects, posts, showcase, announcements, reports, notifications, email, 500 MB transfer, admin/super-admin) were built from the master requirements, with Tribes integrated on top, not beside, them.

## 6. Security checklist before launch
- [ ] `npm run test:rules` is green on your machine
- [ ] Deployed indexes show **Enabled** (Firestore → Indexes)
- [ ] `SUPER_ADMIN_UID` (rules, `roles.js`, `functions/.env`) is your own account
- [ ] Email domain verified in Resend; test a help request end-to-end
- [ ] Two real phones on different networks: file transfer and voice (add TURN if any fail)
- [ ] App Check enabled (recommended)
- [ ] Auth email templates and authorized domains reviewed
