# Viral polish — review notes (`cursor/viral-polish-7c02`)

Preview locally:

```bash
npm start
# http://localhost:5173/
# http://localhost:5173/?t=miya-bhai
```

## What’s in this branch

### 1. Share + deep links
- **Share** pill (native share on mobile, clipboard on desktop)
- URL updates per track: `/?t=miya-bhai`, `/?t=marfa`, …
- Opening a shared link jumps straight to that song

### 2. Minimal forward auto-travel loop
- Procedural dusk POV: vanishing-point road, scrolling center dashes, yellow canopy/hood frame
- Forward-only seamless loop (dash phase wraps; no reverse / ping-pong / slide morphs)
- Still paints first (`bg.jpg` / `bg-portrait.jpg`); footage lazy-loads via `hero-video.js`
- `bg.mp4` ≈100KB (well under 1.2MB); rebuild with `npm run ride`, then bump `VIDEO_V`

### 3. Playlist sharpening
- Hyd-coded openers first: Miya Bhai → Marfa → Teri Yaadein → Blue Eyes → Seeti Maar…
- Explicit `slug`s for clean share URLs

### 4. Soft ambient bed
- Subtle synthesized auto putter (`ambient.js`)
- Starts on first play, ducks under the song
- Disabled when `prefers-reduced-motion`

### 5. Copy / identity
- Tagline: **Speaker full. Charminar left.**
- `NOW PLAYING` label in the player

## Intentionally removed
- Fantasy fare **meter** (didn’t land visually)
- Desktop credit line (“for the yellow meter…”)

## What to judge
1. Does the minimal road loop feel like continuous auto travel (not a slideshow)?
2. Ambient too quiet / too loud under music?
3. Mobile portrait framing OK with the canopy silhouette?
4. Share link round-trip (`?t=…`) correct?

Rebuild ride loops:

```bash
npm run ride
# then bump VIDEO_V in hero-video.js
```
