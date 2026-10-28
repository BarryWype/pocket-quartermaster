"""Draws the map textures in assets/sprites/: road paving, dirt, timber buildings and trampled ground.

Line patterns repeat along the line, and their height runs across it: a line
narrower than the pattern shows only its middle rows. Exported at 1x, 2x and
3x with nearest-neighbour scaling so the pixels stay sharp.

    python3 scripts/generate-map-textures.py
"""

import math
import random
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "assets" / "sprites"


def hex_color(value: str) -> tuple[int, int, int, int]:
    return (int(value[1:3], 16), int(value[3:5], 16), int(value[5:7], 16), 255)


def value_noise(cells_x: int, cells_y: int, seed: str):
    """Smooth noise over a cells_x × cells_y lattice that wraps, so a texture built on it tiles."""
    rng = random.Random(seed)
    lattice = [[rng.random() for _ in range(cells_x)] for _ in range(cells_y)]
    smooth = lambda t: t * t * (3 - 2 * t)

    def noise(x: float, y: float) -> float:
        cx, cy = int(x) % cells_x, int(y) % cells_y
        fx, fy = smooth(x - int(x)), smooth(y - int(y))
        corner = lambda dx, dy: lattice[(cy + dy) % cells_y][(cx + dx) % cells_x]
        top = corner(0, 0) + (corner(1, 0) - corner(0, 0)) * fx
        bottom = corner(0, 1) + (corner(1, 1) - corner(0, 1)) * fx
        return top + (bottom - top) * fy

    return noise


def blocks(width: int, height: int, block: tuple[int, int], stones: list[str], mortar: str, highlight: str, seed: str) -> Image.Image:
    """Staggered blocks with 1px mortar, tiling seamlessly in both directions."""
    rng = random.Random(seed)
    image = Image.new("RGBA", (width, height), hex_color(mortar))
    bw, bh = block
    for row in range(height // bh):
        shift = (bw // 2) * (row % 2)
        for col in range(width // bw):
            color = hex_color(rng.choice(stones))
            x0 = col * bw + shift
            for dy in range(bh - 1):
                for dx in range(bw - 1):
                    image.putpixel(((x0 + dx) % width, row * bh + dy), color)
            image.putpixel((x0 % width, row * bh), hex_color(highlight))
    return image


def cobble() -> Image.Image:
    """Roman paving for the bigger roads."""
    return blocks(16, 8, (4, 4), ["#b9b09a", "#a89f88", "#c4bca6", "#9e957f"], "#7a705c", "#d6cfba", "cobble")


def dirt() -> Image.Image:
    """A worn earth track: mottled, with faint wheel ruts and ragged edges with a darker lip.
    Outside the edges is transparent, so the ground shows through."""
    rng = random.Random("dirt")
    width, height, ragged = 64, 14, 3
    edges = value_noise(16, 2, "dirt-edges")
    ground = value_noise(4, 7, "dirt-ground")
    tones = [hex_color(c) for c in ["#a68c66", "#b49a72", "#bfa57c"]]
    lip, shade, pebble = hex_color("#836a48"), hex_color("#9a8160"), hex_color("#d6c7a6")
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    for x in range(width):
        top = round(edges(x * 16 / width, 0) * ragged)
        bottom = height - 1 - round(edges(x * 16 / width, 1) * ragged)
        for y in range(top, bottom + 1):
            # Stretched along the road, so the mottling reads as ruts.
            value = ground(x * 4 / width, y / 2) + (rng.random() - 0.5) * 0.25
            color = tones[min(2, int(value * 3))]
            if y in (top, bottom):
                color = lip
            elif y in (top + 1, bottom - 1) and rng.random() < 0.6:
                color = shade
            image.putpixel((x, y), color)
    for _ in range(6):
        x, y = rng.randrange(width), rng.randrange(ragged + 2, height - ragged - 2)
        image.putpixel((x, y), pebble)
    return image


def floor() -> Image.Image:
    """Warm plank floors inside the buildings: staggered planks with grain and seams."""
    rng = random.Random("floor")
    width, height, plank = 16, 16, 4
    tones = [hex_color(c) for c in ["#b88a55", "#ab7d4a", "#c4965f"]]
    grain, highlight, seam = (hex_color(c) for c in ["#94683b", "#d2a671", "#6e4a28"])
    image = Image.new("RGBA", (width, height))
    for row in range(height // plank):
        top = row * plank
        joint = (row * 7) % width
        tone = rng.choice(tones)
        for y in range(top, top + plank):
            for x in range(width):
                image.putpixel((x, y), tone)
        for x in range(width):
            image.putpixel((x, top), highlight if rng.random() < 0.5 else tone)
            image.putpixel((x, top + plank - 1), seam)
            if rng.random() < 0.3:
                image.putpixel((x, top + 1 + rng.randrange(plank - 2)), grain)
        for y in range(top, top + plank):
            image.putpixel((joint, y), seam)
    return image


def sprinkle(image: Image.Image, on: tuple[int, int, int, int], tufts: int, flowers: int, seed: str) -> None:
    """Grass tufts and small flowers, only where the image shows the `on` colour."""
    rng = random.Random(seed)
    shade, light = hex_color("#5f9a44"), hex_color("#a6d47a")
    petals = [hex_color(c) for c in ["#f4f1e6", "#f5d547", "#e58fb6", "#8fb4ec"]]
    width, height = image.size

    def put(x: int, y: int, color: tuple[int, int, int, int]) -> None:
        if image.getpixel((x % width, y % height)) == on:
            image.putpixel((x % width, y % height), color)

    for _ in range(tufts):
        x, y = rng.randrange(width), rng.randrange(height)
        # A little V of blades with a lit tip.
        put(x, y, shade)
        put(x - 1, y - 1, shade)
        put(x + 1, y - 1, shade)
        put(x, y - 1, light)
    for _ in range(flowers):
        x, y = rng.randrange(width), rng.randrange(height)
        petal = rng.choice(petals)
        for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            put(x + dx, y + dy, petal)
        put(x, y, hex_color("#f0b030"))


def grass() -> Image.Image:
    """Open ground: grass with tufts and the odd flower."""
    color = hex_color("#7bb35a")
    image = Image.new("RGBA", (64, 64), color)
    sprinkle(image, color, tufts=40, flowers=5, seed="grass")
    return image


def trampled() -> Image.Image:
    """Grass worn down to dirt in patches, for built-up areas."""
    rng = random.Random("trampled")
    size, cells = 64, 8
    noise = value_noise(cells, cells, "trampled")
    grass, worn, dirt = (hex_color(c) for c in ["#9fbf6a", "#b3b56f", "#c6ad78"])
    image = Image.new("RGBA", (size, size))
    for y in range(size):
        for x in range(size):
            value = noise(x * cells / size, y * cells / size) + (rng.random() - 0.5) * 0.12
            image.putpixel((x, y), dirt if value > 0.68 else worn if value > 0.55 else grass)
    sprinkle(image, grass, tufts=25, flowers=2, seed="trampled-grass")
    return image


def post() -> Image.Image:
    """A timber post for building corners, seen from above."""
    art = ["oooooo", "oHhhdo", "ohhhdo", "ohhhdo", "oddddo", "oooooo"]
    colors = {"o": "#1e120a", "H": "#8a5e36", "h": "#6b4527", "d": "#4a2f1a"}
    image = Image.new("RGBA", (6, 6))
    for y, row in enumerate(art):
        for x, char in enumerate(row):
            image.putpixel((x, y), hex_color(colors[char]))
    return image


CLOUD_SHAPES = [
    # A round puff.
    (24, 12, [(7, 7.5, 4.5), (12.5, 5.5, 5.5), (18, 7.5, 4.5)]),
    # A long, flat bank.
    (36, 10, [(5, 6.5, 3.5), (11, 5, 4.5), (18, 5.5, 4.5), (25, 4.5, 4), (31, 6.5, 3.5)]),
]


def cloud(shape: int) -> Image.Image:
    """Overlapping circles, shaded underneath. Drawn semi-transparent over the map."""
    width, height, puffs = CLOUD_SHAPES[shape]
    white, shade = hex_color("#ffffff"), hex_color("#dbe5ec")
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    for y in range(height):
        for x in range(width):
            if any((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r for cx, cy, r in puffs):
                image.putpixel((x, y), shade if y >= height - 3 else white)
    return image


def bird(frame: int) -> Image.Image:
    """A bird seen from above, heading down the image: wings raised, then level."""
    art = [["o.....o", ".o...o.", "..ooo..", "...o..."], [".......", "ooo.ooo", "...o...", "......."]][frame]
    image = Image.new("RGBA", (7, 4), (0, 0, 0, 0))
    for y, row in enumerate(art):
        for x, char in enumerate(row):
            if char == "o":
                image.putpixel((x, y), hex_color("#2b2b2b"))
    return image


def water(frame: int) -> Image.Image:
    """Water with glints that move between the two frames, so it shimmers."""
    rng = random.Random(f"water-{frame}")
    size = 32
    image = Image.new("RGBA", (size, size), hex_color("#4a86c8"))
    for _ in range(10):
        x, y = rng.randrange(size), rng.randrange(size)
        image.putpixel((x, y), hex_color("#8fc0ef"))
        image.putpixel(((x + 1) % size, y), hex_color("#8fc0ef"))
        if rng.random() < 0.4:
            image.putpixel(((x + 2) % size, y), hex_color("#e6f3ff"))
    return image


def rain() -> Image.Image:
    """Slanted streaks on transparency, tiled over the screen and scrolled down."""
    rng = random.Random("rain")
    size = 32
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    for _ in range(9):
        x, y = rng.randrange(size), rng.randrange(size)
        for step in range(5):
            image.putpixel(((x - step // 2) % size, (y + step) % size), (210, 225, 255, 150))
    return image


def smoke(frame: int) -> Image.Image:
    """Three puffs rising from a chimney at the bottom; the frames loop."""
    width, height = 8, 16
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    for puff in range(3):
        rise = (puff * 5 + frame * 1.25) % 15
        cy = height - 2.5 - rise
        cx = 3.5 + math.sin(rise / 3) * 1.2
        radius = 1.1 + rise / 9
        alpha = round(200 * (1 - rise / 16))
        for y in range(height):
            for x in range(width):
                if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= radius * radius:
                    image.putpixel((x, y), (214, 214, 210, alpha))
    return image


def butterfly(frame: int) -> Image.Image:
    """Wings open, then folded."""
    art = [["oo.oo", "ooboo", ".obo.", "oo.oo"], [".....", ".obo.", ".obo.", "....."]][frame]
    colors = {"o": "#f0a030", "b": "#2b2b2b"}
    image = Image.new("RGBA", (5, 4), (0, 0, 0, 0))
    for y, row in enumerate(art):
        for x, char in enumerate(row):
            if char != ".":
                image.putpixel((x, y), hex_color(colors[char]))
    return image


def firefly() -> Image.Image:
    """A small glow."""
    image = Image.new("RGBA", (3, 3), (0, 0, 0, 0))
    for x, y in [(1, 0), (0, 1), (2, 1), (1, 2)]:
        image.putpixel((x, y), (245, 213, 71, 140))
    image.putpixel((1, 1), (255, 250, 190, 255))
    return image


# Each art pixel is drawn this many screen pixels wide.
TEXTURES = {"cobble": (cobble, 2), "dirt": (dirt, 1), "floor": (floor, 2), "trampled": (trampled, 2), "post": (post, 1), "grass": (grass, 2), "cloud-0": (lambda: cloud(0), 4), "cloud-1": (lambda: cloud(1), 4), "bird-0": (lambda: bird(0), 3), "bird-1": (lambda: bird(1), 3),
    "water-0": (lambda: water(0), 2),
    "water-1": (lambda: water(1), 2),
    "rain": (rain, 2),
    "butterfly-0": (lambda: butterfly(0), 2),
    "butterfly-1": (lambda: butterfly(1), 2),
    "firefly": (firefly, 2),
}
for frame in range(4):
    TEXTURES[f"smoke-{frame}"] = (lambda frame=frame: smoke(frame), 1)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (draw, zoom) in TEXTURES.items():
        image = draw()
        image = image.resize((image.width * zoom, image.height * zoom), Image.NEAREST)
        for scale, suffix in [(1, ""), (2, "@2x"), (3, "@3x")]:
            image.resize((image.width * scale, image.height * scale), Image.NEAREST).save(OUT / f"{name}{suffix}.png")


if __name__ == "__main__":
    main()
