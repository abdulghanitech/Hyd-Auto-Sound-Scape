#!/usr/bin/env python3
"""Encode Hyderabad auto windshield travel loops from illustrated keyframes."""

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
    return np.clip(mask, 0, 1) ** 0.8


def lerp_plates(plates, t: float) -> np.ndarray:
    x = t * (len(plates) - 1)
    i = int(np.floor(x))
    f = x - i
    f = f * f * (3 - 2 * f)
    i2 = min(i + 1, len(plates) - 1)
    return plates[i] * (1 - f) + plates[i2] * f


def encode(out_mp4: Path, w: int, h: int, base, plates, mask, cy_ratio: float, crf: int, seconds: float = 14.0) -> None:
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
    for fi in range(n):
        u = fi / n
        if u < 0.85:
            zprog = u / 0.85
            zoom = 1.0 + 0.12 * zprog
            plate_t = zprog
        else:
            t = (u - 0.85) / 0.15
            ease = t * t * (3 - 2 * t)
            zoom = 1.12 * (1 - ease) + 1.0 * ease
            plate_t = 1.0
        dy = 2.6 * np.sin(fi * 0.62) + 1.3 * np.sin(fi * 1.41)
        dx = 1.6 * np.sin(fi * 0.33)
        plate = lerp_plates(plates, min(plate_t, 0.999))
        exterior = sample(plate, zoom, dx=dx * 0.35, dy=dy * 0.3, cy_ratio=cy_ratio)
        interior = sample(
            base,
            1.0 + 0.003 * np.sin(fi * 0.45),
            dx=dx * 0.12,
            dy=dy * 0.28,
            cy_ratio=cy_ratio,
        )
        frame = interior * (1 - mask3) + exterior * mask3
        frame = sample(frame, 1.0, dy=dy * 0.2, cy_ratio=cy_ratio)
        proc.stdin.write(np.clip(frame, 0, 255).astype(np.uint8).tobytes())
    proc.stdin.close()
    if proc.wait() != 0:
        sys.exit(f"ffmpeg failed for {out_mp4}")
    print(f"wrote {out_mp4} ({out_mp4.stat().st_size} bytes)")


def main() -> None:
    for name in ("k01.jpg", "k02.jpg", "k03.jpg", "k04.jpg", "k05.jpg", "p01.jpg"):
        if not (KF / name).exists():
            sys.exit(f"missing {KF / name}")

    w, h = 1600, 900
    base = load(KF / "k01.jpg", w, h)
    plates = [load(KF / f"k{i}.jpg", w, h) for i in ("01", "02", "03", "04", "05")]
    plates.append(base)
    mask = windshield_mask(h, w, (0.07, 0.11), (0.80, 0.12), (0.08, 0.11), (0.86, 0.12))
    raw = ROOT / "bg-raw.mp4"
    encode(raw, w, h, base, plates, mask, 0.46, 20, 14)
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

    w, h = 1080, 1920
    base = load(KF / "p01.jpg", w, h)
    plates = [base] + [load(KF / f"k{i}.jpg", w, h) for i in ("02", "03", "04", "05")] + [base]
    mask = windshield_mask(h, w, (0.09, 0.11), (0.74, 0.13), (0.07, 0.11), (0.90, 0.10))
    raw = ROOT / "bg-portrait-raw.mp4"
    encode(raw, w, h, base, plates, mask, 0.40, 21, 14)
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
            "25",
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
