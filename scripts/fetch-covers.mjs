#!/usr/bin/env node
/**
 * Pull YouTube thumbnails for every track in public/tracks.js and write square
 * disc art into public/covers/disc — the folder the player reads from.
 *
 * The 16:9 originals go to a temp dir rather than the repo: nothing references
 * them, and the old version left ~2.4 MB of unused images checked in.
 *
 * Usage: npm run covers
 */

import { readFileSync, mkdirSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tracksPath = join(root, "public", "tracks.js");
const coversDir = join(tmpdir(), "hyd-auto-covers");
const discDir = join(root, "public", "covers", "disc");

mkdirSync(discDir, { recursive: true });
mkdirSync(coversDir, { recursive: true });

const src = readFileSync(tracksPath, "utf8");
const ids = [...src.matchAll(/youtubeId:\s*"([^"]+)"/g)].map((m) => m[1]);

if (!ids.length) {
  console.error("No youtubeId entries found in public/tracks.js");
  process.exit(1);
}

async function download(id) {
  const out = join(coversDir, `${id}.jpg`);
  const candidates = [
    `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/sddefault.jpg`,
    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  ];

  for (const url of candidates) {
    const res = await fetch(url);
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    // YouTube sometimes returns a tiny grey placeholder for missing maxres.
    if (buf.length < 5000) continue;
    writeFileSync(out, buf);
    return out;
  }
  throw new Error(`Could not download cover for ${id}`);
}

function makeDisc(id, srcPath) {
  const dest = join(discDir, `${id}.jpg`);
  try {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        srcPath,
        "-vf",
        "crop=min(iw\\,ih):min(iw\\,ih),scale=640:640",
        "-q:v",
        "4",
        dest,
      ],
      { stdio: "ignore" },
    );
  } catch {
    // ffmpeg optional — fall back to the raw thumbnail path in tracks if needed
    if (!existsSync(dest)) {
      writeFileSync(dest, readFileSync(srcPath));
    }
  }
}

for (const id of ids) {
  process.stdout.write(`${id} … `);
  try {
    const path = await download(id);
    makeDisc(id, path);
    console.log("ok");
  } catch (err) {
    console.log(`FAIL (${err.message})`);
  }
}

rmSync(coversDir, { recursive: true, force: true });

console.log(
  `\nDone. ${ids.length} track(s) → public/covers/disc/.` +
  `\nEdit public/tracks.js anytime, then re-run npm run covers.`,
);
