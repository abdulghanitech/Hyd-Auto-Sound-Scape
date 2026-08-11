import * as THREE from "three";
import { V_MAX, vibrationAmplitude } from "./physics.js";

/* Camera modes.

   CHASE is the default. New players need spatial awareness in the first five
   seconds, and it's the only mode where you can see the auto you're driving.

   BACKSEAT is the brand shot — it reproduces the framing of bg.jpg, the still
   the old site was built around. It's parented under the body pivot, so it
   inherits roll, pitch and bounce for free; that inheritance is the entire
   reason POV feels right without any extra code.

   Hard rule enforced below: nothing beat-driven moves the camera more than
   0.15° or 2 mm. Beat-locked camera motion is the fastest way to make people
   motion sick, and it reads as a music video rather than a ride. */

export const CAMERA_MODES = ["chase", "backseat", "driver"];

const CONFIG = {
  chase: {
    label: "CHASE",
    offset: new THREE.Vector3(0, 2.4, -5.5),
    lookHeight: 1.0,
    hFov: 74,
    fovGain: 10,
    rollShare: 0.35, // camera rolls with the body — this is what makes corners feel violent
    vibScale: 1,
    springed: true,
  },
  backseat: {
    label: "BACK SEAT",
    // Sit on the RIGHT of the bench; the driver sits left and forward. Putting
    // both on the centreline made the driver's head fill the whole frame — in
    // the reference art his shoulder occupies the left third and the road is
    // visible past him.
    offset: new THREE.Vector3(0.34, 1.2, -0.86),
    lookHeight: 1.06,
    hFov: 68,
    fovGain: 4,
    rollShare: 1, // rides the body exactly — it IS in the body
    vibScale: 0.5, // halved, or POV makes people queasy
    springed: false,
  },
  driver: {
    label: "DRIVER",
    offset: new THREE.Vector3(0, 1.18, 0.35),
    lookHeight: 1.05,
    hFov: 76,
    fovGain: 6,
    rollShare: 1,
    vibScale: 0.5,
    springed: false,
  },
};

export class CameraRig {
  constructor(stage, { reducedMotion = false } = {}) {
    this.stage = stage;
    this.camera = stage.camera;
    this.reducedMotion = reducedMotion;

    this.mode = "chase";
    this.position = new THREE.Vector3();
    this.lookAt = new THREE.Vector3();
    this.roll = 0;

    this.shake = 0;
    this.shakeDecay = 3.2;

    this._desired = new THREE.Vector3();
    this._lookTarget = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);

    // Cinematic intro move
    this.intro = null;

    this.setMode("chase", { instant: true });
  }

  setMode(mode, { instant = false } = {}) {
    if (!CONFIG[mode]) return;
    this.mode = mode;
    this.config = CONFIG[mode];
    this.stage.setHorizontalFov(this.config.hFov);
    if (instant) this._snap = true;
  }

  cycle() {
    const i = CAMERA_MODES.indexOf(this.mode);
    this.setMode(CAMERA_MODES[(i + 1) % CAMERA_MODES.length]);
    return this.config.label;
  }

  /** One-shot camera kick, used for collisions and the tip-over flirt. */
  addShake(amount) {
    if (this.reducedMotion) return;
    this.shake = Math.min(this.shake + amount, 1.4);
  }

  /**
   * A scripted camera move that overrides normal following.
   * Any player input cancels it — never trap someone in a cutscene.
   */
  playIntro(curve, duration, { fovFrom, fovTo, lookAt }) {
    this.intro = { curve, duration, t: 0, fovFrom, fovTo, lookAt };
  }

  cancelIntro() {
    this.intro = null;
  }

  get introPlaying() {
    return this.intro !== null;
  }

  update(vehicle, dt, elapsed, beat) {
    const cfg = this.config;

    if (this.intro) {
      this.#updateIntro(dt, vehicle);
      return;
    }

    // Where the camera wants to be, in the auto's frame of reference.
    this._desired
      .copy(cfg.offset)
      .applyAxisAngle(this._up, vehicle.yaw)
      .add(vehicle.position);

    if (!cfg.springed) {
      // POV cameras ride the body, so they inherit bounce and pitch directly.
      this._desired.y += vehicle.bounce;
    }

    if (cfg.springed && !this._snap) {
      // Exponential spring arm — frame-rate independent, unlike a raw lerp.
      const k = 1 - Math.exp(-dt * 4.5);
      this.position.lerp(this._desired, k);
    } else {
      this.position.copy(this._desired);
      this._snap = false;
    }

    // Look ahead of where the auto is going, not at where it is. Leading the
    // velocity vector is most of what makes chase cam feel like driving.
    const lead = cfg.springed ? vehicle.speed * 0.25 : vehicle.speed * 0.1;
    this._lookTarget
      .copy(vehicle.forward)
      .multiplyScalar(lead + 4)
      .add(vehicle.position);
    this._lookTarget.y += cfg.lookHeight + vehicle.bounce * (cfg.springed ? 0.4 : 1);

    if (cfg.springed) {
      const k = 1 - Math.exp(-dt * 6.0);
      this.lookAt.lerp(this._lookTarget, k);
    } else {
      this.lookAt.copy(this._lookTarget);
    }

    this.#applyShake(vehicle, dt, elapsed, beat);

    this.camera.position.copy(this.position);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.lookAt);

    // Roll the camera with the body. Chase gets a share of it; POV gets all of
    // it because the camera is physically inside the shell.
    const targetRoll = vehicle.roll * cfg.rollShare * (1 + 0.4 * vehicle.tipping);
    this.roll += (targetRoll - this.roll) * (1 - Math.exp(-dt * 9));
    this.camera.rotateZ(this.reducedMotion ? this.roll * 0.25 : this.roll);

    // Speed opens the FOV — cheap, and it does more for the sensation of speed
    // than any amount of motion blur.
    const speedT = THREE.MathUtils.clamp(Math.abs(vehicle.speed) / V_MAX, 0, 1);
    this.stage.setHorizontalFov(cfg.hFov + cfg.fovGain * speedT);
  }

  #applyShake(vehicle, dt, elapsed, beat) {
    if (this.reducedMotion) return;

    // Engine vibration — continuous, never beat-locked.
    const vib = vibrationAmplitude(vehicle) * this.config.vibScale;
    const hz = vehicle.rpm / 60;
    this.position.y += Math.sin(elapsed * Math.PI * 2 * hz) * vib;
    this.position.x += Math.sin(elapsed * Math.PI * 2 * hz * 0.5) * vib * 0.6;

    // Impulse shake from collisions and near-tips.
    if (this.shake > 0.001) {
      const s = this.shake * this.shake * 0.32;
      this.position.x += (Math.random() - 0.5) * s;
      this.position.y += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - this.shakeDecay * dt);
    }

    // The ONLY beat-driven camera term, and it is deliberately tiny.
    if (beat && this.config.springed) {
      this.position.y += beat.downbeat * 0.0015;
    }
  }

  #updateIntro(dt, vehicle) {
    const m = this.intro;
    m.t += dt;
    const t = THREE.MathUtils.clamp(m.t / m.duration, 0, 1);
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    m.curve.getPoint(eased, this.position);
    this.position.applyAxisAngle(this._up, vehicle.yaw).add(vehicle.position);

    this._lookTarget
      .copy(m.lookAt)
      .applyAxisAngle(this._up, vehicle.yaw)
      .add(vehicle.position);
    this.lookAt.copy(this._lookTarget);

    this.camera.position.copy(this.position);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.lookAt);

    this.stage.setHorizontalFov(THREE.MathUtils.lerp(m.fovFrom, m.fovTo, eased));

    if (t >= 1) {
      this.intro = null;
      this._snap = true;
    }
  }
}
