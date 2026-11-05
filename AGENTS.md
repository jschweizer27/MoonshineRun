# AGENTS.md: SHINE (MoonshineRun) for Codex and other agents

SHINE is a 1920s Baltimore bootlegging game in the browser: plain ES modules and Three.js
r160, no framework, no TypeScript. **Read `CLAUDE.md` in full before changing anything.** It
is the project guide for every agent, not only Claude: the layout, the systems, every
stage's notes and the rules below come from it. For visual polish, the brief is
`docs/VISUAL_POLISH.md`.

## Set up and check
```bash
npm ci
npx playwright install --with-deps chromium   # the playtests and the screenshot tools need it
npm run verify                                # check + lint + build + the Playwright playtests
```
`npm run verify` (or CI's 7 checks: "Check, lint and build" and six "Playtest" shards) must
pass before a PR merges. The full playtest suite takes over an hour on one machine; run the
specs you touched (`npm test -- tests/ux.spec.js`), and let CI run the rest.

## Hard limits (tests enforce them; CLAUDE.md "Rules that keep the game fast and hitch-free")
- **12 lights, always.** Never add or remove a light at runtime: it recompiles every shader.
  Fake glows with emissive or additive materials.
- **Under 60 draw calls** in every view (`tests/performance.spec.js`). Instance repeated
  scenery (`InstancedMesh`); share materials (`models.js` `MATERIALS`, the atlas in `atlas.js`).
- **Nothing compiled or allocated mid-game:** shader programs and geometry counts stay flat
  (`performance.spec.js` and the counts `npm run shots -- dredge-<label>` prints). Pool objects.
- **The layout lock** (`tests/layout.spec.js`) and **the phone layout** (`tests/phone.spec.js`:
  portrait and landscape, no overlaps) stay green.
- **Reduce motion** and the Low quality setting keep working (post-processing is bypassed on
  Low; `src/post.js`).
- Draw frames through `game.renderFrame()`, never `renderer.render` directly.
- Only `main.js`, `hud.js`, `screens.js` and `trunkscreen.js` touch the DOM.

## How to work
- Small PRs, one visual area each, branch from `main`. Say in the PR what changed and why.
- **Before and after screenshots** for every visual change, from the repo's own tools (see
  `docs/VISUAL_POLISH.md`), same label and seed both times. Put them in the PR description.
- Don't change gameplay, tuning (`CONFIG` values that aren't looks), story text (`story.js`,
  `chapters.js`, `arcs.js` lines) or the robot (`scripts/bot/`). Leave `ue5/` alone.
- Match the code around you: plain ES modules, the same comment density and naming.
- Keep `CLAUDE.md` current: add a short bullet for what you changed, as each stage has.
