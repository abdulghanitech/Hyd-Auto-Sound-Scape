/* Per-map lighting, fog and grade.

   A note that matters for the night map: since three r155, PointLight and
   SpotLight intensity is in candela with physical decay. The old `intensity: 1`
   renders effectively black. Night lights here use 20-30 candela with decay 2 —
   and there are at most four of them, because almost every light source in the
   game is a MeshBasicMaterial emitter that bloom turns into a glow. */

export const themes = {
  dusk: {
    id: "dusk",
    label: "OLD CITY · DUSK",
    exposure: 1.02,

    sky: {
      horizon: 0xffb25e,
      zenith: 0x2e3f6b,
      sunAzimuth: 255,
      sunElevation: 6,
      sunColor: 0xfff0c0,
      sunSize: 0.028,
      hazeStrength: 0.55,
    },

    fog: { color: 0xe8a45c, density: 0.0085 },

    hemi: { sky: 0xffcf8a, ground: 0x6b4a2a, intensity: 0.55 },
    sun: {
      color: 0xffb05a,
      intensity: 2.6,
      azimuth: 255,
      elevation: 7,
      shadowRadius: 34,
    },

    // Warm shop bulbs strung through the bazaar
    emitterColor: 0xffd98a,
    emitterIntensity: 3.2,
    windowTheme: "dusk",

    bloomStrength: 0.42,
    bloomRadius: 0.62,
    bloomThreshold: 0.86,

    grain: 0.06,
    chromatic: 0.0022,
    vignette: 0.34,
    saturation: 1.12,
    contrast: 1.04,
    halation: 0.07,
    lift: [0.02, 0.0, -0.03],

    moteColor: 0xffd9a0,
    godRays: false,
    wet: 0.15,
  },

  night: {
    id: "night",
    label: "TANK BUND · NIGHT",
    exposure: 1.0,

    sky: {
      horizon: 0x0b1224,
      zenith: 0x060812,
      sunAzimuth: 70,
      sunElevation: 40,
      sunColor: 0xbcd0f0,
      sunSize: 0.02,
      hazeStrength: 0.18,
    },

    fog: { color: 0x0a1020, density: 0.0075 },

    hemi: { sky: 0x2a3b66, ground: 0x0a0c10, intensity: 0.22 },
    sun: {
      color: 0x8fa8d8,
      intensity: 0.35,
      azimuth: 70,
      elevation: 40,
      shadowRadius: 40,
    },

    emitterColor: 0xfff0c8,
    emitterIntensity: 4.5,
    windowTheme: "night",

    // Night leans hard on bloom — it is doing the job that real lights would.
    bloomStrength: 0.82,
    bloomRadius: 0.75,
    bloomThreshold: 0.58,

    grain: 0.09,
    chromatic: 0.0035,
    vignette: 0.42,
    saturation: 1.18,
    contrast: 1.06,
    halation: 0.12,
    lift: [-0.01, 0.0, 0.03],

    moteColor: 0x9fc0ff,
    godRays: false,
    wet: 0.85, // drives the puddle mask and the reflection smears
  },
};
