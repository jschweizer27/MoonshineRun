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
  replaced; the code still says dredge): loot (`loot.js`, pooled, one InstancedMesh per
  kind; the pool's last slot is the rare find, timed by `loot.rare` and kept out of the
  scatter and the daily demand), the trunk grid (`trunk.js` logic, `trunkscreen.js` screen), markets (`market.js`:
  drift and gluts; `marker.js` the markers) and upgrades, all saved in one of three slots
  (`dredgecareer.js`: cash, the trunk, upgrade levels, market memory, stats, ledger; slot 1
  is `shine.dredge.v1`, slots 2 and 3 add `.s2` / `.s3`, `shine.dredge.slot` is the last one
  played; `showSlots` in `screens.js` is the Saved Games screen).
  `main._applyPerks` turns the upgrade levels into the truck's tuning, `game.perks`
  (pickup radius, radar range, trunk size) and the truck's look. `CONFIG.dredge` holds the
  palette, towns, prices, market, trunk, upgrades and loot; the palette themes every screen
  through `--d-*` CSS variables under `html.dredge` (set by `hud.js`). A market's marker
  costs four draw calls, so only the one nearest the camera shows, within
  `market.markerRange`.
  Everything seeded after the city layout (the atlas, rooflines, the village) draws from its
  own random stream, so the layout of every seed stays put.
- Story: `src/story.js` holds the cast and the beats (dialogue cards, `playDialog` in
  `screens.js`); each beat's `when(data)` reads the save (stats, `flags`, `rank`) and plays
  once per save (`data.story`), checked twice a second in `main._checkStory`. A new game
  opens with the prologue. `?test` turns story off unless `&story`.
- `src/juice.js` — **all game-feel values** (`JUICE`) plus `VehicleFeel` (sprung body roll /
  pitch / bounce for the truck, skid marks, tyre smoke, spray, headlight flicker, crash
  rattle/dent) and `Debris` (pooled chunks on heavy hits). `src/props.js`: sidewalk
  crates/barrels/signs the truck knocks flying (one InstancedMesh, no colliders). Hit-stop
  is held in `main._loop` (real time), so `window.shine.step` tests are unaffected; so is
  slow-mo (`JUICE.cinematic`, `game.timeScale`). `JUICE.ui` drives the HUD animations
  (`hud.js` + `styles.css`), `JUICE.audio` the extra sound (wind, engine load, jazz near
  the speakeasies, crickets in the county). Speed lines live in the grade pass (`uRush`).
  Juice is visual only; `J` toggles it. `camera.js` reads `JUICE.camera`.
- Visual review loop: `npm run shots -- <label>` (or `dredge-<label>` for the full set of
  views with draw-call counts), `npm run reel -- <label>` and `node scripts/playtest.mjs
  <label>` write screenshots / contact sheets to `artifacts/shots/` (they stop the game
  loop and step it themselves). Headless timings are a software GPU: compare them, don't
  read them as fps. `node scripts/economy.mjs [minutes] [level] [seed] [rare]` measures the
  economy (a road-following autopilot with the clock on: $ per game minute, pickups, each
  sale; `rare` also fetches rare finds); set prices and upgrade costs in `CONFIG.dredge`
  against it. One seed is one loot layout and runs vary a lot: compare several seeds.
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
  Monkton and Glyndon), `collision.js` (2D grid colliders + the line-of-sight test the
  camera pulls in by), `roadgraph.js` (pathfinding, the radar's GPS route), `vehicle.js`
  (physics), `hud.js` (DOM).
- Input/UI: `input.js` (remappable keys via `e.code`, gamepad polling, touch controls)
  emits actions; `ui.js` is a screen stack with arrow/D-pad focus navigation. Every new
  overlay must be opened through `game.ui.open(id)` so keyboard/controller users can reach
  it. Preferences live in `settings.js` (localStorage).
- States: `intro` → `playing` ⇄ `paused` (menus, the map, the trunk and the markets all
  pause). Pausing stops simulation and rendering and suspends audio.
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
