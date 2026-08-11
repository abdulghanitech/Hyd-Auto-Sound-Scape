import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import {
  rearPanelTexture,
  makeMeterTexture,
  blobShadowTexture,
  fringeTexture,
  glowTexture,
} from "../world/textures.js";
import { AUTO } from "./physics.js";

/* Procedural Bajaj RE.

   The single highest-value technique here is ExtrudeGeometry from a 2D side
   silhouette with a bevel. A box-built auto looks like Minecraft; a bevelled
   extrusion of the real side profile looks moulded, because the bevel gives a
   continuous specular rim for bloom to catch — for about 40 extra triangles.

   The canopy uses the same trick with a crescent profile, which gets us a
   hooped shell with real thickness and open sides in one geometry, with no
   boolean operations and no hand-built side walls.

   Budget: ≤ 3,500 triangles, ≤ 8 draw calls.

   Axis convention matches physics.js: +Z is forward, +Y is up. */

const YELLOW = 0xf5c518;
const INK = 0x14120f;

/** Build the shape in (forward, up), then rotate so the extrusion runs across X. */
function extrudeAcross(shape, width, bevel = 0.04) {
  const raw = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: 0,
    bevelSegments: 2,
    curveSegments: 8,
  });

  // ExtrudeGeometry comes back non-indexed, but every primitive we merge it
  // with is indexed — and mergeGeometries refuses to mix the two, returning
  // null rather than throwing. Welding it here also removes the duplicate
  // vertices the extruder emits along each seam.
  const geo = mergeVertices(raw);
  raw.dispose();

  geo.rotateY(-Math.PI / 2);
  geo.translate(width / 2, 0, 0);
  return geo;
}

function bodyProfile() {
  const s = new THREE.Shape();
  s.moveTo(-1.28, 0.40);
  s.lineTo(-1.33, 0.74); // rear panel
  s.lineTo(-1.30, 1.06); // seat-back top
  s.lineTo(-0.58, 1.03);
  s.quadraticCurveTo(-0.46, 0.98, -0.44, 0.64); // seat squab scoop
  s.lineTo(0.28, 0.58); // floor
  s.lineTo(0.74, 0.61);
  s.quadraticCurveTo(1.02, 0.64, 1.10, 0.78); // footwell rise
  s.lineTo(1.30, 1.02); // nose top
  s.quadraticCurveTo(1.38, 0.74, 1.26, 0.50); // nose front
  s.lineTo(0.96, 0.36);
  s.closePath();
  return s;
}

function canopyProfile() {
  const s = new THREE.Shape();
  const cz = -0.12;
  const cy = 0.92;
  const rOuter = 0.78;
  const rInner = 0.72;
  const a0 = THREE.MathUtils.degToRad(12);
  const a1 = THREE.MathUtils.degToRad(168);

  s.absarc(cz, cy, rOuter, a0, a1, false);
  s.absarc(cz, cy, rInner, a1, a0, true);
  s.closePath();
  return s;
}

function wheel(radius = AUTO.wheelRadius, width = 0.11) {
  const tyre = new THREE.CylinderGeometry(radius, radius, width, 20, 1);
  tyre.rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(radius * 0.44, radius * 0.44, width * 1.04, 14, 1);
  hub.rotateZ(Math.PI / 2);
  return { tyre, hub };
}

/**
 * @returns {{root: THREE.Group, update: Function, dispose: Function, parts: object}}
 */
export function createAuto({ tier, playerControlled = true } = {}) {
  const root = new THREE.Group();
  root.name = "auto";

  const bodyPivot = new THREE.Group(); // carries roll, pitch, bounce, vibration
  root.add(bodyPivot);

  const materials = {
    body: new THREE.MeshStandardMaterial({ color: YELLOW, metalness: 0.35, roughness: 0.42 }),
    ink: new THREE.MeshStandardMaterial({ color: INK, metalness: 0.2, roughness: 0.68 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xd8d6d0, metalness: 1, roughness: 0.18 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1a1a1c, metalness: 0, roughness: 0.9 }),
    // MeshStandardMaterial with low opacity, NOT MeshPhysicalMaterial transmission —
    // transmission forces an extra render pass and is a mobile killer.
    glass: new THREE.MeshStandardMaterial({
      color: 0xbcd4dd,
      metalness: 0.1,
      roughness: 0.05,
      transparent: true,
      opacity: 0.14,
      envMapIntensity: 1.4,
    }),
    panel: new THREE.MeshStandardMaterial({
      map: rearPanelTexture(),
      metalness: 0.15,
      roughness: 0.62,
    }),
  };

  /* ---------- merged yellow shell ---------- */

  const width = 1.2;
  const yellowParts = [];

  yellowParts.push(extrudeAcross(bodyProfile(), width, 0.045));

  // Nose cowl — the scooter-front bulb
  const cowl = new THREE.SphereGeometry(0.42, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
  cowl.scale(0.85, 1, 1);
  cowl.rotateX(Math.PI * 0.52);
  cowl.translate(0, 0.86, 1.16);
  yellowParts.push(cowl);

  // Side frame tubes — the yellow bars that frame the view in POV cameras.
  // This silhouette is the signature of the reference art.
  for (const side of [-1, 1]) {
    const post = new THREE.CylinderGeometry(0.035, 0.035, 0.72, 8);
    post.translate(side * (width / 2 - 0.02), 1.28, 0.9);
    yellowParts.push(post);

    const rear = new THREE.CylinderGeometry(0.032, 0.032, 0.5, 8);
    rear.translate(side * (width / 2 - 0.02), 1.32, -1.0);
    yellowParts.push(rear);
  }

  const bodyMesh = new THREE.Mesh(mergeGeometries(yellowParts, false), materials.body);
  bodyMesh.castShadow = !!tier?.shadows;
  bodyPivot.add(bodyMesh);
  yellowParts.forEach((g) => g.dispose());

  /* ---------- canopy ---------- */

  const canopy = new THREE.Mesh(extrudeAcross(canopyProfile(), width + 0.06, 0.03), materials.ink);
  canopy.castShadow = !!tier?.shadows;
  bodyPivot.add(canopy);

  /* ---------- rear panel: the chase-cam money shot ---------- */

  const rearPanel = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.62), materials.panel);
  rearPanel.position.set(0, 0.78, -1.345);
  rearPanel.rotation.y = Math.PI;
  bodyPivot.add(rearPanel);

  /* ---------- windshield ---------- */

  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 0.62, 3, 3), materials.glass);
  windshield.position.set(0, 1.24, 1.06);
  windshield.rotation.x = -0.28;
  bodyPivot.add(windshield);

  /* ---------- wheels ---------- */

  const { tyre, hub } = wheel();
  const makeWheelMesh = () => {
    const g = new THREE.Group();
    const t = new THREE.Mesh(tyre, materials.rubber);
    const h = new THREE.Mesh(hub, materials.body);
    t.castShadow = !!tier?.shadows;
    g.add(t, h);
    return g;
  };

  const rearL = makeWheelMesh();
  const rearR = makeWheelMesh();
  rearL.position.set(-AUTO.rearTrack / 2, AUTO.wheelRadius, -1.0);
  rearR.position.set(AUTO.rearTrack / 2, AUTO.wheelRadius, -1.0);
  bodyPivot.add(rearL, rearR);

  // Front wheel and everything that turns with it
  const steerPivot = new THREE.Group();
  steerPivot.position.set(0, 0, 1.0);
  bodyPivot.add(steerPivot);

  const frontWheel = makeWheelMesh();
  frontWheel.position.y = AUTO.wheelRadius;
  steerPivot.add(frontWheel);

  const fork = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.032, 0.6, 8),
    materials.chrome,
  );
  fork.position.set(0, 0.52, 0);
  steerPivot.add(fork);

  /* ---------- headlamp ---------- */

  const lampGlow = new THREE.Mesh(
    new THREE.CircleGeometry(0.1, 14),
    new THREE.MeshBasicMaterial({ color: 0xfff0c8 }),
  );
  lampGlow.position.set(0, 0.9, 1.36);
  bodyPivot.add(lampGlow);

  /* ---------- cabin details (visible in POV cameras) ---------- */

  const handlebar = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 6, 14, Math.PI), materials.chrome);
  bar.rotation.set(Math.PI / 2, 0, 0);
  handlebar.add(bar);
  for (const side of [-1, 1]) {
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.028, 0.13, 8),
      materials.ink,
    );
    grip.rotation.z = Math.PI / 2;
    grip.position.set(side * 0.17, 0, 0.02);
    handlebar.add(grip);
  }
  handlebar.position.set(0, 1.0, 0.72);
  bodyPivot.add(handlebar);

  // Meter — the fare literally ticks up in 3D. Best delight-per-line in the model.
  const meter = makeMeterTexture();
  const meterBox = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.11, 0.05), materials.ink);
  meterBox.position.set(0.32, 1.06, 0.86);
  const meterFace = new THREE.Mesh(
    new THREE.PlaneGeometry(0.17, 0.095),
    new THREE.MeshBasicMaterial({ map: meter.texture }),
  );
  meterFace.position.set(0, 0, 0.026);
  meterBox.add(meterFace);
  bodyPivot.add(meterBox);

  // Mirror + marigold garland
  const mirrorStalk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6),
    materials.chrome,
  );
  mirrorStalk.position.set(0.44, 1.36, 0.92);
  bodyPivot.add(mirrorStalk);

  const mirror = new THREE.Mesh(new THREE.CircleGeometry(0.075, 14), materials.chrome);
  mirror.position.set(0.44, 1.45, 0.9);
  mirror.rotation.y = Math.PI;
  bodyPivot.add(mirror);

  const garlandPivot = new THREE.Group();
  garlandPivot.position.set(0.44, 1.44, 0.9);
  bodyPivot.add(garlandPivot);

  const garland = buildGarland();
  garlandPivot.add(garland);

  // Hanging fringe along the canopy lip — one alpha plane, waved in the shader.
  const fringe = buildFringe(width);
  fringe.position.set(0, 1.55, 1.0);
  bodyPivot.add(fringe);

  // Dashboard idol — bobs on the beat
  const idolPivot = new THREE.Group();
  idolPivot.position.set(-0.3, 1.12, 0.94);
  bodyPivot.add(idolPivot);
  const idol = new THREE.Mesh(
    new THREE.ConeGeometry(0.045, 0.13, 8),
    new THREE.MeshStandardMaterial({ color: 0xff8a3d, emissive: 0x3a1400, roughness: 0.5 }),
  );
  idol.position.y = 0.065;
  idolPivot.add(idol);

  /* ---------- driver ---------- */

  const driver = playerControlled ? buildDriver() : null;
  if (driver) {
    // Offset to the left so the back-seat camera (which sits right) sees past
    // his shoulder rather than into the back of his head.
    driver.position.set(-0.3, 0.54, 0.46);
    bodyPivot.add(driver);
  }

  /* ---------- underglow + blob shadow ---------- */

  const underglow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 2.9),
    new THREE.MeshBasicMaterial({
      map: glowTexture(),
      color: 0xff9a3c,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.5,
    }),
  );
  underglow.rotation.x = -Math.PI / 2;
  underglow.position.y = 0.035;
  underglow.renderOrder = 3;
  root.add(underglow);

  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 3.2),
    new THREE.MeshBasicMaterial({
      map: blobShadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.75,
    }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  blob.renderOrder = 2;
  root.add(blob);

  /* ---------- animation ---------- */

  let wheelSpin = 0;
  let garlandSwing = 0;
  let garlandVel = 0;
  let idolBob = 0;
  let idolVel = 0;
  const fringeMat = fringe.material;

  function update(v, dt, elapsed, beat) {
    root.position.copy(v.position);
    root.rotation.y = v.yaw;

    bodyPivot.rotation.z = v.roll;
    bodyPivot.rotation.x = v.pitch;
    bodyPivot.position.y = v.bounce;

    // Inner rear wheel lifts when the auto flirts with going over.
    if (v.tipping > 0) {
      const lift = v.tipping * 0.06;
      if (v.roll > 0) rearR.position.y = AUTO.wheelRadius + lift;
      else rearL.position.y = AUTO.wheelRadius + lift;
    } else {
      rearL.position.y = AUTO.wheelRadius;
      rearR.position.y = AUTO.wheelRadius;
    }

    wheelSpin -= (v.speed / AUTO.wheelRadius) * dt;
    rearL.rotation.x = wheelSpin;
    rearR.rotation.x = wheelSpin;
    frontWheel.rotation.x = wheelSpin;

    steerPivot.rotation.y = v.steer;
    handlebar.rotation.y = v.steer * 2.2;

    // Garland swings from lateral acceleration, with a small kick on the beat.
    const lateral = v.speed * v.yawRate;
    const target = THREE.MathUtils.clamp(-lateral * 0.06, -0.5, 0.5) + (beat?.pulse ?? 0) * 0.15;
    garlandVel += (110 * (target - garlandSwing) - 2 * 0.5 * 10.5 * garlandVel) * dt;
    garlandSwing += garlandVel * dt;
    garlandPivot.rotation.z = garlandSwing;
    garlandPivot.rotation.x = Math.sin(elapsed * 1.7) * 0.05;

    // Idol bobs on the beat — fed through a spring so it overshoots. Assigning
    // the pulse directly looks robotic.
    idolVel += (150 * ((beat?.pulse ?? 0) * 0.045 - idolBob) - 2 * 0.4 * 12 * idolVel) * dt;
    idolBob += idolVel * dt;
    idolPivot.position.y = 1.12 + idolBob;
    idolPivot.rotation.z = idolBob * 3;

    if (fringeMat.userData.uniforms) {
      fringeMat.userData.uniforms.uTime.value = elapsed;
      fringeMat.userData.uniforms.uAmp.value = 0.4 + 0.6 * (beat?.pulseSmooth ?? 0);
    }

    // Underglow pulses with the music.
    underglow.material.opacity = 0.28 + 0.5 * (beat?.pulseSmooth ?? 0);

    blob.position.set(v.position.x, 0.02, v.position.z);
    blob.rotation.z = -v.yaw;
    underglow.position.set(v.position.x, 0.035, v.position.z);
    underglow.rotation.z = -v.yaw;
  }

  function setMeter(fare, flagDown) {
    meter.draw(fare, flagDown);
  }

  function dispose() {
    root.traverse((o) => {
      o.geometry?.dispose?.();
    });
    Object.values(materials).forEach((m) => m.dispose());
    tyre.dispose();
    hub.dispose();
  }

  return {
    root,
    bodyPivot,
    update,
    setMeter,
    dispose,
    materials,
    parts: { canopy, rearPanel, handlebar, garlandPivot, idolPivot, underglow, driver },
  };
}

/* ---------- sub-builders ---------- */

function buildGarland() {
  const count = 24;
  const geo = new THREE.IcosahedronGeometry(0.022, 0);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  const m = new THREE.Matrix4();
  const color = new THREE.Color();
  const marigold = [0xffa524, 0xf5c518, 0xff7a18];

  // Hang on a catenary so it drapes rather than hanging in a straight line.
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const x = (t - 0.5) * 0.34;
    const y = -0.1 - Math.cosh((t - 0.5) * 3.2) * 0.05;
    m.makeTranslation(x, y, 0);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, color.setHex(marigold[i % marigold.length]));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

function buildFringe(width) {
  const geo = new THREE.PlaneGeometry(width + 0.04, 0.14, 24, 1);
  const mat = new THREE.MeshBasicMaterial({
    map: fringeTexture(),
    transparent: true,
    side: THREE.DoubleSide,
    alphaTest: 0.4,
  });

  // Wave it in the vertex shader — far cheaper than 20 instanced cones.
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uAmp = { value: 1 };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform float uTime;
         uniform float uAmp;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         float wave = sin(uTime * 6.0 + position.x * 9.0) * 0.018 * uAmp;
         transformed.z += wave * (0.5 - uv.y);
         transformed.y += abs(wave) * 0.3;`,
      );
    mat.userData.uniforms = shader.uniforms;
  };

  const mesh = new THREE.Mesh(geo, mat);
  mesh.geometry.translate(0, -0.07, 0);
  return mesh;
}

/** Low-poly seated driver. Only the shoulders and head ever read — that's the bg.jpg framing. */
function buildDriver() {
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: 0xb99a5e, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x8d5a3b, roughness: 0.7 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x191410, roughness: 0.9 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.3, 4, 10), shirt);
  torso.position.y = 0.28;
  torso.rotation.x = 0.18;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 12), skin);
  head.position.set(0, 0.62, 0.02);
  g.add(head);

  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    hair,
  );
  cap.position.set(0, 0.635, 0.01);
  g.add(cap);

  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.3, 4, 8), shirt);
    arm.position.set(side * 0.2, 0.34, 0.16);
    arm.rotation.set(-0.9, 0, side * 0.18);
    g.add(arm);
  }

  return g;
}
