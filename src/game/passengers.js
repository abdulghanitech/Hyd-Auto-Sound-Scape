import * as THREE from "three";
import { Meter } from "./fares.js";

/* Passengers.

   One at a time, deliberately. It keeps the whole system legible, removes any
   sense of a queue building up, and means the player can ignore it completely
   and just drive — which is the baseline the whole game is built around.

   Nothing here can fail. Passengers never expire angrily, there is no timer,
   and ignoring one for 90 seconds just makes them quietly wander off. */

const PICKUP_RADIUS = 4.5;
const PICKUP_SPEED = 2.5;
const PICKUP_HOLD = 0.6;
const DROPOFF_RADIUS = 6.0;
const IGNORE_TIMEOUT = 90;
const MIN_RIDE_DISTANCE = 150;

export const PHASE = { IDLE: "idle", HAILING: "hailing", ABOARD: "aboard" };

export class Passengers {
  constructor(scene, path, mapDef, rng, { onEvent }) {
    this.scene = scene;
    this.path = path;
    this.mapDef = mapDef;
    this.rng = rng;
    this.onEvent = onEvent ?? (() => {});

    this.meter = new Meter();
    this.phase = PHASE.IDLE;
    this.holdTimer = 0;
    this.ignoreTimer = 0;
    this.cooldown = 2.5;

    this.pickupPoint = new THREE.Vector3();
    this.dropoff = null;

    this.#buildMarkers();
  }

  #buildMarkers() {
    // Hail beacon — a soft column plus a ground ring.
    this.hailGroup = new THREE.Group();
    this.hailGroup.visible = false;

    // Additive + DoubleSide means front and back faces both contribute, so the
    // effective opacity is double what's set here. Kept low deliberately: at
    // full strength this reads as a hard white pillar rather than a soft marker.
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 9, 14, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xf5c518,
        transparent: true,
        opacity: 0.075,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    beam.position.y = 4.5;
    this.hailGroup.add(beam);

    // A short cap that renders through buildings, so you can always find them
    // in the Old City lanes without the whole column punching through walls.
    const tip = beam.clone();
    tip.material = beam.material.clone();
    tip.material.depthTest = false;
    tip.material.opacity = 0.1;
    tip.scale.set(0.5, 0.45, 0.5);
    tip.position.y = 10.5;
    tip.renderOrder = 12;
    this.hailGroup.add(tip);

    this.hailGroup.add(ring(0xf5c518));

    // The passenger themself
    this.figure = buildWaver();
    this.hailGroup.add(this.figure);

    this.scene.add(this.hailGroup);

    // Drop-off marker
    this.dropGroup = new THREE.Group();
    this.dropGroup.visible = false;
    const dbeam = beam.clone();
    dbeam.material = beam.material.clone();
    dbeam.material.color.setHex(0x5cd2a0);
    this.dropGroup.add(dbeam);
    const dtip = tip.clone();
    dtip.material = tip.material.clone();
    dtip.material.color.setHex(0x5cd2a0);
    dtip.renderOrder = 12;
    this.dropGroup.add(dtip);
    this.dropGroup.add(ring(0x5cd2a0));
    this.scene.add(this.dropGroup);
  }

  /* ---------------- lifecycle ---------------- */

  #spawnHail(playerDistance) {
    const ahead = this.rng.range(60, 140);
    const d = (playerDistance + ahead) % this.path.length;
    const fr = this.path.frameAtDistance(d);
    const side = this.rng.chance(0.5) ? 1 : -1;
    const lateral = side * (fr.halfWidth + 1.4);

    this.pickupPoint.copy(fr.position).addScaledVector(fr.right, lateral);
    this.pickupDistance = d;

    this.hailGroup.position.copy(this.pickupPoint);
    this.hailGroup.visible = true;
    this.figure.rotation.y = Math.atan2(-fr.right.x * side, -fr.right.z * side);

    this.phase = PHASE.HAILING;
    this.ignoreTimer = 0;
    this.onEvent({ type: "hail", position: this.pickupPoint });
  }

  #board() {
    // Pick a drop-off that's a real ride away, not around the corner.
    const candidates = this.mapDef.dropoffs
      .map((d) => {
        const dist = this.path.nearestDistance(new THREE.Vector3(d.x, 0, d.z));
        const delta = Math.abs(this.path.deltaDistance(this.pickupDistance, dist));
        return { ...d, dist, delta };
      })
      .filter((d) => d.delta > MIN_RIDE_DISTANCE);

    const list = candidates.length ? candidates : this.mapDef.dropoffs.map((d) => ({ ...d }));
    this.dropoff = this.rng.pick(list);

    this.dropGroup.position.set(this.dropoff.x, 0, this.dropoff.z);
    this.dropGroup.visible = true;
    this.hailGroup.visible = false;

    this.phase = PHASE.ABOARD;
    this.meter.start();
    this.onEvent({ type: "pickup", dropoff: this.dropoff });
  }

  #settle(beat) {
    const result = this.meter.settle(beat);
    this.dropGroup.visible = false;
    this.phase = PHASE.IDLE;
    this.cooldown = 3.0;
    this.onEvent({ type: "dropoff", result, dropoff: this.dropoff });
    this.dropoff = null;
    return result;
  }

  noteCollision() {
    this.meter.noteCollision();
  }

  /* ---------------- per-frame ---------------- */

  update(dt, elapsed, vehicle, beat) {
    const pos = vehicle.position;
    const speed = Math.abs(vehicle.speed);

    switch (this.phase) {
      case PHASE.IDLE: {
        this.cooldown -= dt;
        if (this.cooldown <= 0) {
          this.#spawnHail(this.path.nearestDistance(pos));
        }
        break;
      }

      case PHASE.HAILING: {
        this.ignoreTimer += dt;
        if (this.ignoreTimer > IGNORE_TIMEOUT) {
          // Quietly wander off. No nagging, ever.
          this.hailGroup.visible = false;
          this.phase = PHASE.IDLE;
          this.cooldown = 4;
          break;
        }

        // Wave, and bob a little on the beat so they read as part of the scene.
        this.figure.children[2].rotation.z =
          -0.6 + Math.sin(elapsed * 6) * 0.5 + (beat?.pulse ?? 0) * 0.15;

        if (pos.distanceTo(this.pickupPoint) < PICKUP_RADIUS && speed < PICKUP_SPEED) {
          this.holdTimer += dt;
          if (this.holdTimer >= PICKUP_HOLD) {
            this.holdTimer = 0;
            this.#board();
          }
        } else {
          this.holdTimer = 0;
        }
        break;
      }

      case PHASE.ABOARD: {
        this.meter.update(dt, vehicle);

        const dx = pos.x - this.dropoff.x;
        const dz = pos.z - this.dropoff.z;
        if (Math.hypot(dx, dz) < DROPOFF_RADIUS && speed < PICKUP_SPEED) {
          this.holdTimer += dt;
          if (this.holdTimer >= PICKUP_HOLD) {
            this.holdTimer = 0;
            this.#settle(beat);
          }
        } else {
          this.holdTimer = 0;
        }
        break;
      }
    }

    // Gentle idle animation on whichever marker is showing.
    const s = 1 + Math.sin(elapsed * 2.2) * 0.06;
    if (this.hailGroup.visible) this.hailGroup.children[2].scale.set(s, 1, s);
    if (this.dropGroup.visible) this.dropGroup.children[2].scale.set(s, 1, s);
  }

  /** Where the HUD arrow should point, or null. */
  get target() {
    if (this.phase === PHASE.HAILING) return this.pickupPoint;
    if (this.phase === PHASE.ABOARD && this.dropoff) {
      return new THREE.Vector3(this.dropoff.x, 0, this.dropoff.z);
    }
    return null;
  }

  get targetName() {
    if (this.phase === PHASE.HAILING) return "Passenger";
    if (this.phase === PHASE.ABOARD) return this.dropoff?.name ?? "";
    return "";
  }

  dispose() {
    this.scene.remove(this.hailGroup, this.dropGroup);
  }
}

/* ---------- markers ---------- */

function ring(color) {
  const geo = new THREE.RingGeometry(2.1, 2.6, 28);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
  );
  mesh.position.y = 0.06;
  mesh.renderOrder = 7;
  return mesh;
}

function buildWaver() {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: 0xf0e6d2, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x8d5a3b, roughness: 0.75 });

  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.85, 6), cloth);
  legs.position.y = 0.42;
  g.add(legs);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.42, 3, 8), cloth);
  torso.position.y = 1.1;
  g.add(torso);

  // Index 2 — the waving arm, animated above.
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.42, 3, 6), skin);
  arm.position.set(0.22, 1.32, 0);
  arm.geometry.translate(0, 0.21, 0);
  g.add(arm);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), skin);
  head.position.y = 1.52;
  g.add(head);

  return g;
}
