"""Size-adjusted fallback faces for the site's Latin fonts.

While a web font downloads (font-display: swap), the browser draws the text in a local font. These fallback
faces scale that local font (size-adjust) and set its line metrics (ascent/descent/line-gap-override) to match
the web font, so the text takes the same room in both and nothing moves when the web font arrives.

Two local fonts are matched, because phones and computers have different serif fonts:
  - Times New Roman (Windows and Mac; Liberation Serif and Tinos on Linux have the same metrics)
  - Noto Serif (Android)
Each fallback in TARGETS gets two faces, "<name>" and "<name> Android"; the CSS font stacks list both
after the web font. A face whose local() fonts are missing on a device is skipped, so each device uses
the one it has.

Run after scripts/trim-fonts.py, with the two local fonts:
    python scripts/font-fallbacks.py C:/Windows/Fonts/times.ttf path/to/NotoSerif-latin.woff2
It writes assets/fonts/fallbacks.json, which scripts/build-dist.mjs inlines next to the @font-face rules.
Needs fontTools + brotli.
"""
import json
import os
import sys

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
FONTS = os.path.join(ROOT, 'assets', 'fonts')
OUT = os.path.join(FONTS, 'fallbacks.json')

# Typical English text on the site: the widths are averaged over it, the way the letters actually occur
SAMPLE = ('Jordan Odyssey: journeys through Petra, Wadi Rum, the Dead Sea, Amman and Jerash. '
          'Places to explore, the best time to visit, how long to stay and what to see on the way. '
          'From USD 1,315 per person. Plan your trip with a local guide.')
# fallback name -> (web font family, the file whose metrics to match, the text to match widths on, optical size)
# Cinzel has no lowercase (its small letters are small capitals), so it needs two fallbacks: one for text in
# mixed case (--font-display, --font-ui) and one for text set in capitals (--font-caps).
# Source Serif 4 changes shape with the text size (its optical size axis follows the font size), and is
# narrower in headings than in running text: one fallback for text (17px, --dg-serif) and one for headings
# (21-46px, --dg-serif-head).
TARGETS = {
    'EB Garamond Fallback': ('EB Garamond', 'eb-garamond-normal-400-latin-core.', SAMPLE, None),
    'Cinzel Fallback': ('Cinzel', 'cinzel-normal-500-latin-core.', SAMPLE, None),
    'Cinzel Caps Fallback': ('Cinzel', 'cinzel-normal-500-latin-core.', SAMPLE.upper(), None),
    'Source Serif 4 Fallback': ('Source Serif 4', 'source-serif-4-normal-400-latin-core.', SAMPLE, 17),
    'Source Serif 4 Head Fallback': ('Source Serif 4', 'source-serif-4-normal-400-latin-core.', SAMPLE, 28),
}
# Figures get a face of their own (unicode-range U+30-39): Cinzel's and Source Serif's figures are much
# narrower, relative to their letters, than Times's
DIGITS = '0123456789'
LOCALS = {
    '': ["Times New Roman", "TimesNewRomanPSMT", "Liberation Serif", "Tinos"],
    ' Android': ["Noto Serif", "NotoSerif", "Droid Serif"],
}


def width(font, text):
    cmap, hmtx = font.getBestCmap(), font['hmtx']
    upm = font['head'].unitsPerEm
    return sum(hmtx[cmap[ord(c)]][0] for c in text if ord(c) in cmap) / upm


def metrics(font):
    upm = font['head'].unitsPerEm
    hhea = font['hhea']
    return hhea.ascent / upm, -hhea.descent / upm, hhea.lineGap / upm


def load(prefix, opsz):
    font = TTFont(os.path.join(FONTS, next(f for f in os.listdir(FONTS) if f.startswith(prefix))))
    if opsz:
        font = instancer.instantiateVariableFont(font, {'opsz': opsz})
    return font


def face(name, src, size, asc, desc, gap, urange=''):
    return (f'@font-face{{font-family:"{name}";src:{src};{urange}'
            f'size-adjust:{size * 100:.2f}%;ascent-override:{asc / size * 100:.2f}%;'
            f'descent-override:{desc / size * 100:.2f}%;line-gap-override:{gap / size * 100:.2f}%}}')


def main():
    times, noto = sys.argv[1:3]
    fallbacks = {'': TTFont(times), ' Android': TTFont(noto)}
    out = {}
    for name, (family, prefix, sample, opsz) in TARGETS.items():
        target = load(prefix, opsz)
        asc, desc, gap = metrics(target)
        report = []
        for suffix, fb in fallbacks.items():
            src = ', '.join(f'local("{n}")' for n in LOCALS[suffix])
            size = width(target, sample) / width(fb, sample)
            digits = width(target, DIGITS) / width(fb, DIGITS)
            # the figures' face comes second: of two faces that cover a character, the later one is used
            out[family] = out.get(family, '') + face(name + suffix, src, size, asc, desc, gap) + \
                face(name + suffix, src, digits, asc, desc, gap, 'unicode-range:U+30-39;')
            report.append(f'{size:.3f}, figures {digits:.3f} ({"Noto Serif" if suffix else "Times"})')
        print(f'{name}: size-adjust ' + '; '.join(report))
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(out, f, indent=1)
        f.write('\n')


if __name__ == '__main__':
    main()
