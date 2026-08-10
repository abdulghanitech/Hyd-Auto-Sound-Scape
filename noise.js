/* Animated film grain over the artwork — dusty Hyderabad evening lens. */

(() => {

const TILE = 256;
const FRAMES = 8;
const ALPHA = 14;
const INTERVAL_MS = 125;

const layer = document.createElement("div");
layer.className = "grain";
layer.setAttribute("aria-hidden", "true");

const tile = document.createElement("canvas");
tile.width = TILE;
tile.height = TILE;
const ctx = tile.getContext("2d");
const image = ctx.createImageData(TILE, TILE);

const frames = [];
for (let f = 0; f < FRAMES; f++) {
  const buf = image.data;
  for (let i = 0; i < buf.length; i += 4) {
    const v = Math.random() * 255;
    buf[i] = v;
    buf[i + 1] = v;
    buf[i + 2] = v;
    buf[i + 3] = ALPHA;
  }
  ctx.putImageData(image, 0, 0);
  frames.push(`url(${tile.toDataURL()})`);
}

layer.style.backgroundImage = frames[0];
layer.style.backgroundRepeat = "repeat";
document.body.appendChild(layer);

const still = window.matchMedia("(prefers-reduced-motion: reduce)");

let timer = null;
let index = 0;

function start() {
  if (timer !== null || still.matches) return;
  timer = setInterval(() => {
    index = (index + 1) % FRAMES;
    layer.style.backgroundImage = frames[index];
  }, INTERVAL_MS);
}

function stop() {
  if (timer === null) return;
  clearInterval(timer);
  timer = null;
}

start();

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stop();
  else start();
});

still.addEventListener("change", () => {
  stop();
  start();
});

})();
