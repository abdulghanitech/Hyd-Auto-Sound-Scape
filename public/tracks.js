/* =============================================================================
   HYD AUTO — Song library
   =============================================================================
   Edit THIS file to change what plays. Everything else reads from TRACKS.

   This file is served verbatim, with no build step, so you can edit it straight
   in the GitHub web UI and Vercel will ship it.

   Each track needs:
     youtubeId   — the ID from youtube.com/watch?v=XXXXXXXXXXX
     title       — short display title (one line)
     artist      — short artist / film credit

   Optional:
     bpm         — beats per minute. Drives the dashboard idol, the underglow,
                   the suspension kick and the streetlight pulse. YouTube plays
                   in a cross-origin iframe, so the actual audio can't be
                   analysed — this number is how the visuals know the tempo.
                   Defaults to 110 if omitted. The values below are estimates:
                   if a song looks off-beat, nudge it here.
     beatOffset  — seconds before the first beat lands. Default 0.
     beatsPerBar — default 4.
     vibe        — "chill" | "bounce" | "banger". Scales how hard the visuals
                   react. Default "bounce".
     cover       — optional path (defaults to /covers/disc/<id>.jpg)

   After adding a youtubeId, refresh its cover:

     npm run covers
   ============================================================================= */

window.TRACKS = [
  {
    youtubeId: "RMLlyK9rLmc",
    title: "Miya Bhai Hyderabadi",
    artist: "Ruhaan Arshad",
    bpm: 98,
    vibe: "banger",
  },
  {
    youtubeId: "DmmonjioJsI",
    title: "Hyderabadi Marfa",
    artist: "DJ Nikhil Martyn",
    bpm: 128,
    vibe: "banger",
  },
  {
    youtubeId: "eafo6MoqDPw",
    title: "Teri Yaadein",
    artist: "Atif Aslam · Mix",
    bpm: 92,
    vibe: "chill",
  },
  {
    youtubeId: "NbyHNASFi6U",
    title: "Blue Eyes",
    artist: "Yo Yo Honey Singh",
    bpm: 130,
    vibe: "bounce",
  },
  {
    youtubeId: "2mDCVzruYzQ",
    title: "Butta Bomma",
    artist: "Armaan Malik",
    bpm: 106,
    vibe: "bounce",
  },
  {
    youtubeId: "u_wB6byrl5k",
    title: "Oo Antava",
    artist: "Devi Sri Prasad · Pushpa",
    bpm: 104,
    vibe: "banger",
  },
  {
    youtubeId: "WLD0kUKybeE",
    title: "Seeti Maar",
    artist: "DSP · DJ",
    bpm: 128,
    vibe: "banger",
  },
  {
    youtubeId: "4_eEgJhsBMo",
    title: "Naatu Naatu",
    artist: "M. M. Keeravaani · RRR",
    bpm: 124,
    vibe: "banger",
  },
  {
    youtubeId: "k4yXQkG2s1E",
    title: "Kala Chashma",
    artist: "Badshah · Neha Kakkar",
    bpm: 104,
    vibe: "bounce",
  },
  {
    youtubeId: "TRa9IMvccjg",
    title: "Dilbar",
    artist: "Neha Kakkar",
    bpm: 92,
    vibe: "bounce",
  },
  {
    youtubeId: "Jn5hsfbhWx4",
    title: "Munni Badnaam Hui",
    artist: "Lalit Pandit · Dabangg",
    bpm: 140,
    vibe: "banger",
  },
  {
    youtubeId: "KUN5Uf9mObQ",
    title: "Arabic Kuthu",
    artist: "Anirudh · Beast",
    bpm: 86,
    vibe: "banger",
  },
  {
    youtubeId: "CKpbdCciELk",
    title: "Fear Song",
    artist: "Anirudh · Devara",
    bpm: 100,
    vibe: "bounce",
  },
  {
    youtubeId: "fRD_3vJagxk",
    title: "Vaathi Coming",
    artist: "Anirudh · Master",
    bpm: 96,
    vibe: "banger",
  },
  {
    youtubeId: "_KhQT-LGb-4",
    title: "Aankh Marey",
    artist: "Tanishk · Simmba",
    bpm: 118,
    vibe: "bounce",
  },
];

window.HYD_AUTO = {
  name: "HYD AUTO",
  album: "Hyderabad Auto",
  tagline: "Gaane that only slap in a Hyderabad auto.",
};
