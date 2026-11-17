// Jordan Odyssey: what the build scripts share, so the sitemap and each page's canonical
// address always agree.

import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
export const SITE = 'https://www.jordanodyssey.com';
export const SITE_NAME = 'Jordan Odyssey';
export const LANGS = ['en', 'ar'];                       // the first language is the x-default
export const LOCALES = { en: 'en_US', ar: 'ar_AR' };
export const DIRS = { en: 'ltr', ar: 'rtl' };

/** Every .html file under a folder, deepest last. */
export function pagesIn(dir) {
  let out = [];
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out = out.concat(pagesIn(p));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

/** Every page of every language: { lang, rel ("programs/petra.html"), file }. */
export function allPages() {
  const list = [];
  for (const lang of LANGS) {
    for (const file of pagesIn(join(ROOT, lang))) {
      list.push({ lang, file, rel: relative(join(ROOT, lang), file).split(sep).join('/') });
    }
  }
  return list;
}

/** False for pages with a robots/googlebot "noindex" tag or an instant meta-refresh redirect. */
export function isIndexable(html) {
  const metas = html.match(/<meta\b[^>]*>/gi) || [];
  return !metas.some((m) =>
    (/name\s*=\s*["']?(robots|googlebot)["']?/i.test(m) && /content\s*=\s*["'][^"']*noindex/i.test(m)) ||
    /http-equiv\s*=\s*["']?refresh["']?/i.test(m));
}

/** The public address of a page: a language's homepage is /en/, other pages keep the address the site links to. */
export function urlFor(lang, rel) {
  return `${SITE}/${lang}/${rel === 'index.html' ? '' : rel}`;
}
