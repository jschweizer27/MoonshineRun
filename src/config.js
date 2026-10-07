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
    // Towns with a market (stop inside the radius to sell): the city, Monkton at the York
    // Road crossroads in the valley, Glyndon out west and Cockeysville out east (county.js
    // VILLAGES). `area` is how far out the town's name shows when you arrive. A town with a
    // `rank` only deals with Otto from that rank on (its marker and route wait till then),
    // and has no market events or market days (those are the same for every player).
    towns: [
      { id: 'baltimore', town: 'Baltimore', name: 'Lexington Market', x: -44, z: 44, radius: 12 },
      { id: 'monkton', town: 'Monkton', name: 'Monkton General Store', x: 0, z: -660, radius: 12, area: 95 },
      { id: 'glyndon', town: 'Glyndon', name: 'Glyndon Depot', x: -390, z: -690, radius: 12, area: 90 },
      { id: 'cockeysville', town: 'Cockeysville', name: 'Cockeysville Quarry Store', x: 400, z: -650, radius: 12, area: 90, rank: 2 },
    ],
    // What each town pays, as a multiple of each kind's base value.
    prices: {
      baltimore: {
        'small-crate': 1.0, 'bottle-case': 1.1, sack: 0.85, barrel: 0.95, jugs: 1.0,
        crate: 1.2, 'long-crate': 0.9, coil: 1.15, keg: 1.05, strongbox: 1.0,
        bicycle: 1.1, radio: 1.25, 'sewing-machine': 1.0,
        'pocket-watch': 0.6, bonds: 1.8,   // the city's brokers buy bonds
      },
      // The village pays well for what's scarce out there (bottled goods, kegs, cash) and
      // little for farm goods it has plenty of. PLACEHOLDERS: tune after playtesting.
      monkton: {
        'small-crate': 1.1, 'bottle-case': 1.35, sack: 0.7, barrel: 0.8, jugs: 1.3,
        crate: 1.0, 'long-crate': 1.2, coil: 0.85, keg: 1.4, strongbox: 1.15,
        bicycle: 1.2, radio: 0.9, 'sewing-machine': 1.3,
        'pocket-watch': 1.8, bonds: 0.6,   // the village jeweller wants the watch
      },
      // Glyndon's rail depot ships crates and copper to the city: it pays for those, and
      // little for what the farms round it have plenty of. PLACEHOLDERS: tune after playtesting.
      glyndon: {
        'small-crate': 1.05, 'bottle-case': 0.85, sack: 0.95, barrel: 1.0, jugs: 0.7,
        crate: 1.25, 'long-crate': 1.35, coil: 1.4, keg: 0.9, strongbox: 1.2,
        bicycle: 0.9, radio: 1.0, 'sewing-machine': 0.85,
        'pocket-watch': 0.6, bonds: 0.6,
      },
      // Cockeysville's quarry company store: copper for the blasting wire, kegs and barrels
      // for the quarrymen, stout crates; little for the parlour. PLACEHOLDERS: tune after
      // playtesting.
      cockeysville: {
        'small-crate': 1.0, 'bottle-case': 1.2, sack: 0.8, barrel: 1.3, jugs: 1.1,
        crate: 1.3, 'long-crate': 1.2, coil: 1.55, keg: 1.35, strongbox: 1.1,
        bicycle: 0.9, radio: 0.75, 'sewing-machine': 0.7,
        'pocket-watch': 0.6, bonds: 0.6,
      },
    },
    market: {
      drift: 0.15,          // prices wander up to ±15% from one in-game day to the next
      glut: 0.06,           // each piece of a kind sold in a town knocks 6% off its next price
      glutFloor: 0.5,       // ... down to half price at worst
      recoverPerHour: 0.03, // and the price creeps back 3% per in-game hour (~4.5% a real minute)
      stopSpeed: 3,         // m/s: slow to this inside a market to open it
      markerRange: 450,     // metres: a market's marker shows within this (the radar always does);
                            // each costs four draw calls, so a far town's stays hidden
      // Each in-game day from the second on, one town pays this multiple for one kind of
      // loot (rolled from the day, so it's the same for everyone). PLACEHOLDER: tune.
      event: { multiplier: 2 },
    },
    // The trunk: a grid to pack loot into (the trunk upgrade grows it).
    trunk: { cols: 5, rows: 3 },
    // Upgrades, bought at a market. Costs are set from a measured economy (an autopilot
    // earns ~$150-200 a game minute): the first upgrades come within a few minutes, all
    // fifteen levels in about an hour. Steps are still placeholders for playtesting.
    // `costs` are levels 1-3; each level adds `step` to the base value (trunk: `sizes` per
    // level, from the base 5x3 at level 0).
    upgrades: {
      // `ranks`: the rank each level needs (levels 4 and 5 come with rank).
      trunk: { name: 'Bigger bed', desc: 'More room to pack: a wider, then deeper trunk, behind reinforced rails.', costs: [300, 800, 1700, 3200, 5000], ranks: [0, 0, 0, 2, 4], sizes: [[5, 3], [6, 3], [6, 4], [7, 4], [8, 4], [8, 5]] },
      engine: { name: 'Tuned engine', desc: 'Higher top speed and quicker off the line.', costs: [350, 900, 1900, 3400, 5200], ranks: [0, 0, 0, 2, 4], step: { maxSpeed: 3, accel: 2 } },
      handling: { name: 'Stiffer springs', desc: 'More grip and sharper steering.', costs: [300, 750, 1500, 2800, 4400], ranks: [0, 0, 0, 2, 4], step: { grip: 2.5, turnRate: 0.15 } },
      magnet: { name: 'Long arm', desc: 'Grab loot from further off the road.', costs: [250, 600, 1200, 2200, 3600], ranks: [0, 0, 0, 2, 4], step: { pickupRadius: 1.2 } },
      spotter: { name: 'Spotter', desc: 'The radar shows loot further away.', costs: [200, 500, 1000, 1900, 3000], ranks: [0, 0, 0, 2, 4], step: { mapRange: 60 } },
      tyres: { name: 'Farm tyres', desc: 'Less bogging down in the fields, less sliding in the rain.', costs: [300, 700, 1500], ranks: [1, 1, 2], step: { field: 0.08, wet: 0.25 } },
      lamps: { name: 'Spotlamps', desc: 'Brighter headlamps for the night roads.', costs: [250, 600, 1200], ranks: [1, 1, 2], step: { light: 0.25 } },
      plating: { name: 'Steel plating', desc: 'Hard knocks wear the truck less.', costs: [400, 900, 1800], ranks: [2, 2, 3], step: { wear: 0.25 } },
      falsebottom: { name: 'False bottom', desc: 'A hidden space under the bed: a checkpoint search misses this many crates of shine.', costs: [900, 2000], ranks: [2, 3], step: { hidden: 2 } },
    },
    // Loot value tiers show through colour (palette names): low = olive, mid = brick and
    // cream, high = copper, premium = amber. The pickup glow behind each piece is faint and
    // cream for low and mid, copper for high, and a strong amber for premium.
    // Otto's barn, the home base: stop in its yard to open it. The stash holds this many
    // trunk cells' worth of loot. PLACEHOLDERS: tune after playtesting.
    barn: { radius: 9, stashCells: 40 },
    // Traffic (src/traffic.js): up to `count` vehicles out near the camera in the city,
    // `county` in the valley, x `night` late at night; they turn up `spawn` metres away
    // (out of sight) and go beyond `despawn`. `mix`: the share of motor cars and vans (the
    // rest are horse carts); `speeds` (m/s) for each; `lane` metres right of the road's
    // middle; `gap` metres kept behind whatever's ahead; `radius` / `offset` their two
    // collision circles; `stun` seconds a car stops after a knock; a hit harder than
    // `spill` (m/s) throws a piece out of the trunk. PLACEHOLDERS: tune after playtesting.
    traffic: { count: 8, county: 3, night: 0.5, spawn: [90, 220], despawn: 260, mix: [0.5, 0.3], speeds: [11, 9, 5], lane: 2.2, gap: 7, radius: 1.1, offset: 1.3, stun: 1.5, spill: 11 },
    // Road events (src/roadevents.js): every `hours` game hours there's a `chance` of one
    // (a washout, a broken-down cart, a fog bank, a market day), lasting the first `lasts`
    // share of that time; the slots start `offset` hours after midnight, so an event never
    // turns up at the same moment as the day's market demand. A blocked road's barrier is
    // `span` metres across; on market day the town pays `marketDay` x. PLACEHOLDERS: tune
    // after playtesting.
    roadEvents: { hours: 4, offset: 2, chance: 0.6, lasts: 0.75, span: 14, marketDay: 1.15 },
    // Ranks: reputation (contracts, brews, rare finds) lifts Otto through them; each unlocks
    // recipes (CONFIG.dredge.brew), upgrade levels (`ranks` on each upgrade), abilities and,
    // at the top, the brewery deed. Reputation: a contract's pay / contracts.repPer, a brew's
    // quality x `repPerBrew`, `repPerFind` a rare find. PLACEHOLDERS: tune after playtesting.
    ranks: [
      { name: 'Junk Hauler', rep: 0 },
      { name: 'Scavenger', rep: 30, unlocks: 'Applejack, Jockey’s Tip (1), tyres and lamps' },
      { name: 'Runner', rep: 90, unlocks: 'Lead Foot (2), steel plating, upgrade level 4, the Cockeysville Quarry Store' },
      { name: 'Brewer', rep: 150, unlocks: 'Barrel Rye, Sweet Talk (3), Sheriff Hale’s jobs' },
      { name: 'Bootlegger', rep: 250, unlocks: 'Highlandtown Lager, upgrade level 5' },
      { name: 'King of York Road', rep: 360, unlocks: 'the Braun & Sons deed, at Lexington Market' },
    ],
    repPerBrew: 6,
    repPerFind: 5,
    // Abilities (keys 1-3, the D-pad's left / up / right, or the HUD chips), each from a rank:
    // the Jockey's Tip shows every salvage site on the radar for `seconds`; Lead Foot opens
    // the engine up (`speed` / `accel` x) for `seconds`; Sweet Talk adds `bonus` to the next
    // sale or job. `cooldown` seconds before each can be used again.
    abilities: {
      tip: { name: 'Jockey’s Tip', key: '1', rank: 1, seconds: 30, cooldown: 120 },
      leadfoot: { name: 'Lead Foot', key: '2', rank: 2, seconds: 6, cooldown: 60, speed: 1.25, accel: 1.4 },
      sweet: { name: 'Sweet Talk', key: '3', rank: 3, cooldown: 180, bonus: 0.2 },
    },
    // The ending: buy back the Braun & Sons brewery deed at Lexington Market, at the top rank.
    deed: { cost: 20000, rank: 5, town: 'baltimore' },
    // Brewing at Otto's still (src/brew.js), in three phases:
    // 1. The fire (`seconds`): hold STOKE to raise the temperature (`heat.up` a second), let
    //    go and it falls (`heat.down`), keeping it in a band that drifts around
    //    `band.center`; scorching is time above `scorch`. Each copper coil installed raises
    //    the still a level (up to `maxLevel`), widening the band and the cuts' margin
    //    (`levelTol` more a level).
    // 2. The cuts (`cuts.seconds`): the run comes off the still, heads, then hearts, then
    //    tails. Press to cut into the hearts jar at the recipe's first mark and out of it
    //    at the second, within `tol` (a share of the run). Cutting early lets heads (poison)
    //    into the hearts: more than `tol` early is a bad batch. A cut missed altogether is
    //    the worst of both.
    // 3. Proofing (`proof.seconds`): the bead swings across the gauge; press once as it
    //    crosses the recipe's proof line.
    // Quality is the phases weighted by `weights`, graded by `grades` (best first), and
    // sets the crates (`yields`: [least quality, crates]). Each recipe has its own pattern:
    // `heat` and `drift` scale the fire, `hearts` are the two marks, `tol` the cut margin,
    // `proof` the line. Crates of one recipe on hand are one blend (src/brew.js `blend`):
    // its grade sets the price (`gradePrice`); a bad batch taints it until it's all gone,
    // and selling tainted shine blinds someone (`badRep` reputation lost). A recipe needs
    // its ingredients (loot kinds, from the trunk and the stash) and a rank.
    // PLACEHOLDERS: tune after playtesting.
    brew: {
      maxLevel: 3,
      seconds: 18,
      heat: { up: 0.42, down: 0.3 },
      band: { center: 0.55, width: [0.2, 0.26, 0.32], drift: 0.16, speed: 0.55 },
      scorch: 0.95,
      cuts: { seconds: 9, lead: 0.4, levelTol: 0.25 },
      proof: { seconds: 6, swing: 0.42, speed: 2.6, speedUp: 0.25, tol: 0.05 },
      weights: { fire: 0.4, cuts: 0.4, proof: 0.2 },
      grades: [['A', 0.78], ['B', 0.5], ['C', 0]],
      gradePrice: { A: 1.4, B: 1, C: 0.65 },
      badRep: 30,
      yields: [[0.8, 3], [0.45, 2], [0, 1]],
      recipes: [
        { id: 'corn-shine', needs: { sack: 1, jugs: 1 }, rank: 0, heat: 1, drift: 1, hearts: [0.25, 0.75], tol: 0.06, proof: 0.6 },
        { id: 'applejack', needs: { 'small-crate': 2, jugs: 1 }, rank: 1, heat: 1.35, drift: 1.25, hearts: [0.3, 0.72], tol: 0.05, proof: 0.52 },
        { id: 'rye', needs: { sack: 2, barrel: 1, jugs: 1 }, rank: 3, heat: 1, drift: 1.1, hearts: [0.38, 0.64], tol: 0.035, proof: 0.68 },
        { id: 'lager', needs: { sack: 2, barrel: 1, keg: 1 }, rank: 4, heat: 0.85, drift: 0.9, hearts: [0.3, 0.7], tol: 0.045, proof: 0.4 },
      ],
    },
    // Breakage: a knock harder than `from` m/s can break the fragile pieces aboard (the
    // `kinds` listed, and every brewed kind), each with `perMs` chance a m/s over `from`
    // (at most `max`). PLACEHOLDERS: tune after playtesting.
    breakage: { from: 13, perMs: 0.05, max: 0.7, kinds: ['jugs', 'bottle-case'] },
    // Revenue agents (src/police.js): Prohibition Bureau sedans from a pool of `pool`.
    // Patrols cruise the roads near the truck: `patrols` of them by day and by night, in the
    // city and the county. A patrol sees ahead in a cone (`cone` radians either side, out to
    // `sight` metres, x `nightSight` after dark with the headlamps on, x `darkSight` with
    // them off), needing a clear line of sight; one already after you sees all round.
    // Being seen with shine aboard is heat (0-3): spotted is 1 (the spotter follows), and
    // being seen builds toward the next (`buildRate` a second): 2 brings a second car and a
    // roadblock on your route, 3 every car. Out of every agent's sight for `evadeTime[tier]`
    // seconds drops a tier. Pinned (an agent within `pinRadius` while you're under
    // `pinSpeed`) for `bustTime` seconds is a bust: the shine is taken, a `fine` share of the
    // cash (at least `fineMin`), and Otto wakes at the barn. Agents drive at `maxSpeed` /
    // `accel` (x `boost` at heat 3), spawn `spawn` metres off (out of view) and go beyond
    // `despawn`. The York Road `checkpoint` stands at the city gap at night: stop there and
    // they search the trunk (the false bottom hides `hidden` crates); run it with shine
    // aboard and it's heat 2. PLACEHOLDERS: tune after playtesting.
    police: {
      pool: 4, patrols: { day: { city: 1, county: 0 }, night: { city: 2, county: 2 } },
      cone: 0.75, sight: 70, nightSight: 0.8, darkSight: 0.4, closeSight: 12,
      buildRate: 0.12, evadeTime: [0, 6, 8, 10], max: 3,
      pinRadius: 7.5, pinSpeed: 4, bustTime: 2.2, bustRecover: 0.8,
      fine: 0.25, fineMin: 50,
      maxSpeed: 33, accel: 15, boost: 1.15, spawn: [160, 360], despawn: 420,
      roadblockEvery: 18, mapRange: 160,
      checkpoint: { x: 0, z: -262, radius: 14, hours: [20, 6], stopSpeed: 3 },
    },
    // Contracts (src/contracts.js): each in-game day posts `perDay` jobs, a `farmShare` of
    // them from the farms (who want `farmWants`) and the rest from the speakeasies (who want
    // `barWants`, or `shine` once Otto brews). A job pays its goods' value x `payMult`, earns
    // pay / `repPer` reputation, and is due within `hours` (game hours) of being taken;
    // missing it costs `failRep`. Deliver by stopping within `radius` of the contact.
    // PLACEHOLDERS: tune after playtesting.
    contracts: {
      perDay: 3, farmShare: 0.5, payMult: 1.7, repPer: 20, failRep: 15, hours: [8, 16], radius: 9,
      farmWants: ['sewing-machine', 'bicycle', 'radio', 'crate', 'long-crate', 'small-crate', 'sack', 'barrel'],
      barWants: ['bottle-case', 'jugs', 'barrel', 'keg'],
      shine: ['corn-shine', 'applejack', 'rye', 'lager'],
    },
    // The speakeasies (world.drops) buy shine, stopped at within `radius`.
    speakeasy: { radius: 9 },
    // Wear: hard knocks (an impact over `from`) wear the truck, and a worn truck loses up
    // to `maxSlow` of its top speed until it's repaired at the barn (`repairCost` for a
    // full repair, less for less). A hard 28 m/s crash wears about 12%.
    wear: { from: 8, perImpact: 0.006, maxSlow: 0.25, repairCost: 350, warnAt: 0.5 },
    // Salvage sites (src/salvage.js): where the loot is now. `count` sites in the county and
    // `city` back-alley cellars in the city, fixed for a layout. Stop inside a site's ring
    // (`radius` metres) to work it: a mini-game (pry or search) whose score sets how many
    // pieces it gives up (1-3) and how good they are. A worked site refills after
    // `refillDays` game days; a `nightShare` of the sites can only be worked at night
    // (`night` hours). PLACEHOLDERS: tune after playtesting.
    salvage: {
      count: 18, city: 5, radius: 7, refillDays: [1, 2], nightShare: 0.25, night: [20, 6],
      kinds: {
        wreck: { name: 'Wrecked truck', game: 'pry', color: '#7a5236', yields: { crate: 3, 'small-crate': 3, 'long-crate': 2, keg: 1, 'bottle-case': 2, jugs: 2 } },
        farmhouse: { name: 'Abandoned farmhouse', game: 'search', color: '#9c8a64', yields: { sack: 4, jugs: 3, barrel: 2, 'sewing-machine': 1, radio: 1, bicycle: 1 } },
        siding: { name: 'Rail siding', game: 'pry', color: '#5a6066', yields: { coil: 3, barrel: 2, 'long-crate': 2, crate: 2, keg: 1 } },
        cellar: { name: 'Back-alley cellar', game: 'search', color: '#6a4e3a', yields: { 'bottle-case': 3, jugs: 2, keg: 2, strongbox: 1, radio: 1 } },
      },
      // Pry: a needle sweeps the ring and turns back at each hit; press inside a green arc.
      // `arcs` to hit within `seconds`, `strikes` misses and the wood splinters.
      pry: { seconds: 10, arcs: 3, arcWidth: 0.55, speed: 2.4, speedUp: 0.6, strikes: 3 },
      // Search: `goods` of 9 spots hold something; they glint for `glint` seconds, then the
      // lamp burns for `seconds` while you pick `picks` spots.
      search: { seconds: 8, spots: 9, goods: 4, glint: 1.1, picks: 3 },
    },
    lootTiers: {
      low: { color: 'olive', accent: 'cream', glow: { color: 'cream', strength: 0.32, size: 0.9 } },
      mid: { color: 'brick', accent: 'cream', glow: { color: 'cream', strength: 0.4, size: 1 } },
      high: { color: 'copper', accent: 'amber', glow: { color: 'copper', strength: 0.9, size: 1.2 } },
      premium: { color: 'amber', accent: 'brick', glow: { color: 'amber', strength: 1.6, size: 1.9 } },
      brewed: { color: 'cream', accent: 'copper', glow: { color: 'amber', strength: 0.8, size: 1.1 } },
    },
    // Loot lying along the roads. `cells` is the piece's shape in the trunk grid ([col, row]
    // per cell, before rotation). VALUES AND WEIGHTS ARE PLACEHOLDERS: tune after
    // playtesting. `value` is the base price in dollars; `weight` how often it turns up;
    // `color` / `accent` (palette names) override the tier's colours; `short` labels the piece
    // in the trunk.
    loot: {
      // v4: no loose loot in the streets (salvage sites took its place). The pool is kept
      // for pieces thrown out of the trunk in a crash, lying on the road to pick up.
      scatter: false,
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
        { id: 'small-crate', name: 'Small crate', short: 'Small', tier: 'low', value: 20, weight: 0.15, cells: [[0, 0]] },
        { id: 'bottle-case', name: 'Bottle case', short: 'Bottles', tier: 'low', value: 35, weight: 0.12, cells: [[0, 0], [1, 0]] },
        { id: 'sack', name: 'Burlap sack', short: 'Sack', tier: 'low', value: 30, weight: 0.1, cells: [[0, 0], [0, 1], [1, 1]] },
        // A bicycle: cheap and awkward, an arch of five cells (a wheel at each end).
        { id: 'bicycle', name: 'Bicycle', short: 'Bike', tier: 'low', value: 40, weight: 0.05, cells: [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1]] },
        { id: 'barrel', name: 'Barrel', short: 'Barrel', tier: 'mid', value: 40, weight: 0.1, cells: [[0, 0], [0, 1]] },
        { id: 'jugs', name: 'Jug cluster', short: 'Jugs', tier: 'mid', color: 'cream', accent: 'brick', value: 55, weight: 0.09, cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
        { id: 'crate', name: 'Wooden crate', short: 'Crate', tier: 'mid', value: 60, weight: 0.09, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
        { id: 'long-crate', name: 'Long crate', short: 'Long', tier: 'mid', value: 50, weight: 0.07, cells: [[0, 0], [1, 0], [2, 0]] },
        // A cathedral radio set: an L of four (the cabinet and its horn speaker).
        { id: 'radio', name: 'Radio set', short: 'Radio', tier: 'mid', value: 70, weight: 0.05, cells: [[0, 0], [0, 1], [0, 2], [1, 2]] },
        { id: 'coil', name: 'Copper coil', short: 'Coil', tier: 'high', value: 75, weight: 0.06, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
        { id: 'keg', name: 'Aged keg', short: 'Keg', tier: 'high', value: 110, weight: 0.05, cells: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]] },
        // A treadle sewing machine on its table: a P of five.
        { id: 'sewing-machine', name: 'Sewing machine', short: 'Sewing', tier: 'high', value: 105, weight: 0.03, cells: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1]] },
        { id: 'strongbox', name: 'Strongbox', short: 'Box', tier: 'premium', value: 150, weight: 0.04, cells: [[0, 0]] },
        // Rare finds: never in the normal scatter (weight 0, `rare`); one turns up now and then
        // (`rare` below) and pays big at one town (`paysAt`), little anywhere else.
        { id: 'pocket-watch', name: 'Gold pocket watch', short: 'Watch', tier: 'premium', rare: true, paysAt: 'monkton', value: 200, weight: 0, cells: [[0, 0]] },
        { id: 'bonds', name: 'Case of bonds', short: 'Bonds', tier: 'premium', rare: true, paysAt: 'baltimore', value: 240, weight: 0, cells: [[0, 0], [0, 1]] },
        // Brewed at Otto's still (CONFIG.dredge.brew), never found on the roads (weight 0,
        // `brewed`), and sold only at the city's speakeasies.
        { id: 'corn-shine', name: 'Corn Shine', short: 'Corn', tier: 'brewed', brewed: true, value: 70, weight: 0, cells: [[0, 0], [1, 0]] },
        { id: 'applejack', name: 'Applejack', short: 'Apple', tier: 'brewed', brewed: true, accent: 'olive', value: 95, weight: 0, cells: [[0, 0], [1, 0]] },
        { id: 'rye', name: 'Barrel Rye', short: 'Rye', tier: 'brewed', brewed: true, accent: 'brick', value: 130, weight: 0, cells: [[0, 0], [1, 0], [0, 1]] },
        { id: 'lager', name: 'Highlandtown Lager', short: 'Lager', tier: 'brewed', brewed: true, accent: 'amber', value: 170, weight: 0, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
      ],
      // One rare find at a time, out in the county. Seconds of driving. PLACEHOLDERS: tune.
      rare: {
        first: 120,         // the first turns up this long into a run
        every: 420,         // the next, this long after one is taken or lost
        lasts: 180,         // left lying, it's gone after this long (someone else found it)
        minDistance: 350,   // metres from the truck when it turns up
        glow: 1.8,          // its glow, times a premium piece's
      },
    },
  },
};

export const MS_TO_MPH = 2.237;
