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

### 2. Continuous ride background
- Single photoreal auto POV toward Charminar
- One continuous dolly + bump loop (no slide morphs / crossfades)
- Seamless ping-pong so the ride never hard-cuts

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
1. Does the ride video feel like travelling (not slideshow)?
2. Ambient too quiet / too loud under music?
3. Mobile layout clean without the meter?
4. Share link round-trip (`?t=…`) correct?
