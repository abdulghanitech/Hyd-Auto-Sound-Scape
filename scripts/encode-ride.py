#!/usr/bin/env python3
"""Encode Hyderabad auto windshield travel loops from illustrated keyframes.

Polish goals:
- Cabin locked; windshield content dollies forward
- Color-match plates to k01 so morphs don't flash
- End on k01 at zoom 1.0 with a long ease for a soft loop seam
- Bump amplitude eases near the loop point
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import numpy as np

KF = Path(__file__).resolve().parent / "ride-keyframes"
ROOT = Path(__file__).resolve().parents[1]


def load(path: Path, w: int, h: int) -> np.ndarray:
    raw = subprocess.check_output(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(path),
            "-vf",
            f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-",
        ]
    )
    return np.frombuffer(raw, dtype=np.uint8).reshape(h, w, 3).astype(np.float32)


def match_color(src: np.ndarray, ref: np.ndarray) -> np.ndarray:
    """Simple per-channel mean/std match toward ref (keeps mood consistent)."""
    out = src.copy()
    for c in range(3):
        s = src[..., c]
        r = ref[..., c]
        s_std = s.std() + 1e-3
        r_std = r.std() + 1e-3
        out[..., c] = (s - s.mean()) * (r_std / s_std) + r.mean()
    return np.clip(out, 0, 255)


def sample(img: np.ndarray, zoom: float, dx: float = 0.0, dy: float = 0.0, cy_ratio: float = 0.46) -> np.ndarray:
    h, w, _ = img.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = w * 0.50, h * cy_ratio
    xx2 = np.clip((xx - cx) / zoom + cx + dx, 0, w - 1.001)
    yy2 = np.clip((yy - cy) / zoom + cy + dy, 0, h - 1.001)
    x0 = np.floor(xx2).astype(np.int32)
    y0 = np.floor(yy2).astype(np.int32)
    x1 = np.minimum(x0 + 1, w - 1)
    y1 = np.minimum(y0 + 1, h - 1)
    wx = (xx2 - x0)[..., None]
    wy = (yy2 - y0)[..., None]
    return (
        img[y0, x0] * (1 - wx) * (1 - wy)
        + img[y0, x1] * wx * (1 - wy)
        + img[y1, x0] * (1 - wx) * wy
        + img[y1, x1] * wx * wy
    )


def windshield_mask(h: int, w: int, top, bottom, left, right) -> np.ndarray:
    ys = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    xs = np.linspace(0, 1, w, dtype=np.float32)[None, :]
    mask = np.ones((h, w), dtype=np.float32)
    mask *= np.clip((ys - top[0]) / top[1], 0, 1)
    mask *= np.clip((bottom[0] - ys) / bottom[1], 0, 1)
    mask *= np.clip((xs - left[0]) / left[1], 0, 1)
    mask *= np.clip((right[0] - xs) / right[1], 0, 1)
    # Feather edges so cabin/street join is soft
    return np.clip(mask, 0, 1) ** 0.72


def lerp_plates(plates, t: float) -> np.ndarray:
    x = t * (len(plates) - 1)
    i = int(np.floor(x))
    f = x - i
    f = f * f * (3 - 2 * f)
    i2 = min(i + 1, len(plates) - 1)
    return plates[i] * (1 - f) + plates[i2] * f


def smoothstep(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def encode(out_mp4: Path, w: int, h: int, base, plates, mask, cy_ratio: float, crf: int, seconds: float = 16.0) -> None:
    fps = 24
    n = int(seconds * fps)
    mask3 = mask[..., None]
    proc = subprocess.Popen(
        [
            "ffmpeg",
            "-y",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-s",
            f"{w}x{h}",
            "-r",
            str(fps),
            "-i",
            "-",
            "-an",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            str(crf),
            "-preset",
            "slow",
            "-movflags",
            "+faststart",
            str(out_mp4),
        ],
        stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    assert proc.stdin is not None

    # Timeline:
    # 0–78%  forward dolly + plate morph toward end plate
    # 78–100% long ease back to base @ zoom 1.0 (seamless hard-loop)
    travel_end = 0.78

    for fi in range(n):
        u = fi / n
        if u < travel_end:
            zprog = u / travel_end
            # ease-in-out zoom so motion never jerks
            e = smoothstep(zprog)
            zoom = 1.0 + 0.10 * e
            plate_t = e * 0.92  # leave headroom before return
            bump_scale = 1.0
        else:
            t = (u - travel_end) / (1.0 - travel_end)
            ease = smoothstep(t)
            # From current travel state back to identity
            zoom = (1.0 + 0.10) * (1 - ease) + 1.0 * ease
            plate_t = 0.92 * (1 - ease)  # blend back toward first plate
            bump_scale = 1.0 - 0.85 * ease  # calm the cabin near the seam

        dy = bump_scale * (2.2 * np.sin(fi * 0.58) + 1.1 * np.sin(fi * 1.37))
        dx = bump_scale * (1.3 * np.sin(fi * 0.31))

        plate = lerp_plates(plates, min(max(plate_t, 0.0), 0.999))
        exterior = sample(plate, zoom, dx=dx * 0.32, dy=dy * 0.28, cy_ratio=cy_ratio)
        interior = sample(
            base,
            1.0 + 0.0025 * np.sin(fi * 0.42) * bump_scale,
            dx=dx * 0.10,
            dy=dy * 0.22,
            cy_ratio=cy_ratio,
        )
        frame = interior * (1 - mask3) + exterior * mask3
        frame = sample(frame, 1.0, dy=dy * 0.16, cy_ratio=cy_ratio)

        # Final 8% crossfade whole frame toward exact base still → invisible loop cut
        if u > 0.92:
            fade = smoothstep((u - 0.92) / 0.08)
            frame = frame * (1 - fade) + base * fade

        proc.stdin.write(np.clip(frame, 0, 255).astype(np.uint8).tobytes())
        if fi % 48 == 0:
            print(f"{out_mp4.name} frame {fi}/{n} zoom={zoom:.3f} plate_t={plate_t:.3f}")

    proc.stdin.close()
    if proc.wait() != 0:
        sys.exit(f"ffmpeg failed for {out_mp4}")
    print(f"wrote {out_mp4} ({out_mp4.stat().st_size} bytes)")


def main() -> None:
    for name in ("k01.jpg", "k02.jpg", "k03.jpg", "k04.jpg", "k05.jpg", "p01.jpg"):
        if not (KF / name).exists():
            sys.exit(f"missing {KF / name}")

    # Landscape
    w, h = 1600, 900
    base = load(KF / "k01.jpg", w, h)
    plates = [match_color(load(KF / f"k{i}.jpg", w, h), base) for i in ("01", "02", "03", "04", "05")]
    plates[0] = base
    plates.append(base)
    mask = windshield_mask(h, w, (0.07, 0.11), (0.80, 0.12), (0.08, 0.11), (0.86, 0.12))
    raw = ROOT / "bg-raw.mp4"
    encode(raw, w, h, base, plates, mask, 0.46, 20, 16)
    subprocess.check_call(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(raw),
            "-an",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            "23",
            "-preset",
            "slow",
            "-movflags",
            "+faststart",
            str(ROOT / "bg.mp4"),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    raw.unlink(missing_ok=True)
    subprocess.check_call(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(KF / "k01.jpg"),
            "-vf",
            f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}",
            "-q:v",
            "3",
            str(ROOT / "bg.jpg"),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    # Portrait
    w, h = 1080, 1920
    base = load(KF / "p01.jpg", w, h)
    mid = [match_color(load(KF / f"k{i}.jpg", w, h), base) for i in ("02", "03", "04", "05")]
    plates = [base] + mid + [base]
    mask = windshield_mask(h, w, (0.09, 0.11), (0.74, 0.13), (0.07, 0.11), (0.90, 0.10))
    raw = ROOT / "bg-portrait-raw.mp4"
    encode(raw, w, h, base, plates, mask, 0.40, 21, 16)
    subprocess.check_call(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(raw),
            "-an",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            "24",
            "-preset",
            "slow",
            "-movflags",
            "+faststart",
            str(ROOT / "bg-portrait.mp4"),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    raw.unlink(missing_ok=True)
    subprocess.check_call(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(KF / "p01.jpg"),
            "-vf",
            f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}",
            "-q:v",
            "3",
            str(ROOT / "bg-portrait.jpg"),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    for name in ("bg.mp4", "bg.jpg", "bg-portrait.mp4", "bg-portrait.jpg"):
        p = ROOT / name
        print(f"{name}: {p.stat().st_size / 1024:.1f} KB")
    print("done — bump VIDEO_V in hero-video.js")


if __name__ == "__main__":
    main()
