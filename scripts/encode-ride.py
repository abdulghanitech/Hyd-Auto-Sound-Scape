#!/usr/bin/env python3
"""Encode Hyderabad auto windshield travel loops.

Anti-clone rule: never lerp two traffic plates at once for long.
Hold one plate + dolly, then a short crossfade to the next.
Cabin stays locked to k01 the whole time.
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
    out = src.copy()
    for c in range(3):
        s, r = src[..., c], ref[..., c]
        out[..., c] = (s - s.mean()) * ((r.std() + 1e-3) / (s.std() + 1e-3)) + r.mean()
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
    return np.clip(mask, 0, 1) ** 0.7


def smoothstep(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def encode(out_mp4: Path, w: int, h: int, cabin, plates, mask, cy_ratio: float, crf: int, seconds: float = 14.0) -> None:
    """plates: sequence including return to first. Hold each, short xfade between."""
    fps = 24
    n = int(seconds * fps)
    mask3 = mask[..., None]
    n_plates = len(plates) - 1  # last equals first for loop
    # timeline: equal hold slots with short fades; final slot eases to identity
    fade_frac = 0.12  # of each slot
    slot = 1.0 / n_plates

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
        # which slot
        s = min(int(u / slot), n_plates - 1)
        local = (u - s * slot) / slot  # 0..1 within slot
        # zoom creeps forward within each hold, resets gently across fades
        hold_end = 1.0 - fade_frac
        if local < hold_end:
            zprog = local / hold_end
            zoom = 1.0 + 0.045 * smoothstep(zprog)
            blend = 0.0
            a_idx, b_idx = s, s
        else:
            t = (local - hold_end) / fade_frac
            ease = smoothstep(t)
            zoom = 1.045 * (1 - ease) + 1.0 * ease  # settle before next hold
            blend = ease
            a_idx, b_idx = s, s + 1

        bump_scale = 1.0
        # calm near absolute loop end
        if u > 0.90:
            bump_scale = 1.0 - 0.8 * smoothstep((u - 0.90) / 0.10)

        dy = bump_scale * (2.0 * np.sin(fi * 0.55) + 1.0 * np.sin(fi * 1.33))
        dx = bump_scale * (1.1 * np.sin(fi * 0.29))

        if blend <= 0:
            plate = plates[a_idx]
        else:
            # SHORT crossfade only — never long multi-plate lerp (that's what cloned the bikes)
            plate = plates[a_idx] * (1 - blend) + plates[b_idx] * blend

        exterior = sample(plate, zoom, dx=dx * 0.28, dy=dy * 0.24, cy_ratio=cy_ratio)
        interior = sample(
            cabin,
            1.0 + 0.002 * np.sin(fi * 0.4) * bump_scale,
            dx=dx * 0.08,
            dy=dy * 0.18,
            cy_ratio=cy_ratio,
        )
        frame = interior * (1 - mask3) + exterior * mask3
        frame = sample(frame, 1.0, dy=dy * 0.14, cy_ratio=cy_ratio)

        # snap to cabin still at the very end so hard-loop is invisible
        if u > 0.94:
            fade = smoothstep((u - 0.94) / 0.06)
            # crossfade toward first plate at zoom 1 (not cabin alone — keep street)
            end_ext = sample(plates[0], 1.0, cy_ratio=cy_ratio)
            end_frame = interior * (1 - mask3) + end_ext * mask3
            # prefer exact cabin+plate0 composite
            end_frame = cabin * (1 - mask3) + end_ext * mask3
            frame = frame * (1 - fade) + end_frame * fade

        proc.stdin.write(np.clip(frame, 0, 255).astype(np.uint8).tobytes())
        if fi % 48 == 0:
            print(f"{out_mp4.name} f={fi}/{n} slot={s} zoom={zoom:.3f} blend={blend:.2f}")

    proc.stdin.close()
    if proc.wait() != 0:
        sys.exit(f"ffmpeg failed for {out_mp4}")
    print(f"wrote {out_mp4} ({out_mp4.stat().st_size} bytes)")


def compress(src: Path, dst: Path, crf: str) -> None:
    subprocess.check_call(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(src),
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
            str(dst),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def main() -> None:
    for name in ("k01.jpg", "k02.jpg", "k03.jpg", "k04.jpg", "p01.jpg"):
        if not (KF / name).exists():
            sys.exit(f"missing {KF / name}")

    # Landscape — 4 sparse plates + return
    w, h = 1600, 900
    cabin = load(KF / "k01.jpg", w, h)
    plates = [match_color(load(KF / f"k{i}.jpg", w, h), cabin) for i in ("01", "02", "03", "04")]
    plates[0] = cabin
    plates.append(cabin)
    mask = windshield_mask(h, w, (0.06, 0.10), (0.80, 0.11), (0.07, 0.10), (0.87, 0.11))
    raw = ROOT / "bg-raw.mp4"
    encode(raw, w, h, cabin, plates, mask, 0.46, 19, 14)
    compress(raw, ROOT / "bg.mp4", "23")
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
    cabin = load(KF / "p01.jpg", w, h)
    # reuse landscape mids cropped into portrait as mild variation + return
    mids = [match_color(load(KF / f"k{i}.jpg", w, h), cabin) for i in ("02", "03", "04")]
    plates = [cabin] + mids + [cabin]
    mask = windshield_mask(h, w, (0.08, 0.10), (0.74, 0.12), (0.06, 0.10), (0.91, 0.09))
    raw = ROOT / "bg-portrait-raw.mp4"
    encode(raw, w, h, cabin, plates, mask, 0.40, 20, 14)
    compress(raw, ROOT / "bg-portrait.mp4", "24")
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
