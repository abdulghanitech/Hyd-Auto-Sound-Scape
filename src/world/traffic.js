import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/* Traffic.

   Agents advance along the road spline by arclength and brake for whatever is
   in front of them. They do not yield to the player, ever — that is authentic,
   and it means the player has to actually drive.

   Collision with the player is soft: a repulsion impulse, a speed cut and a
   camera shake. No damage model, no rigid-body response, no fail state. */

const UP = new THREE.Vector3(0, 1, 0);

const TYPES = {
  auto: { length: 2.6, width: 1.3, speed: [5.5, 9], color: 0xf5c518, weight: 0.5 },
  bike: { length: 1.9, width: 0.7, speed: [7, 12], color: 0x2b2b33, weight: 0.32 },
  bus: { length: 9.5, width: 2.5, speed: [4.5, 7], color: 0xc23b22, weight: 0.08 },
  car: { length: 4.2, width: 1.75, speed: [6, 10], color: 0xe8e4dc, weight: 0.1 },
};

function boxVehicle(type) {
  const t = TYPES[type];
  const parts = [];

  if (type === "bike") {
    const body = new THREE.BoxGeometry(t.width, 0.5, t.length);
    body.translate(0, 0.55, 0);
    parts.push(body);
    const rider = new THREE.CapsuleGeometry(0.17, 0.5, 3, 6);
    rider.translate(0, 1.2, -0.1);
    parts.push(rider);
  } else if (type === "bus") {
    const body = new THREE.BoxGeometry(t.width, 2.7, t.length);
    body.translate(0, 1.75, 0);
    parts.push(body);
  } else {
    const body = new THREE.BoxGeometry(t.width, 1.0, t.length);
    body.translate(0, 0.75, 0);
    parts.push(body);
    const roof = new THREE.BoxGeometry(t.width * 0.92, 0.7, t.length * 0.62);
    roof.translate(0, 1.5, type === "auto" ? -0.15 : 0.05);
    parts.push(roof);
  }

  // Wheels
  const wr = type === "bus" ? 0.42 : 0.28;
  const positions =
    type === "bike"
      ? [[0, -t.length * 0.36], [0, t.length * 0.36]]
      : [
          [-t.width * 0.42, -t.length * 0.34],
          [t.width * 0.42, -t.length * 0.34],
          [0, t.length * 0.36],
        ];

  for (const [x, z] of positions) {
    const w = new THREE.CylinderGeometry(wr, wr, 0.16, 10);
    w.rotateZ(Math.PI / 2);
    w.translate(x, wr, z);
    parts.push(w);
  }

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

export class Traffic {
  constructor(path, mapDef, rng, count) {
    this.path = path;
    this.count = count;
    this.groups = [];
    this.agents = [];

    const byType = {};
    for (let i = 0; i < count; i++) {
      const type = weightedPick(rng);
      (byType[type] ??= []).push(i);
    }

    let id = 0;
    for (const [type, indices] of Object.entries(byType)) {
      const t = TYPES[type];
      const geo = boxVehicle(type);
      const mat = new THREE.MeshStandardMaterial({
        roughness: 0.6,
        metalness: 0.25,
        vertexColors: false,
      });
      const mesh = new THREE.InstancedMesh(geo, mat, indices.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

      const color = new THREE.Color();
      indices.forEach((_, slot) => {
        const hw = path.halfWidthAt(0);
        const agent = {
          type,
          mesh,
          slot,
          dist: (id / count) * path.length + rng.jitter(6),
          lane: rng.chance(0.5) ? 1 : -1,
          lateral: 0,
          speed: rng.range(t.speed[0], t.speed[1]),
          target: rng.range(t.speed[0], t.speed[1]),
          length: t.length,
        };
        agent.lateral = agent.lane * rng.range(0.35, 0.72) * hw;
        this.agents.push(agent);

        // Autos are yellow; everything else gets a plausible spread.
        const c =
          type === "auto"
            ? 0xf5c518
            : rng.pick([0xe8e4dc, 0x2b2b33, 0x7a8894, 0xc23b22, 0x2f5d8a, 0xb0b6bd]);
        mesh.setColorAt(slot, color.setHex(c));
        id++;
      });

      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.groups.push(mesh);
    }

    // Sorted view for cheap lead-vehicle lookups.
    this.agents.sort((a, b) => a.dist - b.dist);

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    this._fr = {};
  }

  get meshes() {
    return this.groups;
  }

  update(dt, playerPos, playerDist, onPlayerHit) {
    const n = this.agents.length;
    const L = this.path.length;

    for (let i = 0; i < n; i++) {
      const a = this.agents[i];

      // Brake for the nearest agent ahead in the same lane.
      let gap = Infinity;
      for (let k = 1; k <= 3; k++) {
        const b = this.agents[(i + k) % n];
        if (b.lane !== a.lane) continue;
        const d = this.path.deltaDistance(a.dist, b.dist);
        if (d > 0 && d < gap) gap = d - b.length;
      }

      // And for the player, if they're in the way.
      const dPlayer = this.path.deltaDistance(a.dist, playerDist);
      if (dPlayer > 0 && dPlayer < 14) gap = Math.min(gap, dPlayer - 2.5);

      const desired = gap < 8 ? a.target * Math.max(0, (gap - 2.5) / 5.5) : a.target;
      a.speed += (desired - a.speed) * Math.min(1, dt * 2.4);
      a.speed = Math.max(0, a.speed);

      a.dist = (a.dist + a.speed * dt) % L;
      if (a.dist < 0) a.dist += L;

      const fr = this.path.frameAtDistance(a.dist, this._fr);
      this._p.copy(fr.position).addScaledVector(fr.right, a.lateral);
      this._p.y = 0;

      // Soft collision with the player.
      const dx = this._p.x - playerPos.x;
      const dz = this._p.z - playerPos.z;
      const distSq = dx * dx + dz * dz;
      const hitR = 1.5 + a.length * 0.4;
      if (distSq < hitR * hitR) {
        const inv = 1 / Math.max(0.001, Math.sqrt(distSq));
        onPlayerHit?.(new THREE.Vector3(-dx * inv, 0, -dz * inv), a.type === "bus" ? 1 : 0.6);
        a.speed *= 0.4;
      }

      const yaw = Math.atan2(fr.forward.x, fr.forward.z) + (a.lane > 0 ? 0 : Math.PI);
      this._q.setFromAxisAngle(UP, yaw);
      this._m.compose(this._p, this._q, this._s);
      a.mesh.setMatrixAt(a.slot, this._m);
    }

    for (const g of this.groups) g.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const g of this.groups) {
      g.geometry.dispose();
      g.material.dispose();
    }
    this.groups.length = 0;
    this.agents.length = 0;
  }
}

function weightedPick(rng) {
  const r = rng.next();
  let acc = 0;
  for (const [name, t] of Object.entries(TYPES)) {
    acc += t.weight;
    if (r < acc) return name;
  }
  return "auto";
}
