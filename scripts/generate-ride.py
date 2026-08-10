#!/usr/bin/env python3
"""Rebuild the seamless auto-ride loops from illustrated keyframes.

Mirrors the roadways.wtf pattern: a fixed auto interior with motion in the
windshield, encoded as landscape + portrait H.264 loops (~2–2.5MB).

Requires: ffmpeg, numpy, keyframes in scripts/ride-keyframes/
  k01.jpg … k05.jpg  (1600×900)
  p01.jpg            (1080×1920)

Usage:
  python3 scripts/generate-ride.py
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
KF = Path(__file__).resolve().parent / "ride-keyframes"
OUT = ROOT


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


def sample(img: np.ndarray, zoom: float, dx: float = 0.0, dy: float = 0.0, cx_ratio=0.50, cy_ratio=0.48) -> np.ndarray:
    h, w, _ = img.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = w * cx_ratio, h * cy_ratio
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


def windshield_mask(h: int, w: int, *, top, bottom, left, right) -> np.ndarray:
    ys = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    xs = np.linspace(0, 1, w, dtype=np.float32)[None, :]
    mask = np.ones((h, w), dtype=np.float32)
    mask *= np.clip((ys - top[0]) / top[1], 0, 1)
    mask *= np.clip((bottom[0] - ys) / bottom[1], 0, 1)
    mask *= np.clip((xs - left[0]) / left[1], 0, 1)
    mask *= np.clip((right[0] - xs) / right[1], 0, 1)
    return np.clip(mask, 0, 1) ** 0.85


def lerp_plates(plates, t: float) -> np.ndarray:
    x = t * (len(plates) - 1)
    i = int(np.floor(x))
    f = x - i
    i2 = min(i + 1, len(plates) - 1)
    return plates[i] * (1 - f) + plates[i2] * f


def encode_loop(
    *,
    out_mp4: Path,
    base: np.ndarray,
    plates: list,
    mask: np.ndarray,
    w: int,
    h: int,
    cy_ratio: float,
    crf: str,
) -> None:
    fps = 24
    n = int(12.0 * fps)
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
            crf,
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
        tri = 1 - abs(2 * u - 1)
        zoom = 1.0 + 0.10 * tri
        dy = 2.2 * np.sin(fi * 0.55) + 1.1 * np.sin(fi * 1.3)
        dx = 1.4 * np.sin(fi * 0.31)
        plate = lerp_plates(plates, u)
        exterior = sample(plate, zoom, dx=dx * 0.3, dy=dy * 0.3, cy_ratio=cy_ratio)
        interior = sample(
            base,
            1.0 + 0.004 * np.sin(fi * 0.4),
            dx=dx * 0.15,
            dy=dy * 0.35,
            cy_ratio=cy_ratio,
        )
        frame = interior * (1 - mask3) + exterior * mask3
        frame = sample(frame, 1.0, dy=dy * 0.25, cy_ratio=cy_ratio)
        proc.stdin.write(np.clip(frame, 0, 255).astype(np.uint8).tobytes())
    proc.stdin.close()
    if proc.wait() != 0:
        sys.exit(f"ffmpeg failed for {out_mp4}")
    print(f"wrote {out_mp4} ({out_mp4.stat().st_size} bytes)")


def main() -> None:
    for name in ("k01.jpg", "k02.jpg", "k03.jpg", "k05.jpg", "p01.jpg"):
        if not (KF / name).exists():
            sys.exit(f"missing keyframe {KF / name}")

    # Landscape
    w, h = 1600, 900
    base = load(KF / "k01.jpg", w, h)
    plates = [load(KF / f"k{i}.jpg", w, h) for i in ("01", "02", "03", "05")]
    plates.append(base)
    mask = windshield_mask(h, w, top=(0.08, 0.12), bottom=(0.78, 0.14), left=(0.10, 0.12), right=(0.82, 0.14))
    encode_loop(
        out_mp4=OUT / "bg.mp4",
        base=base,
        plates=plates,
        mask=mask,
        w=w,
        h=h,
        cy_ratio=0.48,
        crf="23",
    )
    subprocess.check_call(
        ["ffmpeg", "-y", "-i", str(KF / "k01.jpg"), "-vf", f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}", "-q:v", "4", str(OUT / "bg.jpg")],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    # Portrait
    w, h = 1080, 1920
    base = load(KF / "p01.jpg", w, h)
    plates = [load(KF / f"k{i}.jpg", w, h) for i in ("01", "02", "03", "05")]
    plates[0] = base
    plates.append(base)
    mask = windshield_mask(h, w, top=(0.10, 0.12), bottom=(0.72, 0.14), left=(0.08, 0.12), right=(0.88, 0.12))
    encode_loop(
        out_mp4=OUT / "bg-portrait.mp4",
        base=base,
        plates=plates,
        mask=mask,
        w=w,
        h=h,
        cy_ratio=0.42,
        crf="25",
    )
    subprocess.check_call(
        ["ffmpeg", "-y", "-i", str(KF / "p01.jpg"), "-vf", f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}", "-q:v", "4", str(OUT / "bg-portrait.jpg")],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    print("done")


if __name__ == "__main__":
    main()
