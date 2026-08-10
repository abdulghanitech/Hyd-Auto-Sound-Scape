/* HYD AUTO — one screen, one song.
   Audio is a hidden YouTube IFrame player; the UI is ours.
   Song library lives in tracks.js — edit that file to change the setlist. */

const TRACKS = (window.TRACKS || []).map((t) => ({
  ...t,
  cover: t.cover || `/covers/disc/${t.youtubeId}.jpg`,
}));

const BRAND = window.HYD_AUTO || {
  name: "HYD AUTO",
  album: "Hyderabad Auto",
  tagline: "Gaane that only slap in a Hyderabad auto.",
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

/* ---------- player ---------- */

const card = el("player-card");
const seek = el("seek");
const playBtn = el("play");
const prevBtn = el("prev");
const nextBtn = el("next");

let player = null;
let ready = false;
let scrubbing = false;
let index = 0;

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

/* YouTube IFrame API — keep our iframe so picture-in-picture stays denied. */

function embedUrl(youtubeId) {
  const params = new URLSearchParams({
    enablejsapi: "1",
    controls: "0",
    disablekb: "1",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    origin: location.origin,
  });
  return `https://www.youtube.com/embed/${youtubeId}?${params}`;
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
      },
      onStateChange: (e) => {
        const S = YT.PlayerState;
        if (e.data === S.PLAYING) {
          card.classList.add("is-playing");
          playBtn.setAttribute("aria-label", "Pause");
          el("duration").textContent = fmt(player.getDuration());
        } else {
          card.classList.remove("is-playing");
          playBtn.setAttribute("aria-label", "Play");
        }

        if ("mediaSession" in navigator) {
          navigator.mediaSession.playbackState =
            e.data === S.PLAYING ? "playing" : "paused";
        }
        if (e.data === S.ENDED) {
          if (TRACKS.length > 1) loadTrack(index + 1);
          else player.seekTo(0, true);
          player.playVideo();
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

playBtn.addEventListener("click", () => {
  if (!ready) return;
  const S = YT.PlayerState;
  if (player.getPlayerState() === S.PLAYING) player.pauseVideo();
  else player.playVideo();
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
