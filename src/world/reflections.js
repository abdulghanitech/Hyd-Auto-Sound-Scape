import * as THREE from "three";
import { glowTexture } from "./textures.js";

/* Light glows and wet-road reflections.

   Almost every "light" in this game is geometry with a MeshBasicMaterial that
   bloom turns into a glow. These two classes add the two things bloom alone
   can't give you: a soft halo that survives at distance, and the vertical
   smear a light throws down a wet road.

   Full screen-space reflections are deliberately not used. The smear below is
   about 80% of the look for roughly 1% of the cost. */

/** Soft halos around every emitter. One draw call for the whole map. */
export class GlowSprites {
  constructor(emitters) {
    const count = emitters.length;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const scales = new Float32Array(count);

    const c = new THREE.Color();
    emitters.forEach((e, i) => {
      positions[i * 3] = e.x;
      positions[i * 3 + 1] = e.y;
      positions[i * 3 + 2] = e.z;
      c.setHex(e.color ?? 0xffd98a);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      scales[i] = e.scale ?? 1;
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("aColor", new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute("aScale", new THREE.Float32BufferAttribute(scales, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: glowTexture() },
        uIntensity: { value: 1 },
        uPixelRatio: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute vec3  aColor;
        attribute float aScale;
        uniform float uPixelRatio;
        varying vec3 vColor;
        void main() {
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (aScale * 140.0 * uPixelRatio) / max(-mv.z, 0.001);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform float uIntensity;
        varying vec3 vColor;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vColor * uIntensity, t.a * t.r);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.renderOrder = 6;
    this.points.frustumCulled = false;
  }

  setPixelRatio(r) {
    this.material.uniforms.uPixelRatio.value = r;
  }

  /** Lights breathe very slightly on the beat. */
  setIntensity(v) {
    this.material.uniforms.uIntensity.value = v;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

/**
 * Wet-road reflection smears.
 *
 * One elongated additive quad lying on the road under each light. Each is
 * re-oriented so its long axis points at the camera, which is what makes the
 * streak read as a reflection rather than a puddle — a real reflection always
 * stretches away from the viewer.
 *
 * Re-orientation runs at 10 Hz for the nearest few hundred, which is far below
 * the noise floor of the frame budget.
 */
export class WetSmears {
  constructor(emitters, { maxCount = 320, strength = 1 } = {}) {
    const list = emitters.filter((e) => e.y > 0.5).slice(0, maxCount);
    this.emitters = list;
    this.count = list.length;

    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, 0.5); // pivot at the near end so it stretches away

    const mat = new THREE.MeshBasicMaterial({
      map: glowTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.5 * strength,
      toneMapped: false,
    });

    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, this.count));
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.renderOrder = 4;
    this.mesh.frustumCulled = false;

    const color = new THREE.Color();
    list.forEach((e, i) => this.mesh.setColorAt(i, color.setHex(e.color ?? 0xffd98a)));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._accum = 0;
  }

  update(dt, cameraPos) {
    this._accum += dt;
    if (this._accum < 0.1) return;
    this._accum = 0;

    for (let i = 0; i < this.count; i++) {
      const e = this.emitters[i];
      const dx = cameraPos.x - e.x;
      const dz = cameraPos.z - e.z;
      const dist = Math.hypot(dx, dz);

      // Taller lights throw longer streaks, and so do closer ones.
      const len = THREE.MathUtils.clamp(e.y * 1.6 + dist * 0.12, 2, 22);
      const wide = (e.scale ?? 1) * 1.1;

      this._p.set(e.x, 0.04, e.z);
      this._q.setFromAxisAngle(UP, Math.atan2(dx, dz));
      this._s.set(wide, 1, len);

      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

const UP = new THREE.Vector3(0, 1, 0);
