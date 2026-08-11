import * as THREE from "three";

import "./ui/base.css";
import "./ui/hud.css";
import "./ui/pill.css";
import "./ui/touch.css";
import "./ui/menu.css";

import { Stage, guardContextLoss } from "./engine/renderer.js";
import { Composer } from "./engine/composer.js";
import { Loop } from "./engine/loop.js";
import { guessTier, QualityGovernor, TIERS, isTouchPrimary, prefersReducedMotion } from "./engine/quality.js";

import { WorldGenerator } from "./world/generator.js";
import { makeRng } from "./world/rng.js";

import { VehicleState, stepVehicle, applyCollision, GRIP_DRY, GRIP_WET } from "./vehicle/physics.js";
import { createAuto } from "./vehicle/autoModel.js";
import { CameraRig } from "./vehicle/cameraRig.js";

import { Input } from "./input/input.js";
import { AudioPlayer } from "./audio/player.js";
import { BeatClock } from "./audio/beatClock.js";

import { GameState } from "./game/state.js";
import { Passengers, PHASE } from "./game/passengers.js";

import { Hud } from "./ui/hud.js";
import { Menu } from "./ui/menu.js";
import { capturePhoto } from "./ui/share.js";

import charminar from "./maps/charminar.js";
import tankbund from "./maps/tankbund.js";

const MAPS = { charminar, tankbund };

const boot = {
  root: document.getElementById("boot"),
  bar: document.getElementById("boot-bar"),
  status: document.getElementById("boot-status"),
  start: document.getElementById("start-btn"),
  hint: document.getElementById("start-hint"),
};

class Game {
  constructor() {
    this.state = new GameState();
    this.reducedMotion = this.state.data.reduceMotion ?? prefersReducedMotion();

    const tier = this.state.data.quality ? TIERS[this.state.data.quality] : guessTier();
    this.governor = new QualityGovernor(tier, {
      onChange: (t) => this.#onTierChange(t),
    });

    this.canvas = document.getElementById("stage");
    this.stage = new Stage(this.canvas, tier);
    this.tier = tier;

    guardContextLoss(this.canvas, {
      onLost: () => this.#onContextLost(),
      onRestored: () => location.reload(),
    });

    this.vehicle = new VehicleState();
    this.beat = new BeatClock();
    this.phase = "loading";

    this.auto = createAuto({ tier });
    this.rig = new CameraRig(this.stage, { reducedMotion: this.reducedMotion });

    this.input = new Input({ onAction: (name, arg) => this.action(name, arg) });
    if (this.state.data.autoThrottle !== null) {
      this.input.setAutoThrottle(this.state.data.autoThrottle);
    }

    this._camDir = new THREE.Vector3();
    this._tmp = new THREE.Vector3();

    this.loop = new Loop({
      update: (dt, elapsed) => this.update(dt, elapsed),
      render: (dt, elapsed) => this.render(dt, elapsed),
      onFrameCost: (ms) => this.governor.sample(ms),
    });

    this.#startMap(this.state.data.lastMap ?? "charminar", { firstRun: true });
  }

  /* ------------------------------------------------------------ map load */

  #startMap(mapId, { firstRun = false } = {}) {
    const def = MAPS[mapId] ?? charminar;
    this.mapDef = def;
    this.phase = "loading";

    // Detach the auto first: it lives in the old scene, and the deep disposer
    // would happily free its geometry and materials along with the map.
    this.auto.root.removeFromParent();

    this.world?.dispose();
    this.passengers?.dispose();

    this.world = new WorldGenerator(def, this.tier, this.stage.renderer);
    this.world.scene.add(this.auto.root);

    this.vehicle.roughness = def.roughness;
    this.vehicle.grip = def.wet ? GRIP_WET : GRIP_DRY;
    this.vehicle.potholes = (def.potholes ?? []).map((p) => ({ ...p }));

    if (!this.composer) {
      this.composer = new Composer(this.stage, this.world.scene, this.tier, def.theme);
    } else {
      this.composer.setScene(this.world.scene);
      this.composer.setTheme(def.theme);
    }
    this.stage.renderer.toneMappingExposure = def.theme.exposure;

    this.firstRun = firstRun;
    this.loop.start();
    this.#pump();
  }

  /** Generate the world across frames so the loading bar animates. */
  #pump() {
    const progress = this.world.advance(8);
    boot.bar.style.width = `${Math.round(progress * 100)}%`;
    boot.status.textContent = this.world.currentLabel;

    if (!this.world.done) {
      requestAnimationFrame(() => this.#pump());
      return;
    }
    this.#onWorldReady();
  }

  #onWorldReady() {
    this.rng = makeRng(this.mapDef.seed ^ 0x5f5f);

    this.passengers = new Passengers(this.world.scene, this.world.path, this.mapDef, this.rng, {
      onEvent: (e) => this.#onPassengerEvent(e),
    });

    this.#placeAtSpawn();

    if (this.firstRun) this.#enterTitle();
    else this.#enterRide({ skipIntro: true });
  }

  /** Park the auto facing the landmark, the way one waits at a signal. */
  #placeAtSpawn() {
    const t = this.mapDef.spawn?.t ?? 0;
    const fr = this.world.path.frameAt(t);
    const pos = fr.position.clone().addScaledVector(fr.right, fr.halfWidth * 0.45);

    let yaw = Math.atan2(fr.forward.x, fr.forward.z);
    const landmark = this.world.landmarkPositions?.[0];
    if (this.mapDef.spawn?.lookAtLandmark && landmark) {
      yaw = Math.atan2(landmark.x - pos.x, landmark.z - pos.z);
    }

    this.vehicle.reset(pos, yaw);
    this.auto.update(this.vehicle, 0.016, 0, this.beat);
  }

  /* ------------------------------------------------------------- phases */

  #enterTitle() {
    this.phase = "title";

    // Sit in the back seat, framed like bg.jpg, and cross-fade the still into
    // the live render. If this match is right, a photograph appears to come
    // alive — that is the whole hook.
    this.rig.setMode("backseat", { instant: true });
    this.rig.update(this.vehicle, 0.016, 0, this.beat);

    // Render one frame before revealing, so the fade never shows a blank canvas.
    this.composer.render(0.016, 0, this.beat);

    requestAnimationFrame(() => {
      boot.root.classList.add("is-live");
      boot.bar.parentElement.hidden = true;
      boot.status.hidden = true;
      boot.start.hidden = false;
      boot.hint.hidden = false;
    });

    boot.start.addEventListener("click", () => this.#onStart(), { once: true });
  }

  /**
   * The START tap. This is the only user gesture we are guaranteed, so
   * everything that requires one happens here, in this order.
   */
  async #onStart() {
    // Hand focus back to the document, or the driving keys land on the button.
    boot.start.blur();
    boot.root.classList.add("is-gone");
    setTimeout(() => (boot.root.hidden = true), 800);

    this.audio = new AudioPlayer({
      onTrackChange: (t) => {
        this.beat.setTrack(t);
        this.hud?.setTrack(t);
        this.state.set("trackIndex", this.audio.index);
      },
      onStateChange: (playing) => {
        this.hud?.setPlaying(playing);
        if (playing) {
          this.beat.anchor(this.audio.currentTime);
          this.hud?.setResumePrompt(false);
        } else {
          this.beat.pause();
        }
      },
      onTick: (current, duration) => {
        this.beat.sync(current);
        this.hud?.setProgress(current, duration);
      },
      onStall: ({ kind, track }) => {
        if (kind === "error") this.hud?.toast(`Skipping "${track.title}" — unavailable`, { kind: "warn" });
        else this.hud?.setResumePrompt(true);
      },
    });

    this.#enterRide();

    await this.audio.load();
    this.audio.loadIndex(this.state.data.trackIndex ?? 0, { autoplay: false });
    this.audio.play();

    // Keep the screen awake — nobody wants the display sleeping mid-ride.
    try {
      this.wakeLock = await navigator.wakeLock?.request("screen");
    } catch {
      /* not supported, or denied — harmless */
    }
  }

  #enterRide({ skipIntro = false } = {}) {
    this.phase = "ride";

    if (!this.hud) {
      this.hud = new Hud(document.getElementById("hud"), {
        brand: { name: "HYD AUTO", album: "Hyderabad Auto" },
        onAction: (name, arg) => this.action(name, arg),
      });
      if (isTouchPrimary()) {
        this.input.touch.mount(document.getElementById("hud"));
        this.input.touch.setManualThrottle(!this.input.autoThrottle);
        this.hud.setCompact(true);
      }

      this.menu = new Menu(document.body, {
        state: this.state,
        onSelectMap: (id) => this.#switchMap(id),
        onSetting: (key, value) => this.#applySetting(key, value),
        onClose: () => (this.menuOpen = false),
      });
    }

    this.hud.setMap(this.mapDef.name, this.mapDef.theme.label);
    this.hud.setTotal(this.state.total, this.state.unlockProgress, this.state.isUnlocked("tankbund"));
    this.hud.setVisible(true);

    this.beat.onBar = (bar) => this.world.onBar(bar);

    if (skipIntro || this.reducedMotion) {
      this.rig.setMode(this.state.data.camera ?? "chase", { instant: true });
      this.hud.setCameraLabel(this.rig.config.label);
      return;
    }

    // One continuous 2.6s move out of the back seat into chase. No cuts.
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.18, 1.12, -0.62),
      new THREE.Vector3(-0.6, 1.5, -2.2),
      new THREE.Vector3(-0.3, 2.1, -4.2),
      new THREE.Vector3(0, 2.4, -5.5),
    ]);
    this.rig.playIntro(curve, 2.6, {
      fovFrom: 68,
      fovTo: 74,
      lookAt: new THREE.Vector3(0, 1.0, 5),
    });

    setTimeout(() => {
      this.rig.setMode("chase", { instant: false });
      this.hud.setCameraLabel(this.rig.config.label);
      if (!this.state.data.seenHint) {
        this.hud.showHintOnce();
        this.state.set("seenHint", true);
      }
    }, 2650);
  }

  /* ------------------------------------------------------------ actions */

  action(name, arg) {
    switch (name) {
      case "camera": {
        this.rig.cancelIntro();
        const label = this.rig.cycle();
        this.hud?.setCameraLabel(label);
        this.state.set("camera", this.rig.mode);
        break;
      }
      case "playPause": this.audio?.toggle(); break;
      case "nextTrack": this.audio?.next(); break;
      case "prevTrack": this.audio?.prev(); break;
      case "mute": {
        const muted = this.audio?.toggleMute();
        this.hud?.toast(muted ? "Muted" : "Unmuted");
        break;
      }
      case "seek": this.audio?.seekToRatio(arg); break;
      case "resumeAudio":
        this.audio?.play();
        this.hud?.setResumePrompt(false);
        break;
      case "horn":
        this.hud?.toast("Pom pom!");
        this.world?.pigeons?.burst();
        break;
      case "photo": this.#photo(); break;
      case "menu":
        this.menuOpen = !this.menu?.isOpen;
        this.menu?.toggle(this.mapDef.id);
        break;
      default: break;
    }
  }

  /**
   * Swap maps behind a short fade. The music deliberately keeps playing across
   * the switch — cutting it would break the one thing holding the session
   * together.
   */
  async #switchMap(mapId) {
    if (this._switching || mapId === this.mapDef.id) return;
    this._switching = true;

    await fadeTo(this.composer, 1, 600);

    this.hud.setVisible(false);
    boot.root.hidden = false;
    boot.root.classList.remove("is-gone", "is-live");
    boot.bar.parentElement.hidden = false;
    boot.status.hidden = false;
    boot.start.hidden = true;
    boot.hint.hidden = true;

    this.state.set("lastMap", mapId);
    this.#startMap(mapId, { firstRun: false });

    // #startMap → #pump → #onWorldReady → #enterRide handles the rest; just
    // clear the fade once the new world is up.
    const waitReady = setInterval(() => {
      if (!this.world.done) return;
      clearInterval(waitReady);
      boot.root.classList.add("is-gone");
      setTimeout(() => (boot.root.hidden = true), 700);
      fadeTo(this.composer, 0, 700);
      this.hud.setVisible(true);
      this._switching = false;
    }, 100);
  }

  #applySetting(key, value) {
    switch (key) {
      case "quality": {
        const tier = value === "auto" ? guessTier() : TIERS[value];
        this.state.set("quality", value === "auto" ? null : value);
        this.governor.setTier(tier, { manual: value !== "auto" });
        this.#onTierChange(this.governor.effective());
        this.hud?.toast(`Graphics: ${value}`);
        break;
      }
      case "autoThrottle":
        this.state.set("autoThrottle", value);
        this.input.setAutoThrottle(value);
        break;
      case "tilt": {
        this.state.set("tilt", value);
        if (value) {
          this.input.tilt.enable().then((ok) => {
            if (!ok) {
              this.state.set("tilt", false);
              this.hud?.toast("Tilt steering wasn't allowed", { kind: "warn" });
            } else {
              this.hud?.toast("Hold the phone how you like — that's now centre");
            }
          });
        } else {
          this.input.tilt.disable();
        }
        break;
      }
      case "reduceMotion":
        this.state.set("reduceMotion", value);
        this.reducedMotion = value;
        this.rig.reducedMotion = value;
        this.composer.setTheme({ ...this.mapDef.theme, ...(value ? { grain: 0, chromatic: 0 } : {}) });
        break;
      default:
        this.state.set(key, value);
    }
  }

  async #photo() {
    if (this._capturing) return;
    this._capturing = true;

    this.hud.setVisible(false);
    // Render and read back inside the same frame — that's what lets us avoid
    // preserveDrawingBuffer and its permanent per-frame cost.
    await new Promise((r) => requestAnimationFrame(r));
    this.composer.render(0.016, this.loop.elapsed, this.beat);

    try {
      await capturePhoto(this.canvas, {
        fare: this.state.total,
        map: this.mapDef.name,
      });
      this.hud.toast("Photo saved", { kind: "good" });
    } catch {
      this.hud.toast("Couldn't save the photo", { kind: "warn" });
    }

    this.hud.setVisible(true);
    this._capturing = false;
  }

  #onPassengerEvent(e) {
    switch (e.type) {
      case "hail":
        this.hud?.toast("Someone's waving you down");
        break;
      case "pickup":
        this.hud?.toast(`To ${e.dropoff.name}`, { kind: "good" });
        break;
      case "dropoff": {
        const unlocked = this.state.addFare(e.result.total);
        this.hud?.payout(e.result, e.dropoff.name);
        this.hud?.setTotal(this.state.total, this.state.unlockProgress, this.state.isUnlocked("tankbund"));
        if (unlocked.includes("tankbund")) {
          this.hud?.toast("NIGHT SHIFT UNLOCKED — Tank Bund is open", { kind: "good", ms: 5000 });
        }
        break;
      }
    }
  }

  /* -------------------------------------------------------------- frame */

  update(dt, elapsed) {
    this.beat.update(dt);

    if (this.phase !== "ride") return;

    // The menu leaves the world rendering but stops the auto, so nobody comes
    // back from changing a setting to find themselves in a wall.
    if (this.menuOpen) {
      stepVehicle(this.vehicle, IDLE_INPUT, dt, elapsed);
      return;
    }

    const action = this.input.sample();
    // Any real input cancels the opening move — never trap someone in a cutscene.
    if (this.rig.introPlaying && (Math.abs(action.steer) > 0.1 || action.brake > 0)) {
      this.rig.cancelIntro();
      this.rig.setMode("chase", { instant: false });
    }

    stepVehicle(this.vehicle, action, dt, elapsed);
    this.passengers?.update(dt, elapsed, this.vehicle, this.beat);
  }

  render(dt, elapsed) {
    this.stage.renderer.info.reset();
    this.auto.update(this.vehicle, dt, elapsed, this.beat);
    this.rig.update(this.vehicle, dt, elapsed, this.beat);

    this.stage.camera.getWorldDirection(this._camDir);

    this.world.update(dt, elapsed, {
      cameraPos: this.stage.camera.position,
      cameraDir: this._camDir,
      vehicle: this.vehicle,
      beat: this.beat,
      onPlayerHit: (normal, strength) => this.#onHit(normal, strength),
    });

    if (this.phase === "ride" && this.hud) {
      this.hud.setSpeed(this.vehicle.speedKmh);

      const p = this.passengers;
      const aboard = p?.phase === PHASE.ABOARD;
      this.hud.setMeter(aboard, p?.meter.fare ?? 0, p?.dropoff?.name);
      this.auto.setMeter(p?.meter.fare ?? 0, aboard);

      this.hud.setTarget(p?.target, this.stage.camera, this.vehicle.position);

      // Fade the touch controls out when they're not being used.
      this.input.touch.setDim(this.input.idleFor > 5);
    }

    this.composer.render(dt, elapsed, this.beat);
  }

  /* -------------------------------------------------------------- misc */

  #onHit(normal, strength) {
    // Rate-limit so grinding along a bus isn't a machine-gun of shakes.
    const now = performance.now();
    if (now - (this._lastHit ?? 0) < 400) return;
    this._lastHit = now;

    applyCollision(this.vehicle, normal, strength);
    this.rig.addShake(0.5 * strength);
    this.passengers?.noteCollision();
  }

  #onTierChange(tier) {
    this.tier = tier;
    this.stage.setTier(tier);
    this.world?.glows?.setPixelRatio(this.stage.renderer.getPixelRatio());
  }

  #onContextLost() {
    this.loop.stop();
    this.state.flush();
    boot.root.hidden = false;
    boot.root.classList.remove("is-gone", "is-live");
    boot.status.hidden = false;
    boot.status.textContent = "Lost the graphics context — reloading…";
    setTimeout(() => location.reload(), 1500);
  }
}

const IDLE_INPUT = { throttle: 0, brake: 1, steer: 0, handbrake: true };

function fadeTo(composer, target, ms) {
  return new Promise((resolve) => {
    const from = composer.grade.uniforms.uFade.value;
    const start = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / ms);
      composer.setFade(from + (target - from) * t);
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    tick();
  });
}

/* Kick off once fonts have had a moment, so the brand mark doesn't reflow. */
document.fonts?.ready.finally(() => {
  try {
    window.game = new Game();
  } catch (err) {
    console.error("HYD AUTO failed to start:", err);
    // Distinguish "no WebGL" from "our bug" — conflating them sent me hunting
    // for a driver problem that didn't exist.
    const probe = document.createElement("canvas");
    const hasWebGL = !!(probe.getContext("webgl2") || probe.getContext("webgl"));
    boot.status.textContent = hasWebGL
      ? "Something broke starting the ride. Try reloading."
      : "This browser can't run WebGL, so the ride won't start.";
  }
});
