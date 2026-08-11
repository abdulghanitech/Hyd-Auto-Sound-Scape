import { loadTracks, loadBrand } from "./tracks.js";

/* Audio transport.

   Ported from the original app.js, with three additions that the old version
   needed and didn't have:

   1. onError handling. Any of the 15 videos can become region-blocked,
      age-gated or embed-disabled at any time, and the old player would simply
      go silent forever with no indication. Now it skips.

   2. A stall watchdog. On iOS the gesture token that authorised the first
      playVideo() has expired by the time a track auto-advances, and whether
      playback continues has regressed across iOS versions. If a load doesn't
      reach PLAYING within 2.5s we surface a tap-to-resume prompt rather than
      dying quietly.

   3. The API script is injected AFTER first render instead of in <head> —
      it's ~80 KB from a third-party origin and nothing needs it until the
      player taps START. */

const POLL_MS = 250;
const STALL_MS = 2500;

export class AudioPlayer {
  constructor({ onTrackChange, onStateChange, onStall, onTick }) {
    this.tracks = loadTracks();
    this.brand = loadBrand();
    this.index = 0;

    this.player = null;
    this.ready = false;
    this.playing = false;
    this.muted = false;
    this.scrubbing = false;

    this.onTrackChange = onTrackChange ?? (() => {});
    this.onStateChange = onStateChange ?? (() => {});
    this.onStall = onStall ?? (() => {});
    this.onTick = onTick ?? (() => {});

    this._stallTimer = null;
  }

  get track() {
    return this.tracks[this.index];
  }

  /** Load the IFrame API. Safe to call once, after the first frame is on screen. */
  load() {
    if (this._loading) return this._loading;

    this._loading = new Promise((resolve) => {
      const existing = window.YT?.Player;
      if (existing) {
        this.#create();
        resolve();
        return;
      }

      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        this.#create();
        resolve();
      };

      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.async = true;
      document.head.appendChild(tag);
    });

    return this._loading;
  }

  #embedUrl(id) {
    const params = new URLSearchParams({
      enablejsapi: "1",
      controls: "0",
      disablekb: "1",
      playsinline: "1",
      rel: "0",
      modestbranding: "1",
      origin: location.origin,
    });
    return `https://www.youtube.com/embed/${id}?${params}`;
  }

  #create() {
    const iframe = document.getElementById("yt-player");
    if (!iframe) return;
    iframe.src = this.#embedUrl(this.track.youtubeId);

    this.player = new YT.Player(iframe, {
      events: {
        onReady: () => {
          this.ready = true;
          this.onTrackChange(this.track, this.index);
          this.#publishMediaSession();
        },
        onStateChange: (e) => this.#onState(e),
        onError: (e) => this.#onError(e),
      },
    });

    this._poll = setInterval(() => this.#tick(), POLL_MS);
  }

  #onState(e) {
    const S = YT.PlayerState;
    const wasPlaying = this.playing;
    this.playing = e.data === S.PLAYING;

    if (this.playing) this.#clearStall();

    if (e.data === S.ENDED) {
      this.next();
      return;
    }

    if (this.playing !== wasPlaying) {
      this.onStateChange(this.playing);
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = this.playing ? "playing" : "paused";
      }
    }
  }

  /**
   * 2 and 5 are bad IDs / unplayable in this context; 100, 101 and 150 are
   * removed, private, or embed-disabled. All of them mean "this track is gone",
   * so move on rather than sitting in silence.
   */
  #onError(e) {
    console.warn(`HYD AUTO: track "${this.track.title}" failed (code ${e.data}), skipping.`);
    this.onStall({ kind: "error", track: this.track });
    if (this.tracks.length > 1) setTimeout(() => this.next(), 1200);
  }

  #tick() {
    if (!this.ready || !this.player?.getDuration) return;
    const duration = this.player.getDuration();
    const current = this.player.getCurrentTime();
    if (!duration) return;
    this.onTick(current, duration);
  }

  #armStall() {
    this.#clearStall();
    this._stallTimer = setTimeout(() => {
      if (!this.playing) this.onStall({ kind: "blocked", track: this.track });
    }, STALL_MS);
  }

  #clearStall() {
    if (this._stallTimer) clearTimeout(this._stallTimer);
    this._stallTimer = null;
  }

  /* ---------- transport ---------- */

  /** Must be called from within a user gesture the first time. */
  play() {
    if (!this.ready) return;
    this.player.playVideo();
    this.#armStall();
  }

  pause() {
    if (!this.ready) return;
    this.player.pauseVideo();
  }

  toggle() {
    if (!this.ready) return;
    if (this.playing) this.pause();
    else this.play();
  }

  loadIndex(i, { autoplay = true } = {}) {
    if (!this.tracks.length) return;
    this.index = ((i % this.tracks.length) + this.tracks.length) % this.tracks.length;
    this.onTrackChange(this.track, this.index);
    this.#publishMediaSession();

    if (!this.ready) return;
    if (autoplay) {
      this.player.loadVideoById(this.track.youtubeId);
      this.#armStall();
    } else {
      this.player.cueVideoById(this.track.youtubeId);
    }
  }

  next() {
    this.loadIndex(this.index + 1);
  }

  prev() {
    // Restart the current track first, the way every music player does.
    if (this.ready && this.player.getCurrentTime() > 3) {
      this.player.seekTo(0, true);
      return;
    }
    this.loadIndex(this.index - 1);
  }

  seekToRatio(r) {
    if (!this.ready) return;
    const d = this.player.getDuration();
    if (d) this.player.seekTo(r * d, true);
  }

  toggleMute() {
    if (!this.ready) return this.muted;
    this.muted = !this.muted;
    if (this.muted) this.player.mute();
    else this.player.unMute();
    return this.muted;
  }

  get currentTime() {
    return this.ready && this.player?.getCurrentTime ? this.player.getCurrentTime() : 0;
  }

  #publishMediaSession() {
    if (!("mediaSession" in navigator)) return;
    const t = this.track;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title,
      artist: t.artist,
      album: this.brand.album,
      artwork: [{ src: t.cover, sizes: "640x640", type: "image/jpeg" }],
    });

    const bind = (action, fn) => {
      try {
        navigator.mediaSession.setActionHandler(action, fn);
      } catch {
        /* not every action is supported everywhere */
      }
    };

    bind("play", () => this.play());
    bind("pause", () => this.pause());
    bind("previoustrack", () => this.prev());
    bind("nexttrack", () => this.next());
  }

  dispose() {
    if (this._poll) clearInterval(this._poll);
    this.#clearStall();
    this.player?.destroy?.();
  }
}
