// Every gameplay number lives here so balance can be tuned without touching game code.
// Units: distances in metres, speeds in metres/second (x 2.237 = mph), times in seconds.
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

  player: {
    maxSpeed: 38,         // ~85 mph
    accel: 18,
    brake: 42,
    reverseAccel: 10,
    reverseMax: 12,
    rolling: 4,           // coasting slowdown
    turnRate: 2.1,        // rad/s at low-to-mid speed
    grip: 12,             // how fast sideways sliding is killed
    handbrakeGrip: 1.8,
    radius: 1.45,         // two collision circles along the body
    circleOffset: 1.5,
  },

  police: {
    maxSpeed: 35,
    accel: 16,
    sightRange: 70,       // how far a pursuer can see you (needs clear line of sight)
    closeRange: 15,       // patrols see through the horse-box disguise this close
    catchRadius: 3.8,     // touching distance
    spawnMin: 150,        // spawn this far from the player, out of view
    spawnMax: 260,
    despawnDistance: 110, // leaving cars vanish once off-screen and this far away
    // Busted when a pursuer stays this close while you're this slow, for bustTime seconds.
    pinRadius: 7.5,
    pinSpeed: 4,          // m/s (~9 mph)
    bustTime: 2.0,
    bustRecover: 0.8,     // how fast the bust bar drains once you break free (per second)
  },

  heat: {
    max: 3,
    // Informants (the Temperance Alliance's civilian network) tip off the police while
    // you haul shine. Suspicion fills at this rate; at 1.0 you get your first star.
    tipOffRate: 0.06,
    // While a pursuer can see you and you're carrying, heat climbs toward 3 stars.
    buildRateSeen: 0.1,
    // Seconds you must stay out of every pursuer's sight to shed one star, per star level.
    evadeTime: [0, 5, 7, 9],
    // Horse-box disguise (after the Jockey joins): under this speed with shine aboard you
    // look like a thoroughbred on its way to the races.
    disguiseSpeed: 13.4,      // m/s (30 mph)
    disguiseSuspicion: 0.25,  // suspicion builds this much slower while disguised
  },

  mission: {
    markerRadius: 7,
    // Act I: the zealots come out of the smoke this far behind you, and hold back this many
    // seconds so you can get moving.
    escape: { gap: 50, headStart: 2.5 },
    minPickupDistance: 150,   // stills never spawn on top of you
    minDropDistance: 180,
    // Order book at the still. Pay = jugs x price x (1 + distance / 900).
    orders: [
      { id: 'small', label: 'Small batch', jugs: 12, price: 42, heat: 1.0 },
      { id: 'standard', label: 'Standard run', jugs: 24, price: 46, heat: 1.6 },
      { id: 'big', label: 'Big order', jugs: 40, price: 52, heat: 2.3, tipOff: true, needsBigOrders: true },
    ],
  },

  // The garage's 1925 Rolls-Royce Phantom I: a gentleman's motor car. Faster, and the
  // informants suspect it less, but it can't tow the horse box (no disguise, no armoured
  // box) and the trunk only holds so many jugs (no big orders).
  rolls: {
    cost: 8000,
    speed: 1.15,          // top speed x (on top of the engine upgrades)
    accel: 1.1,
    suspicion: 0.6,       // tip-offs build this much as fast
    trunkJugs: 24,
  },

  camera: {
    distance: 15,         // far enough back to see the horse trailer
    height: 7.2,          // high enough to see the road over it
    noTrailer: 0.72,      // distance and height x when there's no horse box to see over (the Rolls)
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
      truck: 'assets/runner.glb',          // Otto's truck
      fed: 'assets/bureau-sedan.glb',      // Prohibition Bureau sedans
      lamp: 'assets/arc-lamp.glb',         // street lamps
      rolls: 'assets/rolls-royce.glb',     // the garage's Rolls-Royce
    },
    modelReflections: 0.35,          // how much a textured model (the truck) mirrors the street
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
    },
  },

  // Dredge run (?mode=dredge): free-roam driving between towns, picking up loot, packing it
  // into the trunk and selling it. Built beside the bootlegging loop until it replaces it.
  dredge: {
    spawn: { x: 0, z: 100, heading: 0 },   // York Road, just inside the city
    // Arcade handling: sticks to the road, turns sharply even when slow, keeps turning at
    // speed, and glances off walls instead of bouncing back. (Fields not listed here keep
    // their CONFIG.player values.)
    car: {
      maxSpeed: 38,
      accel: 24,            // quicker off the line
      brake: 50,
      turnRate: 2.4,
      steerRamp: 1.5,       // full steering from 1.5 m/s (the bootleg truck needs 4)
      steerFalloff: 0.15,   // barely loses steering at top speed (0.4 in the truck)
      grip: 20,             // sideways slide dies fast: no spinning out
      handbrakeGrip: 3.5,   // a short, controllable handbrake slide
      bounce: 1.05,         // walls deflect rather than throw you back
      wallKeep: 0.99,       // and cost little speed
    },
    // The trunk: a grid to pack loot into (upgrades will grow it).
    trunk: { cols: 5, rows: 3 },
    // Loot lying along the roads. `cells` is the piece's shape in the trunk grid ([col, row]
    // per cell, before rotation); `value` is its base price in dollars.
    loot: {
      count: 36,            // pieces lying out at once (a fixed pool)
      pickupRadius: 3.4,    // metres from the truck's centre
      respawn: 25,          // seconds before a picked-up piece turns up somewhere else
      respawnMin: 90,       // ... at least this far from the truck
      mapRange: 160,        // the radar shows pieces this close
      kinds: [
        { id: 'case', name: 'Case of rye', value: 25, weight: 0.3, cells: [[0, 0]] },
        { id: 'barrel', name: 'Cask', value: 40, weight: 0.22, cells: [[0, 0], [0, 1]] },
        { id: 'crate', name: 'Crate of oysters', value: 70, weight: 0.18, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
        { id: 'sack', name: 'Sack of coffee', value: 45, weight: 0.18, cells: [[0, 0], [0, 1], [1, 1]] },
        { id: 'radio', name: 'Cathedral radio', value: 90, weight: 0.12, cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
      ],
    },
  },
};

export const MS_TO_MPH = 2.237;
