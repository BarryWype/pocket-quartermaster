"""Upscales the small icon sets with nearest-neighbor, since React Native
blurs small pixel art when it scales it up: assets/icons/RPG Icons (32 px)
into assets/icons/rpg, assets/icons/abilities (16 px) into
assets/icons/abilities-scaled, both to 128 px.

Run with: python3 scripts/scale-rpg-icons.py (needs Pillow)
"""

from pathlib import Path

from PIL import Image

SIZE = 128
ICONS = Path(__file__).resolve().parent.parent / 'assets' / 'icons'
SETS = {'RPG Icons': 'rpg', 'abilities': 'abilities-scaled'}

for source, out in SETS.items():
    (ICONS / out).mkdir(exist_ok=True)
    for file in sorted((ICONS / source).glob('*.png')):
        icon = Image.open(file).convert('RGBA')
        icon.resize((SIZE, SIZE), Image.Resampling.NEAREST).save(ICONS / out / file.name)
