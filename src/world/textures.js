import * as THREE from "three";
import { makeRng } from "./rng.js";

/* Every texture in the game is drawn on a 2D canvas at boot. Nothing is
   downloaded. That keeps the payload at ~530 KB total and means the art can be
   tuned by editing numbers rather than round-tripping through an image editor.

   VRAM budget: a 1024² RGBA texture is ~5.3 MB with mipmaps. We allow at most
   five at 1024²; everything else is 512² or smaller. */

const cache = new Map();

function canvas(size, height = size) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = height;
  return c;
}

function toTexture(c, { repeat, srgb = true, aniso = 4 } = {}) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = aniso;
  // Marks this texture as owned by the cache, not by any one scene — the deep
  // disposer skips these so switching maps doesn't destroy shared atlases.
  tex.userData.shared = true;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  return tex;
}

function memo(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

/* ---------------------------------------------------------------- asphalt */

export function asphaltTexture() {
  return memo("asphalt", () => {
    const size = 512;
    const c = canvas(size);
    const g = c.getContext("2d");
    const rng = makeRng(0x4a5f11);

    g.fillStyle = "#2b2724";
    g.fillRect(0, 0, size, size);

    // Aggregate grain
    for (let i = 0; i < 26000; i++) {
      const v = rng.range(0.06, 0.3);
      g.fillStyle = `rgba(${210 * v + 30},${200 * v + 28},${190 * v + 26},${rng.range(0.15, 0.5)})`;
      g.fillRect(rng.range(0, size), rng.range(0, size), rng.range(1, 2.6), rng.range(1, 2.6));
    }

    // Patch repairs — the darker rectangles every Indian road has
    for (let i = 0; i < 9; i++) {
      const w = rng.range(50, 170);
      const h = rng.range(35, 120);
      g.fillStyle = `rgba(18,16,15,${rng.range(0.22, 0.45)})`;
      g.fillRect(rng.range(0, size - w), rng.range(0, size - h), w, h);
    }

    // Cracks
    g.strokeStyle = "rgba(12,11,10,0.55)";
    for (let i = 0; i < 22; i++) {
      g.lineWidth = rng.range(0.6, 1.8);
      g.beginPath();
      let x = rng.range(0, size);
      let y = rng.range(0, size);
      g.moveTo(x, y);
      for (let s = 0; s < 7; s++) {
        x += rng.jitter(34);
        y += rng.jitter(34);
        g.lineTo(x, y);
      }
      g.stroke();
    }

    return toTexture(c, { repeat: [1, 1], aniso: 8 });
  });
}

/* ------------------------------------------------------- window atlas ---- */

/**
 * One 1024² atlas of 8×8 window-strip tiles. Buildings pick a random tile, so
 * thousands of facades look individually authored from a single texture and a
 * single draw call per material.
 *
 * Returns { map, emissive } — the emissive copy blacks out the unlit panes.
 */
export function windowAtlas(theme = "dusk") {
  return memo(`windows:${theme}`, () => {
    const size = 1024;
    const tiles = 8;
    const tile = size / tiles;

    const base = canvas(size);
    const emis = canvas(size);
    const gb = base.getContext("2d");
    const ge = emis.getContext("2d");
    const rng = makeRng(theme === "night" ? 0x91ab33 : 0x5512cc);

    const night = theme === "night";
    const wallLight = night ? "#1b1c24" : "#6d5c4a";
    const wallDark = night ? "#121319" : "#4c4034";
    const litRatio = night ? 0.62 : 0.22;

    ge.fillStyle = "#000";
    ge.fillRect(0, 0, size, size);

    for (let ty = 0; ty < tiles; ty++) {
      for (let tx = 0; tx < tiles; tx++) {
        const ox = tx * tile;
        const oy = ty * tile;

        const grd = gb.createLinearGradient(ox, oy, ox, oy + tile);
        grd.addColorStop(0, wallLight);
        grd.addColorStop(1, wallDark);
        gb.fillStyle = grd;
        gb.fillRect(ox, oy, tile, tile);

        // Plaster mottling
        for (let i = 0; i < 260; i++) {
          gb.fillStyle = `rgba(0,0,0,${rng.range(0.02, 0.1)})`;
          gb.fillRect(ox + rng.range(0, tile), oy + rng.range(0, tile), rng.range(2, 9), rng.range(2, 9));
        }

        const cols = rng.int(2, 4);
        const rows = rng.int(2, 4);
        const pad = tile * 0.14;
        const cw = (tile - pad * 2) / cols;
        const ch = (tile - pad * 2) / rows;

        for (let r = 0; r < rows; r++) {
          for (let cc = 0; cc < cols; cc++) {
            const x = ox + pad + cc * cw + cw * 0.14;
            const y = oy + pad + r * ch + ch * 0.12;
            const w = cw * 0.72;
            const h = ch * 0.7;

            const lit = rng.chance(litRatio);
            const warm = rng.chance(0.78);
            const glow = warm ? [255, 196, 118] : [176, 214, 255];

            // Recess shadow so windows read as holes, not stickers
            gb.fillStyle = "rgba(0,0,0,0.42)";
            gb.fillRect(x - 2, y - 2, w + 4, h + 4);

            if (lit) {
              const a = rng.range(0.72, 1);
              gb.fillStyle = `rgba(${glow[0]},${glow[1]},${glow[2]},${a})`;
              gb.fillRect(x, y, w, h);
              ge.fillStyle = `rgba(${glow[0]},${glow[1]},${glow[2]},${a})`;
              ge.fillRect(x, y, w, h);

              // Curtain / occupant silhouette
              if (rng.chance(0.45)) {
                gb.fillStyle = "rgba(40,26,14,0.5)";
                const sh = h * rng.range(0.2, 0.55);
                gb.fillRect(x, y, w, sh);
                ge.fillStyle = "rgba(0,0,0,0.5)";
                ge.fillRect(x, y, w, sh);
              }
            } else {
              gb.fillStyle = night ? "#0a0b10" : "#2a2620";
              gb.fillRect(x, y, w, h);
            }

            // Frame
            gb.strokeStyle = "rgba(28,24,20,0.75)";
            gb.lineWidth = 1.4;
            gb.strokeRect(x, y, w, h);
          }
        }
      }
    }

    return {
      map: toTexture(base, { aniso: 8 }),
      emissive: toTexture(emis, { aniso: 4 }),
      tiles,
    };
  });
}

/** UV offset/repeat for one random tile of the atlas. */
export function atlasTile(tiles, rng) {
  const tx = rng.int(0, tiles - 1);
  const ty = rng.int(0, tiles - 1);
  return { offset: [tx / tiles, ty / tiles], repeat: [1 / tiles, 1 / tiles] };
}

/* ------------------------------------------------------------- signage --- */

const SIGN_WORDS = [
  "IRANI CHAI", "BIRYANI", "HOTEL", "MEDICALS", "SWEETS", "CYCLE MART",
  "TAILORS", "STUDIO", "BANGLES", "PAAN", "XEROX", "TIFFINS",
  "GENERAL STORE", "MOBILES", "OSMANIA", "TEA STALL",
];

/** 16 shop boards in one 1024² atlas → one draw call for all signage. */
export function signageAtlas() {
  return memo("signage", () => {
    const size = 1024;
    const cols = 4;
    const tile = size / cols;
    const c = canvas(size);
    const g = c.getContext("2d");
    const rng = makeRng(0x7731aa);

    const palettes = [
      ["#1b6b3a", "#FFF8E8"], ["#B3261E", "#FFF8E8"], ["#F5C518", "#12100E"],
      ["#0B4F8A", "#FFF8E8"], ["#12100E", "#F5C518"], ["#D96A1E", "#FFF8E8"],
    ];

    for (let i = 0; i < 16; i++) {
      const ox = (i % cols) * tile;
      const oy = Math.floor(i / cols) * tile;
      const [bg, fg] = rng.pick(palettes);

      g.fillStyle = bg;
      g.fillRect(ox, oy, tile, tile);

      // Weathering
      for (let s = 0; s < 200; s++) {
        g.fillStyle = `rgba(0,0,0,${rng.range(0.02, 0.09)})`;
        g.fillRect(ox + rng.range(0, tile), oy + rng.range(0, tile), rng.range(3, 14), rng.range(2, 7));
      }

      g.strokeStyle = fg;
      g.lineWidth = 4;
      g.strokeRect(ox + 10, oy + 10, tile - 20, tile - 20);

      const word = SIGN_WORDS[i];
      g.fillStyle = fg;
      g.textAlign = "center";
      g.textBaseline = "middle";
      let fs = 46;
      g.font = `800 ${fs}px Syne, Figtree, sans-serif`;
      while (g.measureText(word).width > tile - 46 && fs > 16) {
        fs -= 2;
        g.font = `800 ${fs}px Syne, Figtree, sans-serif`;
      }
      g.fillText(word, ox + tile / 2, oy + tile / 2 - 6);

      // A decorative rule instead of faking a script we can't render properly.
      g.fillRect(ox + tile * 0.28, oy + tile * 0.68, tile * 0.44, 3);
    }

    return toTexture(c, { aniso: 8 });
  });
}

/* ------------------------------------------------- auto rear panel ------- */

/** The chase-camera money shot. Worth the extra care. */
export function rearPanelTexture() {
  return memo("rearPanel", () => {
    const w = 512;
    const h = 512;
    const c = canvas(w, h);
    const g = c.getContext("2d");
    const rng = makeRng(0x1188ee);

    g.fillStyle = "#F5C518";
    g.fillRect(0, 0, w, h);

    // Panel weathering and dust
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(90,68,10,${rng.range(0.015, 0.07)})`;
      g.fillRect(rng.range(0, w), rng.range(0, h), rng.range(2, 11), rng.range(2, 8));
    }

    g.fillStyle = "#12100E";
    g.fillRect(0, 0, w, 54);
    g.fillRect(0, h - 54, w, 54);

    g.textAlign = "center";
    g.textBaseline = "middle";

    g.fillStyle = "#F5C518";
    g.font = "800 34px Syne, sans-serif";
    g.fillText("HYD AUTO", w / 2, 27);

    // HORN OK PLEASE, hand-painted, three lines, slightly wonky.
    g.fillStyle = "#B3261E";
    g.font = "800 78px Syne, sans-serif";
    g.save();
    g.translate(w / 2, 168);
    g.rotate(-0.02);
    g.fillText("HORN", 0, 0);
    g.restore();

    g.fillStyle = "#1b6b3a";
    g.font = "800 94px Syne, sans-serif";
    g.save();
    g.translate(w / 2, 262);
    g.rotate(0.015);
    g.fillText("OK", 0, 0);
    g.restore();

    g.fillStyle = "#0B4F8A";
    g.font = "800 78px Syne, sans-serif";
    g.save();
    g.translate(w / 2, 352);
    g.rotate(-0.01);
    g.fillText("PLEASE", 0, 0);
    g.restore();

    // Painted flourishes
    g.strokeStyle = "#12100E";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(70, 410);
    g.bezierCurveTo(w / 2, 380, w / 2, 440, w - 70, 410);
    g.stroke();

    g.fillStyle = "#FFF8E8";
    g.font = "600 22px Figtree, sans-serif";
    g.fillText("TS 09 · HYDERABAD", w / 2, h - 27);

    return toTexture(c, { aniso: 8 });
  });
}

/** Live fare display — redrawn at 4 Hz while a ride is running. */
export function makeMeterTexture() {
  const c = canvas(256, 128);
  const g = c.getContext("2d");
  const tex = toTexture(c);

  function draw(fare, flagDown) {
    g.fillStyle = "#0a0d0a";
    g.fillRect(0, 0, 256, 128);
    g.strokeStyle = "#243024";
    g.lineWidth = 6;
    g.strokeRect(3, 3, 250, 122);

    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillStyle = "#7bd67b";
    g.font = "600 20px Figtree, sans-serif";
    g.fillText(flagDown ? "FARE" : "FOR HIRE", 18, 28);

    g.font = "800 62px Syne, sans-serif";
    g.fillStyle = flagDown ? "#8CFF8C" : "#2f4a2f";
    g.fillText(flagDown ? `₹${Math.floor(fare)}` : "₹--", 18, 78);

    tex.needsUpdate = true;
  }

  draw(0, false);
  return { texture: tex, draw };
}

/* ------------------------------------------------------------- misc ------ */

/** Soft radial blob — the fake contact shadow used instead of real shadows. */
export function blobShadowTexture() {
  return memo("blob", () => {
    const size = 128;
    const c = canvas(size);
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, "rgba(0,0,0,0.55)");
    grd.addColorStop(0.55, "rgba(0,0,0,0.28)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    return toTexture(c, { srgb: false });
  });
}

/** Additive glow sprite. Every light source in the game is one of these. */
export function glowTexture() {
  return memo("glow", () => {
    const size = 128;
    const c = canvas(size);
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.25, "rgba(255,236,190,0.55)");
    grd.addColorStop(1, "rgba(255,200,120,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    return toTexture(c, { srgb: false });
  });
}

/** Hanging fringe (jhalar) strip — one alpha-mapped plane, waved in the shader. */
export function fringeTexture() {
  return memo("fringe", () => {
    const w = 256;
    const h = 64;
    const c = canvas(w, h);
    const g = c.getContext("2d");
    const rng = makeRng(0x2244aa);
    const colors = ["#F5C518", "#B3261E", "#1b6b3a", "#D96A1E", "#FFF8E8"];

    g.clearRect(0, 0, w, h);
    const n = 16;
    for (let i = 0; i < n; i++) {
      g.fillStyle = colors[i % colors.length];
      const x = (i / n) * w;
      const bw = w / n - 2;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + bw, 0);
      g.lineTo(x + bw / 2, h * rng.range(0.72, 1));
      g.closePath();
      g.fill();
    }
    return toTexture(c, { repeat: [1, 1] });
  });
}

export function disposeTextures() {
  for (const v of cache.values()) {
    if (v?.dispose) v.dispose();
    else if (v?.map) {
      v.map.dispose();
      v.emissive?.dispose();
    }
  }
  cache.clear();
}
