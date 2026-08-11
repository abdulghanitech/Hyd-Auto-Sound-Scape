import * as THREE from "three";

/**
 * Owns the WebGLRenderer, the camera, and the DPR/resize policy.
 *
 * Deliberately does NOT own the scene — maps come and go, the renderer doesn't.
 */
export class Stage {
  constructor(canvas, tier) {
    this.canvas = canvas;
    this.tier = tier;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // MSAA is applied on the composer target instead
      alpha: false,
      powerPreference: "high-performance",
      // preserveDrawingBuffer costs a permanent copy every frame. Photo mode
      // reads the buffer inside the same frame as the draw instead.
      preserveDrawingBuffer: false,
      stencil: false,
    });

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setClearColor(0x12100e, 1);

    // With a composer, info resets on every pass and ends up reporting only the
    // final fullscreen quad — which reads as "1 draw call" and hides the truth.
    // Reset once per frame instead so the numbers cover the whole frame.
    this.renderer.info.autoReset = false;

    if (tier.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 600);
    this.camera.position.set(0, 3, 8);

    this._onResize = () => this.resize();
    window.addEventListener("resize", this._onResize);
    window.addEventListener("orientationchange", this._onResize);

    this.resize();
  }

  /** Horizontal FOV is held constant so portrait phones don't get a letterbox corridor. */
  #applyFov() {
    const HFOV = THREE.MathUtils.degToRad(this.hFovDeg ?? 74);
    const aspect = this.camera.aspect;
    const vFov = 2 * Math.atan(Math.tan(HFOV / 2) / Math.max(aspect, 0.0001));
    this.camera.fov = THREE.MathUtils.radToDeg(vFov);
    this.camera.updateProjectionMatrix();
  }

  /** Camera modes set a horizontal FOV; the vertical one is derived per aspect. */
  setHorizontalFov(deg) {
    this.hFovDeg = deg;
    this.#applyFov();
  }

  setTier(tier) {
    this.tier = tier;
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.tier.maxDpr);

    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);

    this.camera.aspect = w / h;
    this.#applyFov();

    this.onResize?.(w, h, dpr);
  }

  get size() {
    return new THREE.Vector2(window.innerWidth, window.innerHeight);
  }

  dispose() {
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("orientationchange", this._onResize);
    this.renderer.dispose();
  }
}

/**
 * WebGL context loss is real on mobile — backgrounding the tab or memory
 * pressure will do it, and the default outcome is a permanently black screen.
 *
 * Re-initialising three.js in place is error-prone, so we persist and reload.
 */
export function guardContextLoss(canvas, { onLost, onRestored }) {
  canvas.addEventListener(
    "webglcontextlost",
    (e) => {
      e.preventDefault(); // without this, the context is never restorable
      onLost?.();
    },
    false,
  );
  canvas.addEventListener("webglcontextrestored", () => onRestored?.(), false);
}
