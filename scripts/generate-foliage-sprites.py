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
    "p": (47, 107, 58, 255),  # pine needles
    "P": (82, 145, 84, 255),  # pine highlight
    "q": (31, 78, 42, 255),  # pine shade
    "f": (242, 154, 192, 255),  # blossom
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

PINE = """
................
.......oo.......
......oPpo......
.....oPppqo.....
....oPPppqqo....
.....oPppqo.....
....oPPppqqo....
...oPpppppqqo...
....oPPppqqo....
...oPpppppqqo...
..oPPpppppqqqo..
.oPppppppppqqqo.
.oooooooooooooo.
......otto......
......oTto......
.....oottoo.....
"""

# A pale-leaved tree with a white, dark-marked trunk.
BIRCH_COLORS = {
    "g": (127, 191, 85, 255),
    "d": (92, 154, 62, 255),
    "L": (181, 224, 138, 255),
    "t": (58, 58, 58, 255),
    "T": (232, 228, 216, 255),
}


def with_blossoms(art: str, spots: list[tuple[int, int]]) -> str:
    rows = art.strip("\n").split("\n")
    for x, y in spots:
        if rows[y][x] in "gL":
            rows[y] = rows[y][:x] + "f" + rows[y][x + 1 :]
    return "\n".join(rows)


BLOSSOM = with_blossoms(BUSH, [(7, 6), (10, 7), (4, 8), (11, 9), (6, 10), (9, 11), (8, 8)])

# Rows above `bend` sway by the frame offset; the rest stay planted.
# The third value overrides palette colours for that sprite.
SPRITES = {
    "bush": (BUSH, 9, {}),
    "tree": (TREE, 10, {}),
    "pine": (PINE, 12, {}),
    "birch": (TREE, 10, BIRCH_COLORS),
    "blossom": (BLOSSOM, 9, {}),
}
OFFSETS = [0, 1, 0, -1]


def draw(art: str, bend: int, offset: int, colors: dict) -> Image.Image:
    rows = [r for r in art.strip("\n").split("\n")]
    image = Image.new("RGBA", (len(rows[0]), len(rows)))
    for y, row in enumerate(rows):
        shift = offset if y < bend else 0
        for x, char in enumerate(row):
            sx = x + shift
            if 0 <= sx < image.width:
                image.putpixel((sx, y), colors.get(char, COLORS[char]))
    return image


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (art, bend, colors) in SPRITES.items():
        for frame, offset in enumerate(OFFSETS):
            image = draw(art, bend, offset, colors)
            for scale, suffix in [(1, ""), (2, "@2x"), (3, "@3x")]:
                scaled = image.resize((image.width * scale, image.height * scale), Image.NEAREST)
                scaled.save(OUT / f"{name}-{frame}{suffix}.png")


if __name__ == "__main__":
    main()
