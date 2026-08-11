import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { createGradePass, applyTheme } from "../post/GradePass.js";

/* Pass order is not arbitrary:
 *
 *   RenderPass → UnrealBloomPass → OutputPass → GradePass
 *
 * Bloom must see linear HDR values, so it runs BEFORE tone mapping. OutputPass
 * owns tone mapping and sRGB encoding (do not also enable GammaCorrectionShader
 * anywhere — that double-encodes and washes everything out). Grain, vignette
 * and chromatic aberration are display-referred, so they run last.
 *
 * Anti-aliasing is MSAA on the composer's render target on desktop rather than
 * an SMAA pass: it's true geometric AA, nearly free on desktop, and it saves the
 * ~44 KB of base64 lookup textures that SMAAPass embeds. On mobile we skip AA
 * entirely and lean on the DPR clamp instead.
 */

export class Composer {
  constructor(stage, scene, tier, theme) {
    this.stage = stage;
    this.tier = tier;

    const size = stage.size;
    const dpr = stage.renderer.getPixelRatio();

    const target = new THREE.WebGLRenderTarget(size.x * dpr, size.y * dpr, {
      type: THREE.HalfFloatType, // default since r152 — keeps grain/CA from banding
      samples: tier.msaa,
    });

    this.composer = new EffectComposer(stage.renderer, target);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(size.x, size.y);

    this.renderPass = new RenderPass(scene, stage.camera);
    this.composer.addPass(this.renderPass);

    if (tier.bloom) {
      this.bloom = new UnrealBloomPass(
        new THREE.Vector2(size.x * tier.bloomResScale, size.y * tier.bloomResScale),
        theme.bloomStrength ?? 0.62,
        theme.bloomRadius ?? 0.62,
        theme.bloomThreshold ?? 0.72,
      );
      this.composer.addPass(this.bloom);
      this.baseBloomStrength = theme.bloomStrength ?? 0.62;
    }

    this.output = new OutputPass();
    this.composer.addPass(this.output);

    this.grade = createGradePass(tier, theme);
    this.composer.addPass(this.grade);

    stage.onResize = (w, h, ratio) => {
      this.composer.setPixelRatio(ratio);
      this.composer.setSize(w, h);
      this.bloom?.setSize(w * tier.bloomResScale, h * tier.bloomResScale);
    };
  }

  setScene(scene) {
    this.renderPass.scene = scene;
  }

  setTheme(theme) {
    applyTheme(this.grade, this.tier, theme);
    if (this.bloom) {
      this.baseBloomStrength = theme.bloomStrength ?? 0.62;
      this.bloom.strength = this.baseBloomStrength;
      this.bloom.radius = theme.bloomRadius ?? 0.62;
      this.bloom.threshold = theme.bloomThreshold ?? 0.72;
    }
  }

  /** 0 = normal, 1 = black. Used for map-to-map transitions. */
  setFade(v) {
    this.grade.uniforms.uFade.value = v;
  }

  render(dt, elapsed, beat) {
    this.grade.uniforms.uTime.value = elapsed;

    // Bloom breathes very slightly with the music. Kept subtle deliberately —
    // a strongly pumping bloom is nauseating within about thirty seconds.
    if (this.bloom && beat) {
      this.bloom.strength = this.baseBloomStrength + 0.1 * beat.pulseSmooth;
    }

    this.composer.render(dt);
  }

  dispose() {
    this.composer.renderTarget1?.dispose();
    this.composer.renderTarget2?.dispose();
    this.bloom?.dispose();
    this.grade.dispose?.();
  }
}
