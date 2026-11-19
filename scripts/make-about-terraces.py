"""Builds the About page's carved sandstone terraces (no text) from a photo of the Siq's rock wall.

Writes the masters images-src/about/terraces.png (2048 x 640, transparent: the stepped desktop layout)
and images-src/about/stone.jpg (a plain sandstone texture for the stacked mobile steps);
scripts/build-images.mjs makes the web sizes and formats from them.
The step positions here must match the --t*-x / --t*-y percentages in assets/css/about.css.
Run: python scripts/make-about-terraces.py
"""
import numpy as np
from PIL import Image, ImageFilter

W, H = 2048, 640
SRC = Image.open('images-src/cine/s1-entrance.jpg').convert('RGB')   # 2000x1615, sunlit right-hand wall
RNG = np.random.default_rng(7)

def grade(a):
    a = 0.6 + 0.8 * (a - a.mean(axis=(0, 1)))              # even out the light, keep the grain
    a = a * np.array([1.18, 0.66, 0.36])                    # burnt-orange sandstone, as in the mockup
    return np.clip(a, 0, 1)

def strip(y0, h_src, height, stretch):
    """One horizontal band of the wall, scaled to `height` and stretched along the strata."""
    rock = SRC.crop((1060, y0, 2000, y0 + h_src))
    w = round(rock.width * height / rock.height * stretch)
    rock = rock.resize((w, height), Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.1))  # weathered, not gritty
    return np.asarray(rock).astype(np.float32) / 255

def texture(width, height, seeds, stretch=1.6):
    """Strips from different heights of the wall laid end to end with long cross-fades (no mirroring)."""
    out = np.zeros((height, width, 3), np.float32)
    weight = np.zeros((height, width, 1), np.float32)
    x, k, fade = -RNG.integers(0, 300), 0, 220
    while x < width:
        s = strip(seeds[k % len(seeds)], 330, height, stretch)
        w = s.shape[1]
        ramp = np.ones(w, np.float32)
        ramp[:fade] = np.linspace(0, 1, fade); ramp[-fade:] = np.linspace(1, 0, fade)
        a, b = max(x, 0), min(x + w, width)
        if b > a:
            out[:, a:b] += s[:, a - x:b - x] * ramp[a - x:b - x, None]
            weight[:, a:b, 0] += ramp[a - x:b - x]
        x += w - fade; k += 1
    return grade(out / np.maximum(weight, 1e-3))

def smooth(t):
    t = np.clip(t, 0, 1); return t * t * (3 - 2 * t)

def wobble(n, amp, scale, seed):
    """Low-frequency wave for eroded, slightly uneven edges."""
    r = np.random.default_rng(seed)
    xs = np.arange(n, dtype=np.float32)
    v = np.zeros(n, np.float32)
    for f, a in ((1 / scale, 1.0), (2.3 / scale, 0.45), (5.1 / scale, 0.18)):
        v += a * np.sin(xs * f * 2 * np.pi + r.uniform(0, 6.28))
    return v * amp

yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
x1 = np.arange(W, dtype=np.float32)

# left edge, tread top, tread depth, end radius (x, y), wall rows for the texture
BLOCKS = [
    dict(x0=772, top=40,  depth=40, rx=200, ry=110, seeds=(720, 980, 820), seed=1),
    dict(x0=380, top=246, depth=38, rx=210, ry=105, seeds=(1050, 760, 900), seed=2),
    dict(x0=110, top=440, depth=36, rx=230, ry=100, seeds=(880, 1150, 700), seed=3),
]

rgb = np.zeros((H, W, 3), np.float32)
alpha = np.zeros((H, W), np.float32)

# the rock rising behind the top step toward the right edge
hill_top = 40 - 60 * smooth((x1 - 1480) / 568) + wobble(W, 5, 700, 9)
hy = yy - hill_top[None, :]
hill = smooth(hy / 2) * smooth((xx - 1380) / 220)
tex = texture(W, H, (650, 900, 760), 1.5)
rgb = tex * (1.05 - 0.3 * smooth(hy / 200))[..., None] * hill[..., None]
alpha = hill.copy()

for b in BLOCKS:
    x0, top, depth, rx, ry = b['x0'], b['top'], b['depth'], b['rx'], b['ry']
    # top edge: a gentle wave, curling down into a rounded end at the left
    t = top + wobble(W, 4, 900, b['seed'])
    cx = x0 + rx
    u = np.clip((cx - x1) / rx, 0, 1)
    corner = ry * (1 - np.sqrt(1 - u ** 2))
    ytop = np.where(x1 < x0, 1e6, t + corner)
    y = yy - ytop[None, :]                        # depth below the surface line
    m = smooth(y / 1.6 + 0.5) * smooth((xx - x0) / 1.6 + 0.5)
    tex = texture(W, H, b['seeds'], 1.45)
    # tread (sunlit top), a bright lip, then the riser face falling into shadow
    on_tread = smooth((depth - y) / 3)
    tread = 1.08 + 0.16 * smooth(y / depth)
    lip = 0.12 * np.exp(-((y - depth) / 5) ** 2)
    # the face stays dark enough for ivory text (checked at 4.5:1 or better)
    riser = 0.66 - 0.2 * smooth((y - depth) / 150) - 0.1 * np.exp(-((y - depth - 14) / 16) ** 2)
    shade = on_tread * tread + (1 - on_tread) * riser + lip
    # the rounded end turns away from the light
    turn = smooth((xx - x0) / (rx * 1.5))
    shade *= 0.7 + 0.3 * turn
    col = tex * shade[..., None]
    sand = np.array([0.95, 0.6, 0.34], np.float32)
    col = col * (1 - 0.28 * on_tread[..., None]) + sand * 0.28 * on_tread[..., None] * shade[..., None]
    # contact shadow on the block behind, just above this block's tread
    above = np.clip(-y / 26, 0, 1)
    ao = (1 - above) * (y < 0) * smooth((xx - x0 + 30) / 120)
    rgb *= (1 - 0.5 * ao)[..., None]
    # a faint shadow on the cream to the left of the rounded end
    halo = np.exp(-np.clip(x0 - xx, 0, None) / 18) * (xx < x0) * smooth((yy - top - ry * 0.6) / 40)
    alpha = np.maximum(alpha, halo * 0.18)
    rgb = rgb * (1 - m[..., None]) + np.clip(col, 0, 1) * m[..., None]
    alpha = alpha * (1 - m) + m

# the bottom block trails off to the left as a low, sand-covered slope
slope_top = 600 - 150 * smooth((x1 - 0) / 260) + wobble(W, 3, 400, 11)
sy = yy - slope_top[None, :]
sm = smooth(sy / 2) * (xx < 420) * smooth((420 - xx) / 60)
slope_col = texture(W, H, (900, 1100), 1.4) * (1.05 - 0.25 * smooth(sy / 80))[..., None]
under = sm * (alpha < 0.99)
rgb = rgb * (1 - under[..., None]) + slope_col * under[..., None] * 1.0
alpha = np.maximum(alpha, sm)

# melt the bottom and far left into the page's cream
alpha *= smooth((H - yy) / 60) * smooth((xx + 30) / 230)
rgb = np.clip(rgb, 0, 1)

img = Image.fromarray((np.dstack([rgb, alpha]) * 255).round().astype(np.uint8), 'RGBA')
img.save('images-src/about/terraces.png', optimize=True)

t = texture(1200, 400, (720, 980, 1150), 1.3)
Image.fromarray((t * 255).astype(np.uint8)).save('images-src/about/stone.jpg', quality=92)
print('ok')
