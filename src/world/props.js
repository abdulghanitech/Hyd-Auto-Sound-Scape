import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/* Street furniture.

   Everything here merges into two buckets per chunk — solid geometry and
   emissive geometry — so an entire block of stalls, poles, awnings and lamps
   costs two draw calls.

   Light sources are emissive boxes, not PointLights. Bloom turns them into
   glows, which at night is indistinguishable from real lighting and costs
   nothing. Real lights are reserved for the four nearest streetlights. */

const AWNING_COLORS = [0xb3261e, 0x1b6b3a, 0x0b4f8a, 0xd96a1e, 0xf5c518, 0x6b2d8a];

export function buildProps(path, startDist, endDist, mapDef, rng) {
  const solid = [];
  const emissive = [];
  const emitters = []; // world positions for glow sprites + reflection smears

  const fr = {};

  for (const rule of mapDef.propRules) {
    const t0 = rule.along[0] * path.length;
    const t1 = rule.along[1] * path.length;

    const from = Math.max(startDist, t0);
    const to = Math.min(endDist, t1);
    if (from >= to) continue;

    // Snap to a global lattice so props don't shift when chunk bounds change.
    const first = Math.ceil(from / rule.every) * rule.every;

    for (let d = first; d < to; d += rule.every) {
      const dd = d + (rule.jitter ? rng.jitter(rule.jitter) : 0);
      const { position: p, right: r } = path.frameAt(path.distanceToT(dd), fr);
      const hw = path.halfWidthAt(path.distanceToT(dd));
      const yawBase = Math.atan2(r.x, r.z);

      const sides = rule.side === "both" ? [-1, 1] : rule.side === "left" ? [-1] : [1];

      for (const side of sides) {
        const lateral = (hw + 1.5) * side;
        const x = p.x + r.x * lateral;
        const z = p.z + r.z * lateral;
        const yaw = yawBase + (side < 0 ? Math.PI : 0);

        switch (rule.kind) {
          case "stall": stall(x, z, yaw, rng, solid, emissive, emitters); break;
          case "streetlight": streetlight(x, z, yaw, side, solid, emissive, emitters); break;
          case "pole": pole(x, z, rng, solid); break;
          case "banner": banner(p, r, hw, rng, solid); break;
          case "railing": railing(x, z, yaw, solid); break;
          case "stringlights": stringLights(x, z, yaw, rng, emissive, emitters); break;
          default: break;
        }
      }
    }
  }

  return {
    solid: solid.length ? mergeAndFree(solid) : null,
    emissive: emissive.length ? mergeAndFree(emissive) : null,
    emitters,
  };
}

/* ---------- individual props ---------- */

function stall(x, z, yaw, rng, solid, emissive, emitters) {
  const w = rng.range(2.2, 3.4);
  const d = rng.range(1.6, 2.4);
  const h = 2.1;

  // Counter
  const counter = new THREE.BoxGeometry(w, 0.9, d);
  place(counter, x, 0.45, z, yaw);
  solid.push(counter);

  // Four legs implied by a single frame box under the awning
  for (const sx of [-1, 1]) {
    const leg = new THREE.BoxGeometry(0.07, h, 0.07);
    place(leg, x, h / 2, z, yaw, sx * w * 0.45, 0, d * 0.4);
    solid.push(leg);
  }

  // Awning — the colour is most of what you actually see
  const awn = new THREE.BoxGeometry(w * 1.2, 0.06, d * 1.5);
  const awning = awn.clone();
  awn.dispose();
  awning.rotateX(-0.22);
  place(awning, x, h, z, yaw, 0, 0, d * 0.2);
  awning.userData = { color: rng.pick(AWNING_COLORS) };
  colorize(awning, awning.userData.color);
  solid.push(awning);

  // Goods piled on the counter
  const n = rng.int(3, 7);
  for (let i = 0; i < n; i++) {
    const g = new THREE.BoxGeometry(rng.range(0.14, 0.3), rng.range(0.1, 0.26), rng.range(0.14, 0.3));
    colorize(g, rng.pick([0xd94f2b, 0xe8c33a, 0x3a7d44, 0xf0e6d2, 0x8a3fa0]));
    place(g, x, 1.02, z, yaw, rng.jitter(w * 0.4), 0, rng.jitter(d * 0.28));
    solid.push(g);
  }

  // The bare bulb every stall in Laad Bazaar has
  const bulb = new THREE.SphereGeometry(0.075, 8, 6);
  place(bulb, x, h + 0.02, z, yaw, 0, 0, d * 0.1);
  emissive.push(bulb);
  emitters.push({ x, y: h + 0.02, z, scale: 1.1, color: 0xffd98a });
}

function streetlight(x, z, yaw, side, solid, emissive, emitters) {
  const H = 6.4;
  const post = new THREE.CylinderGeometry(0.09, 0.13, H, 8);
  place(post, x, H / 2, z, yaw);
  solid.push(post);

  const arm = new THREE.CylinderGeometry(0.06, 0.06, 1.5, 6);
  arm.rotateZ(Math.PI / 2 - 0.35);
  place(arm, x, H - 0.25, z, yaw, -side * 0.7, 0, 0);
  solid.push(arm);

  const headX = x - Math.cos(yaw) * 0 - side * 1.3 * Math.cos(yaw);
  const headZ = z + side * 1.3 * Math.sin(yaw);

  const lamp = new THREE.BoxGeometry(0.42, 0.1, 0.24);
  place(lamp, headX, H - 0.6, headZ, yaw);
  emissive.push(lamp);

  emitters.push({ x: headX, y: H - 0.62, z: headZ, scale: 3.4, color: 0xfff0c8, tall: true });
}

function pole(x, z, rng, solid) {
  const H = rng.range(5, 7.5);
  const p = new THREE.CylinderGeometry(0.07, 0.09, H, 6);
  place(p, x, H / 2, z, 0);
  solid.push(p);

  // The tangle of wires overhead is very Hyderabad — implied with thin boxes.
  for (let i = 0; i < 3; i++) {
    const wire = new THREE.BoxGeometry(0.03, 0.03, 19);
    place(wire, x, H - 0.4 - i * 0.28, z, 0, rng.jitter(0.2), 0, 0);
    solid.push(wire);
  }
}

function banner(p, r, hw, rng, solid) {
  // A cloth banner strung across the road
  const span = hw * 2 + 3;
  const cloth = new THREE.BoxGeometry(span, 0.9, 0.04);
  const yaw = Math.atan2(r.x, r.z);
  colorize(cloth, rng.pick([0x1b6b3a, 0xb3261e, 0xf5c518, 0x0b4f8a]));
  place(cloth, p.x, 5.4, p.z, yaw + Math.PI / 2);
  solid.push(cloth);
}

function railing(x, z, yaw, solid) {
  const rail = new THREE.BoxGeometry(3.9, 0.07, 0.07);
  place(rail, x, 0.92, z, yaw + Math.PI / 2);
  solid.push(rail);

  const post = new THREE.BoxGeometry(0.08, 0.95, 0.08);
  place(post, x, 0.48, z, yaw);
  solid.push(post);
}

function stringLights(x, z, yaw, rng, emissive, emitters) {
  // A catenary of bulbs between two poles — the Tank Bund signature.
  const span = 11;
  const n = 9;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const off = (t - 0.5) * span;
    const sag = Math.cosh((t - 0.5) * 2.6) * 0.42 - 0.42;
    const bulb = new THREE.SphereGeometry(0.06, 6, 5);
    place(bulb, x, 4.6 - sag, z, yaw + Math.PI / 2, off, 0, 0);
    emissive.push(bulb);

    const bx = x + Math.cos(yaw) * off;
    const bz = z - Math.sin(yaw) * off;
    emitters.push({ x: bx, y: 4.6 - sag, z: bz, scale: 0.8, color: 0xfff0c8 });
  }
}

/* ---------- helpers ---------- */

function place(geo, x, y, z, yaw, ox = 0, oy = 0, oz = 0) {
  if (ox || oy || oz) geo.translate(ox, oy, oz);
  geo.rotateY(yaw);
  geo.translate(x, y, z);
}

/** Bake a flat colour into vertex colours so everything can share one material. */
function colorize(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(arr, 3));
}

function mergeAndFree(parts) {
  // Everything must agree on attributes before merging, so give anything that
  // skipped colorize() a neutral white.
  for (const p of parts) {
    if (!p.attributes.color) colorize(p, 0xffffff);
    if (!p.attributes.uv) {
      const n = p.attributes.position.count;
      p.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    }
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

export function propMaterials(theme) {
  return {
    solid: new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.86,
      metalness: 0.05,
    }),
    emissive: new THREE.MeshBasicMaterial({
      color: theme.emitterColor,
      vertexColors: true,
      toneMapped: false, // let it blow out and bloom
    }),
  };
}
