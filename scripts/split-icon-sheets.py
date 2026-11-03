"""Cuts the 14x8 sprite sheets in assets/icons into one file per icon, named
from each set's manifest.csv (row,col,name; rows and columns from 0).

Pieces of art are assigned to a grid cell by their centre, since some icons
spill a pixel or two over the cell edge. Each icon is trimmed, centred on a
CANVAS px square and upscaled with nearest-neighbor, since React Native blurs
small pixel art when it scales it up.

Run with: python3 scripts/split-icon-sheets.py (needs Pillow)
"""

import csv
from pathlib import Path

from PIL import Image

COLS, ROWS = 14, 8
CANVAS = 34
SCALE = 4
ICONS = Path(__file__).resolve().parent.parent / 'assets' / 'icons'
SHEETS = {
    'sheet-alchemy-potions-ingredients.png': 'alchemy',
    'sheet-magic-items-runes-scrolls.png': 'magic',
    'sheet-relics-trinkets-gear.png': 'relics',
    'sheet-tavern-drinks-food.png': 'tavern',
    'sheet-meals-soups-pastries.png': 'meals',
}


def runs(flags: list[bool]) -> list[tuple[int, int]]:
    found, start = [], None
    for i, flag in enumerate(flags + [False]):
        if flag and start is None:
            start = i
        elif not flag and start is not None:
            found.append((start, i))
            start = None
    return found


def cells(sheet: Image.Image) -> dict[tuple[int, int], tuple[int, int, int, int]]:
    alpha = sheet.getchannel('A').load()
    width, height = sheet.size
    boxes: dict[tuple[int, int], tuple[int, int, int, int]] = {}
    for top, bottom in runs([any(alpha[x, y] for x in range(width)) for y in range(height)]):
        for left, right in runs([any(alpha[x, y] for y in range(top, bottom)) for x in range(width)]):
            cell = (int((top + bottom) / 2 / (height / ROWS)), int((left + right) / 2 / (width / COLS)))
            box = sheet.crop((left, top, right, bottom)).getbbox()
            box = (left + box[0], top + box[1], left + box[2], top + box[3])
            if cell in boxes:
                old = boxes[cell]
                box = (min(old[0], box[0]), min(old[1], box[1]), max(old[2], box[2]), max(old[3], box[3]))
            boxes[cell] = box
    return boxes


for file, folder in SHEETS.items():
    sheet = Image.open(ICONS / file).convert('RGBA')
    out = ICONS / folder
    with open(out / 'manifest.csv', newline='') as manifest:
        names = {(int(row), int(col)): name for row, col, name in csv.reader(manifest)}
    boxes = cells(sheet)
    missing = sorted(set(boxes) - set(names))
    if missing:
        raise SystemExit(f'{folder}/manifest.csv has no name for cells {missing}')
    for cell, name in names.items():
        icon = sheet.crop(boxes[cell])
        canvas = Image.new('RGBA', (CANVAS, CANVAS))
        canvas.paste(icon, ((CANVAS - icon.width) // 2, (CANVAS - icon.height) // 2))
        canvas.resize((CANVAS * SCALE, CANVAS * SCALE), Image.Resampling.NEAREST).save(out / f'{name}.png')
