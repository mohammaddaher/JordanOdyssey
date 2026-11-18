"""About page hero: the Treasury through the Siq (assets/img/sights/petra-siq-treasury.jpg),
cropped closer around the gap and warmed so the walls glow copper as in the approved mockup.
Writes assets/img/about/hero-siq-treasury-1600.jpg and -800.jpg. Run: python scripts/make-about-hero.py
"""
import numpy as np
from PIL import Image, ImageEnhance

src = Image.open('assets/img/sights/petra-siq-treasury.jpg').convert('RGB').crop((450, 0, 2150, 1350))
a = np.asarray(src).astype(np.float32) / 255
lift = 1 - (1 - a) ** 2.4                 # open up the shadowed walls
a = a * 0.3 + lift * 0.7
a = a - 0.22 * np.clip(a - 0.72, 0, 1)    # keep detail in the sunlit facade
a = a * np.array([1.07, 0.84, 0.66])      # copper warmth
im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
im = ImageEnhance.Color(im).enhance(1.18)
im = ImageEnhance.Contrast(im).enhance(1.12)
for w in (1600, 800):
    h = round(w * src.height / src.width)
    im.resize((w, h), Image.LANCZOS).save(f'assets/img/about/hero-siq-treasury-{w}.jpg', quality=80, optimize=True, progressive=True)
    print(w, h)
