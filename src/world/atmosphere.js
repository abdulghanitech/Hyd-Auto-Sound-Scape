import * as THREE from "three";

/* Sky, fog, dust and water.

   Fog is doing the heavy lifting here: it hides chunk pop-in, it fakes aerial
   perspective, and it means the far plane never has to be honest. Committed
   atmospheric perspective is most of what separates "stylised on purpose" from
   "low-poly by accident". */

const SkyShader = {
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3  uHorizon;
    uniform vec3  uZenith;
    uniform vec3  uSunDir;
    uniform vec3  uSunColor;
    uniform float uSunSize;
    uniform float uHaze;
    varying vec3 vDir;

    void main() {
      vec3 dir = normalize(vDir);
      float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);

      // Bias the gradient toward the horizon so the warm band is wide and low.
      float t = pow(clamp(dir.y, 0.0, 1.0), 0.45);
      vec3 col = mix(uHorizon, uZenith, t);

      // Sun disc plus a broad halo
      float d = max(dot(dir, normalize(uSunDir)), 0.0);
      float disc = smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.3, d);
      float halo = pow(d, 14.0) * 0.55 + pow(d, 3.0) * 0.16;
      col += uSunColor * (disc * 2.2 + halo);

      // Dust band hugging the horizon — Hyderabad at dusk is never clear.
      float band = exp(-abs(dir.y) * 9.0) * uHaze;
      col = mix(col, uHorizon * 1.12, band);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function sunDirection(theme) {
  const az = THREE.MathUtils.degToRad(theme.sky.sunAzimuth);
  const el = THREE.MathUtils.degToRad(theme.sky.sunElevation);
  return new THREE.Vector3(
    Math.cos(el) * Math.sin(az),
    Math.sin(el),
    Math.cos(el) * Math.cos(az),
  ).normalize();
}

export function buildSky(theme) {
  const geo = new THREE.SphereGeometry(420, 28, 18);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uHorizon: { value: new THREE.Color(theme.sky.horizon) },
      uZenith: { value: new THREE.Color(theme.sky.zenith) },
      uSunDir: { value: sunDirection(theme) },
      uSunColor: { value: new THREE.Color(theme.sky.sunColor) },
      uSunSize: { value: theme.sky.sunSize },
      uHaze: { value: theme.sky.hazeStrength },
    },
    vertexShader: SkyShader.vertexShader,
    fragmentShader: SkyShader.fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return mesh;
}

/**
 * Environment map for the auto's paint and the wet road.
 * Prefiltering the skydome costs about 8 ms once and zero bytes.
 */
export function buildEnvironment(renderer, sky) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const scene = new THREE.Scene();
  const clone = sky.clone();
  clone.material = sky.material.clone();
  scene.add(clone);

  const target = pmrem.fromScene(scene, 0, 0.1, 500);

  // Only the material is ours to free: Object3D.clone() SHARES the geometry
  // with the original, so disposing it here would silently delete the real sky.
  clone.material.dispose();
  pmrem.dispose();

  return target.texture;
}

/* ---------------------------------------------------------------- motes -- */

/**
 * Dust in the air. A points cloud in a box that follows the camera, so a few
 * hundred particles cover the whole world.
 *
 * Brightness comes from dot(viewDir, sunDir) in the vertex shader, which makes
 * them flare when you drive into the sun — a near-free volumetric substitute.
 */
export function buildMotes(count, theme) {
  if (count <= 0) return null;

  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const EXTENT = 46;

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * EXTENT;
    positions[i * 3 + 1] = Math.random() * 14;
    positions[i * 3 + 2] = (Math.random() - 0.5) * EXTENT;
    seeds[i] = Math.random() * Math.PI * 2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(theme.moteColor) },
      uSunDir: { value: sunDirection(theme) },
      uExtent: { value: EXTENT },
      uOrigin: { value: new THREE.Vector3() },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uExtent;
      uniform vec3  uOrigin;
      uniform vec3  uSunDir;
      varying float vGlow;

      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.4 + aSeed) * 0.9;
        p.y += sin(uTime * 0.27 + aSeed * 1.7) * 0.6;

        // Wrap the cloud around the camera so it never runs out.
        p += uOrigin;
        p.x = mod(p.x - uOrigin.x + uExtent * 0.5, uExtent) + uOrigin.x - uExtent * 0.5;
        p.z = mod(p.z - uOrigin.z + uExtent * 0.5, uExtent) + uOrigin.z - uExtent * 0.5;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vec3 viewDir = normalize(-mv.xyz);
        vec3 sunView = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
        vGlow = pow(max(dot(viewDir, -sunView), 0.0), 3.0) * 0.85 + 0.15;

        gl_Position = projectionMatrix * mv;
        gl_PointSize = (28.0 / -mv.z) * (0.6 + aSeed * 0.12);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vGlow;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.0, length(c));
        gl_FragColor = vec4(uColor * vGlow, a * 0.5 * vGlow);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 8;
  return points;
}

/* ------------------------------------------------------------- god rays -- */

/**
 * Six big additive quads fanned toward the camera from the sun's direction.
 * Combined with bloom this reads as volumetric light for essentially nothing.
 *
 * depthWrite:false + a high renderOrder is load-bearing — get it wrong and the
 * rays punch straight through buildings.
 */
export function buildGodRays(theme) {
  if (!theme.godRays) return null;

  const group = new THREE.Group();
  const dir = sunDirection(theme);
  const mat = new THREE.MeshBasicMaterial({
    color: theme.sky.sunColor,
    transparent: true,
    opacity: 0.05,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });

  for (let i = 0; i < 6; i++) {
    const w = 12 + i * 9;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, 150), mat);
    plane.position.copy(dir).multiplyScalar(120);
    plane.position.y = 30 + i * 4;
    plane.rotation.z = (i - 2.5) * 0.09;
    plane.renderOrder = 10;
    group.add(plane);
  }

  group.frustumCulled = false;
  return group;
}

/* ---------------------------------------------------------------- water -- */

export function buildWater(def, theme) {
  const geo = new THREE.CircleGeometry(def.radius, 48);
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshStandardMaterial({
    color: theme.id === "night" ? 0x0a1424 : 0x2a4358,
    roughness: 0.08,
    metalness: 0.85,
    envMapIntensity: 1.8,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(def.center[0], def.level, def.center[1]);
  mesh.receiveShadow = false;
  return mesh;
}

export function applyFog(scene, theme) {
  scene.fog = new THREE.FogExp2(theme.fog.color, theme.fog.density);
  scene.background = new THREE.Color(theme.fog.color);
}

export function buildLights(theme) {
  const group = new THREE.Group();

  const hemi = new THREE.HemisphereLight(
    theme.hemi.sky,
    theme.hemi.ground,
    theme.hemi.intensity,
  );
  group.add(hemi);

  const sun = new THREE.DirectionalLight(theme.sun.color, theme.sun.intensity);
  const dir = sunDirection(theme);
  sun.position.copy(dir).multiplyScalar(120);
  group.add(sun);
  group.add(sun.target);

  return { group, sun, hemi, sunDir: dir };
}

export function enableSunShadows(sun, theme) {
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;

  const r = theme.sun.shadowRadius;
  const cam = sun.shadow.camera;
  cam.left = -r;
  cam.right = r;
  cam.top = r;
  cam.bottom = -r;
  cam.near = 1;
  cam.far = 320;
  cam.updateProjectionMatrix();
}
