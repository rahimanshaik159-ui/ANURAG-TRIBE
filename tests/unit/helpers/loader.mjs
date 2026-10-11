// Node module-loader hook: lets unit tests import public/js/services/*.js without a browser.
// Replaces core/firebase.js with an in-memory stand-in (see fakeFirebase.mjs).
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const stub = pathToFileURL(path.resolve('tests/unit/helpers/fakeFirebase.mjs')).href;
export async function resolve(specifier, context, next) {
  const r = await next(specifier, context);
  if (/\/public\/js\/core\/firebase\.js$/.test(r.url)) return { url: stub, shortCircuit: true };
  return r;
}
