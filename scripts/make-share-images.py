"""Jordan Odyssey: makes the 1200x630 social sharing images (Open Graph / X cards) in assets/img/share/.

Each page listed below gets a crop of its hero photo; every other page uses default.jpg.
The list is also written to assets/img/share/share-images.json, which scripts/build-head.mjs
reads to fill og:image, og:image:alt and twitter:image.

Run it after adding or changing a share image:   python scripts/make-share-images.py
(needs Pillow:  pip install Pillow)
"""
import json
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'img', 'share')
W, H = 1200, 630
MAX_BYTES = 300 * 1024

# page (path inside the language folder) -> source photo, focus point (x %, y %), alt text
SHARE = {
    '*': ('photos/hero-petra-treasury.jpg', (50, 52), 'The Treasury of Petra, carved into a rose-red cliff face', 'default'),

    'destinations/index.html': ('discover/petra-theatre-wide.jpg', (50, 50), 'The theatre and carved tombs of Petra in rose-red sandstone', 'destinations'),
    'destinations/amman.html': ('sights/amman-citadel.jpg', (50, 50), 'The Temple of Hercules on Amman Citadel, above the white houses of the city’s hills', 'destination-amman'),
    'destinations/aqaba.html': ('sights/aqaba-beach.jpg', (50, 55), 'A sandy beach on the turquoise Red Sea coast near Aqaba', 'destination-aqaba'),
    'destinations/dead-sea.html': ('discover/dead-sea-sunset.jpg', (50, 50), 'The sun setting over the Dead Sea, with beach umbrellas on the shore', 'destination-dead-sea'),
    'destinations/jerash.html': ('sights/jerash-oval-plaza.jpg', (50, 50), 'The Oval Plaza in Jerash, ringed by Roman columns', 'destination-jerash'),
    'destinations/petra.html': ('sights/petra-siq-treasury.jpg', (50, 50), 'The Treasury in Petra, glimpsed at the end of the narrow Siq', 'destination-petra'),
    'destinations/wadi-rum.html': ('discover/wadi-rum.jpg', (50, 55), 'Sandstone mountains rising from the red sand of Wadi Rum', 'destination-wadi-rum'),

    'about.html': ('discover/wadi-rum.jpg', (50, 58), 'Sandstone mountains rising from the warm red sand of Wadi Rum', 'about'),

    # travel guide articles
    'travel-guide/best-time-to-visit-jordan.html': ('sights/petra-monastery.jpg', (50, 40), 'The Monastery (Ad Deir) in Petra under a clear blue sky, for a guide to the best time to visit Jordan', 'guide-best-time-to-visit-jordan'),

    # program pages: the same photo and focus point as the page's hero
    'programs/best-of-jordan.html': ('discover/aqaba.jpg', (50, 62), 'The Gulf of Aqaba at dusk, with the city’s tall flagpole and the mountains behind', 'program-best-of-jordan'),
    'programs/grand-jordan.html': ('photos/hero-petra-treasury.jpg', (50, 58), 'The Treasury of Petra, carved into a rose-red cliff face', 'program-grand-jordan'),
    'programs/jordan-delights-1.html': ('discover/jerash.jpg', (50, 60), 'The colonnaded Oval Plaza of Roman Jerash', 'program-jordan-delights-1'),
    'programs/jordan-delights-2.html': ('discover/dead-sea.jpg', (70, 50), 'Swimmers floating on the still, pale water of the Dead Sea', 'program-jordan-delights-2'),
    'programs/jordan-discovery.html': ('discover/petra-wide.jpg', (28, 45), 'The Treasury (Al-Khazneh) at Petra, its columned façade carved into the rose sandstone cliff', 'program-jordan-discovery'),
    'programs/jordan-explorer.html': ('discover/wadi-rum.jpg', (50, 55), 'Sandstone mountains rising from the red sand of Wadi Rum', 'program-jordan-explorer'),
    'programs/jordan-revealed.html': ('discover/amman.jpg', (50, 72), 'Amman’s hills of pale stone houses, seen from the Citadel', 'program-jordan-revealed'),
}


def crop(src, focus):
    im = Image.open(os.path.join(ROOT, 'images-src', src)).convert('RGB')   # original photos live in images-src/
    scale = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    fx, fy = focus
    # like CSS object-position: the focus percentage of the spare width/height is cut on the left/top
    left = round((im.width - W) * fx / 100)
    top = round((im.height - H) * fy / 100)
    return im.crop((left, top, left + W, top + H))


def save(im, path):
    for q in (84, 80, 76, 72, 68, 64):
        im.save(path, 'JPEG', quality=q, optimize=True, progressive=True)
        if os.path.getsize(path) <= MAX_BYTES:
            return q
    raise SystemExit(f'{path} is still over 300 KB')


os.makedirs(OUT, exist_ok=True)
manifest = {}
for page, (src, focus, alt, name) in SHARE.items():
    path = os.path.join(OUT, name + '.jpg')
    q = save(crop(src, focus), path)
    manifest[page] = {'image': f'assets/img/share/{name}.jpg', 'width': W, 'height': H, 'alt': alt}
    print(f'{name}.jpg  {os.path.getsize(path) // 1024} KB  (quality {q}, from {src})')
with open(os.path.join(OUT, 'share-images.json'), 'w', encoding='utf-8') as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)
    f.write('\n')
