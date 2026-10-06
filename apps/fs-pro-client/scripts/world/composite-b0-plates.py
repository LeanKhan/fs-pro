"""One-off: composite the hand-placed l0-* campus sprites into one b0 plate per
facility (docs/WORLD-VIEW-UI-PLAN.md, "Making the art").

Each facility's sprites (positions copied from the old HOTSPOTS in
src/components/game/map-config.ts) are drawn into a transparent PNG the size
of their union box, at 2x map units (the scene image's resolution). Prints
the plot boxes and hit boxes for src/components/world/campus-plots/city.ts.

Run from apps/fs-pro-client:  python3 scripts/world/composite-b0-plates.py
"""
import json
import os
from PIL import Image

SPRITES = 'public/campus/sprites'
OUT = 'public/world/campus/plates'
SCALE = 2  # plate pixels per map unit

FACILITIES = {
    'stadium_grounds': [('l0-regulation-pitch', 671, 610, 700, False)],
    'stands': [
        ('l0-bench-long', 490, 352, 170, True),
        ('l0-bench-long', 875, 530, 170, True),
        ('l0-floodlight', 345, 420, 34, False),
        ('l0-floodlight', 1000, 400, 34, False),
    ],
    'training_ground': [('l0-training-pen', 330, 275, 270, False)],
    'medical_centre': [('l0-medical-hut', 560, 150, 110, False)],
    'staff_house': [('l0-cabin', 900, 195, 200, False)],
    'scouting': [('l0-comms-tower', 110, 470, 95, False)],
    'youth_academy': [('l0-cones-hoops', 240, 590, 120, False), ('l0-mini-goals', 340, 610, 80, False)],
    'dugout': [('l0-bench-short', 660, 500, 100, False)],
}


def placed(img, x, y, w, flip):
    im = Image.open(os.path.join(SPRITES, img + '.png')).convert('RGBA')
    h = w * im.height / im.width
    return im, x - w / 2, y - h, w, h, flip


def main():
    os.makedirs(OUT, exist_ok=True)
    plots = {}
    for key, sprites in FACILITIES.items():
        parts = [placed(*s) for s in sprites]
        x0 = min(p[1] for p in parts)
        y0 = min(p[2] for p in parts)
        x1 = max(p[1] + p[3] for p in parts)
        y1 = max(p[2] + p[4] for p in parts)
        W, H = round((x1 - x0) * SCALE), round((y1 - y0) * SCALE)
        plate = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        for im, left, top, w, h, flip in sorted(parts, key=lambda p: p[2] + p[4]):
            sprite = im.resize((max(1, round(w * SCALE)), max(1, round(h * SCALE))), Image.LANCZOS)
            if flip:
                sprite = sprite.transpose(Image.FLIP_LEFT_RIGHT)
            plate.alpha_composite(sprite, (round((left - x0) * SCALE), round((top - y0) * SCALE)))
        name = f'{key}-b0.png' if key != 'dugout' else 'dugout.png'
        plate.save(os.path.join(OUT, name), optimize=True)
        plots[key] = {
            'x': round((x0 + x1) / 2, 1),
            'y': round(y1, 1),
            'w': round(x1 - x0, 1),
            'h': round(y1 - y0, 1),
            'hit': [[round(p[1], 1), round(p[2], 1), round(p[3], 1), round(p[4], 1)] for p in parts],
        }
    print(json.dumps(plots, indent=2))


if __name__ == '__main__':
    main()
