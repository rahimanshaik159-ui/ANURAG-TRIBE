// Incremental (streaming) SHA-256 for transfer integrity checks.
// crypto.subtle.digest cannot hash a stream, and a 500 MB file must not be held
// in memory just to hash it - so both peers hash chunk-by-chunk as data flows.
// Constants are derived from primes (per FIPS 180-4) to avoid transcription errors;
// verified against Node's crypto in tests/unit/sha256.test.js.

const K = new Uint32Array(64);
const H0 = new Uint32Array(8);
(function init() {
  const primes = []; for (let n = 2; primes.length < 64; n++) if (primes.every((p) => n % p)) primes.push(n);
  const frac = (x) => Math.floor((x - Math.floor(x)) * 4294967296) >>> 0;
  primes.forEach((p, i) => { K[i] = frac(Math.cbrt(p)); if (i < 8) H0[i] = frac(Math.sqrt(p)); });
})();

export class Sha256 {
  constructor() {
    this.h = new Uint32Array(H0); this.buf = new Uint8Array(64); this.bl = 0; this.len = 0; this.w = new Uint32Array(64);
  }
  update(data) {
    const d = data instanceof Uint8Array ? data : new Uint8Array(data);
    this.len += d.length; let i = 0;
    if (this.bl) {
      while (i < d.length && this.bl < 64) this.buf[this.bl++] = d[i++];
      if (this.bl === 64) { this._block(this.buf, 0); this.bl = 0; }
    }
    for (; i + 64 <= d.length; i += 64) this._block(d, i);
    while (i < d.length) this.buf[this.bl++] = d[i++];
    return this;
  }
  _block(b, o) {
    const w = this.w; const h = this.h;
    for (let t = 0; t < 16; t++) w[t] = (b[o + t * 4] << 24) | (b[o + t * 4 + 1] << 16) | (b[o + t * 4 + 2] << 8) | b[o + t * 4 + 3];
    for (let t = 16; t < 64; t++) {
      const a = w[t - 15]; const c = w[t - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((c >>> 17) | (c << 15)) ^ ((c >>> 19) | (c << 13)) ^ (c >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let a = h[0], bb = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let t = 0; t < 64; t++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[t] + w[t]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & bb) ^ (a & c) ^ (bb & c);
      const t2 = (S0 + maj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + bb) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }
  /** Finalise and return lowercase hex. The instance must not be reused after. */
  hex() {
    const bitsHi = Math.floor(this.len / 0x20000000); const bitsLo = (this.len << 3) >>> 0;
    const pad = new Uint8Array(((this.bl < 56 ? 56 : 120) - this.bl) + 8);
    pad[0] = 0x80;
    const n = pad.length;
    pad[n - 8] = bitsHi >>> 24; pad[n - 7] = bitsHi >>> 16; pad[n - 6] = bitsHi >>> 8; pad[n - 5] = bitsHi;
    pad[n - 4] = bitsLo >>> 24; pad[n - 3] = bitsLo >>> 16; pad[n - 2] = bitsLo >>> 8; pad[n - 1] = bitsLo;
    const savedLen = this.len; this.update(pad); this.len = savedLen;
    return [...this.h].map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
}
