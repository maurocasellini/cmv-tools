"""Makes a PDF look as if it had been printed and scanned again."""
import io
import random

import numpy as np
import pymupdf
from PIL import Image, ImageEnhance, ImageFilter

PRESETS = {
    "leicht": dict(rot=0.35, shift=2, noise=3.0, blur=0.35, paper=0.985, shading=0.035,
                   specks=6, black=22, desat=0.92, quality=82, edge=False),
    "mittel": dict(rot=0.8, shift=4, noise=5.5, blur=0.55, paper=0.97, shading=0.07,
                   specks=18, black=32, desat=0.85, quality=72, edge=False),
    "stark": dict(rot=1.5, shift=7, noise=8.5, blur=0.8, paper=0.95, shading=0.11,
                  specks=45, black=42, desat=0.75, quality=62, edge=True),
}


def _lighting(h, w, strength, rng):
    """Uneven lighting: diagonal gradient + slight vignette."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    yy /= h
    xx /= w
    ang = rng.uniform(0, 2 * np.pi)
    lin = (np.cos(ang) * (xx - 0.5) + np.sin(ang) * (yy - 0.5)) + 0.5  # 0..1
    vign = ((xx - 0.5) ** 2 + (yy - 0.5) ** 2) * 2  # 0 Mitte .. 1 Ecken
    return 1.0 - strength * (0.6 * lin + 0.4 * vign)


def scanify_image(img, preset="mittel", color="gray", rng=None):
    p = PRESETS.get(preset, PRESETS["mittel"])
    rng = rng or random.Random()
    nrng = np.random.default_rng(rng.randrange(1 << 30))

    img = img.convert("RGB")
    if color == "color":
        img = ImageEnhance.Color(img).enhance(p["desat"])
    else:
        img = img.convert("L")

    # scanner optics: very slightly blurred
    img = img.filter(ImageFilter.GaussianBlur(p["blur"]))

    # sheet is slightly skewed and not perfectly aligned
    angle = rng.uniform(0.35, 1.0) * p["rot"] * rng.choice((-1, 1))
    dx = rng.uniform(-p["shift"], p["shift"])
    dy = rng.uniform(-p["shift"], p["shift"])
    fill = 255 if img.mode == "L" else (255, 255, 255)
    img = img.rotate(angle, resample=Image.BICUBIC, translate=(dx, dy), fillcolor=fill)

    arr = np.asarray(img).astype(np.float32)
    h, w = arr.shape[:2]

    # tones: black is never fully black, paper never fully white
    black = p["black"]
    if arr.ndim == 3:
        paper = np.array([p["paper"], p["paper"] - 0.004, p["paper"] - 0.014]) * 255
        arr = black + arr / 255.0 * (paper - black)
    else:
        arr = black + arr / 255.0 * (p["paper"] * 255 - black)

    light = _lighting(h, w, p["shading"], nrng)
    arr = arr * (light[..., None] if arr.ndim == 3 else light)

    # noise (sensor + paper texture)
    grain = nrng.normal(0, p["noise"], (h, w)).astype(np.float32)
    arr = arr + (grain[..., None] if arr.ndim == 3 else grain)

    # dust / specks
    for _ in range(p["specks"]):
        cy, cx = nrng.integers(0, h), nrng.integers(0, w)
        r = max(1, int(nrng.integers(1, 3)))
        val = nrng.uniform(40, 150)
        y0, y1, x0, x1 = max(0, cy - r), min(h, cy + r), max(0, cx - r), min(w, cx + r)
        arr[y0:y1, x0:x1] = np.minimum(arr[y0:y1, x0:x1], val)

    # shadow at the edge (scanner lid)
    if p["edge"]:
        side = rng.choice(("top", "left", "bottom", "right"))
        width = max(4, int(min(h, w) * 0.012))
        ramp = np.linspace(0.55, 1.0, width, dtype=np.float32)
        if side == "top":
            arr[:width] *= ramp[:, None, None] if arr.ndim == 3 else ramp[:, None]
        elif side == "bottom":
            arr[-width:] *= ramp[::-1, None, None] if arr.ndim == 3 else ramp[::-1, None]
        elif side == "left":
            arr[:, :width] *= ramp[None, :, None] if arr.ndim == 3 else ramp[None, :]
        else:
            arr[:, -width:] *= ramp[None, ::-1, None] if arr.ndim == 3 else ramp[None, ::-1]

    arr = np.clip(arr, 0, 255).astype(np.uint8)
    out = Image.fromarray(arr)
    if color == "bw":
        thr = 150 + nrng.uniform(-10, 10)
        out = out.point(lambda v: 255 if v > thr else 0).convert("L")
    return out


def scanify_pdf(doc, preset="mittel", color="gray", dpi=150):
    """Returns a new document in which every page is a 'scanned' image."""
    p = PRESETS.get(preset, PRESETS["mittel"])
    rng = random.Random()
    out = pymupdf.open()
    for page in doc:
        pix = page.get_pixmap(dpi=dpi, alpha=False)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        img = scanify_image(img, preset, color, rng)
        buf = io.BytesIO()
        if color == "bw":
            img.save(buf, format="PNG", optimize=True)
        else:
            img.save(buf, format="JPEG", quality=p["quality"], optimize=True)
        r = page.rect
        newp = out.new_page(width=r.width, height=r.height)
        newp.insert_image(newp.rect, stream=buf.getvalue())
    out.set_metadata({"producer": "Scanner", "creator": "Scanner"})
    return out
