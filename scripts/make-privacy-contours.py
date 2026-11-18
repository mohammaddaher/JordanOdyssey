"""Faint copper contour lines for the Privacy page's title band (assets/img/privacy/contours.svg).
Nested, gently wobbling loops around two high points near the band's right edge, like a topographic map.
Run: python scripts/make-privacy-contours.py
"""
import math, random

W, H = 900, 300
random.seed(11)

def loop(cx, cy, r, sx, phase, amp):
    pts = []
    for i in range(48):
        t = i / 48 * 2 * math.pi
        k = 1 + amp * (0.55 * math.sin(3 * t + phase) + 0.3 * math.sin(5 * t + phase * 1.7) + 0.15 * math.sin(8 * t + phase * 0.6))
        pts.append((cx + math.cos(t) * r * sx * k, cy + math.sin(t) * r * k))
    # smooth closed curve through the points (Catmull-Rom to cubic Bézier)
    d = f'M{pts[0][0]:.1f} {pts[0][1]:.1f}'
    n = len(pts)
    for i in range(n):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f'C{c1[0]:.0f} {c1[1]:.0f} {c2[0]:.0f} {c2[1]:.0f} {p2[0]:.0f} {p2[1]:.0f}'
    return d + 'Z'

paths = []
for cx, cy, n, step, sx, ph in ((760, 70, 13, 26, 1.35, 0.4), (560, 380, 6, 34, 1.7, 2.1)):
    for j in range(1, n + 1):
        paths.append(loop(cx, cy, j * step, sx, ph + j * 0.18, 0.05 + j * 0.006))

svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" fill="none" stroke="#c8784a" '
       f'stroke-width="1.1" stroke-opacity="0.6">' + ''.join(f'<path d="{d}"/>' for d in paths) + '</svg>\n')
open('assets/img/privacy/contours.svg', 'w', encoding='utf-8', newline='\n').write(svg)
print(len(svg), 'bytes')
