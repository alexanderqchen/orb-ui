from pathlib import Path

from PIL import Image, ImageDraw


PUBLIC_DIR = Path(__file__).resolve().parents[1] / "demo" / "public"


def draw_orb(size: int) -> Image.Image:
    image = Image.new("RGBA", (size, size), (9, 9, 11, 255))
    draw = ImageDraw.Draw(image)
    cx = cy = size / 2

    outer = size * 0.305
    draw.ellipse(
        (cx - outer, cy - outer, cx + outer, cy + outer),
        outline=(255, 255, 255, 245),
        width=max(2, size // 18),
    )

    glow = size * 0.203
    draw.ellipse((cx - glow, cy - glow, cx + glow, cy + glow), fill=(79, 158, 255, 64))

    core = size * 0.113
    draw.ellipse((cx - core, cy - core, cx + core, cy + core), fill=(255, 255, 255, 255))
    return image


def main() -> None:
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    draw_orb(512).save(PUBLIC_DIR / "apple-touch-icon.png")

    sizes = (16, 32, 48, 64, 128, 256)
    icons = [draw_orb(size) for size in sizes]
    icons[0].save(
        PUBLIC_DIR / "favicon.ico",
        sizes=[(icon.width, icon.height) for icon in icons],
        append_images=icons[1:],
    )


if __name__ == "__main__":
    main()
