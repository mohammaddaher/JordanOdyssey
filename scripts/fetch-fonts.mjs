// Jordan Odyssey: self-hosted fonts.
// Pages keep their Google Fonts <link> in the source (it documents the families and weights they use).
// This script downloads those families once into assets/fonts/ (WOFF2, only the Latin subsets, plus
// Arabic for Amiri and Nabataean for Noto Sans Nabataean) and writes assets/fonts/fonts.json, which maps
// each Google Fonts URL to local @font-face rules with font-display: swap. scripts/build-dist.mjs replaces
// the <link> with those rules, so visitors never contact Google for fonts.
// Run again only when a page's font link changes: node scripts/fetch-fonts.mjs

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './site.mjs';

const OUT = join(ROOT, 'assets', 'fonts');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const KEEP = /^(latin|latin-ext|arabic|nabataean)$/;

function pages(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) pages(p, out); else if (n.endsWith('.html')) out.push(p);
  }
  return out;
}
const urls = new Set();
for (const f of pages(join(ROOT, 'en'))) {
  for (const m of readFileSync(f, 'utf8').matchAll(/href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/g)) urls.add(m[1].replace(/&amp;/g, '&'));
}

mkdirSync(OUT, { recursive: true });
const map = {};
const files = new Map();   // Google file URL -> local name
for (const url of urls) {
  const css = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
  const rules = [];
  for (const m of css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*{[^}]+})/g)) {
    const [, subset, block] = m;
    if (!KEEP.test(subset)) continue;
    const family = block.match(/font-family:\s*'([^']+)'/)[1];
    const style = block.match(/font-style:\s*(\w+)/)[1];
    const weight = block.match(/font-weight:\s*([\d ]+)/)[1].trim().replace(' ', '-');
    const src = block.match(/url\((https:[^)]+\.woff2)\)/)[1];
    if (!files.has(src)) {
      const buf = Buffer.from(await (await fetch(src, { headers: { 'User-Agent': UA } })).arrayBuffer());
      const name = `${family.toLowerCase().replace(/\s+/g, '-')}-${style}-${weight}-${subset}.${createHash('sha256').update(buf).digest('hex').slice(0, 8)}.woff2`;
      if (!existsSync(join(OUT, name))) writeFileSync(join(OUT, name), buf);
      files.set(src, name);
    }
    rules.push({
      family, style, weight, subset, file: files.get(src),
      css: block.replace(src, `/assets/fonts/${files.get(src)}`).replace(/font-display:\s*\w+/, 'font-display: swap').replace(/\s+/g, ' ')
    });
  }
  map[url] = rules;
  console.log(`fonts: ${url.slice(37, 110)}… → ${rules.length} rules`);
}
writeFileSync(join(OUT, 'fonts.json'), JSON.stringify(map, null, 1) + '\n');
console.log(`fonts: ${files.size} files in assets/fonts/`);
