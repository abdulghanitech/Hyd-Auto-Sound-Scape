import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { windowAtlas, atlasTile, signageAtlas } from "./textures.js";

/* Facades.

   Every building is a stack of boxes UV-mapped into one shared window atlas.
   Because each box picks a random tile, thousands of facades look individually
   authored while costing one draw call per material per chunk.

   Recipes:
     oldcity  — 2-4 stacked boxes, arched ground floor, balcony slab, jaali screen
     bazaar   — lower, wider, awnings, dense shopfront signage
     lakeside — taller, plainer, more glass, dense emissive window rows */

const RECIPES = {
  oldcity: { floors: [2, 4], shrink: 0.86, balcony: 0.7, arch: 0.8, dome: 0.18, sign: 0.45 },
  bazaar: { floors: [1, 3], shrink: 0.9, balcony: 0.4, arch: 0.95, dome: 0.05, sign: 0.92 },
  lakeside: { floors: [3, 7], shrink: 0.93, balcony: 0.15, arch: 0.1, dome: 0.0, sign: 0.28 },
};

/**
 * Generate the buildings for one chunk.
 * @returns {{wall: THREE.BufferGeometry|null, glow: THREE.BufferGeometry|null, sign: THREE.BufferGeometry|null}}
 */
export function buildBuildings(path, startDist, endDist, mapDef, rng) {
  const atlas = windowAtlas(mapDef.theme.windowTheme);
  const wallParts = [];
  const glowParts = [];
  const signParts = [];

  const fr = {};
  const spacing = 9.5;

  for (let d = startDist; d < endDist; d += spacing) {
    const t = (d / path.length) % 1;
    const district = districtAt(mapDef, t);
    if (!district) continue;
    if (!rng.chance(district.density)) continue;

    const recipe = RECIPES[district.facade] ?? RECIPES.oldcity;
    const sides = district.side === "right" ? [1] : district.side === "left" ? [-1] : [-1, 1];

    for (const side of sides) {
      if (sides.length === 2 && rng.chance(0.12)) continue; // gaps and alleys

      const dd = d + rng.jitter(2.6);
      const { position: p, right: r } = path.frameAt(path.distanceToT(dd), fr);

      const hw = path.halfWidthAt(path.distanceToT(dd));
      const lateral = (hw + 3.0 + district.setback + rng.range(0, 2.4)) * side;

      const bx = p.x + r.x * lateral;
      const bz = p.z + r.z * lateral;
      const yaw = Math.atan2(r.x, r.z) + (side < 0 ? Math.PI : 0);

      const height = rng.range(district.height[0], district.height[1]);
      const width = rng.range(6, 12);
      const depth = rng.range(7, 13);

      emitBuilding(
        { x: bx, z: bz, yaw, width, depth, height, recipe, rng, atlas },
        wallParts,
        glowParts,
        signParts,
      );
    }
  }

  return {
    wall: wallParts.length ? mergeAndFree(wallParts) : null,
    glow: glowParts.length ? mergeAndFree(glowParts) : null,
    sign: signParts.length ? mergeAndFree(signParts) : null,
  };
}

function emitBuilding(o, wallParts, glowParts, signParts) {
  const { x, z, yaw, recipe, rng, atlas } = o;
  const floors = rng.int(recipe.floors[0], recipe.floors[1]);

  let y = 0;
  let w = o.width;
  let d = o.depth;
  const floorH = o.height / floors;

  for (let f = 0; f < floors; f++) {
    const box = new THREE.BoxGeometry(w, floorH, d);
    applyAtlasTile(box, atlas.tiles, rng);
    box.translate(0, y + floorH / 2, 0);
    box.rotateY(yaw);
    box.translate(x, 0, z);
    wallParts.push(box);

    // The emissive copy uses the same UVs — lit panes glow, the rest is black.
    const glow = box.clone();
    glowParts.push(glow);

    // Balcony slab
    if (f > 0 && rng.chance(recipe.balcony)) {
      const slab = new THREE.BoxGeometry(w * 1.06, 0.16, d * 0.34);
      slab.translate(0, y + floorH * 0.18, d * 0.5);
      slab.rotateY(yaw);
      slab.translate(x, 0, z);
      wallParts.push(slab);
    }

    y += floorH;
    w *= recipe.shrink;
    d *= recipe.shrink;
  }

  // Arched ground floor — a half-cylinder cut into the front face reads as an
  // arcade without any boolean work.
  if (rng.chance(recipe.arch)) {
    const archH = Math.min(2.6, floorH * 0.8);
    const arch = new THREE.CylinderGeometry(archH * 0.42, archH * 0.42, 0.5, 10, 1, false, 0, Math.PI);
    arch.rotateZ(Math.PI / 2);
    arch.rotateY(Math.PI / 2);
    arch.translate(0, archH * 0.62, o.depth * 0.5 + 0.1);
    arch.rotateY(yaw);
    arch.translate(x, 0, z);
    wallParts.push(arch);
  }

  // Shallow dome on the roof — the Old City skyline signature
  if (rng.chance(recipe.dome)) {
    const dome = new THREE.SphereGeometry(w * 0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
    dome.translate(0, y, 0);
    dome.rotateY(yaw);
    dome.translate(x, 0, z);
    wallParts.push(dome);
  }

  // Rooftop clutter — water tank
  if (rng.chance(0.55)) {
    const tank = new THREE.CylinderGeometry(0.5, 0.5, 0.9, 8);
    tank.translate(rng.jitter(w * 0.25), y + 0.45, rng.jitter(d * 0.25));
    tank.rotateY(yaw);
    tank.translate(x, 0, z);
    wallParts.push(tank);
  }

  // Shop board over the entrance
  if (rng.chance(recipe.sign)) {
    const sw = o.width * rng.range(0.5, 0.82);
    const board = new THREE.PlaneGeometry(sw, sw * 0.32);
    applySignTile(board, rng);
    board.translate(0, rng.range(2.7, 3.9), o.depth * 0.5 + 0.14);
    board.rotateY(yaw);
    board.translate(x, 0, z);
    signParts.push(board);
  }
}

/** Remap a box's UVs into one random tile of the window atlas. */
function applyAtlasTile(geo, tiles, rng) {
  const { offset, repeat } = atlasTile(tiles, rng);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(
      i,
      offset[0] + uv.getX(i) * repeat[0],
      offset[1] + uv.getY(i) * repeat[1],
    );
  }
  uv.needsUpdate = true;
}

function applySignTile(geo, rng) {
  const cols = 4;
  const i = rng.int(0, 15);
  const ox = (i % cols) / cols;
  const oy = Math.floor(i / cols) / cols;
  const uv = geo.attributes.uv;
  for (let k = 0; k < uv.count; k++) {
    uv.setXY(k, ox + uv.getX(k) / cols, oy + uv.getY(k) / cols);
  }
  uv.needsUpdate = true;
}

function mergeAndFree(parts) {
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

function districtAt(mapDef, t) {
  for (const d of mapDef.districts) {
    if (t >= d.along[0] && t < d.along[1]) return d;
  }
  return mapDef.districts[mapDef.districts.length - 1];
}

export function buildingMaterials(theme) {
  const atlas = windowAtlas(theme.windowTheme);
  return {
    wall: new THREE.MeshStandardMaterial({
      map: atlas.map,
      roughness: 0.94,
      metalness: 0.0,
    }),
    glow: new THREE.MeshBasicMaterial({
      map: atlas.emissive,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: theme.id === "night" ? 0.95 : 0.42,
    }),
    sign: new THREE.MeshStandardMaterial({
      map: signageAtlas(),
      emissiveMap: signageAtlas(),
      emissive: 0xffffff,
      emissiveIntensity: theme.id === "night" ? 0.85 : 0.25,
      roughness: 0.8,
      side: THREE.DoubleSide,
    }),
  };
}
