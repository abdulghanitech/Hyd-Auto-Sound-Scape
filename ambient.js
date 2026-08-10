/* Soft auto-rickshaw bed under the music.
   Web Audio only — no asset download. Stays ducked and optional. */

(() => {

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
let ctx = null;
let master = null;
let running = false;

function createPutter(ctx, master) {
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.4;

  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 180;
  filter.Q.value = 0.7;

  const rumble = ctx.createOscillator();
  rumble.type = "triangle";
  rumble.frequency.value = 48;

  const rumbleGain = ctx.createGain();
  rumbleGain.gain.value = 0.012;

  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.018;

  /* Slow amplitude idle — feels like a waiting auto, not a club bed. */
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 1.7;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.006;
  lfo.connect(lfoGain);
  lfoGain.connect(noiseGain.gain);

  src.connect(filter);
  filter.connect(noiseGain);
  rumble.connect(rumbleGain);
  noiseGain.connect(master);
  rumbleGain.connect(master);

  src.start();
  rumble.start();
  lfo.start();

  return { src, rumble, lfo, noiseGain, rumbleGain };
}

let nodes = null;

function ensure() {
  if (reduced.matches) return null;
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  nodes = createPutter(ctx, master);
  return ctx;
}

window.HydAmbient = {
  async start() {
    if (running || reduced.matches) return;
    const c = ensure();
    if (!c) return;
    if (c.state === "suspended") {
      try { await c.resume(); } catch { return; }
    }
    running = true;
    const now = c.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(1, now + 1.2);
  },

  /* Duck under the song so the bed never fights the banger. */
  duck(on) {
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const target = on ? 0.28 : 1;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(target, now + 0.35);
  },

  stop() {
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + 0.6);
    running = false;
  },
};

})();
