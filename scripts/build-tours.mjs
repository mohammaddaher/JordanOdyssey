// Jordan Odyssey: writes the "Tours that include …" list on each destination page from the program pages,
// so the list, the durations and the prices always match the programs themselves.
//
// A destination page asks for the list with
//   <section … data-tours-place="Petra"> … <!-- tours:start --><!-- tours:end --> … </section>
// and gets every program of the same language whose "Places visited" list (<dd class="program-places">,
// names separated by "·") includes that name, shortest first. Each item takes its words from the program
// page: its name (<h1>), its length (.place-duration) and its starting price (.program-hero-price), so an
// Arabic page gets an Arabic list from the Arabic programs, with no text in this script.
//
// Runs in `npm run build` before build-head. Run it by hand with:
//   node scripts/build-tours.mjs            (writes the pages)
//   node scripts/build-tours.mjs --check    (only reports pages that are out of date)

import { readFileSync, writeFileSync } from 'node:fs';
import { allPages } from './site.mjs';

const CHECK_ONLY = process.argv.includes('--check');
const LIST_RE = /<!-- tours:start -->[\s\S]*?<!-- tours:end -->/;

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
const text = (html) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const first = (html, re) => { const m = html.match(re); return m ? m[1] : ''; };
// "8 days, 7 nights" -> 8 (also with Arabic-Indic digits)
const number = (s) => parseInt(s.replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x660).replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x6f0).match(/\d+/)?.[0] || '0', 10);

const pages = allPages();
const problems = [];

// The programs of each language
const programs = {};
for (const { lang, rel, file } of pages) {
  if (!rel.startsWith('programs/')) continue;
  const html = readFileSync(file, 'utf8');
  const p = {
    rel,
    name: text(first(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i)),
    duration: text(first(html, /class="place-duration"[^>]*>([\s\S]*?)<\/span>/i)),
    price: text(first(html, /class="program-hero-price"[^>]*>([\s\S]*?)<\/p>/i)),
    places: text(first(html, /<dd class="program-places"[^>]*>([\s\S]*?)<\/dd>/i)).split(/\s*·\s*/).filter(Boolean)
  };
  for (const k of ['name', 'duration', 'price']) if (!p[k]) problems.push(`${lang}/${rel}: no ${k} found for the destination pages' tour lists`);
  if (!p.places.length) problems.push(`${lang}/${rel}: no <dd class="program-places"> list`);
  p.price = p.price.replace(/\s*\.$/, '');
  p.sort = [number(p.duration), number(p.price.replace(/,/g, ''))];
  (programs[lang] ||= []).push(p);
}

let changed = 0;
for (const { lang, rel, file } of pages) {
  const raw = readFileSync(file, 'utf8');
  const place = decode(first(raw, /\bdata-tours-place="([^"]*)"/));
  if (!place) continue;
  if (!LIST_RE.test(raw)) { problems.push(`${lang}/${rel}: data-tours-place without <!-- tours:start --><!-- tours:end -->`); continue; }
  const list = (programs[lang] || []).filter((p) => p.places.includes(place))
    .sort((a, b) => a.sort[0] - b.sort[0] || a.sort[1] - b.sort[1] || a.name.localeCompare(b.name));
  if (!list.length) problems.push(`${lang}/${rel}: no program lists "${place}" in its places`);
  const depth = rel.split('/').length - 1;
  const up = '../'.repeat(depth);
  const indent = (raw.match(/\n([ \t]*)<!-- tours:start -->/) || ['', ''])[1];
  const items = list.map((p) =>
    `${indent}  <li class="dg-tours-item"><a class="dg-tours-name" href="${up}${p.rel}">${esc(p.name)}</a>` +
    `<span class="dg-tours-meta">${esc(p.duration)} · ${esc(p.price)}</span></li>`);
  const block = `<!-- tours:start -->\n${indent}<ul class="dg-tours-list">\n${items.join('\n')}\n${indent}</ul>\n${indent}<!-- tours:end -->`;
  const crlf = raw.includes('\r\n');
  const out0 = raw.replace(/\r\n/g, '\n').replace(LIST_RE, () => block);
  const out = crlf ? out0.replace(/\n/g, '\r\n') : out0;
  if (out !== raw) {
    if (CHECK_ONLY) problems.push(`${lang}/${rel}: tour list is out of date (run node scripts/build-tours.mjs)`);
    else { writeFileSync(file, out); changed++; }
  }
}
for (const p of problems) console.warn('tours: ' + p);
console.log(`tours: ${CHECK_ONLY ? 'checked' : `updated ${changed}`} page(s), ${problems.length} problem(s)`);
if (problems.length && !CHECK_ONLY) process.exit(1);
