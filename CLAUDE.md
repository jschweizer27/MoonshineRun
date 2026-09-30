# SHINE — project guide for Claude

SHINE is a 1920s Prohibition bootlegging game (Otto Braun, Baltimore/Green Spring Valley)
built as a browser demo with Three.js, plus a UE5 C++ scaffold in `ue5/` for the full game.
Design sources: the "Shine Game Treatment" (story/factions) and "Moonshine Run Dev Guide"
(5-phase UE5 plan).

## Run, test, build
- `npm start` — local server + opens the browser (plays the unbundled source; no build step).
- `npm run verify` — everything CI runs: `check` (syntax + vendored Three.js), `lint`,
  `build`, `test` (Playwright playtests). Run it before pushing.
- `npm test -- tests/loop.spec.js -g "full run"` — one test. Screenshots land in
  `artifacts/screenshots/`.
- URL flags: `?debug` (overlay + `window.shine` test API), `?test` (API, deterministic
  missions), `?seed=N` (city layout + missions).

## Layout
- `src/main.js` game loop + state machine; `step(dt, input)` is the single simulation step
  (tests call it through `window.shine.step(seconds, input)` at a fixed 60 Hz).
- `src/config.js` — **all gameplay tuning numbers**. Change balance here, not in code.
- `src/world.js` city generation (seeded), `collision.js` (2D grid colliders + line of
  sight), `roadgraph.js` (pathfinding), `vehicle.js` (physics), `models.js` (procedural
  vehicles), `police.js` (pursuer AI), `mission.js` (loop + heat), `hud.js` (DOM).
- `vendor/three/` Three.js r160, vendored (no CDN). Upgrade via `npm run vendor`.
- `scripts/` zero-dependency dev server, build (esbuild → `dist/` site + single-file
  `dist/Shine.html`), checks, CI summary.
- `.github/workflows/` CI (every PR), Pages deploy (main), Release zips (tags).

## Rules that keep the game fast and hitch-free
- **Fixed light count.** Only hemisphere, moon, the player headlight and `world.fxLight`
  exist. Never add/remove lights at runtime (it recompiles every shader). Fake glows with
  emissive/additive materials; move/dim `fxLight` for effects.
- **No mid-game allocation of meshes/materials.** Pool objects (see `Police`) and share
  materials (`models.js` `MATERIALS`). Tests assert shader programs and geometry counts
  stay flat.
- **Instance repeated scenery** (`InstancedMesh`), keep draw calls low (test budget < 60).
- Heading 0 faces north (−Z); positive steer turns right. Forward = (sin h, −cos h).
- Game logic returns events; only `main.js`/`hud.js` touch the DOM.
- Storage goes through `save.js` (never throws; private mode safe).

## Conventions
- Plain ES modules, no framework, no TypeScript. Match the surrounding comment density.
- New behaviour gets a Playwright test in `tests/` driven through `window.shine`.
- Keep `README.md` player-facing and accurate when controls or features change.
