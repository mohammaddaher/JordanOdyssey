// Jordan Odyssey: builds sitemap.xml at the site root from the pages in /en/ (and /ar/ once it exists).
// Vercel runs it on every deploy (see "buildCommand" in vercel.json). Run it by hand with:
//   node scripts/build-sitemap.mjs
//
// - Every .html page under each language folder is included, except pages with a robots "noindex"
//   tag or an instant meta-refresh redirect.
// - Addresses come from scripts/site.mjs, the same place each page's canonical tag comes from:
//   a language's homepage (/en/index.html) is listed as /en/, other pages keep the address the
//   site links to (for example /en/travel-guide/index.html).
// - <lastmod> is the date of the page's last git commit; without git history, the file's modified date.
// - When the same page exists in /en/ and /ar/, both entries get hreflang alternates
//   (en, ar, and x-default pointing to the English page).
// It never fails the deploy: if anything goes wrong it reports the error and leaves the build running.

import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, LANGS, allPages, isIndexable, urlFor } from './site.mjs';

const OUT = join(ROOT, 'sitemap.xml');

// Git dates need the full history; Vercel may clone only the latest commits, so ask for the rest first.
let gitOk = false;
try {
  execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: ROOT, stdio: 'pipe' });
  gitOk = true;
  const shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: ROOT, stdio: 'pipe' }).toString().trim();
  if (shallow === 'true') {
    try { execFileSync('git', ['fetch', '--unshallow', '--quiet'], { cwd: ROOT, stdio: 'pipe', timeout: 60000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }); }
    catch { console.warn('sitemap: shallow git history; dates of pages unchanged in recent commits may be too recent'); }
  }
} catch { /* not a git checkout: file dates are used */ }

function lastmod(file) {
  if (gitOk) {
    try {
      const d = execFileSync('git', ['log', '-1', '--format=%cs', '--', relative(ROOT, file)], { cwd: ROOT, stdio: 'pipe' }).toString().trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    } catch { /* fall through */ }
  }
  return statSync(file).mtime.toISOString().slice(0, 10);
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

try {
  // page key (path inside the language folder) -> { lang: { loc, lastmod } }
  const pages = new Map();
  for (const { lang, rel, file } of allPages()) {
    if (!isIndexable(readFileSync(file, 'utf8'))) { console.log(`sitemap: skipped ${lang}/${rel} (noindex or redirect)`); continue; }
    if (!pages.has(rel)) pages.set(rel, {});
    pages.get(rel)[lang] = { loc: urlFor(lang, rel), lastmod: lastmod(file) };
  }

  const keys = [...pages.keys()].sort((a, b) =>
    (a === 'index.html' ? -1 : b === 'index.html' ? 1 : 0) || a.split('/').length - b.split('/').length || a.localeCompare(b));
  const entries = [];
  for (const lang of LANGS) {
    for (const key of keys) {
      const versions = pages.get(key);
      const page = versions[lang];
      if (!page) continue;
      const langs = LANGS.filter((l) => versions[l]);
      let alt = '';
      if (langs.length > 1) {
        alt = langs.map((l) => `\n    <xhtml:link rel="alternate" hreflang="${l}" href="${esc(versions[l].loc)}"/>`).join('') +
          `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${esc((versions[LANGS[0]] || versions[langs[0]]).loc)}"/>`;
      }
      entries.push(`  <url>\n    <loc>${esc(page.loc)}</loc>\n    <lastmod>${page.lastmod}</lastmod>${alt}\n  </url>`);
    }
  }

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    entries.join('\n') + '\n</urlset>\n';
  writeFileSync(OUT, xml);
  console.log(`sitemap: wrote ${entries.length} URLs to sitemap.xml (${gitOk ? 'git' : 'file'} dates)`);
} catch (e) {
  console.error('sitemap: not generated:', e && e.message);
}
