// Jordan Odyssey: responsive images from the originals in images-src/.
//
// Pages, stylesheets and scripts refer to an original, e.g. images-src/photos/hero-petra-treasury.jpg.
// This script finds every original the site uses and writes, next to the deployed assets,
//   assets/img/<same folder>/<name>-<width>.<hash>.<avif|webp|jpg>
// at a ladder of widths no wider than the original. Images with transparency get AVIF and WebP only.
// scripts/build-dist.mjs then swaps each reference for <picture>/srcset markup using
// scripts/images-manifest.json. Originals in images-src/ are only read, never changed.
//
// It is incremental: an original whose content and settings are unchanged is skipped, so a deploy only
// encodes new or edited photos. Add a photo by putting it in images-src/ and referring to it from a page.
// Run: node scripts/build-images.mjs  (or npm run images)

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import sharp from 'sharp';
import { ROOT } from './site.mjs';

const SRC = join(ROOT, 'images-src');
const OUT = join(ROOT, 'assets', 'img');
const MANIFEST = join(ROOT, 'scripts', 'images-manifest.json');

// Quality: visually lossless for photos. Heroes (homepage and program pages) get a little more.
const Q = { avif: 62, webp: 80, jpg: 82 };
const Q_HERO = { avif: 70, webp: 84, jpg: 86 };
const HERO = new Set([
  'photos/hero-petra-treasury.jpg',
  'discover/aqaba.jpg', 'discover/jerash.jpg', 'discover/dead-sea.jpg', 'discover/wadi-rum.jpg',
  'discover/amman.jpg', 'discover/petra-wide.jpg',
  // the Discover backgrounds for Jerash, Amman and Petra: small photos shown large, so keep every detail
  'guides/card-jerash.jpg', 'guides/card-amman.jpg', 'guides/card-petra.jpg'
]);
// Phone crops for heroes. On a phone only part of a hero photo is visible, so phones get just that part,
// cut where the page's own object-position puts it (`x`, `y`), so the framing is identical:
//   portrait  the homepage hero fills a portrait phone's height: a centred vertical slice
//   phone     program heroes sit in a 100vw x 80vw box (aspect 1.25) on portrait phones (styles.css .program-hero);
//             destination banners in a 100vw x 48vw box (aspect 25/12, styles.css .dg-hero-photo)
// scripts/build-dist.mjs serves each through a <source media="..."> on images with the matching class.
const PHONE_Q = { avif: 50, webp: 72, jpg: 78 };   // seen at 1.75-3x density: q50 AVIF looks the same as q60 at 2/3 of the size
const phone = (x, y = 0.5) => ({ name: 'phone', aspect: 1.25, x, y, widths: [480, 768, 1080], q: PHONE_Q });
// the banners are only 217 px tall, so the slice is narrower than 480 px: it keeps its own width (and quality)
const banner = (x) => ({ name: 'phone', aspect: 25 / 12, x, y: 0.5, widths: [480], q: { avif: 62, webp: 80, jpg: 82 } });
export const CROPS = {
  'guides/hero-overview.jpg': [banner(0.4)],
  'guides/hero-amman.jpg': [banner(0.8)],
  'guides/hero-aqaba.jpg': [banner(0.64)],
  'guides/hero-dead-sea.jpg': [banner(0.66)],
  'guides/hero-jerash.jpg': [banner(0.62)],
  'guides/hero-petra.jpg': [banner(0.44)],
  'guides/hero-wadi-rum.jpg': [banner(0.52)],
  'photos/hero-petra-treasury.jpg': [
    { name: 'portrait', aspect: 0.8, x: 0.5, widths: [480, 768], q: { avif: 64, webp: 78, jpg: 80 } },
    phone(0.5)                        // The Grand Jordan Tour
  ],
  'discover/aqaba.jpg': [phone(0.4)],     // Best of Jordan
  'discover/jerash.jpg': [phone(0.3)],    // Jordan Delights 1
  'discover/dead-sea.jpg': [phone(0.74)], // Jordan Delights 2
  'discover/petra.jpg': [phone(0.47)],    // Jordan Discovery (portrait photo: the crop is a horizontal band)
  'discover/wadi-rum.jpg': [phone(0.44)], // Jordan Explorer
  'discover/amman.jpg': [phone(0.46)],    // Jordan Revealed
  'sights/petra-monastery.jpg': [phone(0.5)]   // travel guide: best time to visit Jordan
};
const LADDER = [480, 768, 1200, 1600, 2000];
const SMALL_LADDER = [120, 240, 360];   // logos and other small images
const SETTINGS = 'v1';                  // bump to re-encode everything

const sha = (buf, n = 64) => createHash('sha256').update(buf).digest('hex').slice(0, n);

/* ---------- Which originals does the site use? ---------- */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
export function usedOriginals() {
  const files = [
    ...walk(join(ROOT, 'en')).filter((f) => f.endsWith('.html')),
    ...walk(join(ROOT, 'assets', 'css')).filter((f) => f.endsWith('.css')),
    ...walk(join(ROOT, 'assets', 'js')).filter((f) => f.endsWith('.js'))
  ];
  const used = new Set();
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/images-src\/([\w./-]+\.(?:jpe?g|png|webp|avif))/gi)) used.add(m[1]);
  }
  return [...used].sort();
}

/* ---------- Encoding ---------- */
function widthsFor(w) {
  if (w <= 640) return [...SMALL_LADDER.filter((x) => x < w * 0.9), w];
  const list = LADDER.filter((x) => x < w * 0.95);
  list.push(Math.min(w, 2000));
  return [...new Set(list)];
}

async function encodeCrop(rel, crop, entryOld) {
  const buf = readFileSync(join(SRC, rel));
  const key = `${SETTINGS}:crop:${JSON.stringify(crop)}:${sha(buf)}`;
  if (entryOld && entryOld.key === key && entryOld.files.every((f) => existsSync(join(ROOT, f)))) return { entry: entryOld, encoded: 0 };
  const meta = await sharp(buf).rotate().metadata();
  const W = meta.autoOrient?.width || meta.width, H = meta.autoOrient?.height || meta.height;
  // narrower than the photo: full height, a vertical slice at x; wider: full width, a band at y
  const tall = crop.aspect < W / H;
  const cw = tall ? Math.round(crop.aspect * H) : W;
  const ch = tall ? H : Math.round(W / crop.aspect);
  const left = Math.round((crop.x ?? 0.5) * (W - cw));
  const top = Math.round((crop.y ?? 0.5) * (H - ch));
  const base = rel.replace(extname(rel), '') + '-' + crop.name;
  const entry = { key, width: cw, height: ch, alpha: false, crop: { left, top, width: cw, height: ch }, variants: {}, files: [] };
  let encoded = 0;
  for (const fmt of ['avif', 'webp', 'jpg']) {
    entry.variants[fmt] = [];
    // the widths that fit, or the crop's own width when none does
    const widths = crop.widths.filter((x) => x <= cw);
    for (const w of widths.length ? widths : [cw]) {
      const h = Math.round((ch * w) / cw);
      let img = sharp(buf).rotate().extract({ left, top, width: cw, height: ch }).resize(w, h, { kernel: 'lanczos3' });
      if (fmt === 'avif') img = img.avif({ quality: crop.q.avif, effort: 5 });
      if (fmt === 'webp') img = img.webp({ quality: crop.q.webp, effort: 5 });
      if (fmt === 'jpg') img = img.jpeg({ quality: crop.q.jpg, mozjpeg: true, progressive: true });
      const out = await img.toBuffer();
      const name = `${base}-${w}.${sha(out, 8)}.${fmt}`;
      writeFileSync(join(OUT, name), out);
      const path = relative(ROOT, join(OUT, name)).split('\\').join('/');
      entry.variants[fmt].push({ w, h, file: path, bytes: out.length });
      entry.files.push(path);
      encoded++;
    }
  }
  return { entry, encoded };
}

async function encode(rel, entryOld) {
  const file = join(SRC, rel);
  const buf = readFileSync(file);
  const hero = HERO.has(rel);
  const key = `${SETTINGS}:${hero ? 'hero' : 'std'}:${sha(buf)}`;
  if (entryOld && entryOld.key === key && entryOld.files.every((f) => existsSync(join(ROOT, f)))) return { entry: entryOld, encoded: 0 };

  const meta = await sharp(buf).rotate().metadata();
  const W = meta.autoOrient?.width || meta.width, H = meta.autoOrient?.height || meta.height;
  const alpha = !!meta.hasAlpha && (await sharp(buf).stats()).isOpaque === false;
  const q = hero ? Q_HERO : Q;
  const formats = alpha ? ['avif', 'webp'] : ['avif', 'webp', 'jpg'];
  const base = rel.replace(extname(rel), '');
  mkdirSync(dirname(join(OUT, rel)), { recursive: true });

  const entry = { key, width: W, height: H, alpha, hero, variants: {}, files: [] };
  let encoded = 0;
  for (const fmt of formats) {
    entry.variants[fmt] = [];
    for (const w of widthsFor(W)) {
      const h = Math.round((H * w) / W);
      let img = sharp(buf).rotate().resize(w, h, { kernel: 'lanczos3' });
      if (fmt === 'avif') img = img.avif({ quality: q.avif, effort: 5, chromaSubsampling: '4:2:0' });
      if (fmt === 'webp') img = img.webp({ quality: q.webp, effort: 5, alphaQuality: 90 });
      if (fmt === 'jpg') img = img.flatten({ background: '#ffffff' }).jpeg({ quality: q.jpg, mozjpeg: true, progressive: true });
      const out = await img.toBuffer();
      const name = `${base}-${w}.${sha(out, 8)}.${fmt}`;
      writeFileSync(join(OUT, name), out);
      const path = relative(ROOT, join(OUT, name)).split('\\').join('/');
      entry.variants[fmt].push({ w, h, file: path, bytes: out.length });
      entry.files.push(path);
      encoded++;
    }
  }
  return { entry, encoded };
}

/* ---------- Run ---------- */
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('\\').join('/').split('/').pop());
if (isMain) {
  const old = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
  const used = usedOriginals();
  const missing = used.filter((rel) => !existsSync(join(SRC, rel)));
  if (missing.length) {
    console.error('images: referenced but not in images-src/:\n  ' + missing.join('\n  '));
    process.exit(1);
  }
  const manifest = {};
  let total = 0;
  for (const rel of used) {
    const { entry, encoded } = await encode(rel, old[rel]);
    manifest[rel] = entry;
    total += encoded;
    if (encoded) console.log(`images: ${rel} → ${encoded} files`);
    for (const crop of CROPS[rel] || []) {
      const key = `${rel}#${crop.name}`;
      const c = await encodeCrop(rel, crop, old[key]);
      manifest[key] = c.entry;
      total += c.encoded;
      if (c.encoded) console.log(`images: ${key} → ${c.encoded} files`);
    }
  }
  // remove generated files that no longer belong to any original
  const keep = new Set(Object.values(manifest).flatMap((e) => e.files));
  let removed = 0;
  for (const f of walk(OUT)) {
    const rel = relative(ROOT, f).split('\\').join('/');
    if (/-\d+\.[0-9a-f]{8}\.(avif|webp|jpg|png)$/.test(rel) && !keep.has(rel)) { unlinkSync(f); removed++; }
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + '\n');
  console.log(`images: ${used.length} originals in use, ${total} files encoded, ${removed} stale files removed`);
}
