import * as THREE from "three";
import { RoadPath, buildRoadSegment, roadMaterials } from "./road.js";
import { buildBuildings, buildingMaterials } from "./buildings.js";
import { buildProps, propMaterials } from "./props.js";
import { buildLandmark } from "./landmarks.js";
import { Crowd, Pigeons } from "./crowd.js";
import { Traffic } from "./traffic.js";
import { GlowSprites, WetSmears } from "./reflections.js";
import {
  buildSky, buildEnvironment, buildMotes, buildWater,
  applyFog, buildLights, enableSunShadows,
} from "./atmosphere.js";
import { makeRng } from "./rng.js";
import { disposeObject } from "../engine/dispose.js";

const CHUNK_LENGTH = 60; // metres of arclength per chunk

/**
 * Builds a whole map, incrementally.
 *
 * Generation is chunked across frames (never blocking for more than a few
 * milliseconds) so the loading bar actually animates instead of freezing —
 * which is also why there is no Web Worker here. Transferring BufferGeometry
 * back from a worker is possible, but the complexity isn't worth ~300 ms.
 */
export class WorldGenerator {
  constructor(mapDef, tier, renderer) {
    this.mapDef = mapDef;
    this.tier = tier;
    this.renderer = renderer;
    this.theme = mapDef.theme;

    this.scene = new THREE.Scene();
    this.path = new RoadPath(mapDef);
    this.rng = makeRng(mapDef.seed);

    this.chunks = [];
    this.emitters = [];
    this.steps = [];
    this.done = false;

    this.chunkCount = Math.max(1, Math.round(this.path.length / CHUNK_LENGTH));
    this.#planSteps();
  }

  get totalSteps() {
    return this.steps.length;
  }

  #planSteps() {
    this.steps.push({ label: "Filling petrol…", run: () => this.#setupScene() });

    for (let i = 0; i < this.chunkCount; i++) {
      this.steps.push({
        label: i % 3 === 0 ? "Laying the road…" : null,
        run: () => this.#buildChunk(i),
      });
    }

    this.steps.push({ label: "Raising Charminar…", run: () => this.#buildLandmarks() });
    this.steps.push({ label: "Calling the crowd…", run: () => this.#buildCrowd() });
    this.steps.push({ label: "Letting traffic in…", run: () => this.#buildTraffic() });
    this.steps.push({ label: "Switching on the lights…", run: () => this.#buildLighting() });
  }

  /** Run steps until the time budget is spent. Returns progress in [0,1]. */
  advance(budgetMs = 8) {
    const start = performance.now();
    while (this.stepIndex < this.steps.length && performance.now() - start < budgetMs) {
      const step = this.steps[this.stepIndex];
      step.run();
      if (step.label) this.currentLabel = step.label;
      this.stepIndex++;
    }
    if (this.stepIndex >= this.steps.length) this.done = true;
    return this.stepIndex / this.steps.length;
  }

  stepIndex = 0;
  currentLabel = "Warming up the engine…";

  /* ---------------- steps ---------------- */

  #setupScene() {
    applyFog(this.scene, this.theme);

    this.sky = buildSky(this.theme);
    this.scene.add(this.sky);

    this.envMap = buildEnvironment(this.renderer, this.sky);
    this.scene.environment = this.envMap;

    const { group, sun, sunDir } = buildLights(this.theme);
    this.scene.add(group);
    this.sun = sun;
    this.sunOffset = sunDir.clone().multiplyScalar(120);
    if (this.tier.shadows) enableSunShadows(sun, this.theme);

    this.roadMats = roadMaterials(this.theme);
    this.buildingMats = buildingMaterials(this.theme);
    this.propMats = propMaterials(this.theme);

    // Ground plane under everything, so gaps between buildings aren't sky.
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(600, 32),
      new THREE.MeshStandardMaterial({
        color: this.theme.id === "night" ? 0x11151c : 0x7a6a55,
        roughness: 1,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.03;
    ground.receiveShadow = !!this.tier.shadows;
    this.scene.add(ground);

    if (this.mapDef.water) {
      this.scene.add(buildWater(this.mapDef.water, this.theme));
    }
  }

  #buildChunk(i) {
    const start = (i / this.chunkCount) * this.path.length;
    const end = ((i + 1) / this.chunkCount) * this.path.length;

    const group = new THREE.Group();
    group.userData.center = this.path.offsetPoint((start + end) / 2, 0);

    const seg = buildRoadSegment(this.path, start, end + 0.5, {
      wet: this.mapDef.wet ? 1 : 0,
    });

    const road = new THREE.Mesh(seg.road, this.roadMats.road);
    road.receiveShadow = !!this.tier.shadows;
    group.add(road);
    group.add(new THREE.Mesh(seg.kerb, this.roadMats.kerb));
    group.add(new THREE.Mesh(seg.footpath, this.roadMats.footpath));

    const b = buildBuildings(this.path, start, end, this.mapDef, this.rng);
    if (b.wall) {
      const m = new THREE.Mesh(b.wall, this.buildingMats.wall);
      m.castShadow = !!this.tier.shadows;
      m.receiveShadow = !!this.tier.shadows;
      group.add(m);
    }
    if (b.glow) {
      const m = new THREE.Mesh(b.glow, this.buildingMats.glow);
      m.renderOrder = 5;
      group.add(m);
    }
    if (b.sign) group.add(new THREE.Mesh(b.sign, this.buildingMats.sign));

    const p = buildProps(this.path, start, end, this.mapDef, this.rng);
    if (p.solid) {
      const m = new THREE.Mesh(p.solid, this.propMats.solid);
      m.castShadow = !!this.tier.shadows;
      group.add(m);
    }
    if (p.emissive) group.add(new THREE.Mesh(p.emissive, this.propMats.emissive));
    this.emitters.push(...p.emitters);

    group.userData.startDist = start;
    group.userData.endDist = end;

    this.scene.add(group);
    this.chunks.push(group);
  }

  #buildLandmarks() {
    this.landmarkPositions = [];
    for (const def of this.mapDef.landmarks ?? []) {
      const { group, emitters } = buildLandmark(def, this.theme);
      this.scene.add(group);
      this.emitters.push(...emitters);
      this.landmarkPositions.push(new THREE.Vector3(def.x, 0, def.z));
    }
  }

  #buildCrowd() {
    const total = Math.round(this.tier.crowd * (this.mapDef.crowdDensity ?? 1));
    if (total <= 0) return;

    this.crowds = [];
    const perChunk = Math.max(1, Math.round(total / this.chunkCount));

    for (const chunk of this.chunks) {
      const c = new Crowd(
        this.path,
        chunk.userData.startDist,
        chunk.userData.endDist,
        this.mapDef,
        this.rng,
        perChunk,
      );
      chunk.add(c.mesh);
      this.crowds.push(c);
    }

    if (this.mapDef.pigeons > 0 && this.landmarkPositions?.length) {
      this.pigeons = new Pigeons(this.mapDef.pigeons, this.landmarkPositions[0], this.rng);
      this.scene.add(this.pigeons.mesh);
    }
  }

  #buildTraffic() {
    this.traffic = new Traffic(this.path, this.mapDef, this.rng, this.tier.traffic);
    for (const m of this.traffic.meshes) this.scene.add(m);
  }

  #buildLighting() {
    this.glows = new GlowSprites(this.emitters);
    this.glows.setPixelRatio(this.renderer.getPixelRatio());
    this.scene.add(this.glows.points);

    if (this.mapDef.wet) {
      this.smears = new WetSmears(this.emitters, { strength: this.theme.wet });
      this.scene.add(this.smears.mesh);
    }

    this.motes = buildMotes(this.tier.motes, this.theme);
    if (this.motes) this.scene.add(this.motes);
  }

  /* ---------------- runtime ---------------- */

  /**
   * Chunk visibility: distance plus a forward-cone test, evaluated at 10 Hz.
   * ~25 tests beats letting three cull thousands of individual objects.
   */
  updateVisibility(cameraPos, cameraDir) {
    const far = this.tier.drawDistance;
    const farSq = far * far;

    for (const chunk of this.chunks) {
      const c = chunk.userData.center;
      const dx = c.x - cameraPos.x;
      const dz = c.z - cameraPos.z;
      const distSq = dx * dx + dz * dz;

      if (distSq > farSq) {
        chunk.visible = false;
        continue;
      }
      // Always keep what's very close, regardless of facing.
      if (distSq < 3600) {
        chunk.visible = true;
        continue;
      }
      const inv = 1 / Math.sqrt(distSq);
      chunk.visible = (dx * inv * cameraDir.x + dz * inv * cameraDir.z) > -0.35;
    }
  }

  update(dt, elapsed, ctx) {
    const { cameraPos, cameraDir, vehicle, beat, onPlayerHit } = ctx;

    this._visAccum = (this._visAccum ?? 0) + dt;
    if (this._visAccum > 0.1) {
      this._visAccum = 0;
      this.updateVisibility(cameraPos, cameraDir);
    }

    if (this.crowds) {
      for (let i = 0; i < this.crowds.length; i++) {
        if (this.chunks[i].visible) this.crowds[i].update(dt, elapsed);
      }
    }

    this.pigeons?.update(dt, elapsed);
    this.traffic?.update(dt, vehicle.position, this.path.nearestDistance(vehicle.position), onPlayerHit);
    this.smears?.update(dt, cameraPos);

    if (this.motes) {
      this.motes.material.uniforms.uTime.value = elapsed;
      this.motes.material.uniforms.uOrigin.value.copy(cameraPos);
    }

    // Street lighting breathes on the beat — subtle, and only the glow halos,
    // never the geometry, so nothing appears to physically move.
    if (this.glows && beat) this.glows.setIntensity(0.88 + 0.24 * beat.pulseSmooth);

    if (this.sun && this.tier.shadows) {
      // Keep the shadow frustum tight around the player: carry the sun along
      // with the auto, preserving its direction so the light angle never shifts.
      this.sun.position.copy(vehicle.position).addScaledVector(this.sunOffset, 1);
      this.sun.target.position.copy(vehicle.position);
      this.sun.target.updateMatrixWorld();
    }
  }

  onBar(barIndex) {
    if (this.pigeons && barIndex % 16 === 0) this.pigeons.burst();
  }

  dispose() {
    disposeObject(this.scene);
    this.crowds?.forEach((c) => c.dispose());
    this.pigeons?.dispose();
    this.traffic?.dispose();
    this.glows?.dispose();
    this.smears?.dispose();
    this.envMap?.dispose();
    Object.values(this.roadMats ?? {}).forEach((m) => m.dispose());
    Object.values(this.buildingMats ?? {}).forEach((m) => m.dispose());
    Object.values(this.propMats ?? {}).forEach((m) => m.dispose());
    this.chunks.length = 0;
    this.emitters.length = 0;
  }
}

export { CHUNK_LENGTH };
