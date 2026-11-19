"""About page hero: the Treasury through the Siq (images-src/sights/petra-siq-treasury.jpg),
cropped closer around the gap and warmed so the walls glow copper as in the approved mockup.
Writes the full-size master images-src/about/hero-siq-treasury.jpg; scripts/build-images.mjs makes the
web sizes and formats from it. Run: python scripts/make-about-hero.py
"""
import numpy as np
from PIL import Image, ImageEnhance

src = Image.open('images-src/sights/petra-siq-treasury.jpg').convert('RGB').crop((300, 0, 2300, 1350))   # as wide as the gap allows
a = np.asarray(src).astype(np.float32) / 255
lift = 1 - (1 - a) ** 1.9                 # open up the shadowed walls
a = a * 0.4 + lift * 0.6
a = a - 0.22 * np.clip(a - 0.72, 0, 1)    # keep detail in the sunlit facade
a = a * np.array([1.03, 0.93, 0.84])      # a gentle warmth, not an orange cast
im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
im = ImageEnhance.Color(im).enhance(1.04)
im = ImageEnhance.Contrast(im).enhance(1.08)
im.save('images-src/about/hero-siq-treasury.jpg', quality=95, subsampling=0)
print(im.size)

# Stand-in until the final photo arrives (the Treasury doorway seen through a narrow, curved opening of
# the Siq): the full facade between the canyon walls, cropped above the visitors and camels at the bottom.
sub = Image.open('images-src/photos/hero-petra-treasury.jpg').convert('RGB').crop((250, 0, 2200, 1265))
b = np.asarray(sub).astype(np.float32) / 255 * np.array([1.02, 0.97, 0.92])
sub = ImageEnhance.Contrast(Image.fromarray((np.clip(b, 0, 1) * 255).astype(np.uint8))).enhance(1.04)
sub.save('images-src/about/hero-treasury-standin.jpg', quality=95, subsampling=0)
print(sub.size)
