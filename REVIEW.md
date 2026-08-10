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

### 2. Roadways-style ride background
- Illustrated flat-gouache auto POV toward Charminar (same pattern as roadways.wtf’s bus cabin)
- Still paints first (`bg.jpg` / `bg-portrait.jpg`); looping footage attaches after `load` via `hero-video.js`
- Fixed yellow canopy + moving windshield; landscape + portrait loops (~2.5MB / ~2.3MB)
- CSS bump only on the still fallback; video carries its own ride vibration

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
1. Does the illustrated ride feel like roadways.wtf — cabin fixed, road alive?
2. Ambient too quiet / too loud under music?
3. Mobile portrait artwork framing OK?
4. Share link round-trip (`?t=…`) correct?

Rebuild ride loops (optional):

```bash
python3 scripts/generate-ride.py
# then bump VIDEO_V in hero-video.js
```
