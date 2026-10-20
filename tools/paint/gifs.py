"""Animate the GIF moments the bot sends (welcome, matched, kaju, float, prizes), like the shuttle app's.

    uv run --with pillow python3 tools/paint/gifs.py            # every GIF
    uv run --with pillow python3 tools/paint/gifs.py kaju float # some

Reads the paintings a person picked (PICKS: takes in tools/paint/out made by paint.py, or the site's own art) and writes
public/gifs/<name>.gif. Sprites on flat cream are cut out here; the kaju coin is public/art/kaju.svg rendered to a
transparent PNG (tools/paint/out/kaju-coin.png). The motion (bobs, confetti, hearts, coins) is drawn in code.
"""

import math
import os
import random
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
GIFS = os.path.join(HERE, "..", "..", "public", "gifs")

W, H = 480, 270
FPS = 10
INK = (59, 36, 24)
COLOURS = [(224, 122, 79), (79, 179, 176), (63, 155, 90), (255, 210, 63), (255, 126, 182)]
PAPER = (253, 241, 216)

# the takes a person looked at and chose
ART = os.path.join(HERE, "..", "..", "public", "art")
PICKS = {
    "lane": "gif-lane-1.png",  # empty village lane
    "beach": "gif-beach-2.png",  # empty beach (take 1 had people in it)
    "night": "gif-night-2.png",  # courtyard under string lights
    "pair": "gif-pair-1.png",  # a scene: rider and a delighted pillion, used whole
    "pilot": os.path.join(ART, "pilot.webp"),  # scooty + car, cuts out cleanly
    "floater": os.path.join(ART, "floater.webp"),  # cuts out as a round "sticker" scene
    "coin": "kaju-coin.png",  # transparent already
}


def raw(key):
    return Image.open(os.path.join(OUT, PICKS[key])).convert("RGB")


def png(key, width):
    """A picture that is already transparent, scaled to `width`."""
    im = Image.open(os.path.join(OUT, PICKS[key])).convert("RGBA")
    im = im.crop(im.getbbox())
    return im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)


def cover(im, w=W, h=H):
    s = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h)).convert("RGBA")


def sprite(key, width):
    """Cut the subject out of its flat cream background (flood fill from the edges), crop, and scale to `width`."""
    im = raw(key)
    marker = (1, 254, 3)
    filled = im.copy()
    w, h = im.size
    for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]:
        if filled.getpixel(seed) != marker:
            ImageDraw.floodfill(filled, seed, marker, thresh=42)
    alpha = Image.new("L", im.size, 255)
    px = filled.load()
    a = alpha.load()
    for y in range(h):
        for x in range(w):
            if px[x, y] == marker:
                a[x, y] = 0
    out = im.convert("RGBA")
    out.putalpha(alpha)
    out = out.crop(out.getbbox())
    s = width / out.width
    return out.resize((width, round(out.height * s)), Image.LANCZOS)


def paste(base, layer, x, y):
    base.alpha_composite(layer, (int(round(x)), int(round(y))))


def save(frames, name, colors=96):
    """One shared palette for every frame (no flicker), no dithering (smaller files), loop forever."""
    sheet = Image.new("RGB", (W, H * min(len(frames), 6)))
    step = max(1, len(frames) // 6)
    for i, f in enumerate(frames[::step][:6]):
        sheet.paste(f.convert("RGB"), (0, i * H))
    pal = sheet.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    q = [f.convert("RGB").quantize(palette=pal, dither=Image.Dither.NONE) for f in frames]
    os.makedirs(GIFS, exist_ok=True)
    path = os.path.join(GIFS, name + ".gif")
    q[0].save(path, save_all=True, append_images=q[1:], duration=int(1000 / FPS), loop=0, optimize=True, disposal=1)
    print(name, len(frames), "frames", os.path.getsize(path) // 1024, "KB")


def bob(t, amp, freq=2.0, phase=0.0):
    return amp * math.sin(2 * math.pi * freq * t + phase)


def confetti(d, t, seconds, seed=7, count=34):
    rnd = random.Random(seed)
    for _ in range(count):
        x0, y0, col, speed, ph, sz = rnd.random(), rnd.random(), rnd.choice(COLOURS), rnd.choice([1, 1, 2]), rnd.random() * 6.28, rnd.choice([3, 4, 5])
        u = (y0 + t * speed / seconds) % 1.0
        x = x0 * W + 10 * math.sin(2 * math.pi * t / seconds + ph)
        y = u * (H + 20) - 10
        ang = ph + 4 * math.pi * t / seconds
        dx, dy = sz * math.cos(ang), sz * math.sin(ang)
        d.line((x - dx, y - dy, x + dx, y + dy), fill=col + (235,), width=sz)


def heart(d, x, y, r, fill):
    d.ellipse((x - r, y - r, x, y), fill=fill)
    d.ellipse((x, y - r, x + r, y), fill=fill)
    d.polygon([(x - r, y - r / 2.2), (x + r, y - r / 2.2), (x, y + r)], fill=fill)


def rising_hearts(d, x, y, t, seconds, n=4, spread=26, height=90, seed=5):
    rnd = random.Random(seed)
    for k in range(n):
        ph = (t / seconds * 2 + k / n) % 1.0
        hx = x + rnd.uniform(-spread, spread) + 8 * math.sin(ph * 6.28 + k)
        hy = y - ph * height
        r = 5 + ph * 6
        a = int(255 * (1 - ph) ** 1.3)
        heart(d, hx, hy, r, (255, 126, 182, a))


def sparkle(d, x, y, r, a):
    col = (255, 244, 200, a)
    d.polygon([(x, y - r), (x + r * 0.28, y - r * 0.28), (x + r, y), (x + r * 0.28, y + r * 0.28), (x, y + r), (x - r * 0.28, y + r * 0.28), (x - r, y), (x - r * 0.28, y - r * 0.28)], fill=col)


def gif_welcome(seconds=3.0):
    """The village lane, the pilot (scooty, with a car behind) riding across, confetti."""
    bg = cover(raw("lane"))
    rider = sprite("pilot", 132)
    n = int(seconds * FPS)
    frames = []
    for i in range(n):
        t = i / FPS
        f = bg.copy()
        u = t / seconds
        x = -rider.width + u * (W + rider.width)
        paste(f, rider, x, H - rider.height - 6 + bob(t, 2.0, 3))
        confetti(ImageDraw.Draw(f), t, seconds)
        frames.append(f)
    save(frames, "welcome")


def gif_matched(seconds=3.0):
    """The delighted pillion scene, hearts rising from the two riders."""
    scene = raw("pair")
    side = scene.width
    band = scene.crop((0, round(side * 0.24), side, round(side * 0.24 + side * 9 / 16)))  # the riders' strip
    still = band.resize((W, H), Image.LANCZOS).convert("RGBA")  # a still scene keeps the file small
    n = int(seconds * FPS)
    frames = []
    for i in range(n):
        t = i / FPS
        f = still.copy()
        d = ImageDraw.Draw(f)
        rising_hearts(d, W * 0.5, H * 0.42, t, seconds, n=6, spread=60, height=110)
        for k in range(3):
            ph = (t / seconds * 3 + k / 3) % 1.0
            sparkle(d, W * (0.3 + 0.2 * k), H * 0.2 - ph * 20, 4 + 7 * math.sin(ph * math.pi), int(255 * (1 - ph)))
        frames.append(f)
    save(frames, "matched")


def gif_kaju(seconds=3.0):
    """Kaju coins raining onto the paper, one big coin flipping in the middle."""
    bg = Image.new("RGBA", (W, H), PAPER + (255,))
    big = png("coin", 130)
    small = png("coin", 34)
    rnd = random.Random(3)
    drops = [(rnd.random() * (W - 34), rnd.random(), rnd.uniform(0.8, 1.6), rnd.random() * 6.28) for _ in range(14)]
    n = int(seconds * FPS)
    frames = []
    for i in range(n):
        t = i / FPS
        f = bg.copy()
        for x, y0, speed, ph in drops:
            u = (y0 + t * speed / seconds) % 1.0
            s = small.rotate(math.degrees(ph + t * 3), resample=Image.BICUBIC, expand=True)
            paste(f, s, x, u * (H + 40) - 40)
        flip = abs(math.cos(2 * math.pi * t / seconds))
        b = big.resize((max(4, round(big.width * (0.15 + 0.85 * flip))), big.height), Image.LANCZOS)
        paste(f, b, (W - b.width) / 2, (H - big.height) / 2 + bob(t, 6, 1))
        d = ImageDraw.Draw(f)
        for k in range(4):
            ph = (t / seconds * 2 + k / 4) % 1.0
            ang = k * math.pi / 2 + 0.6
            sparkle(d, W / 2 + math.cos(ang) * (70 + ph * 30), H / 2 + math.sin(ang) * (55 + ph * 20), 4 + 7 * math.sin(ph * math.pi), int(255 * (1 - ph)))
        frames.append(f)
    save(frames, "kaju")


def gif_float(seconds=3.0):
    """The floater painting, whole: hearts drifting off the phone, a map pin pulsing above it."""
    scene = Image.open(PICKS["floater"]).convert("RGB")
    side = scene.width
    top = round(side * 0.30)
    still = scene.crop((0, top, side, top + round(side * 9 / 16))).resize((W, H), Image.LANCZOS).convert("RGBA")
    px, py = W * 0.60, H * 0.12  # above the phone
    n = int(seconds * FPS)
    frames = []
    for i in range(n):
        t = i / FPS
        f = still.copy()
        d = ImageDraw.Draw(f)
        for k in range(2):
            ph = (t / seconds * 2 + k / 2) % 1.0
            r = 8 + ph * 34
            d.ellipse((px - r, py + 14 - r * 0.45, px + r, py + 14 + r * 0.45), outline=(255, 126, 182, int(230 * (1 - ph))), width=3)
        hop = 4 * math.sin(2 * math.pi * 2 * t / seconds)
        d.ellipse((px - 11, py - 22 + hop, px + 11, py + hop), fill=(224, 122, 79, 255), outline=INK + (255,), width=2)
        d.polygon([(px - 9, py - 6 + hop), (px + 9, py - 6 + hop), (px, py + 12 + hop)], fill=(224, 122, 79, 255))
        d.ellipse((px - 4, py - 15 + hop, px + 4, py - 7 + hop), fill=(255, 246, 230, 255))
        rising_hearts(d, W * 0.66, H * 0.42, t, seconds, n=4, spread=16, height=80, seed=9)
        frames.append(f)
    save(frames, "float")


def gif_prizes(seconds=3.0):
    """Night in the village: twinkling stars, confetti, a big kaju bobbing, the car honking."""
    bg = cover(raw("night"))
    coin = png("coin", 110)
    rnd = random.Random(11)
    stars = [(rnd.random() * W, rnd.random() * H * 0.4, rnd.random() * 6.28, rnd.uniform(1.2, 2.4)) for _ in range(20)]
    n = int(seconds * FPS)
    frames = []
    for i in range(n):
        t = i / FPS
        f = bg.copy()
        d = ImageDraw.Draw(f)
        for sx, sy, ph, sz in stars:
            tw = 0.5 + 0.5 * math.sin(4 * math.pi * t / seconds + ph)
            r = sz * (0.7 + 0.5 * tw)
            d.ellipse((sx - r, sy - r, sx + r, sy + r), fill=(255, 244, 200, int(60 + 190 * tw)))
        hop = max(0.0, math.sin(4 * math.pi * t / seconds))
        paste(f, coin, (W - coin.width) / 2, H - coin.height - 30 - hop * 18)
        for k in range(4):
            ph = (t / seconds * 2 + k / 4) % 1.0
            ang = k * math.pi / 2 + 0.6
            sparkle(d, W / 2 + math.cos(ang) * (80 + ph * 30), H - 95 + math.sin(ang) * (45 + ph * 15), 4 + 7 * math.sin(ph * math.pi), int(255 * (1 - ph)))
        confetti(ImageDraw.Draw(f), t, seconds, seed=21, count=28)
        frames.append(f)
    save(frames, "prizes")


ALL = {"welcome": gif_welcome, "matched": gif_matched, "kaju": gif_kaju, "float": gif_float, "prizes": gif_prizes}

if __name__ == "__main__":
    for name in sys.argv[1:] or list(ALL):
        ALL[name]()
