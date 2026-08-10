/* Looping Hyderabad auto ride behind the UI.
   bg.jpg paints underneath as poster / reduced-motion fallback.
   Start the loop ASAP so the page feels alive on first paint. */

(() => {

const ENABLED = true;
const SRC = "/bg.mp4";
const video = document.querySelector(".hero-video");
const still = window.matchMedia("(prefers-reduced-motion: reduce)");
const saveData = navigator.connection && navigator.connection.saveData;

function wanted() {
  return ENABLED && video && !still.matches && !saveData;
}

function reveal() {
  video.classList.add("is-playing");
}

function load() {
  if (!wanted()) return;

  if (!video.getAttribute("src") && !video.src) {
    video.src = SRC;
  }

  video.addEventListener("playing", reveal);
  video.addEventListener("error", () => {
    video.classList.remove("is-playing");
  });

  const attempt = video.play();
  if (attempt) {
    attempt.then(reveal).catch(() => {
      const retry = () => {
        video.play().then(reveal).catch(() => {});
      };
      document.addEventListener("pointerdown", retry, { once: true });
      document.addEventListener("touchstart", retry, { once: true });
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", load, { once: true });
} else {
  load();
}

document.addEventListener("visibilitychange", () => {
  if (!video) return;
  if (document.hidden) video.pause();
  else if (wanted()) video.play().then(reveal).catch(() => {});
});

still.addEventListener("change", () => {
  if (still.matches) {
    video.pause();
    video.classList.remove("is-playing");
  } else {
    load();
  }
});

})();
