import { bindKeyboard } from "./keyboard.js";
import { TouchControls } from "./touch.js";
import { TiltSteering } from "./tilt.js";
import { isTouchPrimary } from "../engine/quality.js";

/**
 * The single source of truth for driving intent.
 *
 * Keyboard, touch and tilt all write into the same action object; the vehicle
 * never knows or cares which one the player used. Both can be active at once
 * (a tablet with a keyboard), so each source contributes and we take the
 * strongest signal.
 */
export class Input {
  constructor({ onAction } = {}) {
    this.action = { throttle: 0, brake: 0, steer: 0, handbrake: false };

    this.keys = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    this.touchState = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    this.tiltSteer = 0;

    this.onAction = onAction ?? (() => {});
    this.lastInputAt = 0;
    this.hasDriven = false;

    // On phones the auto creeps forward on its own unless braking, so the
    // player only has to steer. One thumb, portrait, works while walking —
    // every mobile toy that went viral is one-thumb.
    this.autoThrottle = isTouchPrimary();

    this.unbindKeyboard = bindKeyboard({
      onDrive: (state) => {
        Object.assign(this.keys, state);
        this.#touched();
      },
      onAction: (name) => this.onAction(name),
    });

    this.touch = new TouchControls({
      onChange: (state) => {
        Object.assign(this.touchState, state);
        this.#touched();
      },
    });

    this.tilt = new TiltSteering({
      onSteer: (v) => {
        this.tiltSteer = v;
        if (Math.abs(v) > 0.08) this.#touched();
      },
    });
  }

  #touched() {
    this.lastInputAt = performance.now();
    this.hasDriven = true;
  }

  /** Called once per frame, before physics substeps. */
  sample() {
    const a = this.action;

    a.steer = strongest(this.keys.steer, this.touchState.steer, this.tiltSteer);
    a.brake = Math.max(this.keys.brake, this.touchState.brake);
    a.handbrake = this.keys.handbrake || this.touchState.handbrake;

    let throttle = Math.max(this.keys.throttle, this.touchState.throttle);
    if (this.autoThrottle && !this.touch.manualThrottle) {
      // Creep unless the player is actively braking or reversing.
      if (a.brake === 0 && !a.handbrake) throttle = Math.max(throttle, 0.4);
    }
    a.throttle = throttle;

    return a;
  }

  setAutoThrottle(on) {
    this.autoThrottle = on;
    this.touch.setManualThrottle(!on);
  }

  get idleFor() {
    return (performance.now() - this.lastInputAt) / 1000;
  }

  dispose() {
    this.unbindKeyboard();
    this.touch.dispose();
    this.tilt.dispose();
  }
}

/** Take whichever source is pushing hardest, preserving its sign. */
function strongest(...values) {
  let best = 0;
  for (const v of values) if (Math.abs(v) > Math.abs(best)) best = v;
  return best;
}
