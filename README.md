# HYD AUTO

Sit in the back seat of a Hyderabad auto. Charminar ahead. Speakers blasting.

A one-screen soundscape for the songs that only slap in a yellow meter — inspired by [roadways.wtf](https://roadways.wtf) and [saloon.wtf](https://saloon.wtf).

**Live vibe:** full-bleed auto POV, bumpy-road motion, film grain, and a YouTube-backed player.

## Quick start

```bash
npm start
```

Open [http://localhost:5173](http://localhost:5173).

No build step. Static HTML, CSS, and JS.

## Change the song library

Edit **`tracks.js`** only:

```js
{
  youtubeId: "XXXXXXXXXXX", // from youtube.com/watch?v=XXXXXXXXXXX
  title: "Song name",
  artist: "Artist",
  // cover: "/covers/disc/XXXXXXXXXXX.jpg" // optional
}
```

Refresh artwork after adding IDs:

```bash
npm run covers
```

That pulls YouTube thumbnails into `covers/` and square disc art into `covers/disc/`.

## Swap the ride footage

| File     | Role                                      |
| -------- | ----------------------------------------- |
| `bg.jpg` | Still / poster (paints first, always)     |
| `bg.mp4` | Looping drive clip (loads after page load) |

Keep both framed as a passenger POV from inside a yellow auto.

## Project layout

```
tracks.js              ← edit this to change the setlist
app.js                 player + YouTube iframe API
hero-video.js          lazy-loads bg.mp4
noise.js               film grain
styles.css             layout + motion
scripts/fetch-covers.mjs
covers/disc/           square artwork used by the player
```

## Deploy

Any static host works (Vercel, Netlify, GitHub Pages, Cloudflare Pages).

```bash
npx vercel
```

`vercel.json` is included for clean URLs and a picture-in-picture block (audio stays in-page).

## License

MIT — see [LICENSE](LICENSE).

Song audio streams from YouTube; you are responsible for the videos you link in `tracks.js`.
