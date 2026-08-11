import { themes } from "./themes.js";

/* Old City.

   A rounded rectangle roughly 320 × 240 m with Charminar in the CENTRE, so the
   monument is in frame from nearly everywhere on the loop. That composition
   decision does more for the screenshots than any amount of geometry detail.

   Closed loop: infinite drive, no invisible walls, trivial traffic AI, and
   every drop-off is always reachable. */

export default {
  id: "charminar",
  name: "OLD CITY",
  theme: themes.dusk,
  seed: 0x48594421,
  roughness: 1.35, // Old City roads are genuinely terrible
  wet: false,

  // [x, z, roadHalfWidth]
  spline: [
    [-87, -68, 4.4],
    [0, -77, 5.0],
    [87, -68, 4.4],
    [100, -25, 3.8],
    [98, 25, 3.6],
    [86, 66, 4.2],
    [25, 79, 5.2],
    [-29, 78, 5.0],
    [-87, 64, 4.2],
    [-100, 22, 3.6],
    [-99, -26, 3.8],
  ],


  /* The loop runs anticlockwise around the monument, which makes `right` the
     INNER side. Everything tall is therefore restricted to "left" — the outer
     kerb — so the centre stays an open plaza with Charminar in it. Building on
     both sides walls the monument in and you never see it once. */
  districts: [
    { along: [0.0, 0.28], facade: "oldcity", height: [7, 15], setback: 2.4, density: 0.92, side: "left" },
    { along: [0.28, 0.5], facade: "oldcity", height: [6, 12], setback: 3.2, density: 0.78, side: "left" },
    { along: [0.5, 0.76], facade: "bazaar", height: [5, 11], setback: 2.2, density: 0.95, side: "left" },
    { along: [0.76, 1.0], facade: "oldcity", height: [8, 16], setback: 2.8, density: 0.85, side: "left" },
  ],

  landmarks: [{ kind: "charminar", x: 0, z: 0, rotY: 0, scale: 1 }],

  /* Stalls hug the shopfronts on the outer kerb. Only thin things — lamp posts
     — go on the inner side, so the view across to the monument stays open. */
  propRules: [
    { kind: "stall", side: "left", along: [0.06, 0.46], every: 7.0, jitter: 1.6 },
    { kind: "stall", side: "left", along: [0.5, 0.94], every: 6.2, jitter: 1.4 },
    { kind: "streetlight", side: "right", along: [0, 1], every: 26, jitter: 2 },
    { kind: "banner", side: "both", along: [0.1, 0.9], every: 34, jitter: 6 },
    { kind: "pole", side: "left", along: [0, 1], every: 19, jitter: 3 },
  ],

  potholes: [
    { x: 38, z: -73, r: 0.8 }, { x: -52, z: -72, r: 0.7 },
    { x: 99, z: -4, r: 0.75 }, { x: 92, z: 48, r: 0.85 },
    { x: 4, z: 79, r: 0.7 }, { x: -60, z: 73, r: 0.8 },
    { x: -100, z: -5, r: 0.75 }, { x: -94, z: 43, r: 0.7 },
  ],

  crowdDensity: 1.0,
  pigeons: 40,

  dropoffs: [
    { id: "laad", name: "Laad Bazaar", x: -73, z: -69 },
    { id: "mecca", name: "Mecca Masjid", x: 94, z: -21 },
    { id: "chowk", name: "Gulzar Houz", x: 82, z: 62 },
    { id: "patthar", name: "Patthargatti", x: -19, z: 78 },
    { id: "moti", name: "Moti Chowk", x: -98, z: 14 },
    { id: "char", name: "Charminar Circle", x: 0, z: -76 },
  ],

  // Where the ride starts: on the north straight, facing east toward the monument.
  spawn: { t: 0.04, lookAtLandmark: true },
};
