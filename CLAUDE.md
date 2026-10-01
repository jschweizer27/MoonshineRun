# SHINE — project guide for Claude

SHINE is a 1920s Prohibition bootlegging game (Otto Braun, Baltimore/Green Spring Valley)
built as a browser demo with Three.js, plus a UE5 C++ scaffold in `ue5/` for the full game.
Design sources: the "Shine Game Treatment" (story/factions) and "Moonshine Run Dev Guide"
(5-phase UE5 plan).

## Run, test, build
- `npm start` — local server + opens the browser (plays the unbundled source; no build step).
- `npm run verify` — everything CI runs: `check` (syntax, vendored Three.js, UE5 static
  checks), `lint`,
  `build`, `test` (Playwright playtests). Run it before pushing.
- `npm test -- tests/loop.spec.js -g "full run"` — one test. Screenshots land in
  `artifacts/screenshots/`.
- URL flags: `?debug` (overlay + `window.shine` test API), `?test` (API, deterministic
  missions), `?seed=N` (city layout + missions).

## Layout
- `src/main.js` game loop + state machine; `step(dt, input)` is the single simulation step
  (tests call it through `window.shine.step(seconds, input)` at a fixed 60 Hz).
- `src/config.js` — **all gameplay tuning numbers**. Change balance here, not in code.
  `CONFIG.look` holds the night palette (exposure, FogExp2, teal fill, moonlight).
- `src/juice.js` — **all game-feel values** (`JUICE`) plus `VehicleFeel` (sprung body roll /
  pitch / bounce for truck and horse box, skid marks, tyre smoke, spray, headlight flicker,
  crash rattle/dent) and `Debris` (pooled chunks on heavy hits). `src/props.js`: sidewalk
  crates/barrels/signs that cars knock flying (one InstancedMesh, no colliders). Hit-stop
  is held in `main._loop` (real time), so `window.shine.step` tests are unaffected.
  Juice is visual only; `J` toggles it. `camera.js` reads `JUICE.camera`.
- Visual review loop: `npm run shots -- <label>` and `npm run reel -- <label>` write
  screenshots / contact sheets to `artifacts/shots/` (they stop the game loop and step it
  themselves). Headless timings are a software GPU: compare them, don't read them as fps.
- Vehicles (`models.js`) share one `MeshPhysicalMaterial` (clearcoat, street env map); each
  vertex carries its finish in the `surf` attribute (paint/metal/glass/rubber/wood), so new
  parts need no new material. The player's headlight beams are additive cones
  (`CONFIG.look.beamOpacity`, set in `renderFrame`). Every wheel is an invisible Object3D
  drawn through `WHEELS` (one InstancedMesh per wheel shape, updated in `renderFrame`).
- 3D models (`assets/*.glb`, credits in `assets/README.md`) load in `src/assets.js` before
  `new Game()` so nothing compiles mid-game; `buildVehicle` / the lamps use them when
  present, else the procedural ones (`?models=0` forces those). Make new ones with
  `scripts/optimize-models.mjs` (orients, scales, splits out a wheel, bakes cars into the
  shared vehicle material).
- Atmosphere: `src/sky.js` is the sky dome (one draw call; horizon = fog colour, stars,
  moon, clouds; `Environment` sets it, `renderFrame` keeps it on the camera). Steam from
  `world.grates` and smoke from `world.chimneys` come from the nearest few to the camera
  through the shared smoke pool (`particles.atmosphere`). Tuning: `CONFIG.look.skyDome`,
  `CONFIG.look.atmosphere`.
- `src/world.js` city generation (seeded), `collision.js` (2D grid colliders + line of
  sight), `roadgraph.js` (pathfinding), `vehicle.js` (physics), `models.js` (procedural
  vehicles), `police.js` (pursuer AI), `mission.js` (loop + heat), `hud.js` (DOM).
- Input/UI: `input.js` (remappable keys via `e.code`, gamepad polling, touch controls)
  emits actions; `ui.js` is a screen stack with arrow/D-pad focus navigation. Every new
  overlay must be opened through `game.ui.open(id)` so keyboard/controller users can reach
  it. Preferences live in `settings.js` (localStorage).
- States: `intro` → `playing` ⇄ `paused` → `gameover`. Pausing stops simulation and
  rendering and suspends audio.
- Career (`career.js`, localStorage) holds cash, upgrades, story flags, stats, ledger, and
  the car Otto drives (`ride`: the truck + horse box, or the garage's Rolls-Royce,
  `CONFIG.rolls`). Both bodies are built at boot (`Vehicle.addRide`/`setRide`); `perks`
  carries the ride's rules (no trailer = no disguise/armour, trunk-sized loads).
  Mission modes: `escape` (Act I) and `loop`. Stills are county barns, drops are named city
  intersections (`world.drops`). Mission emits events (`orders`, `pickup`, `deliver`,
  `hideout`, `escaped`, `spotted`, ...); `main.js` turns them into screens and saves.
- Test flags: `?test` disables story, tips and the day/night clock; add `&story`, `&hints`,
  `&time` to turn them back on. `window.shine.loadShine(i)` loads order `i` at the still.
- North is −Z. The county spans z −247…−1040; York Road leaves the city through a gap in
  the north wall at x = 0.
- `vendor/three/` Three.js r160, vendored (no CDN). Upgrade via `npm run vendor`.
- `scripts/` zero-dependency dev server, build (esbuild → `dist/` site + single-file
  `dist/Shine.html`), checks, CI summary.
- `.github/workflows/` CI (every PR), Pages deploy (main), Release zips (tags).
- `ue5/` a complete UE5 C++ project (`MoonshineRun.uproject`) mirroring the web rules:
  `MoonshineDeliveryManager` = `mission.js` + the heat/bust parts of `main.js`,
  `ProhibitionCopController` = `police.js`, `ShineTuning.h` = `config.js` in centimetres.
  When web gameplay rules or numbers change, update the UE5 mirror too. No engine exists in
  CI, so `scripts/check-ue5.mjs` checks UHT rules, includes and Build.cs modules instead;
  the C++ is otherwise uncompiled. Beginner setup lives in `ue5/CHECKLIST.md`.

## Rules that keep the game fast and hitch-free
- **Fixed light count.** Only hemisphere, moon (the shadow caster; its shadow box follows
  the view in `world.updateShadow`), the player headlight, `world.fxLight`, and the lamp pool
  (`CONFIG.look.lampLights` point lights + one shadow spot that hop to the lamps nearest the
  view in `world.updateLamps`; hide extras with `visible`, only on quality change) exist. Never add/remove lights at runtime (it recompiles every shader). Fake glows with
  emissive/additive materials; move/dim `fxLight` for effects.
- **No mid-game allocation of meshes/materials.** Pool objects (see `Police`) and share
  materials (`models.js` `MATERIALS`). Tests assert shader programs and geometry counts
  stay flat.
- **Instance repeated scenery** (`InstancedMesh`), keep draw calls low (test budget < 60).
- Heading 0 faces north (−Z); positive steer turns right. Forward = (sin h, −cos h).
- Game logic returns events; only `main.js`/`hud.js` touch the DOM.
- Draw frames through `game.renderFrame()` (shadows and lamp lights follow the camera there,
  then `src/post.js` PostFX: bloom → ACES output → teal/orange grade + vignette + grain;
  bypassed on Low), not `renderer.render` directly. Post values live in `CONFIG.look.post`.
  Its addons are vendored in `vendor/three/addons/` (`npm run vendor`; `check` verifies).
- Storage goes through `save.js` (never throws; private mode safe).

## Conventions
- Plain ES modules, no framework, no TypeScript. Match the surrounding comment density.
- New behaviour gets a Playwright test in `tests/` driven through `window.shine`.
- Keep `README.md` player-facing and accurate when controls or features change.
