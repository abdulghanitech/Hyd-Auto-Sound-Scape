import { themes } from "./themes.js";

/* Tank Bund at night.

   Wide, divided, and built around one long lakeside straight with the lit
   Buddha statue on the water at its midpoint. Long straights mean high speed,
   and high speed with wet reflections is what people screenshot.

   The inland return leg is deliberately plainer — contrast is what makes the
   lakeside stretch land. */

export default {
  id: "tankbund",
  name: "TANK BUND",
  theme: themes.night,
  seed: 0x7a9c0311,
  roughness: 0.55, // properly surfaced road, unlike Old City
  wet: true,

  spline: [
    [-210, -180, 7.0],
    [-70, -212, 7.2],
    [80, -206, 7.2],
    [196, -150, 6.6],
    [232, -30, 6.2],
    [226, 96, 6.4],
    [150, 190, 6.8],
    [10, 222, 7.0],
    [-130, 200, 6.6],
    [-224, 110, 6.0],
    [-246, -30, 6.2],
  ],


  districts: [
    // The lakeside stretch: water on one side, so buildings only inland.
    { along: [0.0, 0.34], facade: "lakeside", height: [14, 34], setback: 9, density: 0.5, side: "right" },
    { along: [0.34, 0.62], facade: "lakeside", height: [12, 30], setback: 7, density: 0.7 },
    { along: [0.62, 1.0], facade: "lakeside", height: [10, 26], setback: 6, density: 0.82 },
  ],

  water: {
    // The lake sits outside the loop, off the northern straight. The radius is
    // chosen so the shoreline stops just short of the road rather than
    // flooding it.
    center: [-20, -430],
    radius: 215,
    level: -0.6,
  },

  // ~100 m off the lakeside straight — close enough to actually read through
  // the night haze, far enough to still feel like it's out on the water.
  landmarks: [{ kind: "buddha", x: -20, z: -300, rotY: Math.PI, scale: 1 }],

  propRules: [
    { kind: "streetlight", side: "both", along: [0, 1], every: 22, jitter: 1 },
    { kind: "stringlights", side: "left", along: [0.0, 0.4], every: 12, jitter: 0 },
    { kind: "railing", side: "left", along: [0.0, 0.42], every: 4, jitter: 0 },
    { kind: "banner", side: "right", along: [0.5, 0.95], every: 40, jitter: 8 },
    { kind: "pole", side: "right", along: [0, 1], every: 24, jitter: 3 },
  ],

  potholes: [
    { x: 200, z: -120, r: 0.7 }, { x: 224, z: 60, r: 0.65 },
    { x: -180, z: 190, r: 0.7 }, { x: -240, z: 20, r: 0.6 },
  ],

  crowdDensity: 0.42,
  pigeons: 0,

  dropoffs: [
    { id: "buddha", name: "Buddha Statue View", x: -60, z: -204 },
    { id: "necklace", name: "Necklace Road", x: 190, z: -140 },
    { id: "eatstreet", name: "Eat Street", x: 228, z: 40 },
    { id: "sanjeevaiah", name: "Sanjeevaiah Park", x: 60, z: 218 },
    { id: "secbad", name: "Secunderabad End", x: -220, z: 120 },
    { id: "lumbini", name: "Lumbini Park", x: -246, z: -20 },
  ],

  spawn: { t: 0.06, lookAtLandmark: true },
};
