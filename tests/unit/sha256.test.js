import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Sha256 } from '../../public/js/lib/sha256.js';

const ref = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

test('matches node crypto for edge-case lengths', () => {
  for (const n of [0, 1, 3, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 1000, 65537]) {
    const b = crypto.randomBytes(n);
    assert.equal(new Sha256().update(b).hex(), ref(b), `length ${n}`);
  }
});
test('chunked updates (like a transfer) equal one-shot hash', () => {
  const b = crypto.randomBytes(5 * 1024 * 1024 + 123);
  const h = new Sha256();
  for (let o = 0; o < b.length; o += 16384) h.update(b.subarray(o, Math.min(o + 16384, b.length)));
  assert.equal(h.hex(), ref(b));
});
test('odd-sized chunking', () => {
  const b = crypto.randomBytes(100000);
  const h = new Sha256(); let o = 0; let step = 1;
  while (o < b.length) { h.update(b.subarray(o, o + step)); o += step; step = (step * 7 + 3) % 997 + 1; }
  assert.equal(h.hex(), ref(b));
});
test('known vector "abc"', () => {
  assert.equal(new Sha256().update(new TextEncoder().encode('abc')).hex(), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
