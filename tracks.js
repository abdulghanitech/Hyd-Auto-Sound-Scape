/* =============================================================================
   HYD AUTO — Song library
   =============================================================================
   Edit THIS file to change what plays. Everything else reads from TRACKS.

   Each track needs:
     youtubeId  — the ID from youtube.com/watch?v=XXXXXXXXXXX
     title      — short display title (one line)
     artist     — short artist / film credit
     slug       — optional share URL (?t=slug). Auto-derived from title if omitted.
     cover      — optional path (defaults to /covers/disc/<id>.jpg)

   After adding a youtubeId, refresh its cover:

     npm run covers

   Share a specific banger:
     https://hyd-auto.vercel.app/?t=miya-bhai
   ============================================================================= */

window.TRACKS = [
  /* —— open with the most Hyd-coded punches —— */
  {
    youtubeId: "RMLlyK9rLmc",
    title: "Miya Bhai Hyderabadi",
    artist: "Ruhaan Arshad",
    slug: "miya-bhai",
  },
  {
    youtubeId: "DmmonjioJsI",
    title: "Hyderabadi Marfa",
    artist: "DJ Nikhil Martyn",
    slug: "marfa",
  },
  {
    youtubeId: "eafo6MoqDPw",
    title: "Teri Yaadein",
    artist: "Atif Aslam · Mix",
    slug: "teri-yaadein",
  },
  {
    youtubeId: "NbyHNASFi6U",
    title: "Blue Eyes",
    artist: "Yo Yo Honey Singh",
    slug: "blue-eyes",
  },
  {
    youtubeId: "WLD0kUKybeE",
    title: "Seeti Maar",
    artist: "DSP · DJ",
    slug: "seeti-maar",
  },
  {
    youtubeId: "2mDCVzruYzQ",
    title: "Butta Bomma",
    artist: "Armaan Malik",
    slug: "butta-bomma",
  },
  {
    youtubeId: "u_wB6byrl5k",
    title: "Oo Antava",
    artist: "Devi Sri Prasad · Pushpa",
    slug: "oo-antava",
  },
  {
    youtubeId: "4_eEgJhsBMo",
    title: "Naatu Naatu",
    artist: "M. M. Keeravaani · RRR",
    slug: "naatu-naatu",
  },
  {
    youtubeId: "k4yXQkG2s1E",
    title: "Kala Chashma",
    artist: "Badshah · Neha Kakkar",
    slug: "kala-chashma",
  },
  {
    youtubeId: "TRa9IMvccjg",
    title: "Dilbar",
    artist: "Neha Kakkar",
    slug: "dilbar",
  },
  {
    youtubeId: "Jn5hsfbhWx4",
    title: "Munni Badnaam Hui",
    artist: "Lalit Pandit · Dabangg",
    slug: "munni",
  },
  {
    youtubeId: "KUN5Uf9mObQ",
    title: "Arabic Kuthu",
    artist: "Anirudh · Beast",
    slug: "arabic-kuthu",
  },
  {
    youtubeId: "CKpbdCciELk",
    title: "Fear Song",
    artist: "Anirudh · Devara",
    slug: "fear-song",
  },
  {
    youtubeId: "fRD_3vJagxk",
    title: "Vaathi Coming",
    artist: "Anirudh · Master",
    slug: "vaathi-coming",
  },
  {
    youtubeId: "_KhQT-LGb-4",
    title: "Aankh Marey",
    artist: "Tanishk · Simmba",
    slug: "aankh-marey",
  },
];

window.HYD_AUTO = {
  name: "HYD AUTO",
  album: "Hyderabad Auto",
  tagline: "Speaker full. Charminar left.",
  shareText: "HYD AUTO — gaane that only slap in a Hyderabad auto.",
};
