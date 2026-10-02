// Every gameplay number lives here so balance can be tuned without touching game code.
// Units: distances in metres, speeds in metres/second (x 2.237 = mph), times in seconds.
// The palette (VISUAL DIRECTION). Loot, markers, the radar and the UI take their colours
// from here (the UI as --d-* CSS variables). Cool and dark by default; warm colour only
// where something matters.
const PALETTE = {
  shadowTeal: '#1B2530',   // sky, shadows, asphalt; UI panels
  slate: '#2F3B47',        // wet street, building shadow sides; trunk cells
  amber: '#E8A548',        // windows, lamps, headlights: the main accent
  copper: '#B8733A',       // the still, pipes, high-value loot
  brick: '#8A3B2E',        // buildings, barns; mid-value loot
  olive: '#4A5240',        // the truck; low-value loot
  taillight: '#D8402F',    // taillights, "won't fit": sparingly
  duskRose: '#C0655A',     // the horizon glow only
  cream: '#EFE6D0',        // UI text, crate labels
};

export const CONFIG = {
  // Same seed = same city layout every visit.
  seed: 1922,

  world: {
    blockSize: 44,        // distance between road centerlines
    gridRadius: 5,        // roads from -5..5 blocks around the center
    roadWidth: 12,
    sidewalk: 3,
    edge: 232,            // drivable half-extent of the city (outer roads sit at +/-220)
  },

  // Otto's truck: arcade handling. It sticks to the road, turns sharply even when slow,
  // keeps turning at speed, and glances off walls instead of bouncing back. The upgrades
  // (dredge.upgrades) add to these.
  player: {
    maxSpeed: 38,         // ~85 mph
    accel: 24,
    brake: 50,
    reverseAccel: 10,
    reverseMax: 12,
    rolling: 4,           // coasting slowdown
    turnRate: 2.4,        // rad/s at low-to-mid speed
    steerRamp: 1.5,       // full steering from this speed (m/s)
    steerFalloff: 0.15,   // share of the steering lost at top speed
    grip: 20,             // how fast sideways sliding dies: no spinning out
    handbrakeGrip: 3.5,   // a short, controllable handbrake slide
    bounce: 1.05,         // walls deflect rather than throw you back
    wallKeep: 0.99,       // and cost little speed
    radius: 1.45,         // two collision circles along the body
    circleOffset: 1.5,
  },

  camera: {
    distance: 10.8,       // metres behind the truck
    height: 5.184,        // and above the road
    fov: 62,              // chase feel (lag, pull-back, FOV kick, shake) is in src/juice.js
  },

  // The night look: moody noir, warm amber lamps against deep teal shadows. Colors are hex,
  // intensities in three.js physical units. Day values blend in with the daylight cycle.
  look: {
    exposure: 1.27,                  // ACES filmic tone mapping exposure
    sky: 0x0a1320,                   // night sky and fog: blue-black
    fogDensity: 0.0068,              // exponential fog: ~35% at 100 m, ~80% at 200 m
    dayFogDensity: 0.0022,
    fogWeatherDensity: 0.016,        // in fog weather
    ambientSky: 0x3f7890,            // hemisphere fill: teal from above...
    ambientGround: 0x1a120c,         // ...warm dark from below
    ambient: 1.7,
    moon: 0x9db6ff,                  // cool moonlight, the shadow-casting key light
    moonIntensity: 1.9, 
    countyNight: { ambient: 0.6, moon: 0.5 },  // extra fill and moonlight out in the county at night
    windowGlow: 0.62,                // lit windows (warm amber)
    windowsLit: 0.3,                 // share of windows lit at night
    shadowRange: 70,                 // metres of shadow around the view (high: 2048 map)
    lampColor: 0xffb466,             // gas-lamp amber
    lampLights: 8,                   // real lights that follow the nearest lamps (High; 6 Medium, 4 Low)
    lampIntensity: 58,               // candela per lamp
    lampRange: 26,                   // metres a lamp's light reaches
    lampShadow: true,                // the nearest lamp casts shadows (High only)
    coneOpacity: 0.09,               // faint light cone under each lantern
    poolOpacity: 0.5,                // fake light pool decal for lamps without a real light
    baseWet: 0.4,                    // how damp the streets look on a clear night (rain = 1)
    streakOpacity: 0.8,              // lamp reflections on the wet road
    beamOpacity: 0.17,               // the truck's headlight beams in the night air
    // 3D models from assets/ (made by scripts/optimize-models.mjs, see assets/README.md).
    // null, or a file that won't load, uses the built-in procedural model instead.
    models: {
      truck: 'assets/dredge-truck.glb',    // Otto's truck (made by scripts/make-truck.mjs)
      lamp: 'assets/arc-lamp.glb',         // street lamps
    },
    modelReflections: 0.35,          // how much a textured model mirrors the street
    // The sky dome (src/sky.js): its horizon is always the fog colour, so the city melts in.
    skyDome: {
      zenith: 0x02060e,                // night sky overhead: deep blue-black
      dayZenith: 0x3c6eb0,
      cityGlow: 0x3a2412,              // amber haze the city lamps throw up at the horizon
      stars: 0.05,                     // share of sky cells holding a star
      starBrightness: 0.9,
      clouds: 0.45,                    // cloud cover on a clear night, 0-1 (rain/fog thicken it)
      cloudSpeed: 0.006,               // drift
      moonSize: 0.03,                  // radians
      moonElevation: 0.36,             // the moon disc sits this high (radians), in the moonlight's direction
    },
    // Steam from the street grates and smoke from rooftop chimneys near the view (particles.js).
    atmosphere: {
      grates: 6,                       // nearest grates that steam
      grateRange: 70,                  // metres from the camera
      steamRate: 9,                    // puffs per second per grate
      chimneys: 8,
      chimneyRange: 140,
      smokeRate: 3,
      wind: [1.1, -0.35],              // m/s drift (x, z)
    },
    // Post-processing (High: full-res bloom, Medium: half-res bloom, Low: off).
    post: {
      bloomStrength: 0.85,           // how much bright things glow
      bloomRadius: 0.55,             // how far the glow spreads
      bloomThreshold: 0.75,          // brightness (linear, before tone mapping) that starts to glow
      shadowTint: [0.0, 0.055, 0.075],    // teal pushed into the shadows
      highlightTint: [0.07, 0.025, -0.03], // warm orange pushed into the highlights
      gradeAmount: 1,
      saturation: 1.05,
      contrast: 1.06,
      vignette: 0.38,                // darkening at the corners
      grain: 0.045,                  // film grain
      // The painterly look (Settings → Painterly look; Medium and High graphics).
      paint: {
        kuwahara: 0.75,              // how much of the brush-patch filter shows (0-1)
        lut: 0.35,                   // pull toward the palette
        fog: 0.4,                    // extra depth fog at most
        fogNear: 45, fogFar: 420,    // metres: where it starts and where it's full
        fogFalloff: 0.035,           // thinner with height (per metre)
        horizon: 0.55,               // rose toward the horizon at night
        bloomRadius: 0.75,           // softer, wider glow
        bloomBoost: 1.12,
      },
    },
  },

  // The run: free-roam driving between towns, picking up loot, packing it into the trunk
  // and selling it at the markets.
  dredge: {
    palette: PALETTE,
    spawn: { x: 0, z: 100, heading: 0 },   // York Road, just inside the city
    // Towns with a market (stop inside the radius to sell): the city, and Monkton, a village
    // at the York Road crossroads in the valley (county.js VILLAGE). `area` is how far out
    // the town's name shows when you arrive.
    towns: [
      { id: 'baltimore', town: 'Baltimore', name: 'Lexington Market', x: -44, z: 44, radius: 12 },
      { id: 'monkton', town: 'Monkton', name: 'Monkton General Store', x: 0, z: -660, radius: 12, area: 95 },
    ],
    // What each town pays, as a multiple of each kind's base value.
    prices: {
      baltimore: {
        'small-crate': 1.0, 'bottle-case': 1.1, sack: 0.85, barrel: 0.95, jugs: 1.0,
        crate: 1.2, 'long-crate': 0.9, coil: 1.15, keg: 1.05, strongbox: 1.0,
      },
      // The village pays well for what's scarce out there (bottled goods, kegs, cash) and
      // little for farm goods it has plenty of. PLACEHOLDERS: tune after playtesting.
      monkton: {
        'small-crate': 1.1, 'bottle-case': 1.35, sack: 0.7, barrel: 0.8, jugs: 1.3,
        crate: 1.0, 'long-crate': 1.2, coil: 0.85, keg: 1.4, strongbox: 1.15,
      },
    },
    market: {
      drift: 0.15,          // prices wander up to ±15% from one in-game day to the next
      glut: 0.06,           // each piece of a kind sold in a town knocks 6% off its next price
      glutFloor: 0.5,       // ... down to half price at worst
      recoverPerHour: 0.01, // and the price creeps back 1% per in-game hour
      stopSpeed: 3,         // m/s: slow to this inside a market to open it
      markerRange: 450,     // metres: a market's marker shows within this (the radar always does);
                            // each costs four draw calls, so a far town's stays hidden
    },
    // The trunk: a grid to pack loot into (the trunk upgrade grows it).
    trunk: { cols: 5, rows: 3 },
    // Upgrades, bought at a market. COSTS AND STEPS ARE PLACEHOLDERS: tune after playtesting.
    // `costs` are levels 1-3; each level adds `step` to the base value (trunk: `sizes` per
    // level, from the base 5x3 at level 0).
    upgrades: {
      trunk: { name: 'Bigger bed', desc: 'More room to pack: a wider, then deeper trunk, behind reinforced rails.', costs: [400, 1100, 2400], sizes: [[5, 3], [6, 3], [6, 4], [7, 4]] },
      engine: { name: 'Tuned engine', desc: 'Higher top speed and quicker off the line.', costs: [500, 1300, 2800], step: { maxSpeed: 3, accel: 2 } },
      handling: { name: 'Stiffer springs', desc: 'More grip and sharper steering.', costs: [400, 1000, 2200], step: { grip: 2.5, turnRate: 0.15 } },
      magnet: { name: 'Long arm', desc: 'Grab loot from further off the road.', costs: [300, 800, 1800], step: { pickupRadius: 1.2 } },
      spotter: { name: 'Spotter', desc: 'The radar shows loot further away.', costs: [250, 700, 1500], step: { mapRange: 60 } },
    },
    // Loot value tiers show through colour (palette names): low = olive, mid = brick and
    // cream, high = copper, premium = amber. The pickup glow behind each piece is faint and
    // cream for low and mid, copper for high, and a strong amber for premium.
    lootTiers: {
      low: { color: 'olive', accent: 'cream', glow: { color: 'cream', strength: 0.32, size: 0.9 } },
      mid: { color: 'brick', accent: 'cream', glow: { color: 'cream', strength: 0.4, size: 1 } },
      high: { color: 'copper', accent: 'amber', glow: { color: 'copper', strength: 0.9, size: 1.2 } },
      premium: { color: 'amber', accent: 'brick', glow: { color: 'amber', strength: 1.6, size: 1.9 } },
    },
    // Loot lying along the roads. `cells` is the piece's shape in the trunk grid ([col, row]
    // per cell, before rotation). VALUES AND WEIGHTS ARE PLACEHOLDERS: tune after
    // playtesting. `value` is the base price in dollars; `weight` how often it turns up;
    // `color` / `accent` (palette names) override the tier's colours; `short` labels the piece
    // in the trunk.
    loot: {
      count: 36,            // pieces lying out at once (a fixed pool)
      pickupRadius: 3.4,    // metres from the truck's centre
      respawn: 25,          // seconds before a picked-up piece turns up somewhere else
      respawnMin: 90,       // ... at least this far from the truck
      mapRange: 160,        // the radar shows pieces this close
      drawRange: 220,       // pieces further than this from the truck aren't drawn (fog hides them)
      scale: 1.25,          // a touch larger than life, to read at a distance
      emissive: 0.06,       // a faint neutral lift (x cream) so dark pieces don't vanish at night
      // The pickup glow sprite behind each piece: `size` metres up close, growing with
      // distance (x distance / `near`, up to `maxScale`) so loot still reads far down a road.
      glow: { size: 1.6, height: 0.6, opacity: 0.5, near: 25, maxScale: 3.5 },
      kinds: [
        { id: 'small-crate', name: 'Small crate', short: 'Small', tier: 'low', value: 20, weight: 0.18, cells: [[0, 0]] },
        { id: 'bottle-case', name: 'Bottle case', short: 'Bottles', tier: 'low', value: 35, weight: 0.14, cells: [[0, 0], [1, 0]] },
        { id: 'sack', name: 'Burlap sack', short: 'Sack', tier: 'low', value: 30, weight: 0.12, cells: [[0, 0], [0, 1], [1, 1]] },
        { id: 'barrel', name: 'Barrel', short: 'Barrel', tier: 'mid', value: 40, weight: 0.12, cells: [[0, 0], [0, 1]] },
        { id: 'jugs', name: 'Jug cluster', short: 'Jugs', tier: 'mid', color: 'cream', accent: 'brick', value: 55, weight: 0.1, cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
        { id: 'crate', name: 'Wooden crate', short: 'Crate', tier: 'mid', value: 60, weight: 0.1, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
        { id: 'long-crate', name: 'Long crate', short: 'Long', tier: 'mid', value: 50, weight: 0.08, cells: [[0, 0], [1, 0], [2, 0]] },
        { id: 'coil', name: 'Copper coil', short: 'Coil', tier: 'high', value: 75, weight: 0.07, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
        { id: 'keg', name: 'Aged keg', short: 'Keg', tier: 'high', value: 110, weight: 0.05, cells: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]] },
        { id: 'strongbox', name: 'Strongbox', short: 'Box', tier: 'premium', value: 150, weight: 0.04, cells: [[0, 0]] },
      ],
    },
  },
};

export const MS_TO_MPH = 2.237;
