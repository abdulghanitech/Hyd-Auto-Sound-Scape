import { VIBE_INTENSITY } from "./tracks.js";

/* Beat clock.

   The YouTube IFrame API's getCurrentTime() is a cached value pushed over
   postMessage — it's coarse, it jitters, and it can be up to a poll interval
   stale. Binding visuals to it directly makes everything stutter.

   So we run a local clock and phase-lock it to the polled value, PLL-style:
   small errors nudge the playback rate, large errors mean a seek or a track
   change and force a hard re-anchor. Converges in about two seconds and the
   correction is invisible. */

const HARD_RESYNC_THRESHOLD = 0.35; // seconds
const RATE_LIMITS = [0.985, 1.015];

export class BeatClock {
  constructor() {
    this.anchorMedia = 0;
    this.anchorWall = performance.now();
    this.rate = 1;
    this.running = false;

    this.bpm = 110;
    this.beatOffset = 0;
    this.beatsPerBar = 4;
    this.intensity = 1;

    // Ramps 0→1 after a resync so visuals fade in rather than snapping.
    this.confidence = 0;

    this.beatPhase = 0;
    this.barPhase = 0;
    this.pulse = 0;
    this.pulseSmooth = 0;
    this.downbeat = 0;
    this.bar = 0;

    this._lastBar = -1;
    this.onBar = null;
  }

  setTrack(track) {
    this.bpm = track.bpm;
    this.beatOffset = track.beatOffset;
    this.beatsPerBar = track.beatsPerBar;
    this.intensity = VIBE_INTENSITY[track.vibe] ?? 1;
    this.confidence = 0;
    this._lastBar = -1;
  }

  /** Playback started or resumed at this media time. */
  anchor(mediaTime) {
    this.anchorMedia = mediaTime;
    this.anchorWall = performance.now();
    this.rate = 1;
    this.running = true;
    this.confidence = 0;
  }

  pause() {
    // Freeze at the current estimate so resuming doesn't jump.
    this.anchorMedia = this.mediaTime;
    this.anchorWall = performance.now();
    this.running = false;
  }

  get mediaTime() {
    if (!this.running) return this.anchorMedia;
    return this.anchorMedia + ((performance.now() - this.anchorWall) / 1000) * this.rate;
  }

  /** Called on every poll of the real player (~4 Hz). */
  sync(polledTime) {
    if (!this.running) return;

    const err = polledTime - this.mediaTime;

    if (Math.abs(err) > HARD_RESYNC_THRESHOLD) {
      // A seek, a track change, or a buffer underrun.
      this.anchor(polledTime);
      return;
    }

    // Soft correction: nudge the rate and creep the anchor. Never jump.
    this.rate = clamp(this.rate + clamp(err, -0.05, 0.05) * 0.08, RATE_LIMITS[0], RATE_LIMITS[1]);
    this.anchorMedia += err * 0.06;
  }

  update(dt) {
    if (this.running) this.confidence = Math.min(1, this.confidence + dt / 1.5);
    else this.confidence = Math.max(0, this.confidence - dt / 0.4);

    const beatDuration = 60 / this.bpm;
    const beats = (this.mediaTime - this.beatOffset) / beatDuration;

    this.beatPhase = beats - Math.floor(beats);
    const barFloat = beats / this.beatsPerBar;
    this.barPhase = barFloat - Math.floor(barFloat);
    this.bar = Math.floor(barFloat);

    const gain = this.confidence * this.intensity;

    // Sharp attack, exponential decay — a linear ramp reads as a wobble.
    this.pulse = Math.pow(1 - this.beatPhase, 2.6) * gain;
    this.downbeat = Math.pow(1 - this.barPhase, 4) * gain;

    // One-pole smoothing, tau = 0.12 s, for anything that shouldn't flicker.
    const k = 1 - Math.exp(-dt / 0.12);
    this.pulseSmooth += (this.pulse - this.pulseSmooth) * k;

    if (this.bar !== this._lastBar) {
      this._lastBar = this.bar;
      if (this.running) this.onBar?.(this.bar);
    }
  }
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
