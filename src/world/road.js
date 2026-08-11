import * as THREE from "three";
import { asphaltTexture } from "./textures.js";

const UP = new THREE.Vector3(0, 1, 0);

/**
 * The road spline, plus every query the rest of the game needs against it.
 *
 * Everything positional in the world — buildings, props, crowd, traffic,
 * passengers, drop-offs — is placed by asking this object for a point and a
 * normal at some distance along the loop. One source of truth for the layout.
 */
export class RoadPath {
  constructor(mapDef) {
    const pts = mapDef.spline.map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.curve = new THREE.CatmullRomCurve3(pts, true, "catmullrom", 0.4);
    this.widths = mapDef.spline.map(([, , w]) => w);

    // Arc-length lookup so we can work in metres rather than in curve-t, which
    // is wildly non-uniform on a Catmull-Rom.
    this.divisions = 900;
    this.lengths = this.curve.getLengths(this.divisions);
    this.length = this.lengths[this.lengths.length - 1];

    this._p = new THREE.Vector3();

    this.#bakeSamples();
  }

  /**
   * Precomputed frames at ~1 m intervals.
   *
   * Everything that queries the path per frame — 260 pedestrians, 24 traffic
   * agents, the smear reflections — goes through frameAtDistance(). Evaluating
   * the curve directly there means a binary search plus two curve evaluations
   * per entity per frame, which was comfortably the most expensive thing in the
   * game. Baking the frames once turns it into an array read and a lerp.
   */
  #bakeSamples() {
    const step = 1.0; // metres
    const n = Math.max(8, Math.ceil(this.length / step));
    this.sampleCount = n;
    this.sampleStep = this.length / n;

    this.sPos = new Float32Array(n * 2);
    this.sFwd = new Float32Array(n * 2);
    this.sHalfWidth = new Float32Array(n);

    const p = new THREE.Vector3();
    const f = new THREE.Vector3();

    for (let i = 0; i < n; i++) {
      const t = this.curve.getUtoTmapping(0, (i * this.sampleStep) % this.length);
      this.curve.getPointAt(t, p);
      this.curve.getTangentAt(t, f);

      this.sPos[i * 2] = p.x;
      this.sPos[i * 2 + 1] = p.z;
      this.sFwd[i * 2] = f.x;
      this.sFwd[i * 2 + 1] = f.z;
      this.sHalfWidth[i] = this.halfWidthAt(t);
    }
  }

  /** Distance in metres → curve parameter t. */
  distanceToT(distance) {
    const d = ((distance % this.length) + this.length) % this.length;
    return this.curve.getUtoTmapping(0, d);
  }

  /** Half-width of the carriageway at parameter t, interpolated between control points. */
  halfWidthAt(t) {
    const n = this.widths.length;
    const f = t * n;
    const i = Math.floor(f) % n;
    const j = (i + 1) % n;
    return THREE.MathUtils.lerp(this.widths[i], this.widths[j], f - Math.floor(f));
  }

  /**
   * Position, forward and right at a parameter t.
   * Right is tangent × up — NOT computeFrenetFrames, which twists the frame
   * around closed curves and makes buildings roll over.
   */
  frameAt(t, out = {}) {
    const p = out.position ?? new THREE.Vector3();
    const f = out.forward ?? new THREE.Vector3();
    const r = out.right ?? new THREE.Vector3();

    this.curve.getPointAt(t, p);
    this.curve.getTangentAt(t, f);
    r.copy(f).cross(UP).normalize();

    return { position: p, forward: f, right: r, halfWidth: this.halfWidthAt(t) };
  }

  /**
   * Fast path frame, from the baked table. Safe to call thousands of times per
   * frame: no curve evaluation, and it writes into the scratch object you pass
   * rather than allocating (which matters — 260 pedestrians allocating three
   * vectors each per frame is pure GC pressure).
   */
  frameAtDistance(distance, out) {
    const scratch = out ?? (this._scratch ??= makeScratch());
    if (!scratch.position) Object.assign(scratch, makeScratch());

    const n = this.sampleCount;
    const d = ((distance % this.length) + this.length) % this.length;
    const f = d / this.sampleStep;
    const i0 = Math.floor(f) % n;
    const i1 = (i0 + 1) % n;
    const a = f - Math.floor(f);

    const px = lerp(this.sPos[i0 * 2], this.sPos[i1 * 2], a);
    const pz = lerp(this.sPos[i0 * 2 + 1], this.sPos[i1 * 2 + 1], a);
    const fx = lerp(this.sFwd[i0 * 2], this.sFwd[i1 * 2], a);
    const fz = lerp(this.sFwd[i0 * 2 + 1], this.sFwd[i1 * 2 + 1], a);

    const inv = 1 / (Math.hypot(fx, fz) || 1);

    scratch.position.set(px, 0, pz);
    scratch.forward.set(fx * inv, 0, fz * inv);
    // right = forward × up
    scratch.right.set(scratch.forward.z, 0, -scratch.forward.x);
    scratch.halfWidth = lerp(this.sHalfWidth[i0], this.sHalfWidth[i1], a);

    return scratch;
  }

  /** A point offset sideways from the centreline. Positive = right-hand side. */
  offsetPoint(distance, lateral, out = new THREE.Vector3()) {
    const fr = this.frameAtDistance(distance);
    return out.copy(fr.position).addScaledVector(fr.right, lateral);
  }

  /**
   * Approximate nearest distance-along-loop for an arbitrary world point.
   * Scans the baked samples, so it's a flat array walk rather than several
   * hundred curve evaluations.
   */
  nearestDistance(point) {
    const n = this.sampleCount;
    let bestI = 0;
    let bestSq = Infinity;

    for (let i = 0; i < n; i++) {
      const dx = this.sPos[i * 2] - point.x;
      const dz = this.sPos[i * 2 + 1] - point.z;
      const sq = dx * dx + dz * dz;
      if (sq < bestSq) {
        bestSq = sq;
        bestI = i;
      }
    }

    return bestI * this.sampleStep;
  }

  /** Signed shortest difference between two distances on a closed loop. */
  deltaDistance(from, to) {
    let d = to - from;
    while (d > this.length / 2) d -= this.length;
    while (d < -this.length / 2) d += this.length;
    return d;
  }
}

/**
 * Build the carriageway, kerbs and footpaths for one arclength span.
 *
 * Returns geometries in world space so the caller can merge a whole chunk into
 * a single draw call.
 */
export function buildRoadSegment(path, startDist, endDist, { step = 2.2, wet = 0 } = {}) {
  const road = { pos: [], uv: [], idx: [], color: [] };
  const kerb = { pos: [], uv: [], idx: [] };
  const walk = { pos: [], uv: [], idx: [] };

  const KERB_W = 0.22;
  const KERB_H = 0.14;
  const WALK_W = 2.6;

  const count = Math.max(2, Math.ceil((endDist - startDist) / step) + 1);
  const fr = {};

  for (let i = 0; i < count; i++) {
    const d = startDist + (i / (count - 1)) * (endDist - startDist);
    const { position: p, right: r, halfWidth: hw } = path.frameAt(path.distanceToT(d), fr);
    const v = d / 8;

    // Carriageway
    push3(road.pos, p.x - r.x * hw, 0, p.z - r.z * hw);
    push3(road.pos, p.x + r.x * hw, 0, p.z + r.z * hw);
    road.uv.push(0, v, 1, v);

    // Darken the centre where oil and wear collect, lighten the edges.
    const wear = 0.86;
    push3(road.color, wear, wear, wear);
    push3(road.color, 1, 1, 1);

    // Kerb — a vertical lip either side
    for (const side of [-1, 1]) {
      const inner = hw * side;
      const outer = (hw + KERB_W) * side;
      push3(kerb.pos, p.x + r.x * inner, 0, p.z + r.z * inner);
      push3(kerb.pos, p.x + r.x * inner, KERB_H, p.z + r.z * inner);
      push3(kerb.pos, p.x + r.x * outer, KERB_H, p.z + r.z * outer);
      kerb.uv.push(0, v, 0.5, v, 1, v);
    }

    // Footpath
    for (const side of [-1, 1]) {
      const a = (hw + KERB_W) * side;
      const b = (hw + KERB_W + WALK_W) * side;
      push3(walk.pos, p.x + r.x * a, KERB_H, p.z + r.z * a);
      push3(walk.pos, p.x + r.x * b, KERB_H, p.z + r.z * b);
      walk.uv.push(0, v, 1, v);
    }
  }

  ribbonIndices(road.idx, count, 2);
  ribbonIndices(kerb.idx, count, 6, [[0, 1], [1, 2]]);
  ribbonIndices(walk.idx, count, 4, [[0, 1], [2, 3]]);

  return {
    road: toGeometry(road, true),
    kerb: toGeometry(kerb),
    footpath: toGeometry(walk),
  };
}

export function roadMaterials(theme) {
  const map = asphaltTexture();
  const road = map.clone();
  road.needsUpdate = true;
  road.wrapS = road.wrapT = THREE.RepeatWrapping;
  road.repeat.set(1, 1);
  // The clone is this map's own copy, so it must NOT inherit the cache's
  // "shared" flag or it would survive every teardown and leak.
  road.userData.shared = false;

  return {
    road: new THREE.MeshStandardMaterial({
      map: road,
      vertexColors: true,
      roughness: THREE.MathUtils.lerp(0.92, 0.28, theme.wet ?? 0),
      metalness: THREE.MathUtils.lerp(0.0, 0.42, theme.wet ?? 0),
      envMapIntensity: THREE.MathUtils.lerp(0.2, 1.6, theme.wet ?? 0),
    }),
    kerb: new THREE.MeshStandardMaterial({ color: 0xb8ab97, roughness: 0.85 }),
    footpath: new THREE.MeshStandardMaterial({ color: 0x6d6459, roughness: 0.92 }),
  };
}

/* ---------- helpers ---------- */

function makeScratch() {
  return {
    position: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    right: new THREE.Vector3(),
    halfWidth: 0,
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function push3(arr, a, b, c) {
  arr.push(a, b, c);
}

/**
 * Stitch a ribbon of `count` rings, each of `stride` vertices.
 * `pairs` names which vertex pairs form quads (defaults to a simple 2-wide strip).
 */
function ribbonIndices(idx, count, stride, pairs = [[0, 1]]) {
  for (let i = 0; i < count - 1; i++) {
    const a = i * stride;
    const b = (i + 1) * stride;
    for (const [u, v] of pairs) {
      idx.push(a + u, b + u, a + v);
      idx.push(a + v, b + u, b + v);
    }
  }
}

function toGeometry(src, withColor = false) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(src.pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(src.uv, 2));
  if (withColor && src.color.length) {
    g.setAttribute("color", new THREE.Float32BufferAttribute(src.color, 3));
  }
  g.setIndex(src.idx);
  g.computeVertexNormals();
  return g;
}
