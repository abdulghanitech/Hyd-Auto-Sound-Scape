# HYD AUTO

Sit in the back seat of a Hyderabad auto. Charminar ahead. Speakers blasting.

A one-screen soundscape for the songs that only slap in a yellow meter — inspired by [roadways.wtf](https://roadways.wtf) and [saloon.wtf](https://saloon.wtf).

**Live:** [hyd-auto.vercel.app](https://hyd-auto.vercel.app)

## Quick start

```bash
npm start
```

Open [http://localhost:5173](http://localhost:5173)  
Share a track: [http://localhost:5173/?t=miya-bhai](http://localhost:5173/?t=miya-bhai)

No build step. Static HTML, CSS, and JS.

## Change the song library

Edit **`tracks.js`** only:

```js
{
  youtubeId: "XXXXXXXXXXX", // from youtube.com/watch?v=XXXXXXXXXXX
  title: "Song name",
  artist: "Artist",
  slug: "my-song", // share URL ?t=my-song
  // cover: "/covers/disc/XXXXXXXXXXX.jpg" // optional
}
```

Refresh artwork after adding IDs:

```bash
npm run covers
```

That pulls YouTube thumbnails into `covers/` and square disc art into `covers/disc/`.

## Features

- Illustrated Charminar auto ride loop
- YouTube-backed player + media keys
- Fantasy auto **meter** that runs with the song
- Soft ambient auto bed (Web Audio)
- Share / deep link per track (`?t=slug`)

## Swap the ride footage

| File     | Role                                      |
| -------- | ----------------------------------------- |
| `bg.jpg` | Still / poster (paints first, always)     |
| `bg.mp4` | Looping drive clip (loads after page load) |

Keep both framed as a passenger POV from inside a yellow auto.

## Project layout

```
tracks.js              ← edit this to change the setlist
app.js                 player, meter, share, deep links
ambient.js             soft auto putter (Web Audio)
hero-video.js          lazy-loads bg.mp4
noise.js               film grain
styles.css             layout + motion
scripts/fetch-covers.mjs
covers/disc/           square artwork used by the player
```

See [REVIEW.md](REVIEW.md) for the viral-polish branch checklist.

## Deploy

Any static host works (Vercel, Netlify, GitHub Pages, Cloudflare Pages).

```bash
npx vercel
```

`vercel.json` is included for clean URLs and a picture-in-picture block (audio stays in-page).

## License

MIT — see [LICENSE](LICENSE).

Song audio streams from YouTube; you are responsible for the videos you link in `tracks.js`.
