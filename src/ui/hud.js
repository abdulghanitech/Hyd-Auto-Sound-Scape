import * as THREE from "three";
import { KEY_HELP } from "../input/keyboard.js";
import { UNLOCK_THRESHOLD } from "../game/state.js";

/* The DOM overlay.

   The player pill is lifted near-verbatim from the original site — same glass,
   same spinning disc, same yellow seek bar. It is the strongest single signal
   that this is the same product people already know.

   One layout conflict had to be resolved: the pill is fixed to bottom-centre,
   which is exactly where the mobile steering thumb goes. On phones during a
   ride it collapses to a compact top pill; the full one returns on the pause
   screen. */

export class Hud {
  constructor(root, { brand, onAction }) {
    this.root = root;
    this.onAction = onAction;
    this.brand = brand;
    this.toasts = [];

    root.hidden = false;
    root.innerHTML = template(brand);

    this.el = {
      mapLabel: root.querySelector("#hud-map"),
      clock: root.querySelector("#hud-clock"),
      fare: root.querySelector("#hud-fare"),
      meter: root.querySelector("#hud-meter"),
      meterFare: root.querySelector("#hud-meter-fare"),
      meterTo: root.querySelector("#hud-meter-to"),
      arrow: root.querySelector("#hud-arrow"),
      arrowDist: root.querySelector("#hud-arrow-dist"),
      unlock: root.querySelector("#hud-unlock"),
      unlockBar: root.querySelector("#hud-unlock-bar"),
      toastWrap: root.querySelector("#hud-toasts"),
      cameraChip: root.querySelector("#hud-camera"),
      speed: root.querySelector("#hud-speed"),

      pill: root.querySelector("#pill"),
      cover: root.querySelector("#pill-cover"),
      title: root.querySelector("#pill-title"),
      artist: root.querySelector("#pill-artist"),
      seek: root.querySelector("#pill-seek"),
      elapsed: root.querySelector("#pill-elapsed"),
      duration: root.querySelector("#pill-duration"),
      play: root.querySelector("#pill-play"),
      hint: root.querySelector("#hud-hint"),
      hintKeys: root.querySelector("#hud-hint-keys"),
      resume: root.querySelector("#hud-resume"),
    };

    this.#bind();
    this.#tickClock();
    this._clockTimer = setInterval(() => this.#tickClock(), 1000);

    this._v = new THREE.Vector3();
  }

  #bind() {
    const on = (sel, event, fn) => this.root.querySelector(sel)?.addEventListener(event, fn);

    // A HUD button that keeps focus swallows the driving keys, so every one of
    // them hands focus straight back to the document. Keyboard users still get
    // focus rings while tabbing, because that path never fires a pointer click.
    this.root.addEventListener("pointerup", (e) => {
      const btn = e.target.closest?.("button");
      if (btn) setTimeout(() => btn.blur(), 0);
    });

    on("#pill-play", "click", () => this.onAction("playPause"));
    on("#pill-next", "click", () => this.onAction("nextTrack"));
    on("#pill-prev", "click", () => this.onAction("prevTrack"));
    on("#hud-camera", "click", () => this.onAction("camera"));
    on("#hud-photo", "click", () => this.onAction("photo"));
    on("#hud-menu", "click", () => this.onAction("menu"));
    on("#hud-resume", "click", () => this.onAction("resumeAudio"));
    on("#hud-help", "click", () => this.toggleHint());

    this.el.seek.addEventListener("input", () => {
      this.scrubbing = true;
      this.#paintSeek(Number(this.el.seek.value) / 1000);
    });
    this.el.seek.addEventListener("change", () => {
      this.onAction("seek", Number(this.el.seek.value) / 1000);
      this.scrubbing = false;
    });

    this.el.hintKeys.innerHTML = KEY_HELP.map(
      ([k, v]) => `<div class="hint-row"><kbd>${k}</kbd><span>${v}</span></div>`,
    ).join("");
  }

  #tickClock() {
    const now = new Date();
    let h = now.getHours();
    const ap = h >= 12 ? "pm" : "am";
    h = h % 12 || 12;
    const m = String(now.getMinutes()).padStart(2, "0");
    this.el.clock.innerHTML = `${h}<span class="colon">:</span>${m}<span class="meridiem">${ap}</span>`;
  }

  setMap(name, themeLabel) {
    this.el.mapLabel.textContent = themeLabel ?? name;
  }

  setTotal(total, progress, unlocked) {
    this.el.fare.textContent = `₹${total}`;
    if (unlocked) {
      this.el.unlock.hidden = true;
    } else {
      this.el.unlock.hidden = false;
      this.el.unlockBar.style.width = `${progress * 100}%`;
      this.el.unlock.title = `₹${UNLOCK_THRESHOLD - total} more to unlock Tank Bund`;
    }
  }

  setMeter(active, fare, destination) {
    this.el.meter.hidden = !active;
    if (!active) return;
    this.el.meterFare.textContent = `₹${Math.floor(fare)}`;
    this.el.meterTo.textContent = destination ?? "";
  }

  setSpeed(kmh) {
    this.el.speed.textContent = `${Math.round(kmh)}`;
  }

  setCameraLabel(label) {
    this.el.cameraChip.querySelector(".chip-value").textContent = label;
  }

  /** Off-screen indicator for the current objective. */
  setTarget(worldPos, camera, playerPos) {
    if (!worldPos) {
      this.el.arrow.hidden = true;
      return;
    }

    const v = this._v.copy(worldPos);
    v.y = 1.5;
    const dist = playerPos.distanceTo(worldPos);
    v.project(camera);

    const onScreen = v.z < 1 && Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.92;
    this.el.arrow.hidden = false;
    this.el.arrowDist.textContent = `${Math.round(dist)}m`;

    if (onScreen) {
      this.el.arrow.classList.remove("is-edge");
      this.el.arrow.style.left = `${(v.x * 0.5 + 0.5) * 100}%`;
      this.el.arrow.style.top = `${(-v.y * 0.5 + 0.5) * 100}%`;
      this.el.arrow.style.setProperty("--rot", "0deg");
    } else {
      // Behind or off-frame: pin it to the edge and point the way.
      this.el.arrow.classList.add("is-edge");
      let x = v.x;
      let y = v.y;
      if (v.z > 1) {
        x = -x;
        y = -y;
      }
      const len = Math.max(Math.abs(x), Math.abs(y)) || 1;
      x = (x / len) * 0.86;
      y = (y / len) * 0.86;
      this.el.arrow.style.left = `${(x * 0.5 + 0.5) * 100}%`;
      this.el.arrow.style.top = `${(-y * 0.5 + 0.5) * 100}%`;
      this.el.arrow.style.setProperty("--rot", `${Math.atan2(-y, x) * (180 / Math.PI) + 90}deg`);
    }
  }

  /* ---------- player pill ---------- */

  setTrack(track) {
    this.el.cover.src = track.cover;
    this.el.title.textContent = track.title;
    this.el.artist.textContent = track.artist;
    document.title = `${this.brand.name} — ${track.title}`;
  }

  setPlaying(playing) {
    this.el.pill.classList.toggle("is-playing", playing);
    this.el.play.setAttribute("aria-label", playing ? "Pause" : "Play");
  }

  setProgress(current, duration) {
    if (this.scrubbing || !duration) return;
    this.#paintSeek(current / duration);
    this.el.seek.value = String(Math.round((current / duration) * 1000));
    this.el.elapsed.textContent = fmt(current);
    this.el.duration.textContent = fmt(duration);
  }

  #paintSeek(ratio) {
    this.el.seek.style.setProperty("--progress", `${Math.max(0, Math.min(1, ratio)) * 100}%`);
  }

  /* ---------- feedback ---------- */

  toast(text, { kind = "info", ms = 2200 } = {}) {
    const el = document.createElement("div");
    el.className = `toast toast-${kind}`;
    el.textContent = text;
    this.el.toastWrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add("is-in"));

    setTimeout(() => {
      el.classList.remove("is-in");
      setTimeout(() => el.remove(), 400);
    }, ms);
  }

  payout({ total, base, bonuses }, destination) {
    const lines = [
      `<div class="payout-head">₹${total}</div>`,
      `<div class="payout-sub">Dropped at ${destination}</div>`,
      `<div class="payout-row"><span>Meter</span><b>₹${base}</b></div>`,
      ...bonuses.map((b) => `<div class="payout-row is-bonus"><span>${b.label}</span><b>+₹${b.amount}</b></div>`),
    ];

    const el = document.createElement("div");
    el.className = "payout";
    el.innerHTML = lines.join("");
    this.el.toastWrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add("is-in"));

    setTimeout(() => {
      el.classList.remove("is-in");
      setTimeout(() => el.remove(), 500);
    }, 3400);
  }

  toggleHint(force) {
    const show = force ?? this.el.hint.hidden;
    this.el.hint.hidden = !show;
  }

  showHintOnce() {
    this.toggleHint(true);
    setTimeout(() => this.toggleHint(false), 6000);
  }

  /** Shown when audio is blocked mid-session (iOS) rather than dying silently. */
  setResumePrompt(show) {
    this.el.resume.hidden = !show;
  }

  setCompact(compact) {
    this.root.classList.toggle("is-compact", compact);
  }

  setVisible(visible) {
    this.root.classList.toggle("is-hidden", !visible);
  }

  dispose() {
    clearInterval(this._clockTimer);
    this.root.innerHTML = "";
    this.root.hidden = true;
  }
}

function fmt(seconds) {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function template(brand) {
  return `
  <div class="hud-top">
    <div class="hud-left">
      <div class="hud-brand">${brand.name}</div>
      <div class="hud-map" id="hud-map">OLD CITY · DUSK</div>
    </div>

    <div class="hud-right">
      <div class="hud-clock" id="hud-clock">12:00<span class="meridiem">pm</span></div>
      <div class="hud-total"><span id="hud-fare">₹0</span></div>
      <div class="hud-unlock" id="hud-unlock" hidden>
        <span class="hud-unlock-label">TANK BUND</span>
        <span class="hud-unlock-track"><span class="hud-unlock-bar" id="hud-unlock-bar"></span></span>
      </div>
    </div>
  </div>

  <div class="hud-meter" id="hud-meter" hidden>
    <span class="hud-meter-flag">METER</span>
    <span class="hud-meter-fare" id="hud-meter-fare">₹25</span>
    <span class="hud-meter-to" id="hud-meter-to"></span>
  </div>

  <div class="hud-arrow" id="hud-arrow" hidden>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
    <span id="hud-arrow-dist">0m</span>
  </div>

  <div class="hud-speed-wrap">
    <span class="hud-speed" id="hud-speed">0</span>
    <span class="hud-speed-unit">km/h</span>
  </div>

  <div class="hud-chips">
    <button class="chip" id="hud-camera" type="button" aria-label="Change camera">
      <span class="chip-key">C</span><span class="chip-value">CHASE</span>
    </button>
    <button class="chip" id="hud-photo" type="button" aria-label="Photo mode">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 8h3l2-3h8l2 3h3v11H3z"/><circle cx="12" cy="13" r="3.6"/></svg>
    </button>
    <button class="chip" id="hud-help" type="button" aria-label="Controls">?</button>
    <button class="chip" id="hud-menu" type="button" aria-label="Menu">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
    </button>
  </div>

  <div class="hud-toasts" id="hud-toasts"></div>

  <button class="hud-resume" id="hud-resume" type="button" hidden>
    Tap to keep the music going
  </button>

  <div class="hud-hint" id="hud-hint" hidden>
    <div class="hint-title">Controls</div>
    <div class="hint-keys" id="hud-hint-keys"></div>
    <div class="hint-note">Arrows steer now — music moved to <kbd>P</kbd> <kbd>[</kbd> <kbd>]</kbd></div>
  </div>

  <section class="player" id="pill" aria-label="Now playing">
    <div class="disc" id="pill-disc">
      <img id="pill-cover" src="/covers/disc/RMLlyK9rLmc.jpg" alt="" width="640" height="640">
      <span class="disc-sheen" aria-hidden="true"></span>
      <span class="disc-hole" aria-hidden="true"></span>
    </div>

    <div class="meta">
      <div class="title" id="pill-title">—</div>
      <div class="artist" id="pill-artist"></div>
      <input class="seek" id="pill-seek" type="range" min="0" max="1000" value="0" step="1" aria-label="Seek">
      <div class="time"><span id="pill-elapsed">0:00</span> / <span id="pill-duration">0:00</span></div>
    </div>

    <div class="controls">
      <button class="ctl" id="pill-prev" type="button" aria-label="Previous track">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14l-11-7z"/></svg>
      </button>
      <button class="ctl play" id="pill-play" type="button" aria-label="Play">
        <svg class="i-play" width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>
        <svg class="i-pause" width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>
      </button>
      <button class="ctl" id="pill-next" type="button" aria-label="Next track">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5l11 7-11 7z"/></svg>
      </button>
    </div>
  </section>
  `;
}
