"""Paint the landing-page illustrations with Gemini image (Vertex).

    secrets run -- python3 tools/paint/paint.py hero pilot
    secrets run -- python3 tools/paint/paint.py        # every subject
    secrets run -- python3 tools/paint/paint.py edit:hero-cars   # edit an existing picture (EDITS)

Writes tools/paint/out/<name>-<n>.png (git-ignored). A person picks one and
copies it into public/art/. GEMINI_API_KEY is a Vertex key, read from the
environment and never printed (the address holds it, so that isn't printed either).
"""

import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
MODEL = "gemini-3-pro-image"

STYLE = (
    "Cute hand-painted gouache and risograph-texture illustration, warm and joyful, "
    "flat shapes with soft grain, limited palette: laterite red-orange, coconut green, "
    "sea teal, cream paper, sunny yellow, a touch of hot pink. Chunky rounded characters "
    "with simple dot eyes and rosy cheeks, gender-diverse and ethnically diverse, friendly "
    "and a little silly, like a children's picture book for grown-ups. Setting: a coastal "
    "village in North Goa, India - red laterite lanes, coconut palms, cashew trees, "
    "whitewashed houses with terracotta roofs, the sea glimpsed behind. Everyone on a "
    "scooter wears a helmet. Absolutely no text, letters, numbers, logos or brand marks. "
)

SUBJECTS = {
    "hero": ("16:9",
        "Wide panoramic scene of the village at golden hour seen from slightly above: winding "
        "red lanes between palms, five or six little scooters zipping in different directions, "
        "each with a pilot and a happy pillion rider, one person waving from the roadside to "
        "flag a ride, a dog asleep in the lane, a chai stall, the sea and a sunset sky. Leave "
        "calm empty sky in the top third for a headline."),
    "pilot": ("1:1",
        "A cheerful character riding a mint-green scooter, patting the empty pillion seat "
        "behind them invitingly, a spare helmet hanging off the handlebar. Plain cream background, "
        "centered, small soft shadow."),
    "hitcher": ("1:1",
        "A character with a tote bag standing by a palm tree on a red lane, hopefully holding "
        "up a hand-drawn paper map, a little sparkle of anticipation above their head. Plain "
        "cream background, centered, small soft shadow."),
    "floater": ("1:1",
        "A blissfully relaxed character cruising slowly on a pink scooter with sunglasses, "
        "one hand lifted holding a phone that glows with a simple map pin shape, little "
        "hearts and stars floating behind them like a trail. Plain cream background, "
        "centered, small soft shadow."),
    "kaju": ("1:1",
        "A single cute golden coin shaped like a cashew nut, with a tiny smiling face and "
        "sparkles, glossy gold with risograph grain. Plain cream background, centered, icon."),
    "prizes": ("4:3",
        "A little festive table under string lights piled with small tangible village prizes: "
        "a coconut with a straw, a jar of cashews, a tiny trophy shaped like a scooter, a "
        "bunch of marigolds, a cold drink, a hand-made medal on a ribbon. Plain cream background."),
}

# Edits of a picture already in public/art: (source, aspect ratio, instruction). Output name is the key.
EDITS = {
    "hero-cars": ("hero.webp", "16:9",
        "Edit this illustration, keeping its style, palette, composition, lanes and characters exactly as they "
        "are. Replace one or two of the scooters with small, cute, rounded little cars (a tiny mint or yellow "
        "hatchback, windows down, a driver and one or two smiling passengers waving out of the window), driving "
        "along the red lanes. Scooters must still clearly outnumber the cars: most rides are scooters. Keep the "
        "calm empty sky in the top third. Absolutely no text, letters, numbers, logos or brand marks."),
    "pilot-cars": ("pilot.webp", "1:1",
        "Edit this illustration, keeping the scooter rider exactly as they are, in the same style and palette. "
        "Behind them, slightly smaller, add a cute rounded little car (sunny yellow) with its driver leaning out "
        "of the window and waving, the passenger door open invitingly. The scooter stays the hero in front; the "
        "car is a friendly sidekick. Plain cream background, small soft shadows. Absolutely no text, letters, "
        "numbers, logos or brand marks."),
}


def address():
    key = os.environ["GEMINI_API_KEY"]
    project = os.environ.get("GOOGLE_CLOUD_PROJECT", "843441459341")
    return (
        "https://aiplatform.googleapis.com/v1/projects/%s/locations/global/"
        "publishers/google/models/%s:generateContent?key=%s" % (project, MODEL, key)
    )


def paint(name, n):
    if name.startswith("edit:"):
        name = name[5:]
        src, ratio, instruction = EDITS[name]
        with open(os.path.join(HERE, "..", "..", "public", "art", src), "rb") as f:
            image = base64.b64encode(f.read()).decode()
        parts = [{"inlineData": {"mimeType": "image/webp", "data": image}}, {"text": instruction}]
    else:
        ratio, subject = SUBJECTS[name]
        parts = [{"text": STYLE + subject}]
    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
            "imageConfig": {"aspectRatio": ratio},
        },
    }
    req = urllib.request.Request(address(), data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    for attempt in range(8):
        try:
            with urllib.request.urlopen(req, timeout=300) as res:
                answer = json.loads(res.read().decode())
            break
        except urllib.error.HTTPError as err:
            if err.code == 429 and attempt < 7:
                print("  %s busy, waiting a minute" % name, flush=True)
                time.sleep(60)
                continue
            print("  %s failed: HTTP %s %s" % (name, err.code, err.read()[:300]), flush=True)
            return
    for cand in answer.get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            data = part.get("inlineData")
            if data:
                path = os.path.join(OUT, "%s-%d.png" % (name, n))
                with open(path, "wb") as f:
                    f.write(base64.b64decode(data["data"]))
                print("  wrote", os.path.relpath(path), flush=True)
                return
    print("  %s: no image in answer" % name, flush=True)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    names = sys.argv[1:] or list(SUBJECTS)
    takes = int(os.environ.get("TAKES", "2"))
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(4) as pool:
        for name in names:
            for n in range(1, takes + 1):
                pool.submit(paint, name, n)
