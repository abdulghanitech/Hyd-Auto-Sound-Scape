# Viral polish — review notes (`cursor/viral-polish-7c02`)

Preview locally:

```bash
npm start
# http://localhost:5173/
# http://localhost:5173/?t=miya-bhai
```

## What’s in this branch

### 1. Share + deep links
- **Share** pill (native share sheet on mobile, clipboard copy on desktop)
- URL updates per track: `/?t=miya-bhai`, `/?t=marfa`, …
- Opening a shared link jumps straight to that song
- Tab title + description follow the current track (better for recordings / share sheets)

### 2. Signature meter fantasy
- Auto **METER** above the player
- Starts ticking on play, pauses on pause
- Fare climbs irregularly; routes + Deccani notes rotate
- Turns spicy/absurd colors as the fare gets ridiculous

### 3. Playlist sharpening
- Hyd-coded openers first: Miya Bhai → Marfa → Teri Yaadein → Blue Eyes → Seeti Maar…
- Every track has an explicit `slug` for clean share URLs
- Still edit-only-in-`tracks.js`

### 4. Soft ambient bed
- Subtle synthesized auto putter (`ambient.js`, Web Audio — no audio files)
- Starts on first play, ducks under the song
- Disabled when `prefers-reduced-motion`

### 5. Copy / identity
- Tagline: **Speaker full. Meter running. Charminar left.**
- `NOW PLAYING` label in the player (recording-readable)
- Quiet desktop credit pointing at `tracks.js`

## What to judge
1. Does the meter feel fun or gimmicky?
2. Is ambient too quiet / too loud under music?
3. Mobile: meter + player still fully on-screen?
4. Share link round-trip (`?t=…`) correct?

## Out of scope (intentionally)
- No login, feed, map, or multi-page site
- No loud horn / extra sound gimmicks
- OG image is still the static ride still (dynamic per-track OG would need a host function)
