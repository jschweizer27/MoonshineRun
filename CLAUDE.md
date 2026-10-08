# SHINE — project guide for Claude

SHINE is a 1920s Baltimore driving game (Otto Braun, Baltimore/Green Spring Valley): free
roam, loot along the roads, a Tetris-style trunk to pack, three market towns to sell in and
upgrades to buy, built as a browser demo with Three.js. `ue5/` holds a UE5 C++ scaffold
frozen at the game's earlier bootlegging design. Design sources: the "Shine Game Treatment"
(story/factions) and "Moonshine Run Dev Guide" (5-phase UE5 plan).

## Run, test, build
- `npm start` — local server + opens the browser (plays the unbundled source; no build step).
- `npm run verify` — everything CI runs: `check` (syntax, vendored Three.js, UE5 static
  checks), `lint`,
  `build`, `test` (Playwright playtests). Run it before pushing.
- `npm test -- tests/dredge.spec.js -g "Lexington Market"` — one test. Screenshots land in
  `artifacts/screenshots/`.
- URL flags: `?debug` (overlay + `window.shine` test API), `?test` (API, deterministic: the
  clock stands still and the painterly pass is off; `&time` / `&painterly` turn them back
  on), `?seed=N` (city layout and the loot it seeds).

## Layout
- `src/main.js` game loop + state machine; `step(dt, input)` is the single simulation step
  (tests call it through `window.shine.step(seconds, input)` at a fixed 60 Hz; it stops
  early when the game pauses, e.g. a pickup opening the trunk).
- `src/config.js` — **all gameplay tuning numbers**. Change balance here, not in code.
  `CONFIG.player` is the truck, `CONFIG.dredge` the run (below), `CONFIG.look` the night
  palette (exposure, FogExp2, teal fill, moonlight, the painterly pass).
- The run (it was built as "the dredge run" beside the old bootlegging loop, which it
  replaced; the code still says dredge): loot (`loot.js`, pooled, one InstancedMesh for every
  kind: the kinds share one geometry tagged per vertex (`aKind`) and each piece picks its own
  (`iKind`), so all the loot is one draw call; `loot.kindIndex(id)`, `loot.drawn[k]`; the
  pool's last slot is the rare find, timed by `loot.rare` and kept out of the scatter and
  the daily demand), the trunk grid (`trunk.js` logic, `trunkscreen.js` screen), markets (`market.js`:
  drift and gluts; `marker.js` the markers) and upgrades, all saved in one of three slots
  (`dredgecareer.js`: cash, the trunk, upgrade levels, market memory, stats, ledger; slot 1
  is `shine.dredge.v1`, slots 2 and 3 add `.s2` / `.s3`, `shine.dredge.slot` is the last one
  played; `showSlots` in `screens.js` is the Saved Games screen).
  `main._applyPerks` turns the upgrade levels into the truck's tuning, `game.perks`
  (pickup radius, radar range, trunk size) and the truck's look. `CONFIG.dredge` holds the
  palette, towns, prices, market, trunk, upgrades and loot; the palette themes every screen
  through `--d-*` CSS variables under `html.dredge` (set by `hud.js`). A market's marker
  costs four draw calls, so only the one nearest the camera shows, within
  `market.markerRange`. A town with a `rank` (Cockeysville) only deals with Otto from that
  rank (`market.townOpen`): until then `main._nearestMarket` skips it (so does the route), its
  marker is off, the radar shows it barred (`market-closed`) and `main._checkClosed` says
  when. Market events and market days only come to the towns without one (`openTowns`).
  Everything seeded after the city layout (the atlas, rooflines, the village) draws from its
  own random stream, so the layout of every seed stays put.
- Otto's barn (`world.home`, a `county.js` barn with a stop point `stopX/stopZ` in its yard;
  `CONFIG.dredge.barn`): `main.openBarn` / `showBarn` (stash as counts per kind in
  `data.stash`, capped in trunk cells; the garage repairs `data.wear`, which hard knocks add
  in `main._wear` and `_applyPerks` turns into lost top speed; `CONFIG.dredge.wear`). Its
  marker joins `main.markers`, where only the nearest marker shows.
- Brewing: `src/brew.js` is pure logic (recipes in `CONFIG.dredge.brew`, ingredients from the
  trunk and the stash, `newBatch` / `stepBatch` / `quality` / `yieldFor`); `showStill` in
  `screens.js` runs a batch on its own clock (`manual()` + `step()` in tests). Brewed kinds
  are loot kinds with `brewed: true` (weight 0); `market.buys` keeps them out of the markets
  and lets the speakeasies (`world.drops`, town ids `drop:<n>`) buy only them.
- Contracts: `src/contracts.js` is pure logic (`contacts(world)`: the speakeasies and farms,
  and Sheriff Hale's lockup in Cockeysville from his `rank`; `offersFor(day, ...)` rolls the
  day's jobs like `eventFor`; `progress` / `handOver`). Every contact is a character: `who`
  on `DROPS` (world.js) and `BARNS` (county.js) names a `CAST` entry in `story.js`, whose
  `asks` lines go on the board with each job (`line`).
  `main._jobs()` is the board the market and barn screens show; `data.contract` is the job in
  hand (`due` in game hours), `data.taken` the offers already taken, `data.rep` the standing it
  earns. `main._checkContract` delivers (stop at the contact) or loses it when late; its
  marker is one of `main.jobMarkers`, under the nearest-marker rule.
- Ranks and abilities: `data.rep` (contracts, brews, rare finds; `main._addRep`) sets
  `data.rank` against `CONFIG.dredge.ranks`; ranks gate recipes, upgrade levels (`ranks` on each
  upgrade, `dredgecareer.lockedRank`) and the abilities (`CONFIG.dredge.abilities`,
  `main.useAbility`, HUD chips in `#abilities`; actions `ability1-3`, the d-pad's left / up /
  right while driving). The ending is the deed (`CONFIG.dredge.deed`, bought in
  `main._deed` at Lexington Market), which sets `flags.deed` for the last story beat.
- Traffic: `src/traffic.js`, a pool of `CONFIG.dredge.traffic.count` kinematic vehicles on
  the road graph near the camera (right-hand lane, turning at junctions, keeping a gap),
  drawn as one InstancedMesh with the loot's kind-selecting trick (three bodies). They join
  `main._cars` (props). `Traffic._collide` pushes the truck out and returns the impact;
  `main._onTraffic` runs `_crash` (sparks, wear) and a hard hit spills a trunk piece onto the
  road (`loot.drop`). Off under `?test` unless `&traffic`.
- Orders and trust (v4): `contracts.js` rolls the day's offers (`offersFor`, with trust and the
  barn's distance), `progress` checks counts and a shine order's grade against the blend, and
  `trustLevel`/`nextDawn` are the helpers. The save keeps `orders` (the book, up to
  `CONFIG.dredge.contracts.book`), `trust`, `delivered`, `scenes` and `best`; old single
  `contract` saves are moved into the book. `main._checkContract` / `_deliver` / `_handoff`
  hand orders over (shine only at night), and `_focusOrder` picks the one the banner, marker
  and route show. `story.js` `TRUSTED` holds each contact's line at trust 3; `showNotebook`
  (screens.js) is the notebook.
- Agents and heat (v4): `src/police.js` is a pool of Bureau sedans (physics-only `Vehicle`s,
  `model: false`) drawn as three InstancedMeshes (bodies, roof lamps, sight cones) plus the
  sawhorses; the roadblock and the York Road checkpoint borrow extra body instances. It owns
  heat (`heat`, `tier`), the bust meter and the checkpoint, and `update` returns events that
  `main._onPolice` turns into toasts, `_searched` and `_bust`. Off under `?test` unless
  `&police`. Lights off (`main.toggleLights`) zeroes the headlamp via `feel.headlightBase`.
- The still (v4): `src/brew.js` is a batch in three phases (`newBatch`, `stepBatch`,
  `pressBatch`): the fire, the cuts (heads/hearts/tails; an early first cut is a bad batch)
  and proofing, scored by `fireScore`/`cutScore`/`proofScore`, graded by `gradeOf`. Each
  recipe's crates on hand are one blend (`blend`, saved in `data.market.blend`), whose grade
  scales the speakeasy price (`priceOf`). Selling a tainted blend calls `main._blinded`;
  hard crashes break fragile pieces (`main._breakage`, `CONFIG.dredge.breakage`).
- Salvage (v4): `src/salvage.js` places fixed sites (wrecks, farmhouses, rail sidings in the
  county; cellars in the city) from their own random stream, draws them as one instanced
  heap, and holds the two mini-games as pure state machines (`newPry`/`stepPry`/`pressPry`,
  `newSearch`/`stepSearch`/`pickSearch`, `score`, `payout`). `showSalvage` (screens.js) runs
  one; `main._checkSalvage` / `_onSalvaged` open it and queue what it gives up into the
  trunk (`_pending`). Worked sites are `data.sites` (id -> day). `CONFIG.dredge.loot.scatter`
  is false: the loot pool only holds pieces spilled in crashes. Lamp posts have no
  colliders: `world.knockLamps` tips them over (instance matrices only) and `standLamps`
  puts them back at dawn (`main._dawn`, which also shows the night's take and saves).
  Deliveries end on a handoff card (`main._handoff`, `story.js THANKS`).
- Road events: `src/roadevents.js`, rolled per slot of game hours (`CONFIG.dredge.roadEvents`,
  offset from midnight so they never land with the daily demand). A blocked road gets an
  edge key in `blocked` (shared with traffic and `minimap.blocked`, so routes and cars go
  around), a capsule collider and a parked traffic cart (`traffic.park`). Market day is
  `market.marketDay` in the saved market state, which `priceOf` reads. `main` shows the
  toasts and the radar's ⚠.
- Story: `src/story.js` holds the cast and the beats (dialogue cards, `playDialog` in
  `screens.js`); each beat's `when(data)` reads the save (stats, `flags`, `rank`) and plays
  once per save (`data.story`), checked twice a second in `main._checkStory`. A new game
  opens with the prologue. `?test` turns story off unless `&story`.
- The first run's tips (`main._guideText` / `_updateGuide`) read where the save stands
  (empty trunk → find loot, packed → go sell, first sale → done) and end for good;
  `data.guide` is set on a new game. `?test` shows none unless `&hints`.
- `src/juice.js` — **all game-feel values** (`JUICE`) plus `VehicleFeel` (sprung body roll /
  pitch / bounce for the truck, skid marks, tyre smoke, spray, headlight flicker, crash
  rattle/dent) and `Debris` (pooled chunks on heavy hits). `src/props.js`: sidewalk
  crates/barrels/signs the truck knocks flying (one InstancedMesh, no colliders). Hit-stop
  is held in `main._loop` (real time), so `window.shine.step` tests are unaffected; so is
  slow-mo (`JUICE.cinematic`, `game.timeScale`). `JUICE.ui` drives the HUD animations
  (`hud.js` + `styles.css`), `JUICE.audio` the extra sound (wind, engine load, jazz near
  the speakeasies, crickets in the county, the towns' sounds). Speed lines live in the grade
  pass (`uRush`).
  Juice is visual only; `J` toggles it. `camera.js` reads `JUICE.camera`.
- Visual review loop: `npm run shots -- <label>` (or `dredge-<label>` for the full set of
  views with draw-call counts), `npm run reel -- <label>` and `node scripts/playtest.mjs
  <label>` write screenshots / contact sheets to `artifacts/shots/` (they stop the game
  loop and step it themselves). Headless timings are a software GPU: compare them, don't
  read them as fps. `node scripts/economy.mjs [minutes] [level] [seed] [rare]` measures the
  economy (a road-following autopilot with the clock on: $ per game minute, pickups, each
  sale; `rare` also fetches rare finds); set prices and upgrade costs in `CONFIG.dredge`
  against it. One seed is one loot layout and runs vary a lot: compare several seeds.
  `node scripts/progress.mjs [loot $/min]` projects the long game from the tuning (jobs,
  brews and rare finds on top of that income): the hour each rank and the deed come.
- The truck (`models.js`) uses one `MeshPhysicalMaterial` (clearcoat, street env map); each
  vertex carries its finish in the `surf` attribute (paint/metal/glass/rubber/wood), so new
  parts need no new material. Its headlight beams are additive cones
  (`CONFIG.look.beamOpacity`, set in `renderFrame`). Wheels are invisible Object3Ds drawn
  through `WHEELS` (one InstancedMesh per wheel shape, updated in `renderFrame`). Its two
  bodies (stock, reinforced) are both built at boot; `Vehicle.setLook` shows one.
- 3D models (`assets/*.glb`, credits in `assets/README.md`) load in `src/assets.js` before
  `new Game()` so nothing compiles mid-game; `buildVehicle` / the lamps use them when
  present, else the procedural ones (`?models=0` forces those). The truck is generated by
  `scripts/make-truck.mjs`; downloaded models go through `scripts/optimize-models.mjs`
  (orients, scales, splits out a wheel, bakes into the shared vehicle material).
- Atmosphere: `src/sky.js` is the sky dome (one draw call; horizon = fog colour, stars,
  moon, clouds; `Environment` sets it, `renderFrame` keeps it on the camera). Steam from
  `world.grates` and smoke from `world.chimneys` come from the nearest few to the camera
  through the shared smoke pool (`particles.atmosphere`). Tuning: `CONFIG.look.skyDome`,
  `CONFIG.look.atmosphere`.
- `src/world.js` city generation (seeded; `world.drops` are the named corners, where the
  speakeasy jazz plays), `county.js` (the valley, barns, the villages in `VILLAGES`:
  Monkton, Glyndon and Cockeysville with its quarry yard), `collision.js` (2D grid colliders + the line-of-sight test the
  camera pulls in by), `roadgraph.js` (pathfinding, the radar's GPS route), `vehicle.js`
  (physics), `hud.js` (DOM).
- Input/UI: `input.js` (remappable keys via `e.code`, gamepad polling, touch controls)
  emits actions; `ui.js` is a screen stack with arrow/D-pad focus navigation. Every new
  overlay must be opened through `game.ui.open(id)` so keyboard/controller users can reach
  it. Preferences live in `settings.js` (localStorage).
- States: `intro` → `playing` ⇄ `paused` (menus, the map, the trunk and the markets all
  pause). Pausing stops simulation and rendering. The pause menu suspends audio; a screen
  over the road (`pause({ showMenu: false })`: a market, the barn, the trunk, the map, a
  story card) only hushes it (`audio.setPaused('hush')`: the engine and road go quiet, the
  radio plays on softer), so its own sounds (the bell, the till) are heard.
- Sound (`audio.js`, `music.js`, all generated): the radio (`Radio`) fades between four
  tunes (`TUNES`: stride, blues, waltz, rag) that `main._tuneFor` picks by place, time and
  Lead Foot (`_updateTune` waits two seconds before a change, except for the rag). The
  towns' sounds come from `audio._ambience` by `place`; markets ring a bell, speakeasies get
  a knock, a job done a chime, and a rank, a rare find and the deed a `fanfare`.
- Tests: `startRun(page, { loot: false })` / `clearLoot(page)` (tests/helpers.js) take the
  loot off the roads for tests that drive about; a pickup would open the trunk mid-drive.
- North is −Z. The county spans z −247…−1040; York Road leaves the city through a gap in
  the north wall at x = 0.
- `vendor/three/` Three.js r160, vendored (no CDN). Upgrade via `npm run vendor`.
- `scripts/` zero-dependency dev server, build (esbuild → `dist/` site + single-file
  `dist/Shine.html`), checks, CI summary.
- `.github/workflows/` CI (every PR), Pages deploy (main), Release zips (tags).
- `ue5/` a complete UE5 C++ project (`MoonshineRun.uproject`), **frozen** at the
  bootlegging design (stills, heat, police; see `ue5/README.md`). Web changes don't need
  mirroring there. No engine exists in CI, so `scripts/check-ue5.mjs` checks UHT rules,
  includes and Build.cs modules instead; the C++ is otherwise uncompiled. Beginner setup
  lives in `ue5/CHECKLIST.md`.

## Rules that keep the game fast and hitch-free
- **Fixed light count (12).** Only hemisphere, moon (the shadow caster; its shadow box
  follows the view in `world.updateShadow`), the truck's headlight, and the lamp pool
  (`CONFIG.look.lampLights` point lights + one shadow spot that hop to the lamps nearest the
  view in `world.updateLamps`; hide extras with `visible`, only on quality change) exist.
  Never add/remove lights at runtime (it recompiles every shader). Fake glows with
  emissive/additive materials.
- **No mid-game allocation of meshes/materials.** Pool objects (see `Loot`, `Debris`) and
  share materials (`models.js` `MATERIALS`). Tests assert shader programs and geometry
  counts stay flat.
- **Instance repeated scenery** (`InstancedMesh`), keep draw calls low (test budget < 60).
- Heading 0 faces north (−Z); positive steer turns right. Forward = (sin h, −cos h).
- Game logic returns events; only `main.js`/`hud.js`/`screens.js`/`trunkscreen.js` touch
  the DOM.
- Draw frames through `game.renderFrame()` (shadows and lamp lights follow the camera there,
  then `src/post.js` PostFX: bloom → ACES output → teal/orange grade + vignette + grain, and
  the painterly look; bypassed on Low), not `renderer.render` directly. Post values live in
  `CONFIG.look.post`. Its addons are vendored in `vendor/three/addons/` (`npm run vendor`;
  `check` verifies).
- Storage goes through `save.js` (never throws; private mode safe).

## Conventions
- Plain ES modules, no framework, no TypeScript. Match the surrounding comment density.
- New behaviour gets a Playwright test in `tests/` driven through `window.shine`.
- Keep `README.md` player-facing and accurate when controls or features change.
