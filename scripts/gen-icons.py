"""
Generate PWA icons for 매장닥터.
Design: dark navy background, ascending bar chart in sky-blue,
        trend line connecting bar tops, upward arrow tip.
No external dependencies — uses only Python stdlib (zlib, struct).
"""

import zlib
import struct
import math


def write_png(path: str, width: int, height: int, pixels):
    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    raw = b""
    for row in pixels:
        raw += b"\x00"
        for r, g, b, a in row:
            raw += bytes([r, g, b, a])

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(png)
    print(f"  wrote {path}  ({width}x{height})")


def lerp(a, b, t):
    return a + (b - a) * t


def clamp(v, lo=0.0, hi=1.0):
    return max(lo, min(hi, v))


def alpha_blend(fg, bg, alpha):
    """alpha in 0-1"""
    r = int(fg[0] * alpha + bg[0] * (1 - alpha))
    g = int(fg[1] * alpha + bg[1] * (1 - alpha))
    b = int(fg[2] * alpha + bg[2] * (1 - alpha))
    return (r, g, b, 255)


def rounded_rect_aa(px, py, rx, ry, rw, rh, radius):
    """Return coverage 0-1 of point (px,py) inside rounded rect."""
    # Map to rect-local
    cx = clamp(px - rx, 0, rw)
    cy = clamp(py - ry, 0, rh)
    # Nearest corner
    corner_x = clamp(px - rx, radius, rw - radius)
    corner_y = clamp(py - ry, radius, rh - radius)
    dx = (px - rx) - corner_x
    dy = (py - ry) - corner_y
    dist = math.sqrt(dx * dx + dy * dy)
    # Outside rounded rect
    if px < rx or px > rx + rw or py < ry or py > ry + rh:
        if dist > radius + 0.5:
            return 0.0
        return clamp(radius + 0.5 - dist)
    # Inside: check corner regions
    if (px - rx < radius or px - rx > rw - radius) and (py - ry < radius or py - ry > rh - radius):
        if dist > radius + 0.5:
            return 0.0
        return clamp(radius + 0.5 - dist)
    return 1.0


def circle_aa(px, py, cx, cy, r):
    dist = math.sqrt((px - cx) ** 2 + (py - cy) ** 2)
    return clamp(r + 0.5 - dist)


def line_aa(px, py, x0, y0, x1, y1, thickness):
    """Coverage for thick line segment."""
    dx, dy = x1 - x0, y1 - y0
    length = math.sqrt(dx * dx + dy * dy)
    if length < 1e-9:
        return 0.0
    # Project point onto line
    t = clamp(((px - x0) * dx + (py - y0) * dy) / (length * length), 0.0, 1.0)
    nearest_x = x0 + t * dx
    nearest_y = y0 + t * dy
    dist = math.sqrt((px - nearest_x) ** 2 + (py - nearest_y) ** 2)
    return clamp(thickness / 2 + 0.5 - dist)


def make_icon(size: int):
    S = size
    BG = (15, 23, 42)        # #0f172a
    SKY = (56, 189, 248)     # #38bdf8
    SKY2 = (14, 165, 233)    # #0ea5e9 (darker sky for line)
    EMR = (52, 211, 153)     # #34d399 emerald for arrow

    # Design proportions (all in pixel coords)
    pad = S * 0.12           # 12% padding each side
    inner = S - 2 * pad      # usable area

    # Bar chart: 4 bars
    n_bars = 4
    bar_gap = inner * 0.06
    bar_w = (inner - bar_gap * (n_bars + 1)) / n_bars
    bar_heights = [0.30, 0.50, 0.70, 0.90]  # fraction of inner height
    bar_radius = bar_w * 0.25

    bars = []
    for i in range(n_bars):
        bx = pad + bar_gap * (i + 1) + bar_w * i
        bh = inner * bar_heights[i]
        by = pad + inner - bh
        bars.append((bx, by, bar_w, bh))

    # Trend line: connects top-centres of bars
    tops = [(bx + bar_w / 2, by) for bx, by, bw, bh in bars]

    # Arrow tip above last bar top
    arrow_tip = (tops[-1][0], tops[-1][1] - inner * 0.10)

    line_thick = max(S * 0.025, 2)
    arrow_size = max(S * 0.04, 3)

    pixels = []
    for y in range(S):
        row = []
        for x in range(S):
            px, py = x + 0.5, y + 0.5

            # Start with background
            color = BG
            cov = 0.0

            # Bars
            for bx, by, bw, bh in bars:
                c = rounded_rect_aa(px, py, bx, by, bw, bh, bar_radius)
                if c > cov:
                    cov = c
                    color = SKY

            # Trend line segments
            for i in range(len(tops) - 1):
                x0, y0 = tops[i]
                x1, y1 = tops[i + 1]
                c = line_aa(px, py, x0, y0, x1, y1, line_thick)
                if c > 0:
                    color = alpha_blend(SKY2, color, c)
                    cov = max(cov, c)

            # Arrow: line from last top to tip
            c = line_aa(px, py, tops[-1][0], tops[-1][1], arrow_tip[0], arrow_tip[1], line_thick)
            if c > 0:
                color = alpha_blend(EMR, color, c)
                cov = max(cov, c)

            # Arrow head (two short lines branching from tip)
            tip_x, tip_y = arrow_tip
            for ang_deg in [225, 315]:  # left-down and right-down from tip
                ang = math.radians(ang_deg)
                ex = tip_x + math.cos(ang) * arrow_size
                ey = tip_y - math.sin(ang) * arrow_size  # y inverted
                c = line_aa(px, py, tip_x, tip_y, ex, ey, line_thick * 0.9)
                if c > 0:
                    color = alpha_blend(EMR, color, c)
                    cov = max(cov, c)

            # Compose pixel
            if cov > 0:
                r = int(color[0] * cov + BG[0] * (1 - cov))
                g = int(color[1] * cov + BG[1] * (1 - cov))
                b = int(color[2] * cov + BG[2] * (1 - cov))
                row.append((r, g, b, 255))
            else:
                row.append((*BG, 255))
        pixels.append(row)
    return pixels


if __name__ == "__main__":
    import os
    os.makedirs("public", exist_ok=True)
    for size, name in [(192, "public/icon-192x192.png"), (512, "public/icon-512x512.png")]:
        print(f"Generating {name}...")
        write_png(name, size, size, make_icon(size))
    print("Done.")
