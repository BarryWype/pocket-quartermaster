"""Draws the placeholder foliage sprites in assets/sprites/.

Each sprite has 4 sway frames (centre, right, centre, left), exported at 1x,
2x and 3x with nearest-neighbour scaling so the pixels stay sharp. Replace the
PNGs with real art at any time; keep the names and the 4 frames.

    python3 scripts/generate-foliage-sprites.py
"""

from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "assets" / "sprites"

# Palette, matched to src/content/mapStyle.ts.
COLORS = {
    "o": (38, 66, 30, 255),  # outline
    "d": (58, 110, 44, 255),  # shade
    "g": (79, 138, 60, 255),  # leaf
    "L": (138, 196, 98, 255),  # highlight
    "t": (94, 54, 34, 255),  # trunk
    "T": (130, 82, 50, 255),  # trunk highlight
    ".": (0, 0, 0, 0),
}

BUSH = """
................
................
................
................
................
.....oooooo.....
...ooggggggoo...
..oggLLggggggo..
.ogLLggggggggdo.
.oggggggggdgggo.
.oggggggggggggo.
.ogdggggggggddo.
..oggggggggddo..
...oddddddddo...
....oooooooo....
................
"""

TREE = """
................
.....oooooo.....
...ooLLggggoo...
..oLLgggggggdo..
.oLggggggggggdo.
.ogggggdgggggdo.
.ogggggggggggdo.
.oggdgggggggddo.
..ogggggggdddo..
..oddgggggdddo..
...ooddddddoo...
.....ootto......
......oTto......
......oTto......
......oTto......
.....oottoo.....
"""

# Rows above `bend` sway by the frame offset; the rest stay planted.
SPRITES = {"bush": (BUSH, 9), "tree": (TREE, 10)}
OFFSETS = [0, 1, 0, -1]


def draw(art: str, bend: int, offset: int) -> Image.Image:
    rows = [r for r in art.strip("\n").split("\n")]
    image = Image.new("RGBA", (len(rows[0]), len(rows)))
    for y, row in enumerate(rows):
        shift = offset if y < bend else 0
        for x, char in enumerate(row):
            sx = x + shift
            if 0 <= sx < image.width:
                image.putpixel((sx, y), COLORS[char])
    return image


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (art, bend) in SPRITES.items():
        for frame, offset in enumerate(OFFSETS):
            image = draw(art, bend, offset)
            for scale, suffix in [(1, ""), (2, "@2x"), (3, "@3x")]:
                scaled = image.resize((image.width * scale, image.height * scale), Image.NEAREST)
                scaled.save(OUT / f"{name}-{frame}{suffix}.png")


if __name__ == "__main__":
    main()
