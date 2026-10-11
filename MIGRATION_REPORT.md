# ANURAG TRIBE - Cloud Functions migration report

**Bottom line.** Tribe membership no longer needs any Cloud Function. All eight Tribe callables were replaced by direct client-SDK
transactions that `firestore.rules` validate. **Cloud Functions cannot be removed completely**: suspension, notifications, e-mail,
counters, announcements and scheduled cleanup still need a trusted server. The `functions/` directory therefore stays
(33 functions -> 24; 13 callables -> 2).

> **Not verified by me:** `firestore.rules` were never executed against the Firestore emulator (this sandbox cannot download it).
> They parse cleanly with Firebase's official rules grammar and are covered by 37 new emulator tests that you must run
> (`npm run test:rules`) **before deploying**. See section 7.

## 1. State of the project when I received it
The project was already half-migrated. Findings (all verified in the code):
1. `createTribe` and `respondToJoinRequest` were already client-side. `respondToJoinRequest` **could not work**: it wrote `memberCount`, which no rule permitted.
   It also dropped the join-decision notification and made re-joining impossible ("existing inactive membership").
2. `getIceServers` was already replaced by STUN-only client code. `syncMyClaims` / `setUserRole` had **no caller** (roles are now written straight to `users/{uid}.role`).
3. The retained admin callables checked a `role` **custom claim** that nothing sets any more, so even the Super Admin would have been refused. Fixed (section 3).
4. The rules header and README still described the old claims/callables design.

## 2. Migration table (every original function)
| Original function | Type | Replacement | Status |
|---|---|---|---|
| `createTribe` | callable | `services/tribes.js` batch (Tribe + owner member) + rules | **Migrated** (see differences 1-2) |
| `respondToJoinRequest` | callable | transaction: member + count +1 + marker + request; notification via trigger | **Migrated** (and fixed) |
| `inviteToTribe` | callable | transaction writing `tribeInvites/{tribeId}_{uid}`; rules check leader, active Tribe, invitee visibility/suspension, not a member, no duplicate pending, inviter name; notification via trigger | **Migrated** |
| `respondToInvite` | callable | transaction: invite + member + count +1 + marker | **Migrated** |
| `removeTribeMember` | callable | transaction: status `removed`, count -1, marker | **Migrated** |
| `leaveTribe` | callable | transaction: status `left`, count -1; last owner archives | **Migrated** |
| `setTribeMemberRole` | callable | owner-only role toggle; ownership transfer = 3-document atomic write | **Migrated** |
| `archiveTribe` | callable | owner-only `status: archived` | **Migrated** |
| `syncMyClaims` | callable | none (no caller; roles live in Firestore) | **Removed (dead)** |
| `setUserRole` | callable | already replaced by a Super-Admin-only Firestore write | **Removed (dead)** |
| `getIceServers` | callable | none (client already STUN-only; TURN needs a secret) | **Removed (dead)** |
| `setUserSuspended` | callable | - | **Kept: category B** (Auth claim, disable account, revoke tokens) |
| `setTribeStatus` | callable | - | **Kept: category D** (guaranteed audit log + trusted notification; rules cannot guarantee a log row) |
| 18 Firestore triggers + 2 schedules | server | unchanged | **Kept**: notifications, e-mail, counters, announcements, cleanup |
| - | trigger | `onTribeInviteWritten`, `onTribeMemberWritten`; `onJoinRequestWritten` extended | **Added**: notifications that the callables used to send |

Callers of `callFn` that remain: only `admin/reports.js` (suspend user, suspend Tribe). The Functions SDK init in `core/firebase.js` therefore stays.

## 3. Server-side changes (`functions/`)
* `core.js`: admin check now matches the rules (Super Admin UID, or `users/{uid}.role == 'admin'`); stale custom-claim roles are deliberately **not** trusted.
  New param `SUPER_ADMIN_UID` (default = the UID in your rules). Removed `SUPER_ADMIN_EMAILS`, TURN params.
* `admin.js`: only `setUserSuspended`, `setTribeStatus`. `setTribeStatus` now refuses to change an **archived** Tribe (previously it could un-archive one).
* `tribes.js`, `ice.js`: deleted. `index.js`, `.env.example`: updated.

## 4. Firestore rules - protections preserved or added
* Default deny retained; every non-Tribe rule is byte-identical (verified by diff).
* Verified e-mail + not-suspended (`verified()`) on every membership write; active-Tribe requirement for create/join/invite.
* Owner/moderator matrix: owner removes anyone but an owner; moderator removes plain members only; only the owner changes roles or archives; members cannot escalate anyone.
* Tribe creation is atomic with its owner document; `creatorUid`, `memberCount == 1`, `status == active`, timestamps `== request.time`, exact key sets.
* Join: leader accepts a *pending* request, or the invitee accepts an invitation addressed to them; re-join returns only as a plain `member`.
* Invitations: deterministic id (one per Tribe+student, so no duplicate pending), only inviter/invitee can read, inviter name and Tribe name verified against real documents, no re-invite over a pending one.
* **No client can create a notification** (`notifications` create stays `false`).
* New narrow read grants (needed so flows work): own member document; the single Tribe of a *pending* invitation (so an invitee of a private Tribe sees what they join).

## 5. Member count design (trade-off)
`memberCount` is **never freely writable**. It may change only by exactly +/-1, in the same atomic write as the matching member-document
change, and that write must carry `tribes/{id}.lastMembershipChange = {uid, kind, at}` (`at == request.time`). Each side's rule checks the other
(`getAfter`), so a count cannot move without a real member change and a member change cannot happen without the matching count. Rules are
evaluated at commit time, so two simultaneous accepts cannot both succeed from the same count (tested). The platform cap (`settings/platform.tribeHardCap`, default 30) is enforced in rules.
* **Cost:** one new documented field on Tribe documents. It reveals the uid of the last membership change to anyone who can read the Tribe; for public Tribes the roster is already public, for private Tribes only members can read it.
* **Assumption:** counts are exact, which holds for data written by the old server code and the new rules. A pre-existing inexact count would make the "last owner leaves" check wrong; a reconcile script is not included.

## 6. Behaviour differences you should know about
1. **Unique Tribe names** and the **per-user `maxTribesPerUser` (3)** are no longer enforced. Rules cannot count or deduplicate without extra documents. (The in-progress client code had already dropped them.)
2. Category allow-list and the slug format of skills/interests are validated by the client (`validateTribe`, `normalizeTribeInput`), not by rules (rules cannot iterate lists).
3. Notifications for invites, join decisions, removal and role changes now come from triggers: **they appear only when Functions are deployed.** Core membership flows work without them.
4. Re-joining keeps old `leftAt`/`removedAt` fields on the member document (harmless).
5. "Owner may leave only as last member" uses `memberCount`, not a live roster query.

## 7. Tests: executed vs not executed
| Check | Command | Result |
|---|---|---|
| Unit tests (53: logic, service write-sets against an in-memory Firestore, server auth) | `npm test` | **53/53 pass** |
| Import / HTML integrity | `npm run check` | **pass** (71 JS files, 24 pages, 404 imports) |
| Functions load | `node -e "require('./functions')"` | **pass** (24 exports) |
| Rules syntax | official `@firebase/eslint-plugin-security-rules` parser | **0 errors** (3 warnings = intentional public reads) |
| UI e2e (Playwright, fake Firebase) | `python3 tests/e2e/ui.e2e.py` | **ALL PASSED** (82 checks, no JS errors) |
| Voice e2e | `python3 tests/e2e/voice.e2e.py` | **ALL PASSED** |
| **Rules tests (17 existing + 37 new)** | `npm run test:rules` | **NOT RUN** - emulator unavailable here. Syntax-checked only. |
| Transfer e2e | `python3 tests/e2e/transfer.e2e.py` | **Fails identically on your original ZIP** (stale harness); not touched by this work |

Honest limits: the unit service tests prove the client writes the documents/fields the rules expect; they do **not** evaluate rules. The e2e suite was
failing on your original (its fake lacked `connect*Emulator`); I repaired that harness. Unexercised risks, highest first:
1. Rules logic and Firestore's **access-call limits** (10 per operation, 20 per batch). My worst-case estimate for "leader accepts a request" is ~8-9 calls per operation; if the emulator reports the limit, the first thing to relax is the redundant `existsAfter/getAfter` check in `leaderRespondsToRequest`.
2. `getAfter()` on server-timestamp fields nested in a map (`lastMembershipChange.at`) - documented behaviour, untested here.
3. Retained callables and new triggers were not run against real Firebase.

## 8. Test locally
```bash
npm install && (cd functions && npm install)
npm test && npm run check
npm run test:rules          # needs Java 11+; downloads the Firestore emulator. REQUIRED before deploying rules
python3 tests/e2e/ui.e2e.py # needs: pip install playwright && playwright install chromium
npm run serve               # full emulator suite for manual testing
```
Manual smoke test in the emulator: create Tribe -> second account requests to join -> leader accepts -> check `memberCount`; invite from the Members tab -> accept/decline; remove; leave; transfer ownership; archive.

## 9. Deploy (only after you approve and `npm run test:rules` is green)
```bash
firebase deploy --only firestore:rules
firebase deploy --only hosting
```
Deploy these two together. Do **not** deploy Functions first: it prompts to delete the 11 removed functions, and clients still running the old site call some of them.
When ready: `firebase deploy --only functions` (needs the Blaze plan; adds the new notification triggers and fixes the admin callables).

## 10. Manual Firebase Console / CLI actions
* After hosting+rules are live, delete the removed deployed functions if they exist: `createTribe respondToJoinRequest inviteToTribe respondToInvite removeTribeMember leaveTribe setTribeMemberRole archiveTribe syncMyClaims setUserRole getIceServers` (or accept the prompt on the next functions deploy).
* Remove `SUPER_ADMIN_EMAILS` and `TURN_URLS` from your real `functions/.env`, and delete the `TURN_SHARED_SECRET` secret if it exists (I did not edit `.env`).
* Keep `SUPER_ADMIN_UID` identical in `firestore.rules`, `public/js/core/roles.js` and `functions/.env`.
* Suspension and Tribe moderation still need Functions deployed (Blaze plan).

## 11. Package contents
Complete project including `.git`, `.env*` and local files exactly as uploaded, **excluding `node_modules/`** (reinstall with `npm install`, see section 8) and Python caches.
Added: `public/js/lib/tribeLogic.js`, `tests/rules/tribeMembership.rules.test.js`, `tests/unit/{tribeLogic,tribeService,functionsAuth}.test.js`, `tests/unit/helpers/*`, this report.
Modified: `firestore.rules`, `README.md`, `package.json`, `public/js/services/tribes.js`, `public/js/pages/admin/content.js`, `functions/{index.js,src/core.js,src/admin.js,src/triggers.js,.env.example}`, `tests/rules/firestore.rules.test.js` (titles), `tests/e2e/{fake-firebase.js,ui.e2e.py}` (harness repair).
Removed: `functions/src/tribes.js`, `functions/src/ice.js`.
Note: your upload already had uncommitted edits (`roles.js`, `robots.txt`, `sitemap.xml`); they are untouched.
