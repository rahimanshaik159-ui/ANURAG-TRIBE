'use strict';
// ANURAG TRIBE Cloud Functions entry. Each module exports named functions.
//
// What still runs on a server, and why (see MIGRATION_REPORT.md):
//   admin.js     setUserSuspended, setTribeStatus  - Auth-claim changes and audited moderation
//   triggers.js  notifications, e-mail fan-out, counters, announcements - clients must never write these
//   cleanup.js   scheduled cleanup of temporary voice / transfer data and e-mail retries
// Tribe membership itself (create / join / invite / remove / leave / roles / archive) has NO function:
// it is written directly by the client and enforced by firestore.rules.
Object.assign(exports, require('./src/admin'), require('./src/cleanup'));
const t = require('./src/triggers');
delete t.deleteCollection;
Object.assign(exports, t);
