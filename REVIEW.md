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

### 2. Hyderabad auto windshield ride
- Illustrated cabin POV: yellow auto frame, windshield, marigold garland, driver + handlebars
- Charminar + old-city street through the glass; cabin locked, road dollies forward
- Still paints first; footage lazy-loads via `hero-video.js` (landscape + portrait)
- Rebuild: `npm run ride`, then bump `VIDEO_V`

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
1. Can you read Hyderabad + auto + windshield immediately?
2. Does the ride feel continuous (not a slideshow)?
3. Ambient too quiet / too loud under music?
4. Share link round-trip (`?t=…`) correct?

Rebuild ride loops:

```bash
npm run ride
# then bump VIDEO_V in hero-video.js
```
