'use strict';
// ANURAG TRIBE Cloud Functions entry. Each module exports named functions.
Object.assign(exports, require('./src/admin'), require('./src/tribes'), require('./src/ice'), require('./src/cleanup'));
const t = require('./src/triggers');
delete t.deleteCollection;
Object.assign(exports, t);
