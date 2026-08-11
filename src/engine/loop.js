/**
 * Frame loop with a fixed-timestep physics accumulator.
 *
 * Two things here are load-bearing:
 *
 *  1. dt is clamped unconditionally. Come back to a backgrounded tab and the
 *     raw delta is 30+ seconds, which flings the auto through the map. This is
 *     the single most common bug in browser games.
 *
 *  2. Physics runs at a fixed 120 Hz regardless of display rate, so the vehicle
 *     feels identical on a 60 Hz phone, a 120 Hz iPad and a 144 Hz monitor.
 *     Rendering still happens once per animation frame.
 */

export const FIXED_DT = 1 / 120;
const MAX_FRAME_DT = 0.05; // 20 fps floor — beyond this we simply lose time
const MAX_SUBSTEPS = 8;

export class Loop {
  constructor({ update, render, onFrameCost }) {
    this.update = update;
    this.render = render;
    this.onFrameCost = onFrameCost ?? (() => {});

    this.running = false;
    this.accumulator = 0;
    this.last = 0;
    this.elapsed = 0;
    this.frame = 0;

    this._tick = this._tick.bind(this);
    this._onVisibility = () => {
      // Stop burning battery when hidden, but never pause the music — audio
      // continuing in the background is a feature, not a bug.
      if (document.hidden) this.stop();
      else this.start();
    };
    document.addEventListener("visibilitychange", this._onVisibility);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.accumulator = 0; // discard whatever time passed while we were stopped
    this.raf = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  _tick(now) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this._tick);

    const rawDt = (now - this.last) / 1000;
    this.last = now;

    const dt = Math.min(rawDt, MAX_FRAME_DT);
    this.elapsed += dt;
    this.frame++;

    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
      this.update(FIXED_DT, this.elapsed);
      this.accumulator -= FIXED_DT;
      steps++;
    }
    // Ran out of substeps (a long stall): drop the backlog rather than
    // spiral-of-death our way through it.
    if (steps >= MAX_SUBSTEPS) this.accumulator = 0;

    // Fraction of a physics step we're ahead by, for render interpolation.
    const alpha = this.accumulator / FIXED_DT;
    this.render(dt, this.elapsed, alpha);

    this.onFrameCost(performance.now() - now);
  }

  dispose() {
    this.stop();
    document.removeEventListener("visibilitychange", this._onVisibility);
  }
}
