/* Persistent state.

   One versioned key, wrapped in try/catch because Safari in private mode throws
   on setItem, and writes debounced to 1 Hz because we touch this on every fare
   tick. */

const KEY = "hydauto.v1";
const UNLOCK_THRESHOLD = 500; // rupees earned to open Tank Bund

const DEFAULTS = {
  v: 1,
  total: 0,
  ridesDone: 0,
  unlocked: ["charminar"],
  lastMap: "charminar",
  camera: "chase",
  quality: null, // null = auto-detect
  trackIndex: 0,
  autoThrottle: null, // null = decide by device
  tilt: false,
  reduceMotion: null,
  seenHint: false,
};

export class GameState {
  constructor() {
    this.data = { ...DEFAULTS, ...read() };
    // Guard against a hand-edited or corrupted payload.
    if (!Array.isArray(this.data.unlocked) || !this.data.unlocked.length) {
      this.data.unlocked = ["charminar"];
    }
    this._dirty = false;
    this._timer = setInterval(() => this.flush(), 1000);
  }

  get total() {
    return this.data.total;
  }

  get unlockProgress() {
    return Math.min(1, this.data.total / UNLOCK_THRESHOLD);
  }

  isUnlocked(mapId) {
    return this.data.unlocked.includes(mapId);
  }

  /** @returns {string[]} map ids unlocked by this payout */
  addFare(amount) {
    this.data.total += Math.round(amount);
    this.data.ridesDone++;
    this._dirty = true;

    const newly = [];
    if (this.data.total >= UNLOCK_THRESHOLD && !this.isUnlocked("tankbund")) {
      this.data.unlocked.push("tankbund");
      newly.push("tankbund");
    }
    return newly;
  }

  set(key, value) {
    if (this.data[key] === value) return;
    this.data[key] = value;
    this._dirty = true;
  }

  flush() {
    if (!this._dirty) return;
    this._dirty = false;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* private mode, quota, or storage disabled — the game still works */
    }
  }

  reset() {
    this.data = { ...DEFAULTS };
    this._dirty = true;
    this.flush();
  }

  dispose() {
    clearInterval(this._timer);
    this.flush();
  }
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && parsed.v === 1 ? parsed : {};
  } catch {
    return {};
  }
}

export { UNLOCK_THRESHOLD };
