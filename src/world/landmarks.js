import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/* Hero geometry.

   These are the two things people will point at, so they get more triangles
   than anything else in the world — and they're built once, not per chunk.

   Charminar is roughly to scale: 20 m square base, 56 m minarets, four great
   arches. The proportions matter more than the ornament; get the minaret taper
   and the arch spring-line right and it reads instantly even at low detail. */

const STONE = 0xd9c9a8;
const STONE_DARK = 0xb9a684;

export function buildLandmark(def, theme) {
  const group = new THREE.Group();
  const built = def.kind === "charminar" ? charminar(theme) : buddha(theme);

  group.add(built.mesh);
  if (built.emissive) group.add(built.emissive);

  group.position.set(def.x, 0, def.z);
  group.rotation.y = def.rotY ?? 0;
  if (def.scale && def.scale !== 1) group.scale.setScalar(def.scale);

  return { group, emitters: built.emitters.map((e) => localToWorld(e, def)) };
}

function localToWorld(e, def) {
  const c = Math.cos(def.rotY ?? 0);
  const s = Math.sin(def.rotY ?? 0);
  return {
    ...e,
    x: def.x + e.x * c + e.z * s,
    z: def.z - e.x * s + e.z * c,
  };
}

/* ------------------------------------------------------------- Charminar - */

function charminar(theme) {
  const solid = [];
  const glow = [];
  const emitters = [];

  const BASE = 20; // square side, metres
  const PLINTH_H = 2.2;
  const ARCH_H = 20;
  const DECK_H = 24;

  // Plinth
  const plinth = new THREE.BoxGeometry(BASE + 4, PLINTH_H, BASE + 4);
  plinth.translate(0, PLINTH_H / 2, 0);
  solid.push(plinth);

  // The four piers, leaving four great arches between them
  const pierW = 4.2;
  const half = BASE / 2 - pierW / 2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pier = new THREE.BoxGeometry(pierW, ARCH_H, pierW);
      pier.translate(sx * half, PLINTH_H + ARCH_H / 2, sz * half);
      solid.push(pier);
    }
  }

  // Arch heads — a half-cylinder spanning each opening on all four faces
  const span = BASE - pierW * 2;
  for (let i = 0; i < 4; i++) {
    const yaw = (i * Math.PI) / 2;
    const arch = new THREE.CylinderGeometry(span / 2, span / 2, pierW, 14, 1, false, 0, Math.PI);
    arch.rotateZ(Math.PI / 2);
    arch.rotateY(Math.PI / 2);
    arch.translate(0, PLINTH_H + ARCH_H - span / 2, BASE / 2 - pierW / 2);
    arch.rotateY(yaw);
    solid.push(arch);

    // Spandrel above the arch
    const wall = new THREE.BoxGeometry(span, 3.4, pierW * 0.7);
    wall.translate(0, PLINTH_H + ARCH_H + 1.7, BASE / 2 - pierW / 2);
    wall.rotateY(yaw);
    solid.push(wall);
  }

  // Gallery deck
  const deck = new THREE.BoxGeometry(BASE + 3, 1.2, BASE + 3);
  deck.translate(0, DECK_H, 0);
  solid.push(deck);

  // Balustrade
  for (let i = 0; i < 4; i++) {
    const yaw = (i * Math.PI) / 2;
    const rail = new THREE.BoxGeometry(BASE + 3, 1.1, 0.3);
    rail.translate(0, DECK_H + 1.15, (BASE + 3) / 2);
    rail.rotateY(yaw);
    solid.push(rail);
  }

  // Second storey
  const upper = new THREE.BoxGeometry(BASE - 4, 6.5, BASE - 4);
  upper.translate(0, DECK_H + 3.9, 0);
  solid.push(upper);

  const upperDeck = new THREE.BoxGeometry(BASE - 1.5, 0.9, BASE - 1.5);
  upperDeck.translate(0, DECK_H + 7.5, 0);
  solid.push(upperDeck);

  // Central dome
  const dome = new THREE.SphereGeometry(3.4, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
  dome.translate(0, DECK_H + 8, 0);
  solid.push(dome);

  // The four minarets
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      minaret(sx * half, sz * half, PLINTH_H, solid, glow, emitters);
    }
  }

  // Uplighting at the base of each pier — this is what makes it glow at dusk
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      emitters.push({
        x: sx * (half + 1.5),
        y: 0.6,
        z: sz * (half + 1.5),
        scale: 5,
        color: 0xffc978,
      });
    }
  }

  const mesh = new THREE.Mesh(
    mergeAndFree(solid),
    new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.88, metalness: 0.02 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const emissiveMesh = glow.length
    ? new THREE.Mesh(
        mergeAndFree(glow),
        new THREE.MeshBasicMaterial({ color: 0xffe6b0, toneMapped: false }),
      )
    : null;

  return { mesh, emissive: emissiveMesh, emitters };
}

function minaret(x, z, baseY, solid, glow, emitters) {
  const H = 34;
  const segs = 4;
  let y = baseY + 24;
  let r = 2.1;

  // Shaft below the deck, embedded in the corner pier
  const lower = new THREE.CylinderGeometry(2.3, 2.5, 24, 14);
  lower.translate(x, baseY + 12, z);
  solid.push(lower);

  for (let i = 0; i < segs; i++) {
    const h = H / segs;
    const rTop = r * 0.86;
    const shaft = new THREE.CylinderGeometry(rTop, r, h, 14);
    shaft.translate(x, y + h / 2, z);
    solid.push(shaft);

    // Gallery ring at each level
    const ring = new THREE.CylinderGeometry(r * 1.32, r * 1.32, 0.5, 14);
    ring.translate(x, y + h, z);
    solid.push(ring);

    y += h;
    r = rTop;
  }

  // Bulb dome
  const dome = new THREE.SphereGeometry(r * 1.25, 14, 10);
  dome.scale(1, 1.25, 1);
  dome.translate(x, y + r * 0.9, z);
  solid.push(dome);

  // Finial
  const finial = new THREE.ConeGeometry(0.28, 2.2, 8);
  finial.translate(x, y + r * 2.1, z);
  solid.push(finial);

  // A lamp at the top gallery
  const lamp = new THREE.SphereGeometry(0.32, 8, 6);
  lamp.translate(x, y - 1.2, z);
  glow.push(lamp);
  emitters.push({ x, y: y - 1.2, z, scale: 2.6, color: 0xffe6b0 });
}

/* --------------------------------------------------------------- Buddha -- */

function buddha(theme) {
  const solid = [];
  const glow = [];
  const emitters = [];

  // Rock plinth in the water
  const rock = new THREE.CylinderGeometry(9, 12, 3.2, 12);
  rock.translate(0, 1.6, 0);
  solid.push(rock);

  const plinth = new THREE.CylinderGeometry(5.4, 6.2, 3.6, 16);
  plinth.translate(0, 4.6, 0);
  solid.push(plinth);

  // Lotus base
  const lotus = new THREE.SphereGeometry(5.2, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.42);
  lotus.scale(1, 0.5, 1);
  lotus.translate(0, 6.2, 0);
  solid.push(lotus);

  // Standing figure — robe, torso, head. Simple, but the silhouette is famous.
  const robe = new THREE.CylinderGeometry(2.3, 3.5, 12, 16);
  robe.translate(0, 12.4, 0);
  solid.push(robe);

  const torso = new THREE.CylinderGeometry(1.9, 2.4, 5.4, 16);
  torso.translate(0, 20.6, 0);
  solid.push(torso);

  const shoulders = new THREE.SphereGeometry(2.3, 14, 10);
  shoulders.scale(1.25, 0.72, 0.9);
  shoulders.translate(0, 22.6, 0);
  solid.push(shoulders);

  // Arms held close to the body
  for (const side of [-1, 1]) {
    const arm = new THREE.CapsuleGeometry(0.62, 5.6, 4, 8);
    arm.translate(side * 2.35, 19.4, 0.2);
    solid.push(arm);
  }

  const neck = new THREE.CylinderGeometry(0.7, 0.9, 1.2, 10);
  neck.translate(0, 24.1, 0);
  solid.push(neck);

  const head = new THREE.SphereGeometry(1.55, 16, 12);
  head.scale(0.92, 1.12, 0.98);
  head.translate(0, 25.6, 0);
  solid.push(head);

  const ushnisha = new THREE.SphereGeometry(0.75, 12, 8);
  ushnisha.translate(0, 26.9, 0);
  solid.push(ushnisha);

  // Uplights around the plinth — the statue is lit from below on the water
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = Math.cos(a) * 6.6;
    const z = Math.sin(a) * 6.6;
    const lamp = new THREE.SphereGeometry(0.3, 6, 5);
    lamp.translate(x, 3.4, z);
    glow.push(lamp);
    emitters.push({ x, y: 3.4, z, scale: 6, color: 0xcfe4ff });
  }

  const mesh = new THREE.Mesh(
    mergeAndFree(solid),
    new THREE.MeshStandardMaterial({ color: STONE_DARK, roughness: 0.78, metalness: 0.04 }),
  );
  mesh.castShadow = true;

  const emissiveMesh = new THREE.Mesh(
    mergeAndFree(glow),
    new THREE.MeshBasicMaterial({ color: 0xdcecff, toneMapped: false }),
  );

  return { mesh, emissive: emissiveMesh, emitters };
}

function mergeAndFree(parts) {
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}
