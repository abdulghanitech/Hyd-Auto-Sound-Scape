/* Seeded PRNG. Every world is generated from a fixed seed, so the city is
   byte-identical for every player on every load — screenshots match, and bug
   reports are reproducible. */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Convenience wrapper with the helpers world generation actually reaches for. */
export function makeRng(seed) {
  const r = mulberry32(seed);
  return {
    next: r,
    /** Uniform float in [min, max). */
    range: (min, max) => min + r() * (max - min),
    /** Uniform integer in [min, max]. */
    int: (min, max) => Math.floor(min + r() * (max - min + 1)),
    /** True with probability p. */
    chance: (p) => r() < p,
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    /** Signed jitter in [-amount, amount). */
    jitter: (amount) => (r() * 2 - 1) * amount,
  };
}

/* ---- 1D value noise, used for road roughness and any smooth wander ---- */

function hash1(n) {
  const s = Math.sin(n) * 43758.5453123;
  return s - Math.floor(s);
}

/** Smooth 1D noise in [-1, 1]. Cheap enough to call per physics substep. */
export function noise1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return (hash1(i) * (1 - u) + hash1(i + 1) * u) * 2 - 1;
}
