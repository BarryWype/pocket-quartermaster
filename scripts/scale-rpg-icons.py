"""Upscales the 32 px icons in assets/icons/RPG Icons into assets/icons/rpg
with nearest-neighbor, since React Native blurs small pixel art when it scales
it up.

Run with: python3 scripts/scale-rpg-icons.py (needs Pillow)
"""

from pathlib import Path

from PIL import Image

SCALE = 4
ICONS = Path(__file__).resolve().parent.parent / 'assets' / 'icons'
SOURCE = ICONS / 'RPG Icons'
OUT = ICONS / 'rpg'

OUT.mkdir(exist_ok=True)
for file in sorted(SOURCE.glob('*.png')):
    icon = Image.open(file).convert('RGBA')
    name = file.stem.rstrip('-')
    icon.resize((icon.width * SCALE, icon.height * SCALE), Image.Resampling.NEAREST).save(OUT / f'{name}.png')
