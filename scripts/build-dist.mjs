// Jordan Odyssey: builds the deployable site in dist/ (Vercel serves that folder).
//
// The source pages stay simple: they refer to original photos in images-src/, to assets/css/*.css and
// assets/js/*.js, and to Google Fonts. For each page this script:
//   - swaps every image for responsive markup from scripts/images-manifest.json (made by build-images.mjs):
//     <picture> with AVIF and WebP sources and a JPEG fallback, srcset/sizes, width/height, lazy loading
//     below the hero, and a preload with fetchpriority="high" for the hero (the image marked fetchpriority);
//   - replaces the Google Fonts links with self-hosted @font-face rules (assets/fonts/, font-display: swap)
//     and preloads the one or two fonts used above the fold;
//   - minifies and fingerprints CSS and JS (name.<hash>.css), so they can be cached for a year;
//   - inlines the CSS the page needs and loads the full stylesheet without blocking rendering.
// It never touches the consent defaults, Google Tag Manager, canonical/Open Graph/schema tags or the forms.
// Run: npm run build (images, head, sitemap, then this).

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative } from 'node:path';
import * as esbuild from 'esbuild';
import Beasties from 'beasties';
import { ROOT } from './site.mjs';

const DIST = join(ROOT, 'dist');
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'scripts', 'images-manifest.json'), 'utf8'));
const FONTS = JSON.parse(readFileSync(join(ROOT, 'assets', 'fonts', 'fonts.json'), 'utf8'));
const NOINDEX_ALLOWED = new Set(['404.html', 'thank-you.html']);

// Display widths when a page gives no sizes attribute (header and footer logos); everything else is full width
const SIZES_BY_CLASS = {
  'brand-emblem': '(min-width: 900px) 100px, 72px',
  'brand-wordmark': '(min-width: 900px) 216px, 164px',
  'footer-emblem': '44px',
  'footer-wordmark': '104px',
  'tour-feature-img': '(min-width: 900px) 50vw, 100vw'
};
// CSS backgrounds have no srcset: the width to use for each
const CSS_WIDTH = { 'photos/greeting-carving.jpg': 1600, 'photos/heritage-mobile.jpg': 768, 'about/stone.jpg': 768 };
// The one or two fonts of the first screen (file-name prefixes in assets/fonts/). Only the small "core"
// files (18 and 32 KB): measured with Lighthouse (mobile, 21 Nov 2026), preloading them brings the first
// paint forward (program page: 0.90 s with, 1.35 s without) and leaves the largest paint, the hero photo,
// where it was. Fonts that aren't preloaded show in a size-adjusted local font (assets/fonts/fallbacks.json)
// until they arrive (font-display: swap). The enquiry page's heading font is 122 KB, more than its first
// screen is worth, so it isn't preloaded.
const FONT_PRELOAD = [
  [/^en\/about\.html$/, ['playfair-display-italic-700-latin.']],
  [/^en\/enquire\.html$/, []],
  [/^en\/destinations\//, ['eb-garamond-normal-400-latin-core.']],
  // program heroes: the title in Cinzel, the opening line and the price in EB Garamond
  [/^en\/programs\//, ['cinzel-normal-500-latin-core.', 'eb-garamond-normal-400-latin-core.']],
  // travel guide: the same hero as the program pages, with EB Garamond text in the first view
  [/^en\/travel-guide\//, ['cinzel-normal-500-latin-core.', 'eb-garamond-normal-400-latin-core.']],
  // the homepage's largest element is its heading, in Cinzel; the opening line below it is in EB Garamond
  [/^en\/index\.html$/, ['cinzel-normal-500-latin-core.', 'eb-garamond-normal-400-latin-core.']],
  [/./, ['cinzel-normal-500-latin-core.']]
];
// Fonts that only text below the first screen uses, loaded after the page (see fontsFor). On program pages
// EB Garamond italic sets just the note under the price; deferring it brings the first paint forward
// (Lighthouse mobile: 0.90 -> 0.75 s, largest paint 2.25 -> 2.11 s).
const LATE_FONTS = [
  [/^en\/programs\//, (r) => r.family === 'EB Garamond' && /font-style:\s*italic/.test(r.css)]
];
// Size-adjusted local fallbacks for the Latin web fonts (scripts/font-fallbacks.py)
const FALLBACKS = JSON.parse(readFileSync(join(ROOT, 'assets', 'fonts', 'fallbacks.json'), 'utf8'));
// The origins Google Tag Manager loads from: its script, then the Google Analytics hits
const PRECONNECT = ['https://www.googletagmanager.com', 'https://www.google-analytics.com'];
// Phone crops (scripts/build-images.mjs CROPS) used by images with this class, and when
const ART = {
  'hero-still': { suffix: '#portrait', media: '(max-width: 899px) and (max-aspect-ratio: 3/4)', notMedia: '(min-width: 900px), (min-aspect-ratio: 3/4)', sizes: '80vh' },
  // program heroes on portrait phones show a 100vw x 80vw slice
  'place-hero-photo': { suffix: '#phone', media: '(max-width: 599px) and (orientation: portrait)', notMedia: '(min-width: 600px), (orientation: landscape)', sizes: '100vw' },
  // destination banners on portrait phones show a 100vw x 48vw slice
  'dg-hero-img': { suffix: '#phone', media: '(max-width: 599px) and (orientation: portrait)', notMedia: '(min-width: 600px), (orientation: landscape)', sizes: '100vw' }
};
const artFor = (cls, rel) => (cls || '').split(/\s+/).map((c) => ART[c]).find((x) => x && MANIFEST[rel + x.suffix]);
const artSourcesFor = (rel, art) => sources(rel + art.suffix, art.sizes, art.media) +
  `<source type="image/jpeg" media="${art.media}" srcset="${srcset(rel + art.suffix, 'jpg')}" sizes="${art.sizes}">`;
// A hero that is only above the fold on wide screens is preloaded only there; on phones it loads lazily
const PRELOAD_MEDIA = { 'en/enquire.html': '(min-width: 960px)' };
let currentFile = '';
let pageHasHero = false;   // the page has a photo marked fetchpriority="high": it, not the wordmark, gets high priority

const hash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 8);
const posixRel = (p) => relative(ROOT, p).split('\\').join('/');
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
function copy(from, to) { mkdirSync(dirname(to), { recursive: true }); copyFileSync(from, to); }

/* ---------- Images ---------- */
function original(ref, fromFile) {
  // "../images-src/photos/x.jpg" seen from en/index.html -> "photos/x.jpg"
  const m = ref.match(/images-src\/(.+)$/);
  if (!m) return null;
  const rel = m[1];
  if (!MANIFEST[rel]) throw new Error(`${fromFile}: ${ref} has no optimized versions (run build-images)`);
  return rel;
}
const url = (v) => '/' + v.file;
const srcset = (rel, fmt) => MANIFEST[rel].variants[fmt].map((v) => `${url(v)} ${v.w}w`).join(', ');
const fallbackFmt = (rel) => (MANIFEST[rel].alpha ? 'webp' : 'jpg');
function pick(rel, fmt, width = 1200) {
  const list = MANIFEST[rel].variants[fmt];
  return [...list].reverse().find((v) => v.w <= width) || list[0];
}

function parseAttrs(s) {
  const attrs = [];
  for (const m of s.matchAll(/([^\s=/>]+)(?:\s*=\s*"([^"]*)")?/g)) attrs.push([m[1], m[2] === undefined ? null : m[2]]);
  return attrs;
}
const get = (a, k) => { const e = a.find(([n]) => n === k); return e ? e[1] : undefined; };
const has = (a, k) => a.some(([n]) => n === k);
function set(a, k, v) { const e = a.find(([n]) => n === k); if (e) e[1] = v; else a.push([k, v]); }
function del(a, k) { const i = a.findIndex(([n]) => n === k); if (i >= 0) a.splice(i, 1); }
const tag = (name, a, close = '>') => `<${name}${a.map(([k, v]) => (v === null ? ` ${k}` : ` ${k}="${v}"`)).join('')}${close}`;

function sizesFor(a) {
  if (get(a, 'sizes')) return get(a, 'sizes');
  const cls = (get(a, 'class') || '').split(/\s+/);
  for (const c of cls) if (SIZES_BY_CLASS[c]) return SIZES_BY_CLASS[c];
  return '100vw';
}

function imgAttrs(a, rel, { inHeader }) {
  const e = MANIFEST[rel];
  const fmt = fallbackFmt(rel);
  set(a, 'src', url(pick(rel, fmt)));
  set(a, 'srcset', srcset(rel, fmt));
  set(a, 'sizes', sizesFor(a));
  if (!has(a, 'width') || !has(a, 'height')) { set(a, 'width', String(e.width)); set(a, 'height', String(e.height)); }
  const hero = get(a, 'fetchpriority') === 'high';
  if (hero && PRELOAD_MEDIA[currentFile]) { del(a, 'fetchpriority'); set(a, 'loading', 'lazy'); }
  else if (hero) { set(a, 'loading', 'eager'); }
  else if (!inHeader && !has(a, 'loading')) set(a, 'loading', 'lazy');
  // the header wordmark is the largest thing on screen on pages whose hero is text only
  if (inHeader && !pageHasHero && (get(a, 'class') || '').split(/\s+/).includes('brand-wordmark')) set(a, 'fetchpriority', 'high');
  if (!has(a, 'decoding')) set(a, 'decoding', 'async');
  // keep src/srcset/sizes first, as browsers read them in order
  const order = ['src', 'srcset', 'sizes'];
  a.sort((x, y) => (order.indexOf(x[0]) + 1 || 99) - (order.indexOf(y[0]) + 1 || 99));
  return { hero, sizes: get(a, 'sizes') };
}

function sources(rel, sizes, media, extra = '') {
  const m = media ? ` media="${media}"` : '';
  return `<source type="image/avif"${m} srcset="${srcset(rel, 'avif')}" sizes="${sizes}"${extra}>` +
         `<source type="image/webp"${m} srcset="${srcset(rel, 'webp')}" sizes="${sizes}"${extra}>`;
}

// Images marked data-defer in the page wait until the page has loaded (main.js restores these attributes),
// so a large photo just below the first screen never competes with the hero
const defer = (markup) => markup.replace(/ (src|srcset)="/g, ' data-$1="');

function processImages(html, file) {
  const heroes = [];
  const inHeaderRange = (() => { const s = html.indexOf('<header class="site-header'); const e = html.indexOf('</header>', s); return [s, e]; })();
  const header = (i) => i > inHeaderRange[0] && i < inHeaderRange[1];

  // 1. Existing <picture> elements (art direction): expand each <source> and the <img>
  html = html.replace(/<picture\b([^>]*)>([\s\S]*?)<\/picture>/g, (whole, pAttrs, inner, offset) => {
    if (!/images-src\//.test(inner)) return whole;
    let out = '';
    let imgRel = null, imgA = null;
    const media = [];
    for (const m of inner.matchAll(/<(source|img)\b([^>]*?)\/?>/g)) {
      const a = parseAttrs(m[2]);
      if (m[1] === 'source') {
        const rel = original(get(a, 'srcset'), file);
        const extra = has(a, 'width') ? ` width="${get(a, 'width')}" height="${get(a, 'height')}"` : '';
        out += sources(rel, get(a, 'sizes') || '100vw', get(a, 'media'), extra);
        if (get(a, 'media')) media.push({ rel, sizes: get(a, 'sizes') || '100vw', media: get(a, 'media') });
      } else { imgRel = original(get(a, 'src'), file); imgA = a; }
    }
    const info = imgAttrs(imgA, imgRel, { inHeader: header(offset) });
    // a phone crop of the fallback photo goes first: the first <source> that matches wins
    const art = artFor(get(parseAttrs(pAttrs), 'class'), imgRel);
    if (art) {
      out = artSourcesFor(imgRel, art) + out;
      media.unshift({ rel: imgRel + art.suffix, sizes: art.sizes, media: art.media });
    }
    out += sources(imgRel, info.sizes) + tag('img', imgA);
    // preload what each screen shows: the sources with a media query; the fallback only when there are none
    if (info.hero) heroes.push({ list: media.length ? media : [{ rel: imgRel, sizes: info.sizes, media: PRELOAD_MEDIA[file] }] });
    if (/\bdata-defer\b/.test(pAttrs)) out = defer(out);
    return `<picture${pAttrs}>${out}</picture>`;
  });

  // 2. Plain <img> (outside a picture): wrap in a generated <picture>, unless a script swaps its source
  html = html.replace(/<img\b([^>]*?)\/?>/g, (whole, attrsStr, offset) => {
    const a = parseAttrs(attrsStr);
    const ref = get(a, 'src') || get(a, 'data-src');
    if (!ref || !/images-src\//.test(ref)) {
      // not a photo (SVG and similar): still lazy below the header
      if (!header(offset) && !has(a, 'loading') && get(a, 'fetchpriority') !== 'high' && get(a, 'src')) set(a, 'loading', 'lazy');
      return tag('img', a);
    }
    const rel = original(ref, file);
    const fmt = fallbackFmt(rel);
    // Hero sequence foreground rock: main.js loads it after the page (desktop only)
    if (has(a, 'data-wipe')) {
      del(a, 'src'); set(a, 'data-src', url(pick(rel, 'webp', 2000)));
      return tag('img', a);
    }
    // Discover backgrounds: main.js sets srcset/src when the place is chosen
    if (has(a, 'data-src')) {
      set(a, 'data-src', url(pick(rel, fmt)));
      set(a, 'data-srcset', srcset(rel, 'webp'));
      set(a, 'data-sizes', sizesFor(a));
      if (!has(a, 'width')) { set(a, 'width', String(MANIFEST[rel].width)); set(a, 'height', String(MANIFEST[rel].height)); }
      if (!has(a, 'decoding')) set(a, 'decoding', 'async');
      return tag('img', a);
    }
    // Program picker photo: main.js swaps src/srcset, so no <picture> (its <source> would win)
    if (has(a, 'data-feature-img')) {
      imgAttrs(a, rel, { inHeader: false });
      set(a, 'srcset', srcset(rel, 'webp'));
      const html = tag('img', a);
      return has(a, 'data-defer') ? defer(html) : html;
    }
    const info = imgAttrs(a, rel, { inHeader: header(offset) });
    const art = artFor(get(a, 'class'), rel);
    const artSources = art ? artSourcesFor(rel, art) : '';
    if (info.hero) {
      heroes.push({ list: art
        // the phone crop on phones, the full photo elsewhere: never both
        ? [{ rel: rel + art.suffix, sizes: art.sizes, media: art.media }, { rel, sizes: info.sizes, media: art.notMedia }]
        : [{ rel, sizes: info.sizes, media: PRELOAD_MEDIA[file] }] });
    }
    // Resized files round their height to whole pixels; keep the original's exact proportions for
    // images sized by one dimension (logos), so nothing moves by a pixel
    if (!art) {
      const ratio = `aspect-ratio: ${get(a, 'width')} / ${get(a, 'height')}`;
      const style = get(a, 'style');
      set(a, 'style', style ? `${style.replace(/;?\s*$/, '')}; ${ratio}` : ratio);
    }
    const out = `<picture>${artSources}${sources(rel, info.sizes)}${tag('img', a)}</picture>`;
    if (has(a, 'data-defer')) {
      if (info.hero) throw new Error(`${file}: the hero photo can't wait for data-defer`);
      return defer(out);
    }
    return out;
  });

  // 3. SVG <image> layers of the hero sequence: main.js sets href after the page loads (desktop only)
  html = html.replace(/<image\b([^>]*?)\/?>/g, (whole, attrsStr) => {
    const a = parseAttrs(attrsStr);
    const ref = get(a, 'href');
    if (!ref || !/images-src\//.test(ref)) return whole;
    const rel = original(ref, file);
    del(a, 'href');
    a.unshift(['data-href', url(pick(rel, 'webp', 2000))]);
    return tag('image', a, '/>');
  });

  // 4. Program picker links carry the photo to show: a fallback src plus a WebP srcset
  html = html.replace(/data-img="([^"]*images-src\/[^"]*)"/g, (whole, ref) => {
    const rel = original(ref, file);
    return `data-img="${url(pick(rel, fallbackFmt(rel)))}" data-srcset="${srcset(rel, 'webp')}"`;
  });

  return { html, heroes };
}

/* ---------- CSS and JS ---------- */
const built = {};   // "assets/css/styles.css" -> "/assets/css/styles.1a2b3c4d.css"
async function buildCss(rel) {
  let css = readFileSync(join(ROOT, rel), 'utf8');
  // Photo backgrounds: a JPEG/WebP fallback, then the same declaration with image-set() (AVIF first)
  css = css.replace(/([\w-]+)\s*:\s*([^;{}]*images-src\/[^;{}]*);/g, (whole, prop, value) => {
    const one = (fn) => value.replace(/url\(\s*"?([^")]*images-src\/[^")]+)"?\s*\)/g, (m, ref) => fn(original(ref, rel)));
    const w = (r) => CSS_WIDTH[r] || 1200;
    const plain = one((r) => `url("${url(pick(r, fallbackFmt(r), w(r)))}")`);
    const set = one((r) => `image-set(url("${url(pick(r, 'avif', w(r)))}") type("image/avif"), url("${url(pick(r, 'webp', w(r)))}") type("image/webp")` +
      (MANIFEST[r].alpha ? '' : `, url("${url(pick(r, 'jpg', w(r)))}") type("image/jpeg")`) + ')');
    return `${prop}: ${plain}; ${prop}: ${set};`;
  });
  const out = (await esbuild.transform(css, { loader: 'css', minify: true, target: ['chrome100', 'safari15', 'firefox100'] })).code;
  if (/images-src\//.test(out)) throw new Error(`${rel}: an images-src reference was not replaced`);
  const name = rel.replace(/\.css$/, `.${hash(out)}.css`);
  mkdirSync(dirname(join(DIST, name)), { recursive: true });
  writeFileSync(join(DIST, name), out);
  built[rel] = '/' + name;
  return out.length;
}
async function buildJs(rel) {
  const src = readFileSync(join(ROOT, rel), 'utf8');
  const out = (await esbuild.transform(src, { loader: 'js', minify: true, target: 'es2017' })).code;
  const name = rel.replace(/\.js$/, `.${hash(out)}.js`);
  mkdirSync(dirname(join(DIST, name)), { recursive: true });
  writeFileSync(join(DIST, name), out);
  built[rel] = '/' + name;
  return out.length;
}

/* ---------- Pages ---------- */
function resolveAsset(ref, file) {
  // "../assets/css/styles.css" seen from en/x.html -> "assets/css/styles.css"
  if (/^https?:/.test(ref)) return null;
  const abs = ref.startsWith('/') ? ref.slice(1) : posix.normalize(posix.join(posix.dirname(file), ref));
  return abs;
}

function fontsFor(html, file) {
  const links = [...html.matchAll(/<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)">\n?/g)];
  const rules = [];
  for (const [, href] of links) {
    const list = FONTS[href.replace(/&amp;/g, '&')];
    if (!list) throw new Error(`${file}: no self-hosted fonts for ${href} (run scripts/fetch-fonts.mjs)`);
    for (const r of list) if (!rules.some((x) => x.css === r.css)) rules.push({ ...r });
  }
  if (file.startsWith('en/')) {
    for (let i = rules.length - 1; i >= 0; i--) {
      const r = rules[i];
      // English pages show Arabic only in the language switch, which the device's own Arabic font draws:
      // no Amiri at all, so an English page never downloads an Arabic font
      // Noto Sans Nabataean only sets Nabataean letters here; its Latin files would be fetched just for the
      // spaces between words, which the fallback font draws identically
      if (r.family === 'Amiri' || (r.family === 'Noto Sans Nabataean' && /^latin/.test(r.subset))) rules.splice(i, 1);
    }
  }
  const fallbacks = [...new Set(rules.map((r) => r.family))].map((fam) => FALLBACKS[fam] || '').join('');
  // Fonts only text further down the page uses: their rules go in a stylesheet that main.js switches on
  // once the page has loaded (without JavaScript, the <noscript> copy applies straight away)
  const lateTest = LATE_FONTS.find(([re]) => re.test(file))?.[1];
  const late = lateTest ? rules.filter(lateTest) : [];
  const minify = (list) => list.map((r) => r.css.replace(/\s*([{};:,])\s*/g, '$1')).join('');
  const lateStyle = late.length ? `<style id="late-fonts" media="print">${minify(late)}</style><noscript><style>${minify(late)}</style></noscript>` : '';
  const prefixes = FONT_PRELOAD.find(([re]) => re.test(file))[1];
  const preload = prefixes.map((p) => rules.find((r) => r.file.startsWith(p))).filter(Boolean)
    .map((r) => `<link rel="preload" as="font" type="font/woff2" href="/assets/fonts/${r.file}" crossorigin>`);
  const style = `<style>${minify(rules.filter((r) => !late.includes(r)))}${fallbacks}</style>${lateStyle}`;
  return { links, style, preload };
}

async function buildPage(srcPath, beasties) {
  const file = posixRel(srcPath);                        // en/index.html
  currentFile = file;
  let html = readFileSync(srcPath, 'utf8');
  // (not when the hero is preloaded on wide screens only: on phones the wordmark is still the largest thing)
  pageHasHero = /<img\b[^>]*\bfetchpriority="high"/.test(html) && !PRELOAD_MEDIA[file];

  // Images
  const { html: h1, heroes } = processImages(html, file);
  html = h1;

  // Fonts: self-hosted rules in place of the Google Fonts links; drop the Google preconnects
  const f = fontsFor(html, file);
  html = html.replace(/\s*<link rel="preconnect" href="https:\/\/fonts\.(googleapis|gstatic)\.com"( crossorigin)?>/g, '');
  f.links.forEach(([whole], i) => { html = html.replace(whole, i === 0 ? f.style + '\n' : ''); });

  // Stylesheets and scripts: minified, fingerprinted copies
  html = html.replace(/<link rel="stylesheet" href="([^"]+\.css)">/g, (whole, href) => {
    const rel = resolveAsset(href, file);
    if (!rel || !built[rel]) throw new Error(`${file}: unknown stylesheet ${href}`);
    return `<link rel="stylesheet" href="${built[rel]}">`;
  });
  html = html.replace(/<script src="([^"]+\.js)"( defer| async)?><\/script>/g, (whole, src, mode = '') => {
    const rel = resolveAsset(src, file);
    if (!rel || !built[rel]) throw new Error(`${file}: unknown script ${src}`);
    return `<script src="${built[rel]}"${mode || ' defer'}></script>`;
  });

  // Hero preload (one per page), font preloads and the tag manager's connections, straight after the viewport tag
  const preloads = [];
  if (heroes.length) {
    const pre = ({ rel, sizes, media }) => `<link rel="preload" as="image" type="image/avif" imagesrcset="${srcset(rel, 'avif')}" imagesizes="${sizes}" fetchpriority="high"${media ? ` media="${media}"` : ''}>`;
    preloads.push(...heroes[0].list.map(pre));
  }
  preloads.push(...f.preload);
  if (html.includes('googletagmanager.com/gtm.js')) preloads.push(...PRECONNECT.map((o) => `<link rel="preconnect" href="${o}">`));
  html = html.replace(/(<meta name="viewport"[^>]*>\n)/, (m) => m + preloads.map((p) => '  ' + p + '\n').join(''));

  // Critical CSS inline, the rest loaded without blocking. Selectors that need html.js are matched by
  // adding the class for the analysis only (the page's own script adds it for real).
  const marked = html.replace(/<html lang="([^"]+)" dir="([^"]+)">/, '<html lang="$1" dir="$2" class="js">');
  let out = await beasties.process(marked);
  out = out.replace(/<html lang="([^"]+)" dir="([^"]+)" class="js">/, '<html lang="$1" dir="$2">');
  // Beasties writes an empty alt="" as a bare `alt`; valid HTML, but crawlers (Bing) report it as missing
  out = out.replace(/<img\b[^>]*>/g, (t) => t.replace(/(\s)alt(?=[\s>\/])/, '$1alt=""'));

  if (/images-src\//.test(out)) throw new Error(`${file}: an images-src reference was not replaced`);
  if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(out)) throw new Error(`${file}: Google Fonts reference left`);
  const robots = [...out.matchAll(/<meta\b[^>]*name\s*=\s*["']?(robots|googlebot)["']?[^>]*>/gi)].map((m) => m[0]);
  if (robots.some((m) => /noindex/i.test(m)) && !NOINDEX_ALLOWED.has(file.replace(/^[a-z]{2}\//, ''))) {
    throw new Error(`${file}: has a robots noindex tag; public pages must stay indexable`);
  }
  mkdirSync(dirname(join(DIST, file)), { recursive: true });
  writeFileSync(join(DIST, file), out);
  return { file, bytes: Buffer.byteLength(out), heroes: heroes.map((x) => x.rel) };
}

/* ---------- Run ---------- */
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// Static files
for (const f of ['index.html', 'robots.txt', 'site.webmanifest', 'sitemap.xml']) if (existsSync(join(ROOT, f))) copy(join(ROOT, f), join(DIST, f));
for (const f of walk(join(ROOT, 'assets', 'img'))) copy(f, join(DIST, posixRel(f)));
for (const f of walk(join(ROOT, 'assets', 'fonts')).filter((p) => p.endsWith('.woff2'))) copy(f, join(DIST, posixRel(f)));

// CSS and JS
for (const f of walk(join(ROOT, 'assets', 'css')).filter((p) => p.endsWith('.css'))) await buildCss(posixRel(f));
for (const f of walk(join(ROOT, 'assets', 'js')).filter((p) => p.endsWith('.js'))) await buildJs(posixRel(f));

// Pages
const beasties = new Beasties({
  path: DIST,
  publicPath: '/',
  preload: 'media',
  noscriptFallback: true,
  pruneSource: false,
  reduceInlineStyles: false,
  mergeStylesheets: true,
  inlineFonts: false,
  preloadFonts: false,
  keyframes: 'critical',
  compress: true,
  logLevel: 'warn',
  // shown by scripts soon after load: the cookie banner and the open mobile menu
  allowRules: [/\.consent/, /is-open/, /menu-open/, /consent-open/]
});
const pages = walk(join(ROOT, 'en')).filter((p) => p.endsWith('.html'));
let total = 0;
for (const p of pages) {
  const r = await buildPage(p, beasties);
  total += r.bytes;
}
console.log(`dist: ${pages.length} pages (${Math.round(total / 1024)} KiB of HTML), ${Object.keys(built).length} CSS/JS files minified`);
