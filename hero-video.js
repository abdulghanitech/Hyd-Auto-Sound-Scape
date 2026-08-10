/* Looping Hyderabad auto ride behind the UI.
   bg.jpg always paints underneath as poster / reduced-motion fallback. */

(() => {

const ENABLED = true;
const SRC = "/bg.mp4";
const video = document.querySelector(".hero-video");
const still = window.matchMedia("(prefers-reduced-motion: reduce)");
const saveData = navigator.connection && navigator.connection.saveData;

function wanted() {
  return ENABLED && video && !still.matches && !saveData;
}

function load() {
  if (!wanted() || video.src) return;

  video.src = SRC;
  video.load();

  video.addEventListener("playing", () => video.classList.add("is-playing"), {
    once: true,
  });

  video.addEventListener("error", () => {
    video.classList.remove("is-playing");
  });

  const attempt = video.play();
  if (attempt) {
    attempt.catch(() => {
      const retry = () => {
        video.play().catch(() => {});
      };
      document.addEventListener("pointerdown", retry, { once: true });
    });
  }
}

if (document.readyState === "complete") {
  load();
} else {
  window.addEventListener("load", () => setTimeout(load, 300), { once: true });
}

document.addEventListener("visibilitychange", () => {
  if (!video || !video.src) return;
  if (document.hidden) video.pause();
  else video.play().catch(() => {});
});

still.addEventListener("change", () => {
  if (still.matches) {
    video.pause();
    video.classList.remove("is-playing");
  } else {
    load();
    video.play().catch(() => {});
  }
});

})();
