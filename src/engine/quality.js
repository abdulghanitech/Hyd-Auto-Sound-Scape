/* Quality tiers.

   Tier is decided by MEASURING frame cost, not by sniffing the UA string.
   WEBGL_debug_renderer_info is gone in Safari 17+, and "is it an iPhone" tells
   you nothing useful — an iPhone 15 and an iPhone SE differ by 5x. So we start
   at a guess, render for ~90 frames, and correct. */

export const TIERS = {
  high: {
    name: "high",
    maxDpr: 2,
    msaa: 4,
    bloom: true,
    bloomResScale: 1,
    shadows: true,
    grain: true,
    chromatic: true,
    reflector: true,
    crowd: 260,
    traffic: 18,
    motes: 900,
    drawDistance: 260,
  },
  mid: {
    name: "mid",
    maxDpr: 1.5,
    msaa: 0,
    bloom: true,
    bloomResScale: 0.5,
    shadows: false,
    grain: true,
    chromatic: true,
    reflector: false,
    crowd: 140,
    traffic: 12,
    motes: 400,
    drawDistance: 200,
  },
  low: {
    name: "low",
    maxDpr: 1.15,
    msaa: 0,
    bloom: false,
    bloomResScale: 0.5,
    shadows: false,
    grain: false,
    chromatic: false,
    reflector: false,
    crowd: 60,
    traffic: 8,
    motes: 0,
    drawDistance: 150,
  },
};

const ORDER = ["low", "mid", "high"];

export function isTouchPrimary() {
  return window.matchMedia?.("(pointer: coarse)").matches ?? "ontouchstart" in window;
}

export function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** Opening guess, refined at runtime by QualityGovernor. */
export function guessTier() {
  const mem = navigator.deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  const coarse = isTouchPrimary();

  if (coarse && (mem <= 3 || cores <= 4)) return TIERS.low;
  if (coarse) return TIERS.mid;
  if (cores <= 4 || mem <= 4) return TIERS.mid;
  return TIERS.high;
}

/**
 * Watches frame time and downgrades when the device can't keep up.
 *
 * Only ever downgrades. Auto-upgrading thrashes: a device that just dropped a
 * tier is usually about to get busy again, and oscillating quality looks far
 * worse than being one tier too low.
 */
export class QualityGovernor {
  constructor(tier, { onChange } = {}) {
    this.tier = tier;
    this.dprScale = 1;
    this.onChange = onChange ?? (() => {});
    this.samples = [];
    this.overBudgetFor = 0;
    this.locked = false; // set true when the user picks a tier by hand
    this.warmup = 30; // ignore the first frames — shaders are still compiling
  }

  setTier(tier, { manual = false } = {}) {
    if (manual) this.locked = true;
    if (tier === this.tier) return;
    this.tier = tier;
    this.dprScale = 1;
    this.onChange(this.effective());
  }

  /** The tier plus any DPR reduction applied on top of it. */
  effective() {
    return { ...this.tier, maxDpr: this.tier.maxDpr * this.dprScale };
  }

  sample(frameMs) {
    if (this.locked) return;
    if (this.warmup > 0) {
      this.warmup--;
      return;
    }

    this.samples.push(frameMs);
    if (this.samples.length < 60) return;

    // Median, not mean — one GC pause shouldn't cost the player a quality tier.
    const median = this.samples.slice().sort((a, b) => a - b)[30];
    this.samples.length = 0;

    if (median > 22) {
      this.overBudgetFor++;
      if (this.overBudgetFor < 2) return;
      this.overBudgetFor = 0;
      this.#downgrade();
    } else {
      this.overBudgetFor = 0;
    }
  }

  #downgrade() {
    // Shave resolution first: it's the cheapest large win and the least visible.
    if (this.dprScale > 0.62) {
      this.dprScale = Math.max(0.62, this.dprScale - 0.12);
      this.onChange(this.effective());
      return;
    }
    const i = ORDER.indexOf(this.tier.name);
    if (i > 0) {
      this.tier = TIERS[ORDER[i - 1]];
      this.dprScale = 1;
      this.onChange(this.effective());
    }
  }
}
