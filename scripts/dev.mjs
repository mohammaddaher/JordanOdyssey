// Local preview that keeps up with your edits: `npm run dev`, then open http://127.0.0.1:8080/en/
// Builds dist/ once, serves it, and rebuilds it whenever a page, stylesheet, script or original image
// changes. Pages are sent with no-cache, so a normal reload always shows the latest build.
// It doesn't run build-head (it rewrites the pages' <head>) or build-sitemap; `npm run build` does those.
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, watch } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const PORT = +(process.env.PORT || 8080);
const WATCH = ['en', 'ar', 'assets/css', 'assets/js', 'images-src'];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp4': 'video/mp4'
};

const run = (script) => spawnSync(process.execPath, [join(ROOT, 'scripts', script)], { cwd: ROOT, encoding: 'utf8' });
function build(images) {
  const t = Date.now();
  for (const s of [...(images ? ['build-images.mjs'] : []), 'build-dist.mjs']) {
    const r = run(s);
    if (r.status !== 0) {
      console.error(`\n✗ ${s} failed; the preview still shows the last good build\n${(r.stderr || r.stdout).trim()}\n`);
      return;
    }
  }
  console.log(`✓ rebuilt in ${((Date.now() - t) / 1000).toFixed(1)} s (${new Date().toLocaleTimeString()})`);
}

build(true);

// Rebuild once a burst of saves has settled
let timer, images = false;
for (const dir of WATCH) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) continue;
  watch(abs, { recursive: true }, (_e, file) => {
    // skip editors' and tools' temporary files
    if (!file || /(^|[\\/])\.|~$|\.tmp$|(^|[\\/])sed\w{6}$/.test(file)) return;
    if (dir === 'images-src') images = true;
    console.log(`  changed: ${dir}/${String(file).split(sep).join('/')}`);
    clearTimeout(timer);
    timer = setTimeout(() => { const i = images; images = false; build(i); }, 250);
  });
}

// The fixed-address redirects from vercel.json, so they can be tried here before a deploy
function redirectFor(path) {
  try {
    const { redirects = [] } = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
    return redirects.find((r) => r.source === path && !/[:(*]/.test(r.source));
  } catch { return null; }
}

createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const r = redirectFor(path);
  if (r) { res.writeHead(r.statusCode || (r.permanent === false ? 307 : 308), { Location: r.destination }).end(); return; }
  let file = normalize(join(DIST, path));
  if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!path.endsWith('/')) { res.writeHead(301, { Location: path + '/' }).end(); return; }
    file = join(file, 'index.html');
  }
  if (!existsSync(file)) {
    const notFound = join(DIST, '404.html');
    res.writeHead(404, { 'Content-Type': TYPES['.html'] }).end(existsSync(notFound) ? readFileSync(notFound) : 'Not found');
    return;
  }
  const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
  // fingerprinted files (name.1a2b3c4d.ext) never change; everything else is checked on every load
  const cache = /\.[0-9a-f]{8}\.\w+$/.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache }).end(readFileSync(file));
}).listen(PORT, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${PORT}/en/  (watching ${WATCH.join(', ')})`));
