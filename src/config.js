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
    minPickupDistance: 150,   // stills never spawn on top of you
    minDropDistance: 180,
    // Order book at the still. Pay = jugs x price x (1 + distance / 900).
    orders: [
      { id: 'small', label: 'Small batch', jugs: 12, price: 42, heat: 1.0 },
      { id: 'standard', label: 'Standard run', jugs: 24, price: 46, heat: 1.6 },
      { id: 'big', label: 'Big order', jugs: 40, price: 52, heat: 2.3, tipOff: true, needsBigOrders: true },
    ],
  },

  camera: {
    distance: 15,         // far enough back to see the horse trailer
    height: 7.2,          // high enough to see the road over it
    fov: 62,              // chase feel (lag, pull-back, FOV kick, shake) is in src/juice.js
  },

  // The night look: moody noir, warm amber lamps against deep teal shadows. Colors are hex,
  // intensities in three.js physical units. Day values blend in with the daylight cycle.
  look: {
    exposure: 1.1,                   // ACES filmic tone mapping exposure
    sky: 0x0a1320,                   // night sky and fog: blue-black
    fogDensity: 0.0068,              // exponential fog: ~35% at 100 m, ~80% at 200 m
    dayFogDensity: 0.0022,
    fogWeatherDensity: 0.016,        // in fog weather
    ambientSky: 0x3f7890,            // hemisphere fill: teal from above...
    ambientGround: 0x1a120c,         // ...warm dark from below
    ambient: 1.7,
    moon: 0x9db6ff,                  // cool moonlight, the shadow-casting key light
    moonIntensity: 1.9, 
    windowGlow: 0.62,                // lit windows (warm amber)
    windowsLit: 0.3,                 // share of windows lit at night
    shadowRange: 70,                 // metres of shadow around the view (high: 2048 map)
  },
};

export const MS_TO_MPH = 2.237;
