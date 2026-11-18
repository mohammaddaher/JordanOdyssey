// Jordan Odyssey: writes the search and sharing tags into every page's <head>:
// canonical, web manifest, Open Graph, X (Twitter) card and JSON-LD structured data.
//
// Everything comes from the page itself, so it stays in step with what visitors see:
//   <title> and meta description, the <h1>, the visible breadcrumb, a program's starting price and
//   its day-by-day itinerary. Share images come from assets/img/share/share-images.json
//   (made by scripts/make-share-images.py); pages without their own image use the default one.
// The tags sit between <!-- seo:start --> and <!-- seo:end --> right after the meta description
// and are replaced on every run. It also sets <html lang dir> from the page's language folder.
//
// Vercel runs it on every deploy before the sitemap (see "buildCommand" in vercel.json), so new
// pages, including /ar/ pages, get their tags automatically. Run it by hand with:
//   node scripts/build-head.mjs            (writes the pages)
//   node scripts/build-head.mjs --check    (only reports problems)

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, SITE, SITE_NAME, LANGS, LOCALES, DIRS, allPages, isIndexable, urlFor } from './site.mjs';

const CHECK_ONLY = process.argv.includes('--check');
// The only pages allowed to carry a robots "noindex" tag (paths inside a language folder).
// Anywhere else it stops the deploy, so the live site keeps its indexable pages.
const NOINDEX_ALLOWED = new Set(['404.html', 'thank-you.html']);
const START = '<!-- seo:start: written by scripts/build-head.mjs; edit the <title>, meta description or page content instead -->';
const END = '<!-- seo:end -->';
const BLOCK_RE = /[ \t]*<!-- seo:start[\s\S]*?<!-- seo:end -->\n?/;

const LOGO = { url: `${SITE}/assets/img/brand/logo.png`, width: 440, height: 563 };
const ORG_ID = `${SITE}/#organization`;
const SITE_ID = `${SITE}/#website`;

let share = {};
try { share = JSON.parse(readFileSync(join(ROOT, 'assets/img/share/share-images.json'), 'utf8')); }
catch { console.warn('head: assets/img/share/share-images.json missing; pages will have no share image'); }

/* ---------- reading the page ---------- */

function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|#39);/gi, (m, e) => {
    const k = e.toLowerCase();
    if (k[0] === '#') return String.fromCodePoint(k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[k];
  });
}
const text = (html) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const first = (html, re) => { const m = html.match(re); return m ? m[1] : ''; };

function readPage(html) {
  const title = text(first(html, /<title>([\s\S]*?)<\/title>/i));
  const description = decode(first(html, /<meta\s+name="description"\s+content="([^"]*)"/i)).trim();
  const h1 = text(first(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i));
  // a short name for the breadcrumb when the heading is a headline: <main data-breadcrumb="About">
  const crumbName = decode(first(html, /<main\b[^>]*\bdata-breadcrumb="([^"]*)"/i)).trim();
  const crumbs = [];
  const nav = first(html, /<nav\b[^>]*aria-label="Breadcrumb"[^>]*>([\s\S]*?)<\/nav>/i);
  for (const li of nav.match(/<li\b[^>]*>[\s\S]*?<\/li>/gi) || []) {
    // an icon-only link (the About page's home icon) is named by its aria-label
    crumbs.push({ name: text(li) || decode(first(li, /aria-label="([^"]*)"/i)).trim(), href: first(li, /href="([^"]*)"/i) });
  }
  return { title, description, h1, crumbName, crumbs };
}

function readProgram(html) {
  const priceText = text(first(html, /class="program-facts-price"[^>]*>([\s\S]*?)<\/span>/i)) ||
    text(first(html, /class="program-hero-price"[^>]*>([\s\S]*?)<\/p>/i));
  const price = priceText.match(/USD\s*([\d,]+(?:\.\d+)?)/i);
  const days = [];
  for (const li of html.match(/<li class="itinerary-day[^"]*">[\s\S]*?<\/li>/gi) || []) {
    days.push({
      num: text(first(li, /class="itinerary-num"[^>]*>([\s\S]*?)<\/p>/i)).replace(/\D+/g, ''),
      title: text(first(li, /class="itinerary-title"[^>]*>([\s\S]*?)<\/h3>/i)),
      stay: text(first(li, /class="itinerary-stay"[^>]*>[\s\S]*?<b>([\s\S]*?)<\/b>/i)),
      text: text(first(li, /class="itinerary-text"[^>]*>([\s\S]*?)<\/p>/i))
    });
  }
  return { price: price ? price[1].replace(/,/g, '') : '', days };
}

/* ---------- writing the tags ---------- */

function kindOf(rel) {
  if (rel === 'index.html') return 'home';
  if (rel === 'destinations/index.html') return 'destinations';
  if (rel.startsWith('destinations/')) return 'destination';
  if (rel.startsWith('programs/')) return 'program';
  return 'page';
}

function shareFor(rel) {
  const s = share[rel] || share['*'];
  if (!s || !existsSync(join(ROOT, s.image))) return null;
  return { ...s, url: `${SITE}/${s.image}` };
}

function breadcrumb(lang, rel, page, url) {
  const home = urlFor(lang, 'index.html');
  let items;
  if (page.crumbs.length >= 2) {
    // the breadcrumb the visitor sees; the last item is this page
    items = page.crumbs.map((c, i) => ({
      name: c.name,
      url: i === page.crumbs.length - 1 ? url : new URL(c.href || '', url).href
    }));
  } else {
    items = [{ name: 'Home', url: home }];
    if (rel.startsWith('destinations/') && rel !== 'destinations/index.html') {
      items.push({ name: 'Destinations', url: urlFor(lang, 'destinations/index.html') });
    }
    items.push({ name: page.crumbName || page.h1 || page.title.replace(/\s*\|.*$/, ''), url });
  }
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url }))
  };
}

function structuredData(lang, rel, kind, page, url, img, html) {
  const graph = [
    {
      '@type': 'Organization',
      '@id': ORG_ID,
      name: SITE_NAME,
      url: `${SITE}/en/`,
      logo: { '@type': 'ImageObject', url: LOGO.url, width: LOGO.width, height: LOGO.height }
    },
    {
      '@type': 'WebSite',
      '@id': SITE_ID,
      name: SITE_NAME,
      url: `${SITE}/en/`,
      inLanguage: LANGS.filter((l) => existsSync(join(ROOT, l))),
      publisher: { '@id': ORG_ID }
    }
  ];
  if (kind !== 'home') graph.push(breadcrumb(lang, rel, page, url));

  if (kind === 'destination') {
    graph.push({
      '@type': 'TouristDestination',
      name: page.h1,
      description: page.description,
      url,
      ...(img ? { image: img.url } : {}),
      containedInPlace: { '@type': 'Country', name: 'Jordan' }
    });
  }
  if (kind === 'program') {
    const p = readProgram(html);
    const slug = rel.replace(/^programs\//, '').replace(/\.html$/, '');
    const trip = {
      '@type': 'TouristTrip',
      name: page.h1,
      description: page.description,
      url,
      ...(img ? { image: img.url } : {}),
      provider: { '@id': ORG_ID },
      itinerary: {
        '@type': 'ItemList',
        numberOfItems: p.days.length,
        itemListElement: p.days.map((d, i) => ({
          '@type': 'ListItem',
          position: Number(d.num) || i + 1,
          name: `Day ${d.num || i + 1}: ${d.title}`,
          ...(d.text ? { description: d.stay ? `${d.text} Overnight: ${d.stay}.` : d.text } : {})
        }))
      }
    };
    if (p.price) {
      trip.offers = {
        '@type': 'Offer',
        price: p.price,
        priceCurrency: 'USD',
        description: 'Starting price per person',
        url: `${urlFor(lang, 'enquire.html')}?program=${slug}`,
        seller: { '@id': ORG_ID }
      };
    }
    graph.push(trip);
  }
  // "</" can't appear inside a <script>
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2).replace(/</g, '\\u003c');
}

function block(lang, rel, html, indexable) {
  const page = readPage(html);
  const kind = kindOf(rel);
  const url = urlFor(lang, rel);
  const img = shareFor(rel);
  const ogTitle = kind === 'home' ? page.title : page.title.replace(/\s*\|\s*Jordan Odyssey\s*$/, '');
  const arOrEn = LANGS.filter((l) => l !== lang && existsSync(join(ROOT, l, rel)));
  const lines = [START];
  if (indexable) lines.push(`<link rel="canonical" href="${attr(url)}">`);
  lines.push('<link rel="manifest" href="/site.webmanifest">');
  lines.push(
    `<meta property="og:type" content="${kind === 'home' ? 'website' : 'article'}">`,
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta property="og:title" content="${attr(ogTitle)}">`,
    `<meta property="og:description" content="${attr(page.description)}">`,
    `<meta property="og:url" content="${attr(url)}">`,
    `<meta property="og:locale" content="${LOCALES[lang] || lang}">`,
    ...arOrEn.map((l) => `<meta property="og:locale:alternate" content="${LOCALES[l] || l}">`)
  );
  if (img) {
    lines.push(
      `<meta property="og:image" content="${attr(img.url)}">`,
      `<meta property="og:image:width" content="${img.width}">`,
      `<meta property="og:image:height" content="${img.height}">`,
      `<meta property="og:image:alt" content="${attr(img.alt)}">`
    );
  }
  lines.push(
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${attr(ogTitle)}">`,
    `<meta name="twitter:description" content="${attr(page.description)}">`
  );
  if (img) lines.push(`<meta name="twitter:image" content="${attr(img.url)}">`, `<meta name="twitter:image:alt" content="${attr(img.alt)}">`);
  lines.push('<script type="application/ld+json">', structuredData(lang, rel, kind, page, url, img, html), '</script>', END);
  return { page, text: lines.map((l) => l.split('\n').map((x) => '  ' + x).join('\n')).join('\n') + '\n' };
}

/* ---------- run ---------- */

const problems = [];
const blocked = [];
const seen = { title: new Map(), description: new Map() };
let changed = 0;
for (const { lang, rel, file } of allPages()) {
  try {
    const raw = readFileSync(file, 'utf8');
    const crlf = raw.includes('\r\n');
    let html = raw.replace(/\r\n/g, '\n');
    const indexable = isIndexable(html);
    const { page, text: tags } = block(lang, rel, html.replace(BLOCK_RE, ''), indexable);
    const where = `${lang}/${rel}`;
    const robots = html.match(/<meta\b[^>]*name\s*=\s*["']?(robots|googlebot)["']?[^>]*>/gi) || [];
    if (robots.some((m) => /noindex/i.test(m)) && !NOINDEX_ALLOWED.has(rel)) {
      blocked.push(`${where} has a robots "noindex" tag; remove it, or add the page to NOINDEX_ALLOWED in scripts/build-head.mjs`);
    }

    if (!page.title) problems.push(`${where}: missing <title>`);
    else if (page.title.length > 60) problems.push(`${where}: title is ${page.title.length} characters (aim for 60 or fewer)`);
    if (!page.description) problems.push(`${where}: missing meta description`);
    else if (page.description.length > 155) problems.push(`${where}: description is ${page.description.length} characters (aim for 155 or fewer)`);
    for (const k of ['title', 'description']) {
      if (!page[k]) continue;
      if (seen[k].has(page[k])) problems.push(`${where}: same ${k} as ${seen[k].get(page[k])}`);
      else seen[k].set(page[k], where);
    }

    // <html lang dir> follows the language folder
    html = html.replace(/<html\b[^>]*>/i, `<html lang="${lang}" dir="${DIRS[lang] || 'ltr'}">`);
    // (functions, so a "$" in the page text is never read as a replacement pattern)
    if (BLOCK_RE.test(html)) html = html.replace(BLOCK_RE, () => tags);
    else if (/<meta\s+name="description"[^>]*>\n/i.test(html)) html = html.replace(/(<meta\s+name="description"[^>]*>\n)/i, (m) => m + tags);
    else html = html.replace(/<\/head>/i, (m) => tags + m);

    const out = crlf ? html.replace(/\n/g, '\r\n') : html;
    if (out !== raw) {
      if (CHECK_ONLY) problems.push(`${where}: tags are out of date (run node scripts/build-head.mjs)`);
      else { writeFileSync(file, out); changed++; }
    }
  } catch (e) {
    problems.push(`${lang}/${rel}: not updated (${e && e.message})`);
  }
}
for (const p of problems) console.warn('head: ' + p);
console.log(`head: ${CHECK_ONLY ? 'checked' : `updated ${changed}`} page(s), ${problems.length} problem(s)`);
if (blocked.length) {
  for (const b of blocked) console.error('head: STOPPED: ' + b);
  console.error('head: deploy stopped so the live site stays indexable');
  process.exit(1);
}
