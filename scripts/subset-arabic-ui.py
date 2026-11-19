"""English pages show Arabic only in the language switch ("العربية"). Instead of the full 106 KB Amiri
Arabic font, they get a tiny subset with just the Arabic letters used on English pages (with their joining
forms). Writes assets/fonts/amiri-normal-400-arabic-ui.<hash>.woff2 and assets/fonts/arabic-ui.json.
scripts/build-dist.mjs uses it for /en/ pages and stops the build if an English page needs a letter it lacks;
then run this again. Needs fontTools and brotli: pip install fonttools brotli
Run: python scripts/subset-arabic-ui.py
"""
import glob, hashlib, json, os, re
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, 'assets', 'fonts')
ARABIC = re.compile(r'[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]')

chars = set()
for p in glob.glob(os.path.join(ROOT, 'en', '**', '*.html'), recursive=True):
    chars |= set(ARABIC.findall(open(p, encoding='utf-8').read()))
text = ''.join(sorted(chars))

full = [f for f in os.listdir(FONTS) if f.startswith('amiri-normal-400-arabic.') and f.endswith('.woff2')][0]
font = TTFont(os.path.join(FONTS, full))
opts = subset.Options()
opts.flavor = 'woff2'
opts.layout_features = ['*']          # keep Arabic joining (init, medi, fina, rlig, ...)
opts.name_IDs = ['*']
s = subset.Subsetter(opts)
s.populate(text=text)
s.subset(font)
tmp = os.path.join(FONTS, 'arabic-ui.tmp.woff2')
font.flavor = 'woff2'
font.save(tmp)
data = open(tmp, 'rb').read()
name = f'amiri-normal-400-arabic-ui.{hashlib.sha256(data).hexdigest()[:8]}.woff2'
for old in glob.glob(os.path.join(FONTS, 'amiri-normal-400-arabic-ui.*.woff2')):
    os.remove(old)
os.replace(tmp, os.path.join(FONTS, name))
json.dump({'file': name, 'chars': text}, open(os.path.join(FONTS, 'arabic-ui.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print(f'{name}: {len(data)} bytes for {len(text)} letters')
