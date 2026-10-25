"""Splits the sprite sheets in assets/icons and upscales every icon with
nearest-neighbor into assets/icons/scaled, since React Native blurs small
pixel art when it scales it up.

Run with: python3 scripts/scale-icons.py (needs Pillow)
"""

from pathlib import Path

from PIL import Image

SCALE = 8
TILE = 16
ICONS = Path(__file__).resolve().parent.parent / 'assets' / 'icons'
OUT = ICONS / 'scaled'

SINGLES = ['wood', 'stone', 'copper', 'iron', 'charcoal']
# Each sheet is a grid of 16px tiles: rows top to bottom, columns left to right.
SHEETS = {
    'weapons-16px.png': [
        [f'{weapon}-{tier}' for weapon in ['sword', 'bow', 'wand', 'pickaxe']]
        for tier in ['wood', 'stone', 'copper', 'iron', 'steel']
    ],
    'menu-icons.png': [['menu-craft', 'menu-team', 'menu-expeditions', 'menu-forge', 'menu-alchemy', 'menu-inventory']],
}


def save(image: Image.Image, name: str) -> None:
    size = (image.width * SCALE, image.height * SCALE)
    image.resize(size, Image.Resampling.NEAREST).save(OUT / f'{name}.png')


OUT.mkdir(exist_ok=True)
for name in SINGLES:
    save(Image.open(ICONS / f'{name}.png'), name)
for sheet, grid in SHEETS.items():
    image = Image.open(ICONS / sheet)
    for row, names in enumerate(grid):
        for col, name in enumerate(names):
            box = (col * TILE, row * TILE, (col + 1) * TILE, (row + 1) * TILE)
            save(image.crop(box), name)
