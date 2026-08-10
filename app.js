/* HYD AUTO — one screen, one song.
   Audio is a hidden YouTube IFrame player; the UI is ours.
   Song library lives in tracks.js — edit that file to change the setlist. */

function slugify(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

const TRACKS = (window.TRACKS || []).map((t) => ({
  ...t,
  slug: t.slug || slugify(t.title),
  cover: t.cover || `/covers/disc/${t.youtubeId}.jpg`,
}));

const BRAND = window.HYD_AUTO || {
  name: "HYD AUTO",
  album: "Hyderabad Auto",
  tagline: "Speaker full. Charminar left.",
  shareText: "HYD AUTO — gaane that only slap in a Hyderabad auto.",
};

if (!TRACKS.length) {
  console.error("HYD AUTO: tracks.js is empty. Add songs to window.TRACKS.");
}

/* ---------- clock ---------- */

const el = (id) => document.getElementById(id);

function tickClock() {
  const now = new Date();
  let h = now.getHours();
  const ap = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  el("clock-h").textContent = String(h);
  el("clock-m").textContent = String(now.getMinutes()).padStart(2, "0");
  el("clock-ap").textContent = ap;
}

tickClock();
setInterval(tickClock, 1000);

/* ---------- deep links + share ---------- */

function trackUrl(t) {
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("t", t.slug);
  return url.toString();
}

function syncUrl(t, replace = true) {
  const url = trackUrl(t);
  if (replace) history.replaceState({ slug: t.slug }, "", url);
  else history.pushState({ slug: t.slug }, "", url);
}

function indexFromUrl() {
  const params = new URLSearchParams(location.search);
  const key = params.get("t") || params.get("v") || "";
  if (!key) return 0;
  const bySlug = TRACKS.findIndex((t) => t.slug === key);
  if (bySlug >= 0) return bySlug;
  const byId = TRACKS.findIndex((t) => t.youtubeId === key);
  return byId >= 0 ? byId : 0;
}

function showToast(msg) {
  const toast = el("toast");
  const label = el("share-label");
  if (toast) {
    toast.hidden = false;
    toast.textContent = msg;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.hidden = true;
    }, 1700);
  }
  if (label) {
    const prev = label.dataset.prev || label.textContent;
    label.dataset.prev = prev;
    label.textContent = msg;
    clearTimeout(showToast._l);
    showToast._l = setTimeout(() => {
      label.textContent = label.dataset.prev || "Share";
    }, 1700);
  }
}

async function shareRide() {
  const t = TRACKS[index];
  if (!t) return;
  const url = trackUrl(t);
  const payload = {
    title: `${BRAND.name} — ${t.title}`,
    text: `${BRAND.shareText || BRAND.tagline}\n▶ ${t.title}`,
    url,
  };

  const preferNativeShare =
    typeof navigator.share === "function" &&
    (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ||
      (navigator.userAgentData && navigator.userAgentData.mobile));

  if (preferNativeShare) {
    try {
      await navigator.share(payload);
      showToast("Link sent");
      return;
    } catch (err) {
      if (err && err.name === "AbortError") return;
    }
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url);
    } else {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;opacity:0;left:0;top:0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (!ok) throw new Error("execCommand copy failed");
    }
    showToast("Link copied");
  } catch {
    showToast("Copy failed");
  }
}

el("share-btn").addEventListener("click", shareRide);

/* ---------- player ---------- */

const card = el("player-card");
const seek = el("seek");
const playBtn = el("play");
const prevBtn = el("prev");
const nextBtn = el("next");

let player = null;
let ready = false;
let scrubbing = false;
let wantPlay = false;
let index = indexFromUrl();

if (el("brand-line") && BRAND.tagline) {
  el("brand-line").textContent = BRAND.tagline;
}

function kickAmbient(duck) {
  if (!window.HydAmbient) return;
  Promise.resolve(window.HydAmbient.start())
    .then(() => {
      if (duck) window.HydAmbient.duck(true);
    })
    .catch(() => {});
}

function fmt(seconds) {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function setProgress(ratio) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  seek.style.setProperty("--progress", `${pct}%`);
  if (!scrubbing) seek.value = String(Math.round(pct * 10));
}

function renderTrack() {
  const t = TRACKS[index];
  if (!t) return;

  el("track-title").textContent = t.title;
  el("track-artist").textContent = t.artist;
  el("cover").src = t.cover;
  document.title = `${BRAND.name} — ${t.title}`;
  el("yt-link").href = `https://www.youtube.com/watch?v=${t.youtubeId}`;

  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute("content", `${t.title} · ${BRAND.tagline}`);

  syncUrl(t, true);
  publishMediaSession(t);

  const solo = TRACKS.length < 2;
  prevBtn.disabled = solo;
  nextBtn.disabled = solo;
}

function publishMediaSession(t) {
  if (!("mediaSession" in navigator)) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title,
    artist: t.artist,
    album: BRAND.album,
    artwork: [{ src: t.cover, sizes: "640x640", type: "image/jpeg" }],
  });

  const bind = (action, fn) => {
    try {
      navigator.mediaSession.setActionHandler(action, fn);
    } catch {
      /* not every action is supported everywhere */
    }
  };

  bind("play", () => ready && player.playVideo());
  bind("pause", () => ready && player.pauseVideo());
  bind("previoustrack", () => prevBtn.click());
  bind("nexttrack", () => nextBtn.click());
}

function loadTrack(i) {
  if (!TRACKS.length) return;
  index = (i + TRACKS.length) % TRACKS.length;
  renderTrack();
  if (ready) player.loadVideoById(TRACKS[index].youtubeId);
}

renderTrack();

window.addEventListener("popstate", () => {
  const next = indexFromUrl();
  if (next !== index) loadTrack(next);
});

function embedUrl(youtubeId) {
  const params = new URLSearchParams({
    enablejsapi: "1",
    autoplay: "1",
    controls: "0",
    disablekb: "1",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    origin: location.origin,
  });
  return `https://www.youtube.com/embed/${youtubeId}?${params}`;
}

/* Browsers often block unmuted autoplay. We try on load; if blocked,
   the first tap / key anywhere starts the ride. */
let gestureArmed = false;

function isYtPlaying() {
  if (!ready || !player || !window.YT) return false;
  return player.getPlayerState() === YT.PlayerState.PLAYING;
}

function requestPlayback() {
  kickAmbient(true);
  if (!ready || !player) {
    wantPlay = true;
    return;
  }
  wantPlay = false;
  player.unMute();
  player.setVolume(100);
  player.playVideo();
}

function armGesturePlay() {
  if (gestureArmed) return;
  gestureArmed = true;
  const unlock = () => {
    if (isYtPlaying()) return;
    requestPlayback();
  };
  document.addEventListener("pointerdown", unlock, { once: true });
  document.addEventListener("keydown", unlock, { once: true });
}

function tryAutoplay() {
  requestPlayback();
  /* If the browser blocked it, fall back to one-gesture start. */
  setTimeout(() => {
    if (!isYtPlaying()) armGesturePlay();
  }, 900);
}

function onPlaying(isPlaying) {
  if (isPlaying) {
    card.classList.add("is-playing");
    playBtn.setAttribute("aria-label", "Pause");
    kickAmbient(true);
  } else {
    card.classList.remove("is-playing");
    playBtn.setAttribute("aria-label", "Play");
    if (window.HydAmbient) window.HydAmbient.duck(false);
  }

  if ("mediaSession" in navigator) {
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }
}

window.onYouTubeIframeAPIReady = function () {
  if (!TRACKS.length) return;

  const iframe = document.getElementById("yt-player");
  iframe.src = embedUrl(TRACKS[index].youtubeId);

  player = new YT.Player(iframe, {
    events: {
      onReady: () => {
        ready = true;
        el("duration").textContent = fmt(player.getDuration());
        playBtn.disabled = false;
        /* Honor a tap that happened before the iframe was ready. */
        if (wantPlay) {
          wantPlay = false;
          onPlaying(true);
          player.playVideo();
        }
      },
      onStateChange: (e) => {
        const S = YT.PlayerState;
        if (e.data === S.PLAYING) {
          el("duration").textContent = fmt(player.getDuration());
          onPlaying(true);
        } else if (e.data === S.ENDED) {
          onPlaying(false);
          if (TRACKS.length > 1) loadTrack(index + 1);
          else player.seekTo(0, true);
          player.playVideo();
        } else if (e.data === S.PAUSED || e.data === S.CUED) {
          onPlaying(false);
        }
      },
    },
  });
};

const ytTag = document.createElement("script");
ytTag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(ytTag);

setInterval(() => {
  if (!ready || scrubbing) return;
  const dur = player.getDuration();
  const cur = player.getCurrentTime();
  if (!dur) return;
  el("elapsed").textContent = fmt(cur);
  el("duration").textContent = fmt(dur);
  setProgress(cur / dur);
}, 250);

playBtn.disabled = true;

playBtn.addEventListener("click", () => {
  /* Never block the song on ambient / network — start YT immediately. */
  kickAmbient(true);

  if (!ready || !player) {
    wantPlay = true;
    onPlaying(true);
    return;
  }

  const S = YT.PlayerState;
  const state = player.getPlayerState();
  if (state === S.PLAYING) {
    wantPlay = false;
    player.pauseVideo();
    onPlaying(false);
  } else {
    wantPlay = false;
    onPlaying(true);
    player.playVideo();
  }
});

prevBtn.addEventListener("click", () => {
  if (!ready) return;
  if (player.getCurrentTime() > 3) player.seekTo(0, true);
  else loadTrack(index - 1);
});

nextBtn.addEventListener("click", () => loadTrack(index + 1));

seek.addEventListener("input", () => {
  scrubbing = true;
  setProgress(Number(seek.value) / 1000);
});

seek.addEventListener("change", () => {
  if (ready) {
    const dur = player.getDuration();
    if (dur) player.seekTo((Number(seek.value) / 1000) * dur, true);
  }
  scrubbing = false;
});

document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, button, a")) return;

  if (e.code === "Space") {
    e.preventDefault();
    playBtn.click();
  } else if (e.code === "ArrowRight") {
    nextBtn.click();
  } else if (e.code === "ArrowLeft") {
    prevBtn.click();
  }
});
