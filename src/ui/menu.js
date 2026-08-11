import { TiltSteering } from "../input/tilt.js";
import { UNLOCK_THRESHOLD } from "../game/state.js";

/* Pause menu.

   Also the only route to the second map, so it can't be an afterthought. The
   ride keeps rendering behind it and the music keeps playing — pausing the
   music to read a settings panel would be actively annoying. */

const MAP_CARDS = [
  {
    id: "charminar",
    name: "OLD CITY",
    sub: "Charminar · Dusk",
    blurb: "Narrow lanes, bazaar stalls, and the monument lit at golden hour.",
  },
  {
    id: "tankbund",
    name: "TANK BUND",
    sub: "Necklace Road · Night",
    blurb: "Wide lakeside road, string lights, and the Buddha out on the water.",
  },
];

export class Menu {
  constructor(root, { state, onSelectMap, onSetting, onClose }) {
    this.state = state;
    this.onSelectMap = onSelectMap;
    this.onSetting = onSetting;
    this.onClose = onClose;

    this.el = document.createElement("div");
    this.el.className = "menu";
    this.el.hidden = true;
    root.appendChild(this.el);

    this.el.addEventListener("click", (e) => {
      if (e.target === this.el) this.close();
    });
  }

  get isOpen() {
    return !this.el.hidden;
  }

  open(currentMap) {
    this.currentMap = currentMap;
    this.#render();
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add("is-in"));
  }

  close() {
    this.el.classList.remove("is-in");
    setTimeout(() => (this.el.hidden = true), 260);
    this.onClose?.();
  }

  toggle(currentMap) {
    if (this.isOpen) this.close();
    else this.open(currentMap);
  }

  #render() {
    const d = this.state.data;
    const tiltAvailable = TiltSteering.supported;

    this.el.innerHTML = `
      <div class="menu-panel">
        <button class="menu-close" type="button" aria-label="Close">✕</button>

        <h2 class="menu-title">HYD AUTO</h2>
        <p class="menu-total">₹${this.state.total} earned · ${d.ridesDone} ride${d.ridesDone === 1 ? "" : "s"}</p>

        <div class="menu-section-label">Where to?</div>
        <div class="menu-maps">
          ${MAP_CARDS.map((m) => this.#mapCard(m)).join("")}
        </div>

        <div class="menu-section-label">Settings</div>
        <div class="menu-settings">
          ${this.#row("Graphics", this.#segmented("quality", [
            ["auto", "Auto"], ["high", "High"], ["mid", "Medium"], ["low", "Low"],
          ], d.quality ?? "auto"))}

          ${this.#row("Auto throttle", this.#toggle("autoThrottle", this.#autoThrottleOn()),
            "The auto creeps forward on its own — you only steer.")}

          ${tiltAvailable ? this.#row("Tilt steering", this.#toggle("tilt", !!d.tilt),
            "Steer by tilting the phone. Zero is set when you switch it on.") : ""}

          ${this.#row("Reduced motion", this.#toggle("reduceMotion", !!d.reduceMotion),
            "Cuts camera shake, grain and lens effects.")}
        </div>

        <button class="menu-reset" type="button">Reset progress</button>
      </div>
    `;

    this.el.querySelector(".menu-close").addEventListener("click", () => this.close());

    this.el.querySelectorAll("[data-map]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.map;
        if (btn.disabled || id === this.currentMap) return;
        this.close();
        this.onSelectMap(id);
      });
    });

    this.el.querySelectorAll("[data-setting]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.setting;
        const value = btn.dataset.value === "true" ? true
          : btn.dataset.value === "false" ? false
          : btn.dataset.value;
        this.onSetting(key, value);
        this.#render();
      });
    });

    this.el.querySelector(".menu-reset").addEventListener("click", () => {
      this.state.reset();
      this.#render();
    });
  }

  #autoThrottleOn() {
    const d = this.state.data;
    return d.autoThrottle === null ? window.matchMedia?.("(pointer: coarse)").matches : d.autoThrottle;
  }

  #mapCard(m) {
    const unlocked = this.state.isUnlocked(m.id);
    const current = m.id === this.currentMap;
    const remaining = Math.max(0, UNLOCK_THRESHOLD - this.state.total);

    return `
      <button class="menu-map ${current ? "is-current" : ""} ${unlocked ? "" : "is-locked"}"
              type="button" data-map="${m.id}" ${unlocked ? "" : "disabled"}>
        <span class="menu-map-name">${m.name}</span>
        <span class="menu-map-sub">${m.sub}</span>
        <span class="menu-map-blurb">${m.blurb}</span>
        ${
          unlocked
            ? `<span class="menu-map-state">${current ? "Driving now" : "Drive here"}</span>`
            : `<span class="menu-map-state is-locked">₹${remaining} more to unlock
                 <span class="menu-map-track"><span style="width:${this.state.unlockProgress * 100}%"></span></span>
               </span>`
        }
      </button>
    `;
  }

  #row(label, control, note = "") {
    return `
      <div class="menu-row">
        <div class="menu-row-text">
          <span class="menu-row-label">${label}</span>
          ${note ? `<span class="menu-row-note">${note}</span>` : ""}
        </div>
        ${control}
      </div>
    `;
  }

  #segmented(key, options, current) {
    return `<div class="seg">${options
      .map(
        ([value, label]) =>
          `<button class="seg-btn ${value === current ? "is-on" : ""}" type="button"
                   data-setting="${key}" data-value="${value}">${label}</button>`,
      )
      .join("")}</div>`;
  }

  #toggle(key, on) {
    return `<button class="switch ${on ? "is-on" : ""}" type="button" role="switch"
                    aria-checked="${on}" data-setting="${key}" data-value="${!on}">
              <span class="switch-knob"></span>
            </button>`;
  }

  dispose() {
    this.el.remove();
  }
}
