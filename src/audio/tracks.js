/* Reads the setlist that public/tracks.js put on window.

   Guarded deliberately: a syntax error or a bad edit in tracks.js must degrade
   to a working game with one fallback track, never a black screen. That file is
   edited by hand in the GitHub web UI, so it WILL break at some point. */

const FALLBACK = [
  { youtubeId: "RMLlyK9rLmc", title: "Miya Bhai Hyderabadi", artist: "Ruhaan Arshad", bpm: 98 },
];

const DEFAULT_BPM = 110;

export function loadTracks() {
  const raw = Array.isArray(window.TRACKS) && window.TRACKS.length ? window.TRACKS : FALLBACK;

  const tracks = raw
    .filter((t) => t && typeof t.youtubeId === "string" && t.youtubeId.length > 5)
    .map((t) => ({
      youtubeId: t.youtubeId,
      title: t.title ?? "Unknown",
      artist: t.artist ?? "",
      cover: t.cover ?? `/covers/disc/${t.youtubeId}.jpg`,
      bpm: Number.isFinite(t.bpm) && t.bpm > 40 && t.bpm < 220 ? t.bpm : DEFAULT_BPM,
      beatOffset: Number.isFinite(t.beatOffset) ? t.beatOffset : 0,
      beatsPerBar: Number.isFinite(t.beatsPerBar) ? t.beatsPerBar : 4,
      vibe: t.vibe ?? "bounce",
    }));

  if (!tracks.length) {
    console.error("HYD AUTO: tracks.js produced no playable tracks, using fallback.");
    return FALLBACK.map((t) => ({ ...t, cover: `/covers/disc/${t.youtubeId}.jpg`, beatOffset: 0, beatsPerBar: 4, vibe: "bounce" }));
  }

  return tracks;
}

export function loadBrand() {
  const b = window.HYD_AUTO ?? {};
  return {
    name: b.name ?? "HYD AUTO",
    album: b.album ?? "Hyderabad Auto",
    tagline: b.tagline ?? "Gaane that only slap in a Hyderabad auto.",
  };
}

/** How hard the visuals should react, per track. */
export const VIBE_INTENSITY = { chill: 0.55, bounce: 1.0, banger: 1.35 };
