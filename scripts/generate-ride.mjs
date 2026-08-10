#!/usr/bin/env node
/**
 * Minimal infinite auto-travel loop.
 *
 * Renders a short forward-only POV: dusk sky, vanishing-point asphalt,
 * scrolling center dashes, yellow canopy silhouette, baked micro-bump.
 * Dash phase wraps exactly after N frames so the loop is seamless.
 *
 * Usage: node scripts/generate-ride.mjs
 * Writes: bg.mp4, bg.jpg  (and portrait variants used by hero-video.js)
 */

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const FPS = 24;
const FRAMES = 120; // 5.0s — dash period divides evenly
const LAND = { w: 1280, h: 720 };
const PORT = { w: 720, h: 1280 };

/* Road dashes: world units along depth. Period chosen so phase wraps in FRAMES. */
const DASH_PERIOD = 0.22;
const SPEED = DASH_PERIOD; // one full dash cycle per loop → seamless

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Mix two RGB triples. */
function mix(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/**
 * Render one frame into a Uint8Array (RGB).
 * phase ∈ [0, 1) — dash scroll phase for this frame.
 * bumpY — vertical pixel offset for road vibration.
 */
function renderFrame(w, h, phase, bumpY) {
  const buf = new Uint8Array(w * h * 3);
  const cx = w * 0.5;
  const horizon = h * (w > h ? 0.42 : 0.38);
  const roadHalfNear = w * (w > h ? 0.55 : 0.62);
  const roadHalfFar = w * 0.018;

  // Canopy silhouette: yellow bars + dark hood band
  const canopyTop = h * 0.08;
  const hoodY = h * 0.82;
  const pillarW = w * (w > h ? 0.06 : 0.1);

  for (let y = 0; y < h; y++) {
    const yy = y + bumpY;
    const v = yy / h;

    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      let r, g, b;

      // --- sky (deep indigo → dusty amber) ---
      const skyT = smoothstep(0, horizon / h + 0.02, v);
      const zenith = [18, 22, 48];
      const mid = [72, 58, 78];
      const amber = [210, 140, 72];
      const dust = [245, 190, 120];
      let sky;
      if (v < horizon / h) {
        const t = v / (horizon / h);
        sky = t < 0.55 ? mix(zenith, mid, t / 0.55) : mix(mid, amber, (t - 0.55) / 0.45);
      } else {
        sky = mix(amber, dust, clamp((v - horizon / h) / 0.2, 0, 1));
      }
      // soft sun glow near horizon center
      const sunDx = (x - cx) / w;
      const sunDy = (yy - horizon) / h;
      const sun = Math.exp(-(sunDx * sunDx * 18 + sunDy * sunDy * 40)) * 0.55;
      r = sky[0] + sun * 40;
      g = sky[1] + sun * 22;
      b = sky[2] + sun * 8;

      // thin distant haze band
      if (Math.abs(yy - horizon) < h * 0.03) {
        const haze = 1 - Math.abs(yy - horizon) / (h * 0.03);
        const hm = mix([r, g, b], [190, 150, 110], haze * 0.35);
        r = hm[0];
        g = hm[1];
        b = hm[2];
      }

      // --- ground / road below horizon ---
      if (yy >= horizon) {
        const depth = (yy - horizon) / (h - horizon); // 0 at horizon → 1 near
        const depthEase = depth * depth; // perspective weight
        const half = lerp(roadHalfFar, roadHalfNear, depthEase);
        const dx = x - cx;
        const nx = dx / half; // -1..1 across road

        // roadside dust
        const dustCol = mix([48, 36, 28], [92, 68, 42], depthEase);
        r = dustCol[0];
        g = dustCol[1];
        b = dustCol[2];

        if (Math.abs(nx) <= 1.0) {
          // asphalt
          const asphalt = mix([32, 30, 34], [52, 48, 50], depthEase);
          const edge = smoothstep(1.0, 0.92, Math.abs(nx));
          r = lerp(dustCol[0], asphalt[0], edge);
          g = lerp(dustCol[1], asphalt[1], edge);
          b = lerp(dustCol[2], asphalt[2], edge);

          // shoulder lines (soft)
          const shoulder = Math.abs(Math.abs(nx) - 0.88);
          if (shoulder < 0.04 && depth > 0.05) {
            const a = (1 - shoulder / 0.04) * smoothstep(0.05, 0.2, depth) * 0.7;
            r = lerp(r, 220, a);
            g = lerp(g, 210, a);
            b = lerp(b, 180, a);
          }

          // center dashes — scroll in world depth units
          // Map screen depth to a 1/depth-like world z, then add phase.
          const worldZ = 1 / (depthEase + 0.04);
          const dashCoord = worldZ * 0.08 + phase * (1 / DASH_PERIOD) * DASH_PERIOD;
          // Actually use phase directly on a repeating pattern along depth:
          const along = (1 / (depth + 0.08)) * 0.35 + phase;
          const dashWave = ((along % DASH_PERIOD) + DASH_PERIOD) % DASH_PERIOD;
          const dashOn = dashWave < DASH_PERIOD * 0.42;
          const onCenter = Math.abs(nx) < lerp(0.06, 0.035, depthEase);
          if (dashOn && onCenter && depth > 0.06) {
            const a = smoothstep(0.06, 0.18, depth) * 0.95;
            r = lerp(r, 235, a);
            g = lerp(g, 220, a);
            b = lerp(b, 160, a);
          }
        } else {
          // sparse roadside speckles (dust / pebbles) — deterministic
          const n = Math.sin(x * 12.9898 + yy * 78.233) * 43758.5453;
          const f = n - Math.floor(n);
          if (f > 0.992 && depth > 0.25) {
            r += 18;
            g += 14;
            b += 8;
          }
        }
      }

      // --- yellow canopy / pillars / hood (auto framing) ---
      const inTopBar = yy < canopyTop;
      const inHood = yy > hoodY;
      const inLeftPillar = x < pillarW && yy < hoodY + h * 0.02;
      const inRightPillar = x > w - pillarW && yy < hoodY + h * 0.02;

      if (inTopBar || inLeftPillar || inRightPillar) {
        const yellow = [245, 197, 24];
        const shade = inTopBar ? 1 : 0.82;
        // slight metal gradient
        const gT = inLeftPillar || inRightPillar ? (x < cx ? x / pillarW : (w - x) / pillarW) : 1 - yy / canopyTop;
        r = yellow[0] * shade * lerp(0.75, 1, clamp(gT, 0, 1));
        g = yellow[1] * shade * lerp(0.75, 1, clamp(gT, 0, 1));
        b = yellow[2] * shade * lerp(0.7, 1, clamp(gT, 0, 1));
      }

      if (inHood) {
        // dark hood curve — soft upper edge
        const hoodT = smoothstep(hoodY, hoodY + h * 0.04, yy);
        const hoodCol = [22, 20, 18];
        // subtle yellow lip at hood leading edge
        const lip = 1 - smoothstep(hoodY, hoodY + h * 0.012, yy);
        r = lerp(r, hoodCol[0], hoodT * 0.92);
        g = lerp(g, hoodCol[1], hoodT * 0.92);
        b = lerp(b, hoodCol[2], hoodT * 0.92);
        if (lip > 0) {
          r = lerp(r, 230, lip * 0.55);
          g = lerp(g, 180, lip * 0.55);
          b = lerp(b, 30, lip * 0.55);
        }
      }

      // soft vignette
      const vx = (x / w - 0.5) * 1.15;
      const vy = (y / h - 0.45) * 1.05;
      const vig = clamp(1 - (vx * vx + vy * vy) * 0.55, 0.55, 1);
      r *= vig;
      g *= vig;
      b *= vig;

      buf[i] = clamp(r, 0, 255) | 0;
      buf[i + 1] = clamp(g, 0, 255) | 0;
      buf[i + 2] = clamp(b, 0, 255) | 0;
    }
  }
  return buf;
}

function bumpForFrame(f) {
  // Irregular ~1–2px vertical bump; period independent of dash loop
  return Math.sin(f * 0.9) * 1.4 + Math.sin(f * 1.7) * 0.7;
}

async function encodeMp4(w, h, outPath) {
  const args = [
    "-y",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "-s",
    `${w}x${h}`,
    "-r",
    String(FPS),
    "-i",
    "-",
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-profile:v",
    "high",
    "-crf",
    "26",
    "-preset",
    "slow",
    "-movflags",
    "+faststart",
    outPath,
  ];
  const ff = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
  let err = "";
  ff.stderr.on("data", (d) => {
    err += d.toString();
  });

  for (let f = 0; f < FRAMES; f++) {
    const phase = (f / FRAMES) * SPEED; // wraps: frame 0 == continuation of FRAMES-1
    const bump = bumpForFrame(f);
    const frame = renderFrame(w, h, phase, bump);
    if (!ff.stdin.write(frame)) {
      await once(ff.stdin, "drain");
    }
  }
  ff.stdin.end();
  const code = await new Promise((resolve) => ff.on("close", resolve));
  if (code !== 0) {
    throw new Error(`ffmpeg failed (${code}): ${err.slice(-800)}`);
  }
}

async function writePoster(w, h, outPath) {
  // Mid-loop still via ffmpeg from a single raw frame
  const phase = 0.5 * SPEED;
  const frame = renderFrame(w, h, phase, 0);
  const ff = spawn(
    "ffmpeg",
    [
      "-y",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-s",
      `${w}x${h}`,
      "-i",
      "-",
      "-frames:v",
      "1",
      "-q:v",
      "4",
      outPath,
    ],
    { stdio: ["pipe", "ignore", "pipe"] }
  );
  let err = "";
  ff.stderr.on("data", (d) => {
    err += d.toString();
  });
  ff.stdin.write(frame);
  ff.stdin.end();
  const code = await new Promise((resolve) => ff.on("close", resolve));
  if (code !== 0) throw new Error(`poster ffmpeg failed: ${err.slice(-400)}`);
}

async function main() {
  console.log(`Rendering ${FRAMES} frames @ ${FPS}fps (seamless dash period)…`);
  const bgMp4 = path.join(ROOT, "bg.mp4");
  const bgJpg = path.join(ROOT, "bg.jpg");
  const pMp4 = path.join(ROOT, "bg-portrait.mp4");
  const pJpg = path.join(ROOT, "bg-portrait.jpg");

  await encodeMp4(LAND.w, LAND.h, bgMp4);
  await writePoster(LAND.w, LAND.h, bgJpg);
  await encodeMp4(PORT.w, PORT.h, pMp4);
  await writePoster(PORT.w, PORT.h, pJpg);

  const { statSync } = await import("node:fs");
  for (const p of [bgMp4, bgJpg, pMp4, pJpg]) {
    const n = statSync(p).size;
    console.log(`${path.basename(p)}: ${(n / 1024).toFixed(1)} KB`);
  }
  const landBytes = statSync(bgMp4).size;
  if (landBytes > 1.2 * 1024 * 1024) {
    console.warn(`Warning: bg.mp4 is ${(landBytes / 1024 / 1024).toFixed(2)}MB (target ≤1.2MB)`);
  } else {
    console.log("bg.mp4 within ≤1.2MB budget");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
