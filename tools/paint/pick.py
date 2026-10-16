"""Copy a chosen take into public/art as webp: python tools/paint/pick.py hero-1:hero pilot-1:pilot"""
import os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, "..", "..", "public", "art")
WIDTH = {"hero": 2000}

for pair in sys.argv[1:]:
    take, name = pair.split(":")
    im = Image.open(os.path.join(HERE, "out", take + ".png")).convert("RGB")
    w = WIDTH.get(name, 768)
    if im.width > w:
        im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    path = os.path.join(ART, name + ".webp")
    im.save(path, "WEBP", quality=82, method=6)
    print(name, im.size, os.path.getsize(path) // 1024, "KB")
