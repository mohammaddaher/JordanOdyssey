"""Trim the self-hosted variable fonts to the weights the site uses.

Google serves each variable family with its whole weight axis (Source Serif 4: 200-900), but the site
only asks for the weights in assets/fonts/fonts.json (Source Serif 4: 400, 600 and 700). Limiting the axis
to that range makes the files a third smaller, and text at those weights looks the same: before replacing
a file this script checks every glyph's outline and advance at every weight in use, and keeps the original
unless every point stays within TOLERANCE font units (1.5 of 1000 units is 0.07 px on a 46 px heading;
the difference is rounding). Files that would shrink by less than MIN_SAVING are left alone too.

It then splits the first-screen fonts into the characters the site uses and the rest (see SPLIT below).

Run after scripts/fetch-fonts.mjs (which downloads fresh, untrimmed files):
    python scripts/trim-fonts.py
It rewrites the trimmed files under a new content hash and updates fonts.json. Needs fontTools + brotli.
"""
import hashlib
import io
import json
import os
import re

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
FONTS = os.path.join(ROOT, 'assets', 'fonts')
MANIFEST = os.path.join(FONTS, 'fonts.json')
TOLERANCE = 1.5     # font units, per axis
MIN_SAVING = 0.10   # a tenth of the file


def weights_in_use(manifest):
    used = {}
    for rules in manifest.values():
        for r in rules:
            w = re.search(r'font-weight:\s*(\d+)', r['css'])
            used.setdefault(r['file'], set()).add(int(w.group(1)))
    return used


def outlines(font, wght):
    """Glyph outlines and advances of a variable font instanced at one weight (other axes at default)."""
    inst = instancer.instantiateVariableFont(TTFont(io.BytesIO(font)), {'wght': wght}, static=False)
    glyf, hmtx = inst['glyf'], inst['hmtx']
    out = {}
    for name in inst.getGlyphOrder():
        g = glyf[name]
        coords = tuple(g.getCoordinates(glyf)[0]) if g.numberOfContours else ()
        out[name] = (coords, hmtx[name][0])
    return out


def main():
    manifest = json.load(open(MANIFEST, encoding='utf-8'))
    renamed = {}
    for file, weights in sorted(weights_in_use(manifest).items()):
        path = os.path.join(FONTS, file)
        font = TTFont(path)
        if 'fvar' not in font:
            continue
        axis = next((a for a in font['fvar'].axes if a.axisTag == 'wght'), None)
        lo, hi = min(weights), max(weights)
        if not axis or (axis.minValue >= lo and axis.maxValue <= hi):
            continue
        lo, hi = max(lo, axis.minValue), min(hi, axis.maxValue)
        default = min(max(axis.defaultValue, lo), hi)
        original = open(path, 'rb').read()
        trimmed = instancer.instantiateVariableFont(TTFont(io.BytesIO(original)), {'wght': (lo, default, hi)})
        trimmed.flavor = 'woff2'
        buf = io.BytesIO()
        trimmed.save(buf)
        data = buf.getvalue()
        if len(data) > len(original) * (1 - MIN_SAVING):
            print(f'{file}: left as it is (trimming saves only {(len(original) - len(data)) // 1024} KB)')
            continue
        # the same outlines at every weight in use (to within TOLERANCE font units: rounding), or leave the file alone
        bad = []
        for w in sorted(weights):
            a, b = outlines(original, w), outlines(data, w)
            bad = [n for n in a if n not in b or len(a[n][0]) != len(b[n][0]) or abs(a[n][1] - b[n][1]) > TOLERANCE or
                   max((max(abs(x1 - x2), abs(y1 - y2)) for (x1, y1), (x2, y2) in zip(a[n][0], b[n][0])), default=0) > TOLERANCE]
            if bad:
                print(f'{file}: left as it is (weight {w} would move {len(bad)} glyphs by more than {TOLERANCE} font units, e.g. {bad[:3]})')
                break
        if bad:
            continue
        name = re.sub(r'\.[0-9a-f]{8}\.woff2$', '', file) + '.' + hashlib.sha256(data).hexdigest()[:8] + '.woff2'
        open(os.path.join(FONTS, name), 'wb').write(data)
        if name != file:
            os.remove(path)
        renamed[file] = name
        print(f'{file}: wght {axis.minValue:g}-{axis.maxValue:g} -> {lo:g}-{hi:g}, {len(original) // 1024} KB -> {len(data) // 1024} KB -> {name}')
    for rules in manifest.values():
        for r in rules:
            if r['file'] in renamed:
                r['css'] = r['css'].replace(r['file'], renamed[r['file']])
                r['file'] = renamed[r['file']]
    print(f'{len(renamed)} font files trimmed')
    split(manifest)
    with open(MANIFEST, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
        f.write('\n')


# ---------- Split: the characters English pages use, and the rest ----------
# The fonts on the first screen of destination and program pages are split in two, the way Google splits
# fonts by script: a "core" file with the characters the site's English text uses, and a "rest" file with
# the remaining characters of the latin subset. Each @font-face lists its own characters in unicode-range,
# so a browser downloads the rest file only for a page that uses one of them: a new character in the copy
# still shows in the right font, at the cost of one more small download.
SPLIT = ['source-serif-4-normal-400-latin.', 'eb-garamond-normal-400-latin.', 'cinzel-normal-500-latin.']
CORE = set(range(0x20, 0x7F)) | {
    0xA0, 0xA9, 0xB0, 0xB7, 0xD7,                    # no-break space © ° · ×
    *map(ord, 'àâäçèéêëîïñôöùûü'),                  # accented letters in everyday English (café, façade, naïve)
    0x161, 0x2BE, 0x2BF,                             # š ʾ ʿ (transliterated Arabic and Nabataean names)
    0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026,   # – — ‘ ’ “ ” • …
    0x2190, 0x2191, 0x2192,                          # ← ↑ →
}


def ranges(points):
    out, pts = [], sorted(points)
    i = 0
    while i < len(pts):
        j = i
        while j + 1 < len(pts) and pts[j + 1] == pts[j] + 1:
            j += 1
        out.append(f'U+{pts[i]:04X}' if i == j else f'U+{pts[i]:04X}-{pts[j]:04X}')
        i = j + 1
    return ', '.join(out)


def subset_font(data, points):
    from fontTools import subset
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    opts.hinting = True
    font = TTFont(io.BytesIO(data))
    s = subset.Subsetter(opts)
    s.populate(unicodes=points)
    s.subset(font)
    buf = io.BytesIO()
    font.flavor = 'woff2'
    font.save(buf)
    return buf.getvalue()


def split(manifest):
    done = {}
    for rules in manifest.values():
        for i in range(len(rules) - 1, -1, -1):
            r = rules[i]
            prefix = next((p for p in SPLIT if r['file'].startswith(p)), None)
            if not prefix:
                continue
            if r['file'] not in done:
                path = os.path.join(FONTS, r['file'])
                data = open(path, 'rb').read()
                points = set(TTFont(io.BytesIO(data)).getBestCmap())
                parts = []
                for part, pts in (('core', points & CORE), ('rest', points - CORE)):
                    sub = subset_font(data, pts)
                    name = f'{prefix[:-1]}-{part}.{hashlib.sha256(sub).hexdigest()[:8]}.woff2'
                    open(os.path.join(FONTS, name), 'wb').write(sub)
                    parts.append((part, name, ranges(pts)))
                os.remove(path)
                done[r['file']] = parts
                print(f"{r['file']} ({len(data) // 1024} KB) -> " + ', '.join(
                    f'{n} ({os.path.getsize(os.path.join(FONTS, n)) // 1024} KB)' for _, n, _ in parts))
            new = []
            for part, name, urange in done[r['file']]:
                css = r['css'].replace(r['file'], name)
                css = re.sub(r'unicode-range:[^;}]*', f'unicode-range: {urange}', css)
                new.append({**r, 'subset': f"{r['subset']}-{part}", 'file': name, 'css': css})
            rules[i:i + 1] = new
    print(f'{len(done)} font files split')


if __name__ == '__main__':
    main()
