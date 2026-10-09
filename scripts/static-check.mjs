// Static integrity check (no browser): verifies imports/exports, HTML references, asset paths, and forbidden patterns.
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve('public'); let errors = 0; const err = (m) => { console.log('ERROR', m); errors++; };
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(root); const js = files.filter((f) => f.endsWith('.js')); const html = files.filter((f) => f.endsWith('.html'));
const exportsOf = (src) => { const s = new Set(); for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z0-9_$]+)/g)) s.add(m[1]);
  for (const m of src.matchAll(/export\s+(?:let|const|var)\s+([^;]+);/g)) for (const part of m[1].split(/,(?![^(]*\))/)) { const n = part.trim().match(/^([A-Za-z0-9_$]+)\s*=/); if (n) s.add(n[1]); }
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) m[1].split(',').forEach((x) => s.add(x.trim().split(/\s+as\s+/).pop())); if (/export\s+default/.test(src)) s.add('default'); return s; };
const cache = new Map(); const exp = (f) => { if (!cache.has(f)) cache.set(f, exportsOf(fs.readFileSync(f, 'utf8'))); return cache.get(f); };
let importsChecked = 0;
for (const f of js) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/import\s+(?:([\s\S]*?)\s+from\s+)?['"]([^'"]+)['"]/g)) {
    const spec = m[2]; if (/^https?:/.test(spec)) continue;
    const target = path.resolve(path.dirname(f), spec); importsChecked++;
    if (!fs.existsSync(target)) { err(`${path.relative(root, f)}: cannot resolve ${spec}`); continue; }
    const clause = m[1]; if (!clause) continue; const have = exp(target);
    const named = clause.match(/\{([^}]+)\}/); if (named) for (const n of named[1].split(',')) { const nm = n.trim().split(/\s+as\s+/)[0]; if (nm && !have.has(nm)) err(`${path.relative(root, f)}: '${nm}' is not exported by ${spec}`); }
    if (/^\s*\*\s+as/.test(clause) === false && /^[A-Za-z_$][\w$]*\s*(,|$)/.test(clause.trim()) && !have.has('default')) err(`${path.relative(root, f)}: default import from ${spec} but no default export`);
  }
}
for (const f of html) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/(?:src|href)="([^"#?]+)"/g)) { const u = m[1]; if (/^(https?:|mailto:|data:)/.test(u)) continue; if (!fs.existsSync(path.resolve(path.dirname(f), u))) err(`${path.basename(f)}: missing ${u}`); }
}
// every internal link produced by JS (href: 'x.html' / location.href = 'x.html') must exist
const pages = new Set(html.map((f) => path.basename(f)));
for (const f of js) { const src = fs.readFileSync(f, 'utf8'); for (const m of src.matchAll(/['"`]([a-z0-9-]+\.html)(?:[?#][^'"`]*)?['"`]/g)) if (!pages.has(m[1])) err(`${path.relative(root, f)}: links to missing page ${m[1]}`); }
// asset references
for (const f of js) { const src = fs.readFileSync(f, 'utf8'); for (const m of src.matchAll(/['"`](assets\/[A-Za-z0-9_\/.-]+)['"`]/g)) if (!fs.existsSync(path.join(root, m[1]))) err(`${path.relative(root, f)}: missing asset ${m[1]}`); }
// forbidden: any permanent-storage dependency
const bad = [/firebase-storage/i, /getStorage\s*\(/, /uploadBytes/, /cloudinary/i, /amazonaws\.com/i, /\binnerHTML\s*=\s*[^'"`]/];
for (const f of js) { const src = fs.readFileSync(f, 'utf8'); for (const b of bad) if (b.test(src) && !f.endsWith('icons.js')) err(`${path.relative(root, f)}: forbidden pattern ${b}`); }
for (const n of Array.from({ length: 50 }, (_, i) => `avatar${i + 1}.png`)) if (!fs.existsSync(path.join(root, 'assets/avatars', n))) err(`missing ${n}`);
console.log(`checked ${js.length} JS files, ${html.length} HTML pages, ${importsChecked} imports`);
console.log(errors ? `${errors} problem(s)` : 'STATIC CHECK PASSED');
process.exit(errors ? 1 : 0);
