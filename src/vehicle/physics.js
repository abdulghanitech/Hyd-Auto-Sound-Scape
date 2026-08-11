import * as THREE from "three";
import { noise1 } from "../world/rng.js";

/* Arcade vehicle model for a Bajaj RE three-wheeler.

   Not a rigid-body sim — a kinematic bicycle model plus a lateral slip term
   plus three visual springs. Runs at a fixed 120 Hz substep (see loop.js) with
   semi-implicit Euler, so it never explodes and is frame-rate independent.

   Real Bajaj RE geometry, because the numbers drive the feel:
     wheelbase 2.00 m, rear track 1.15 m, wheel radius 0.22 m, CG height 0.62 m.

   That CG height is the whole personality. Static rollover threshold is
   T/(2h) = 0.575/0.62 = 0.93 g, which is why real autos genuinely tip up onto
   two wheels. We model it honestly and then scale it back for playability. */

export const AUTO = {
  wheelbase: 2.0,
  rearTrack: 1.15,
  wheelRadius: 0.22,
  cgHeight: 0.62,
};

const V_MAX = 16.5; // m/s ≈ 59 km/h
const V_REV_MAX = -3.5;
const A_DRIVE_0 = 5.2; // m/s² at standstill
const A_BRAKE = 9.0;
const D_MAX = 0.62; // rad — 35.5°, autos have enormous steering lock
const STEER_RATE_IN = 3.4; // rad/s toward the target
const STEER_RATE_OUT = 6.0; // rad/s returning to centre (self-centring is faster)
const GRIP_DRY = 8.5; // lateral grip ceiling, m/s²
const GRIP_WET = 5.8;

const TIP_THRESHOLD = 0.24; // rad ≈ 14° — beyond this we play the "about to go over" act

export class VehicleState {
  constructor() {
    this.position = new THREE.Vector3();
    this.yaw = 0;

    this.speed = 0; // along heading, m/s
    this.lateralVel = 0; // sideways scrub, m/s
    this.steer = 0; // actual steer angle, rad
    this.yawRate = 0;

    // Visual springs — these never feed back into the driving simulation.
    this.roll = 0;
    this.rollVel = 0;
    this.pitch = 0;
    this.pitchVel = 0;
    this.bounce = 0;
    this.bounceVel = 0;

    this.distance = 0; // odometer, metres — drives road roughness sampling
    this.rpm = 900;
    this.gear = 0;
    this.shiftTimer = 0;

    this.slip = 0; // 0..1, how far past the grip limit we are
    this.tipping = 0; // 0..1, how close to going over
    this.lastCollision = 0;

    this.grip = GRIP_DRY;
    this.roughness = 1;
    this.potholes = [];
    this._pendingRearHit = null;

    this.forward = new THREE.Vector3(0, 0, 1);
    this.right = new THREE.Vector3(1, 0, 0);
  }

  reset(position, yaw = 0) {
    this.position.copy(position);
    this.yaw = yaw;

    // Recompute the basis here too. stepVehicle() normally maintains these, but
    // it doesn't run on the title screen — and the camera aims using `forward`,
    // so leaving it at its default pointed the opening shot away from the
    // landmark the auto was deliberately parked facing.
    this.forward.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.right.set(Math.cos(yaw), 0, -Math.sin(yaw));

    this.speed = 0;
    this.lateralVel = 0;
    this.steer = 0;
    this.roll = this.rollVel = 0;
    this.pitch = this.pitchVel = 0;
    this.bounce = this.bounceVel = 0;
    this.slip = 0;
    this.tipping = 0;
    this._pendingRearHit = null;
  }

  get speedKmh() {
    return Math.abs(this.speed) * 3.6;
  }
}

/**
 * One fixed physics substep.
 *
 * @param {VehicleState} s
 * @param {{throttle:number, brake:number, steer:number, handbrake:boolean}} input
 * @param {number} dt  fixed, 1/120
 */
export function stepVehicle(s, input, dt, elapsed) {
  const throttle = clamp01(input.throttle);
  const brake = clamp01(input.brake);
  const steerIn = THREE.MathUtils.clamp(input.steer, -1, 1);

  /* ---------- steering ---------- */

  // Steering authority bleeds off with speed. Without this the auto is
  // undriveable above ~8 m/s — it behaves like an air-hockey puck.
  const authority = 0.3 + 0.7 / (1 + Math.pow(Math.abs(s.speed) / 7.0, 1.6));
  const target = steerIn * D_MAX * authority;
  const returningToCentre = Math.abs(target) < Math.abs(s.steer);
  const rate = returningToCentre ? STEER_RATE_OUT : STEER_RATE_IN;
  s.steer = approach(s.steer, target, rate * dt);

  /* ---------- longitudinal ---------- */

  const aDrive = A_DRIVE_0 * (1 - Math.abs(s.speed) / V_MAX);
  const aRoll = 0.9 + 0.06 * Math.abs(s.speed); // rolling resistance
  const aDrag = 0.0022 * s.speed * s.speed;

  let accel = throttle * aDrive - aRoll * Math.sign(s.speed || 1) - aDrag * Math.sign(s.speed || 1);

  if (brake > 0) {
    if (s.speed > 0.15) accel -= brake * A_BRAKE;
    else accel -= brake * A_DRIVE_0 * 0.55; // brake becomes reverse at a standstill
  }
  if (throttle === 0 && brake === 0 && Math.abs(s.speed) < 0.4) {
    s.speed = approach(s.speed, 0, 3 * dt); // settle cleanly rather than creeping
  }

  const prevSpeed = s.speed;
  s.speed = THREE.MathUtils.clamp(s.speed + accel * dt, V_REV_MAX, V_MAX);
  const aLong = (s.speed - prevSpeed) / dt;

  /* ---------- yaw, grip and slide ---------- */

  let grip = s.grip;
  // Handbrake below 6 m/s breaks the rear loose — this is the tight in-traffic
  // pivot every auto driver does, and it's free.
  if (input.handbrake && Math.abs(s.speed) < 6) grip *= 0.35;

  const rDesired = (s.speed / AUTO.wheelbase) * Math.tan(s.steer);
  const aLatRequired = s.speed * rDesired;
  const excess = Math.abs(aLatRequired) - grip;

  s.slip = THREE.MathUtils.clamp(excess / grip, 0, 1);

  // Past the grip limit the auto understeers — it turns less than commanded and
  // the surplus becomes sideways scrub.
  s.yawRate = rDesired * (1 - 0.55 * s.slip);
  if (excess > 0) s.lateralVel += Math.sign(aLatRequired) * excess * dt;
  s.lateralVel *= Math.exp(-dt * (6.0 - 3.5 * s.slip));

  s.yaw += s.yawRate * dt;

  s.forward.set(Math.sin(s.yaw), 0, Math.cos(s.yaw));
  s.right.set(Math.cos(s.yaw), 0, -Math.sin(s.yaw));

  s.position.addScaledVector(s.forward, s.speed * dt);
  s.position.addScaledVector(s.right, s.lateralVel * dt);
  s.distance += Math.abs(s.speed) * dt;

  /* ---------- body roll: the signature ---------- */

  const aLat = s.speed * s.yawRate;
  const rollTarget = THREE.MathUtils.clamp(
    (-(AUTO.cgHeight * aLat) / (9.81 * (AUTO.rearTrack / 2))) * 0.55,
    -0.3,
    0.3,
  );

  // Deliberately under-damped (ζ = 0.35). The overshoot and the visible second
  // wobble ARE the feel — critically damped roll reads like a sedan.
  spring(s, "roll", "rollVel", rollTarget, 7.5, 0.35, dt);

  s.tipping = THREE.MathUtils.clamp(
    (Math.abs(s.roll) - TIP_THRESHOLD) / (0.3 - TIP_THRESHOLD),
    0,
    1,
  );
  // Flirt with going over, never actually do it. Bleed speed so it self-recovers.
  if (s.tipping > 0) s.speed *= 1 - 0.12 * s.tipping * dt * 60 * dt;

  /* ---------- pitch: squat and dive ---------- */

  spring(s, "pitch", "pitchVel", THREE.MathUtils.clamp(-aLong * 0.028, -0.09, 0.09), 9.0, 0.55, dt);

  /* ---------- suspension ---------- */

  const speedFactor = Math.min(Math.abs(s.speed) / 6, 1);
  const road =
    (noise1(s.distance * 0.55) * 0.035 + noise1(s.distance * 2.3) * 0.012) *
    speedFactor *
    s.roughness;

  // Potholes hit the front axle, then the rear one wheelbase-length later.
  // One impulse reads as a glitch; two reads as a vehicle.
  const hit = consumePothole(s);
  if (hit) s.bounceVel -= 1.4;
  if (s._pendingRearHit !== null) {
    s._pendingRearHit -= dt;
    if (s._pendingRearHit <= 0) {
      s.bounceVel -= 1.1;
      s._pendingRearHit = null;
    }
  }

  spring(s, "bounce", "bounceVel", road, 11.0, 0.28, dt);

  // Two-stroke idle shake, ~690 rpm.
  if (Math.abs(s.speed) < 0.5) {
    s.bounce += Math.sin(elapsed * Math.PI * 2 * 11.5) * 0.004;
    s.roll += Math.sin(elapsed * Math.PI * 2 * 5.75) * 0.0025;
  }

  updateRpm(s, dt, throttle);
}

/* ---------- gearbox (visual only — there is no engine audio) ---------- */

const RATIOS = [3.6, 2.1, 1.45, 1.05];
const FINAL_DRIVE = 4.4;

function updateRpm(s, dt, throttle) {
  if (s.shiftTimer > 0) {
    s.shiftTimer -= dt;
    s.rpm = Math.max(900, s.rpm * (1 - 2.2 * dt));
    return;
  }

  const wheelRps = Math.abs(s.speed) / AUTO.wheelRadius;
  const raw = (wheelRps * RATIOS[s.gear] * FINAL_DRIVE * 60) / (Math.PI * 2);
  s.rpm = THREE.MathUtils.clamp(raw + throttle * 250, 900, 6200);

  if (s.rpm > 5600 && s.gear < RATIOS.length - 1) {
    s.gear++;
    s.shiftTimer = 0.18;
  } else if (s.rpm < 2400 && s.gear > 0) {
    s.gear--;
  }
}

/** Engine vibration amplitude, in metres. Halved by POV cameras — see cameraRig. */
export function vibrationAmplitude(s) {
  return 0.0018 + 0.0032 * THREE.MathUtils.smoothstep(s.rpm, 900, 6200);
}

/* ---------- collisions ---------- */

/**
 * Soft collision response. No damage model, no rigid resolution — push apart,
 * scrub speed, and let the camera shake sell it.
 */
export function applyCollision(s, normal, strength = 1) {
  s.speed *= 1 - 0.45 * strength;
  s.lateralVel += normal.x * s.right.x * 2.2 * strength + normal.z * s.right.z * 2.2 * strength;
  s.position.addScaledVector(normal, 0.12 * strength);
  s.bounceVel -= 0.8 * strength;
  s.rollVel += (Math.random() - 0.5) * 2.4 * strength;
  s.lastCollision = performance.now();
}

/* ---------- helpers ---------- */

function consumePothole(s) {
  if (!s.potholes.length) return false;
  for (const p of s.potholes) {
    if (p.hitAt && s.distance - p.hitAt < 6) continue;
    const dx = s.position.x - p.x;
    const dz = s.position.z - p.z;
    if (dx * dx + dz * dz < p.r * p.r) {
      p.hitAt = s.distance;
      s._pendingRearHit = Math.abs(s.speed) > 0.5 ? AUTO.wheelbase / Math.abs(s.speed) : null;
      return true;
    }
  }
  return false;
}

/** Semi-implicit damped spring. Mutates s[pos] and s[vel] in place. */
function spring(s, pos, vel, target, omega, zeta, dt) {
  const accel = omega * omega * (target - s[pos]) - 2 * zeta * omega * s[vel];
  s[vel] += accel * dt;
  s[pos] += s[vel] * dt;
}

function approach(current, target, maxDelta) {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export { GRIP_DRY, GRIP_WET, V_MAX };
