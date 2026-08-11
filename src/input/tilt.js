/* Optional tilt steering.

   iOS 13+ requires DeviceOrientationEvent.requestPermission() and it must be
   called from a user gesture. The only gesture we're guaranteed is the START
   RIDE tap, so enabling tilt is folded into that — never requested on load.

   Zero is calibrated at the moment of enabling, because plenty of people play
   lying down and "flat" is not a safe assumption. */

const DEADZONE_DEG = 3;
const FULL_LOCK_DEG = 22;
const SMOOTHING = 0.15; // one-pole low-pass; raw gamma is very noisy

export class TiltSteering {
  constructor({ onSteer }) {
    this.onSteer = onSteer;
    this.active = false;
    this.zero = 0;
    this.value = 0;
    this._onOrientation = this.#handle.bind(this);
  }

  static get supported() {
    return typeof window.DeviceOrientationEvent !== "undefined";
  }

  static get needsPermission() {
    return typeof window.DeviceOrientationEvent?.requestPermission === "function";
  }

  /** Must be called synchronously from within a user gesture on iOS. */
  async enable() {
    if (!TiltSteering.supported) return false;

    if (TiltSteering.needsPermission) {
      try {
        const res = await window.DeviceOrientationEvent.requestPermission();
        if (res !== "granted") return false;
      } catch {
        return false;
      }
    }

    window.addEventListener("deviceorientation", this._onOrientation);
    this.active = true;
    this.needsCalibration = true;
    return true;
  }

  disable() {
    window.removeEventListener("deviceorientation", this._onOrientation);
    this.active = false;
    this.value = 0;
    this.onSteer(0);
  }

  /** Re-zero to however the phone is being held right now. */
  calibrate() {
    this.needsCalibration = true;
  }

  #handle(e) {
    // gamma is left-to-right tilt in portrait; in landscape the axes swap.
    const landscape = Math.abs(window.orientation ?? 0) === 90;
    let raw = landscape ? (e.beta ?? 0) : (e.gamma ?? 0);
    if (landscape && (window.orientation ?? 0) === -90) raw = -raw;

    if (this.needsCalibration) {
      this.zero = raw;
      this.needsCalibration = false;
    }

    const deg = raw - this.zero;
    const sign = Math.sign(deg);
    const mag = Math.max(0, Math.abs(deg) - DEADZONE_DEG);
    const target = sign * Math.min(mag / (FULL_LOCK_DEG - DEADZONE_DEG), 1);

    this.value += (target - this.value) * SMOOTHING;
    this.onSteer(this.value);
  }

  dispose() {
    this.disable();
  }
}
