// Rebuilds public/icons from the logo drawing in src/lib/logo.js.
// Run: node scripts/make-icons.mjs   (needs rsvg-convert installed)
import { writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { heartSVG, DEFAULT_HEART } from '../src/lib/logo.js';

const dir = mkdtempSync(join(tmpdir(), 'icons-'));
const svg = join(dir, 'icon.svg');
writeFileSync(svg, heartSVG(DEFAULT_HEART, { bg: true, id: 'ico' }));

const out = [
  ['apple-touch-icon.png', 180],
  ['favicon-64.png', 64],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable-512.png', 512],
];
for (const [name, size] of out) {
  execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), svg, '-o', join('public/icons', name)]);
  console.log('wrote', name);
}
