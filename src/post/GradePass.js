import * as THREE from "three";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

/* One pass that does the work of four.

   Each ShaderPass is a full-screen render-target read plus write. On a
   1080×2400 phone at DPR 1.5 that's ~2 M pixels; four stacked passes is ~8 M
   pixels/frame of pure bandwidth on a tile-based mobile GPU — 6-10 ms gone
   before any geometry is drawn. So chromatic aberration, tonal grade, vignette,
   halation and film grain all happen here, in three texture taps.

   This runs AFTER OutputPass, i.e. after tone mapping and sRGB encoding, because
   grain and vignette are display-referred effects. Bloom is the opposite — it
   belongs in linear HDR before tone mapping. */

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAberration: { value: 0.0022 },
    uVignette: { value: 0.34 },
    uGrain: { value: 0.06 },
    uLift: { value: new THREE.Vector3(0.02, 0.0, -0.03) },
    uSaturation: { value: 1.12 },
    uContrast: { value: 1.04 },
    uHalation: { value: 0.12 },
    uFade: { value: 0 }, // 0 = normal, 1 = fully black (used for map transitions)
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAberration;
    uniform float uVignette;
    uniform float uGrain;
    uniform vec3  uLift;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uHalation;
    uniform float uFade;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423));
      p += dot(p, p.yx + 19.19);
      return fract((p.x + p.y) * p.x);
    }

    void main() {
      vec2 uv = vUv;
      vec2 centered = uv - 0.5;
      float r2 = dot(centered, centered);

      // Chromatic aberration, scaled by distance from centre so the middle of
      // the frame stays clean — lens behaviour, not a uniform smear.
      vec2 offset = centered * uAberration * r2 * 4.0;
      vec3 color;
      color.r = texture2D(tDiffuse, uv + offset).r;
      color.g = texture2D(tDiffuse, uv).g;
      color.b = texture2D(tDiffuse, uv - offset).b;

      // Halation: bleed warmth out of the brightest areas, the way film does
      // around a light source. Cheap stand-in for a proper glow pass.
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      float hot = smoothstep(0.84, 1.0, luma);
      color += vec3(0.9, 0.45, 0.16) * hot * uHalation;

      // Tonal grade
      color = (color - 0.5) * uContrast + 0.5;
      color += uLift;
      float grey = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(grey), color, uSaturation);

      // Vignette
      float vig = smoothstep(0.85, 0.18, r2 * 2.0);
      color *= mix(1.0, vig, uVignette);

      // Animated film grain, carried over from the original site's canvas grain.
      float g = hash(uv * vec2(1920.0, 1080.0) + fract(uTime) * 137.0);
      color += (g - 0.5) * uGrain;

      color = mix(color, vec3(0.0), uFade);

      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }
  `,
};

export function createGradePass(tier, theme) {
  const pass = new ShaderPass(GradeShader);
  applyTheme(pass, tier, theme);
  return pass;
}

export function applyTheme(pass, tier, theme = {}) {
  const u = pass.uniforms;
  u.uGrain.value = tier.grain ? (theme.grain ?? 0.06) : 0;
  u.uAberration.value = tier.chromatic ? (theme.chromatic ?? 0.0022) : 0;
  u.uVignette.value = theme.vignette ?? 0.34;
  u.uSaturation.value = theme.saturation ?? 1.12;
  u.uContrast.value = theme.contrast ?? 1.04;
  u.uHalation.value = theme.halation ?? 0.12;
  if (theme.lift) u.uLift.value.set(...theme.lift);
}

/** Reduced-motion and photo mode both want the moving/lens artefacts gone. */
export function setCleanMode(pass, clean) {
  if (clean) {
    pass.uniforms.uGrain.value = 0;
    pass.uniforms.uAberration.value = 0;
  }
}
