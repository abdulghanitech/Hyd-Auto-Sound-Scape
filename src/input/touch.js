/* Mobile controls.

   Design constraint: one thumb, portrait, and it must not cover the view —
   the view IS the product. So steering is a wide arc hugging the bottom-left
   bezel rather than a joystick square parked in the middle of the frame.

   Pointer events with setPointerCapture and per-pointerId bookkeeping, so
   multi-touch (steer + brake simultaneously) falls out for free. */

const STEER_TRAVEL = 132; // px of horizontal drag for full lock

export class TouchControls {
  constructor({ onChange }) {
    this.onChange = onChange;
    this.manualThrottle = false;
    this.state = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    this.pointers = new Map();
    this.root = null;
    this.enabled = false;
  }

  mount(parent) {
    if (this.root) return;

    const root = document.createElement("div");
    root.className = "touch";
    root.innerHTML = `
      <div class="touch-steer" id="touch-steer">
        <div class="touch-steer-track"></div>
        <div class="touch-steer-knob" id="touch-knob"></div>
        <span class="touch-label">STEER</span>
      </div>
      <div class="touch-pedals" id="touch-pedals" hidden>
        <button class="touch-pedal touch-brake" id="touch-brake" type="button" aria-label="Brake">BRAKE</button>
        <button class="touch-pedal touch-gas" id="touch-gas" type="button" aria-label="Throttle">GO</button>
      </div>
    `;
    parent.appendChild(root);
    this.root = root;

    this.steerZone = root.querySelector("#touch-steer");
    this.knob = root.querySelector("#touch-knob");
    this.pedals = root.querySelector("#touch-pedals");

    this.#bindSteer(this.steerZone);
    this.#bindPedal(root.querySelector("#touch-gas"), "throttle");
    this.#bindPedal(root.querySelector("#touch-brake"), "brake");

    this.enabled = true;
  }

  setManualThrottle(on) {
    this.manualThrottle = on;
    if (this.pedals) this.pedals.hidden = !on;
    if (!on) {
      this.state.throttle = 0;
      this.state.brake = 0;
      this.#emit();
    }
  }

  #bindSteer(zone) {
    let originX = 0;
    let activeId = null;

    const down = (e) => {
      if (activeId !== null) return;
      activeId = e.pointerId;
      originX = e.clientX;
      zone.setPointerCapture(e.pointerId);
      zone.classList.add("is-active");
      e.preventDefault();
    };

    const move = (e) => {
      if (e.pointerId !== activeId) return;
      const dx = e.clientX - originX;
      const steer = clamp(dx / STEER_TRAVEL, -1, 1);
      this.state.steer = steer;
      this.knob.style.transform = `translateX(${steer * 46}px)`;
      this.#emit();
      e.preventDefault();
    };

    const up = (e) => {
      if (e.pointerId !== activeId) return;
      activeId = null;
      this.state.steer = 0;
      this.knob.style.transform = "translateX(0px)";
      zone.classList.remove("is-active");
      this.#emit();
    };

    zone.addEventListener("pointerdown", down);
    zone.addEventListener("pointermove", move);
    zone.addEventListener("pointerup", up);
    zone.addEventListener("pointercancel", up);
  }

  #bindPedal(el, key) {
    const press = (e) => {
      el.setPointerCapture(e.pointerId);
      el.classList.add("is-active");
      this.state[key] = 1;
      this.#emit();
      e.preventDefault();
    };
    const release = () => {
      el.classList.remove("is-active");
      this.state[key] = 0;
      this.#emit();
    };
    el.addEventListener("pointerdown", press);
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    el.addEventListener("pointerleave", release);
  }

  #emit() {
    this.onChange({ ...this.state });
  }

  /** Fade the controls back when the player isn't touching them. */
  setDim(dim) {
    if (this.root) this.root.classList.toggle("is-dim", dim);
  }

  dispose() {
    this.root?.remove();
    this.root = null;
    this.enabled = false;
  }
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
