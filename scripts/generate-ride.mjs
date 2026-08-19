#!/usr/bin/env node
/**
 * Rebuild the Hyderabad auto windshield travel loop from illustrated keyframes.
 *
 * Cabin stays locked (yellow canopy, pillars, driver, garland); the street
 * through the windshield dollies forward. Landscape + portrait outputs.
 *
 * Keyframes: scripts/ride-keyframes/k01…k05.jpg + p01.jpg
 * Usage: npm run ride
 * Then bump VIDEO_V in hero-video.js
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KF = path.join(__dirname, "ride-keyframes");
const ENCODER = path.join(__dirname, "encode-ride.py");

for (const f of ["k01.jpg", "k02.jpg", "k03.jpg", "k04.jpg", "k05.jpg", "p01.jpg"]) {
  if (!existsSync(path.join(KF, f))) {
    console.error(`Missing keyframe ${f} in ${KF}`);
    process.exit(1);
  }
}

const child = spawn("python3", [ENCODER], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));
