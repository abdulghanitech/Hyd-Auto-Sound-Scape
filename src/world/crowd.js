import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/* Pedestrians.

   One merged ~180-triangle humanoid, drawn as an InstancedMesh per chunk. Two
   consequences of instancing per chunk rather than globally: frustum culling
   comes free (three culls the whole InstancedMesh by its bounding sphere), and
   nobody has to maintain a visible-slice bookkeeping structure.

   Walk paths are precomputed into a Float32Array at build time. Calling
   curve.getPoint() per pedestrian per frame would be the single most expensive
   thing in the game. */

const SKIN = [0x8d5a3b, 0x6f4229, 0xa9754c, 0x5c3720, 0xc08a5e];
const CLOTH = [
  0xf0e6d2, 0xb3261e, 0x1b6b3a, 0x0b4f8a, 0xf5c518, 0x6b2d8a,
  0xe8853a, 0x2b2b33, 0xd94f7a, 0x3aa8a0,
];

function humanoidGeometry() {
  const parts = [];

  const legs = new THREE.CylinderGeometry(0.13, 0.11, 0.85, 6);
  legs.translate(0, 0.42, 0);
  parts.push(legs);

  const torso = new THREE.CapsuleGeometry(0.16, 0.4, 3, 8);
  torso.translate(0, 1.08, 0);
  parts.push(torso);

  const head = new THREE.SphereGeometry(0.115, 8, 6);
  head.translate(0, 1.48, 0);
  parts.push(head);

  for (const side of [-1, 1]) {
    const arm = new THREE.CapsuleGeometry(0.05, 0.36, 3, 6);
    arm.translate(side * 0.21, 1.06, 0);
    parts.push(arm);
  }

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  // Reused by every chunk of every map, so the scene-graph disposer must leave
  // it alone. disposeCrowdGeometry() below owns its lifetime.
  merged.userData.shared = true;
  return merged;
}

let sharedGeometry = null;

export class Crowd {
  constructor(path, startDist, endDist, mapDef, rng, count) {
    if (!sharedGeometry) sharedGeometry = humanoidGeometry();

    this.count = count;
    this.path = path;

    const material = new THREE.MeshStandardMaterial({
      roughness: 0.9,
      metalness: 0,
      vertexColors: false,
    });

    this.mesh = new THREE.InstancedMesh(sharedGeometry, material, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = true;

    // Per-pedestrian state, kept in flat arrays.
    this.dist = new Float32Array(count);
    this.lateral = new Float32Array(count);
    this.speed = new Float32Array(count);
    this.phase = new Float32Array(count);
    this.dir = new Float32Array(count);
    this.scale = new Float32Array(count);

    const color = new THREE.Color();
    const fr = {};

    for (let i = 0; i < count; i++) {
      const d = rng.range(startDist, endDist);
      const side = rng.chance(0.5) ? -1 : 1;
      const hw = path.halfWidthAt(path.distanceToT(d));

      this.dist[i] = d;
      // Walk on the footpath, not the road.
      this.lateral[i] = side * (hw + 0.6 + rng.range(0, 2.2));
      this.speed[i] = rng.range(0.7, 1.5) * (rng.chance(0.5) ? 1 : -1);
      this.phase[i] = rng.range(0, Math.PI * 2);
      this.dir[i] = side;
      this.scale[i] = rng.range(0.92, 1.08);

      this.mesh.setColorAt(i, color.setHex(rng.pick(CLOTH)));
    }

    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._fr = fr;
    this.startDist = startDist;
    this.endDist = endDist;
  }

  update(dt, elapsed) {
    const m = this._m;
    const q = this._q;
    const p = this._p;
    const s = this._s;
    const span = this.endDist - this.startDist;

    for (let i = 0; i < this.count; i++) {
      this.dist[i] += this.speed[i] * dt;
      // Wrap within this chunk's span so pedestrians never wander into a
      // neighbouring chunk's instanced mesh.
      if (this.dist[i] > this.endDist) this.dist[i] -= span;
      else if (this.dist[i] < this.startDist) this.dist[i] += span;

      const fr = this.path.frameAtDistance(this.dist[i], this._fr);
      p.copy(fr.position).addScaledVector(fr.right, this.lateral[i]);

      // A bob and a slight sway is all a walk cycle needs at this distance.
      const t = elapsed * 5 + this.phase[i];
      p.y = 0.14 + Math.abs(Math.sin(t)) * 0.035;

      const yaw = Math.atan2(fr.forward.x, fr.forward.z) + (this.speed[i] > 0 ? 0 : Math.PI);
      q.setFromAxisAngle(UP, yaw);
      s.set(this.scale[i], this.scale[i], this.scale[i]);

      m.compose(p, q, s);
      this.mesh.setMatrixAt(i, m);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.material.dispose();
    // sharedGeometry is intentionally kept — it is reused across every chunk
    // and every map.
  }
}

const UP = new THREE.Vector3(0, 1, 0);

export function disposeCrowdGeometry() {
  sharedGeometry?.dispose();
  sharedGeometry = null;
}

/* ---------------------------------------------------------------- pigeons */

/**
 * The Charminar flock. Orbits the monument on a shared flow field, and
 * scatters on every sixteenth bar — a share-worthy moment for very little code.
 */
export class Pigeons {
  constructor(count, center, rng) {
    const geo = new THREE.ConeGeometry(0.06, 0.22, 4);
    geo.rotateX(Math.PI / 2);

    this.mesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.8 }),
      count,
    );
    this.count = count;
    this.center = center;

    this.angle = new Float32Array(count);
    this.radius = new Float32Array(count);
    this.height = new Float32Array(count);
    this.speed = new Float32Array(count);
    this.scatter = 0;

    for (let i = 0; i < count; i++) {
      this.angle[i] = rng.range(0, Math.PI * 2);
      this.radius[i] = rng.range(22, 44);
      this.height[i] = rng.range(16, 40);
      this.speed[i] = rng.range(0.16, 0.34);
    }

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
  }

  burst() {
    this.scatter = 1;
  }

  update(dt, elapsed) {
    this.scatter = Math.max(0, this.scatter - dt * 0.4);
    const m = this._m;
    const q = this._q;
    const p = this._p;

    for (let i = 0; i < this.count; i++) {
      this.angle[i] += this.speed[i] * dt * (1 + this.scatter * 2.5);
      const r = this.radius[i] * (1 + this.scatter * 0.55);
      const y = this.height[i] + Math.sin(elapsed * 1.6 + i) * 1.4 + this.scatter * 9;

      p.set(
        this.center.x + Math.cos(this.angle[i]) * r,
        y,
        this.center.z + Math.sin(this.angle[i]) * r,
      );

      q.setFromAxisAngle(UP, -this.angle[i] + Math.PI / 2);
      m.compose(p, q, this._s);
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
