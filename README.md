# HYD AUTO

Drive a yellow auto through Hyderabad. Pick up passengers, run the meter, and blast gaane that only slap in a yellow meter.

Two maps — **Old City** at golden hour with Charminar in the middle of the loop, and **Tank Bund** at night with the Buddha lit out on the water. No timer, no fail state. You can ignore the fares entirely and just drive.

**Live:** [hyd-auto.vercel.app](https://hyd-auto.vercel.app)

---

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

```bash
npm run build && npm run preview   # always run this before pushing
```

## Change the song library

Edit **`public/tracks.js`** only. It is served verbatim with no build step, so you can edit it straight in the GitHub web UI and Vercel will ship it.

```js
{
  youtubeId: "XXXXXXXXXXX", // from youtube.com/watch?v=XXXXXXXXXXX
  title: "Song name",
  artist: "Artist",
  bpm: 104,                 // optional — see below
  vibe: "banger",           // optional — "chill" | "bounce" | "banger"
}
```

Refresh artwork after adding IDs:

```bash
npm run covers
```

That writes square disc art into `public/covers/disc/`.

### Why tracks have a BPM

Audio streams from a hidden YouTube iframe, which is cross-origin — so the page **cannot** analyse the actual waveform. Instead each track carries a `bpm`, and a phase-locked clock derives the beat from playback position. That beat drives the dashboard idol, the underglow, the suspension kick, the streetlight pulse and the bloom.

If a song looks off-beat, change its `bpm`. Omit it and it falls back to 110. `vibe` scales how hard the visuals react.

## Controls

| Action | Key |
| --- | --- |
| Throttle | `W` / `↑` |
| Brake · reverse | `S` / `↓` |
| Steer | `A` `D` / `←` `→` |
| Handbrake | `Space` |
| Camera | `C` |
| Horn | `H` |
| Play · pause | `P` |
| Previous · next track | `[` · `]` |
| Photo mode | `F` |
| Menu | `Esc` |

> **Note for returning users:** the arrows used to change tracks. They steer now — the music moved to `P` / `[` / `]`.

On phones, drag the arc in the bottom-left to steer. The auto creeps forward on its own by default, so you only need one thumb; switch on manual throttle (or tilt steering) in the menu.

Three cameras: **chase** (default), **back seat** — the framing of the original site's artwork — and **driver**.

## How it works

Everything is generated in code. There are no 3D models, no downloaded textures and no audio files in this repo; the auto, the buildings, the crowds and every texture are built procedurally at load. Total payload is about 530 KB.

```
public/
  tracks.js            ← the one file you edit to change the setlist
  covers/disc/         square artwork used by the player
  bg.jpg               loading backdrop + social card
src/
  main.js              boot sequence, wires everything together
  engine/              renderer, composer, frame loop, quality tiers, disposal
  post/GradePass.js    grade + vignette + grain + aberration, in one pass
  input/               keyboard, touch, tilt → one unified action state
  vehicle/             arcade physics, procedural auto, camera rig
  world/               road spline, buildings, props, crowd, traffic, landmarks
  maps/                the two map definitions, as data
  audio/               YouTube transport + the beat clock
  game/                fares, passengers, progression
  ui/                  HUD, player pill, menu, photo sharing
```

A few decisions worth knowing before changing things:

- **Pass order is load-bearing.** `RenderPass → Bloom → OutputPass → GradePass`. Bloom has to see linear HDR *before* tone mapping; grain and aberration are display-referred and have to come *after*. Don't add `GammaCorrectionShader` — `OutputPass` already encodes sRGB.
- **Lights are mostly fake.** At most four real lights per scene. Everything else is emissive geometry that bloom turns into a glow, plus additive sprites. Note that `PointLight` intensity has been in candela since three r155 — `intensity: 1` renders black.
- **The road spline is baked** into a lookup table at load. Anything running per frame (crowd, traffic, reflections) reads that table; calling `curve.getPointAt()` per entity per frame was by far the most expensive thing in the game.
- **`dt` is clamped unconditionally** and physics runs at a fixed 120 Hz. Returning to a backgrounded tab otherwise hands you a 30-second delta and throws the auto through the map.
- **Maps are closed loops**, so there are no invisible walls, traffic AI wraps for free, and every drop-off is always reachable.

## Deploy

Any static host. `vercel.json` sets the build output, keeps clean URLs, blocks picture-in-picture so audio can't escape the page, and — importantly — marks `/tracks.js` as `must-revalidate` so setlist edits aren't swallowed by the CDN cache.

```bash
npx vercel
```

## License

MIT — see [LICENSE](LICENSE).

Song audio streams from YouTube; you are responsible for the videos you link in `public/tracks.js`.
