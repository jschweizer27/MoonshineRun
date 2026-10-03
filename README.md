# SHINE — Roads of 1922 Baltimore

Baltimore, 1922. You are **Otto Braun**, and last night the Temperance Alliance burned your
Highlandtown brewery to the ground. The roads out of the city are littered with what other
people lost: crates, kegs, copper. Work the roads between Baltimore and the Green Spring
Valley, pack what you find into the truck, sell it where it pays best, and buy back what was
yours. The story plays out in short dialogue cards as you go (skip any with Esc).

This repository has two parts:

- **The playable demo** (repo root): a 3D browser game built with Three.js.
- **`ue5/`**: an Unreal Engine 5 C++ project from the game's first design, the bootlegging
  run (stills, heat and the law), following the *Moonshine Run Dev Guide*. It is **frozen**:
  the browser game has since become the loot-and-sell run described here, and the UE5
  project keeps the old design. Start with the step-by-step [`ue5/CHECKLIST.md`](ue5/CHECKLIST.md).

---

## ▶ Play

| Option | Setup | How |
|---|---|---|
| **In your browser** | Nothing | Open **https://jschweizer27.github.io/MoonshineRun/** *(live once GitHub Pages is on; see below)* |
| **Offline, no install** | Nothing | Download `Shine-offline-*.zip` from [Releases](../../releases), unzip it, and double-click **Shine.html** (uses the simpler built-in truck and lamp models) |
| **From this folder** | [Node.js](https://nodejs.org) (free) | Double-click **`Play (Mac).command`** or **`Play (Windows).bat`**, or run `npm start` |

### Controls

Play with a **keyboard**, a **controller** (Xbox / PlayStation / most USB pads) or **touch**:
on-screen pedals appear automatically on phones and tablets.

| Action | Keyboard | Controller | Touch |
|---|---|---|---|
| Throttle / brake & reverse | `W` `S` or `↑` `↓` | RT / LT | GAS / BRAKE |
| Steer | `A` `D` or `←` `→` | Left stick | Drag on the left side |
| Handbrake (slide) | `Space` | A | DRIFT |
| Open the trunk | `T` | X | — |
| Horn | `H` | B | HORN |
| Radio (the jazz soundtrack) | `R` | — | — |
| Look back | `C` | Y | — |
| Map | `Tab` or `N` | View / Back | map button |
| Pause menu | `Esc` or `P` | Start | ❚❚ button |
| Mute / fullscreen | `M` / `F` | — | buttons, top right |
| Game-feel effects on/off (to compare) | `J` | — | — |

**In the trunk:** the arrows (or D-pad) move the piece, **R** / **Q** (or LB / RB) turn it,
**Enter** (A) puts it down, lifts a piece or swaps the two, **X** leaves it on the road, and
**Esc** (B) closes the trunk. You can also drag pieces with the mouse.

Every key can be changed in **Settings → Controls**. Menus work with the arrow keys and
Enter, the D-pad and A/B, or touch.

### How to play

1. Press **Enter** (or click **START DRIVING**). Otto's truck starts on **York Road**, just
   inside the city. On a new game, short tips walk you through the first pickup, packing the
   trunk and the first sale (skip them from the tip card or the pause menu).
2. Drive the roads. **Glowing loot** lies beside them (crates, bottle cases, sacks, barrels,
   jugs, kegs, copper coils, bicycles, radio sets, sewing machines, a strongbox); the radar
   shows what's near. Its colour tells you
   what it's worth: olive is cheap, brick and cream middling, copper good, amber best.
   Now and then word comes of a **rare find** out in the county (a gold pocket watch, a case of
   bonds): a ★ on the radar shows where. Fetch it before someone else does, and sell it in
   the one town that pays big for it.
3. Drive over a piece to pick it up. The **trunk** opens with it in hand: turn it and fit it
   in; pieces can't overlap. Leave behind what won't fit, or press **T** any time to
   rearrange.
4. With loot aboard, the banner's arrow and the **gold route** on the radar lead to the
   nearest **⬢ market**. Stop inside its ring to sell: **Lexington Market** in the city, the
   **Monkton General Store** at the crossroads up York Road, or the **Glyndon Depot** out west
   in the valley. Each town pays differently,
   prices drift day to day, and selling a lot of one thing in one place drives its price down.
   From the second day on, one town each day pays **double** for one kind of loot: the
   banner and the market say which.
5. Spend your cash at any market on **upgrades**: a bigger bed (the trunk grows and the
   truck gets reinforced rails), a tuned engine, stiffer springs, a longer reach for loot,
   and a spotter for the radar.
6. **Otto's barn** (⌂ on the radar, just off York Road outside the city) is home: store loot in
   its stash between trips, and mend the truck in its garage. Hard knocks wear the truck and
   slow it down until it's repaired.
7. The barn's **still** turns loot into shine. Install a copper coil, then brew from what you've
   gathered (Corn Shine takes a sack and jugs; better recipes come later): hold the throttle
   to stoke the fire and keep the needle in the band, and a steady hand makes more crates.
   Shine sells only at the city's **speakeasies**; with crates aboard, the radar shows them.
8. Rain makes the cobbles slick; off the dirt lanes in the valley the truck bogs down in the
   fields. **Otto's Ledger** (in the pause menu) keeps your books. Everything is saved: your
   cash, upgrades and whatever is in the trunk. **Saved games** on the title screen holds
   three slots: continue one, start a new game in another, or erase one.

Settings → Help also lets you **roll a new city layout** or **copy a link** to share yours.

**Sights and sounds:** everything but the street lamp model is generated in the browser,
with no image or audio files: a painted brick-and-stone city with neon blade signs, bay
windows and rooftop water towers, two villages of clapboard houses in the valley, a stride-piano
ragtime soundtrack, and exhaust, dust and sparks. The engine shifts gears, the tyres
screech, and you hear rain on the cobbles, jazz from the speakeasies at night and crickets
in the valley.

### Settings

Volume (master / music / effects), graphics quality (**Auto** picks what your device can
handle), camera distance, minimap style, **large text**, **reduce motion and flashing**,
touch controls and key bindings. Everything is remembered between visits.

Graphics quality: **High** has shadows from the moon and the nearest lamp, 8 real lamp
lights and full bloom; **Medium** fewer lamp lights and half-resolution bloom; **Low** skips
shadows and post-processing for older machines. **Painterly look** (on by default, Medium and
High) softens the picture into brush-like patches with a light depth haze; switch it off in
Settings for the plain image.

### Install it like an app

On the published site, use your browser's **Install** / **Add to Home Screen** option.
SHINE then opens full-screen from your home screen and keeps working **offline**.

### Troubleshooting

- **Black screen or a "WebGL" message:** update your browser (Chrome, Edge, Firefox or
  Safari) and turn on hardware acceleration in its settings.
- **"Couldn't start" message:** reload the page. When playing from the folder, keep the
  launcher window open while you play.
- **macOS says the launcher can't be opened:** right-click `Play (Mac).command`, choose
  **Open**, then **Open** again (only needed the first time).
- Add `?debug` to the address to see frame rate and game stats in the corner, which is handy
  for bug reports.

---

## 🤖 What happens automatically

| When | What | Where |
|---|---|---|
| Every pull request / push to `main` | Syntax check, lint, build, and **automated playtests** in a real browser. Gameplay **screenshots** are attached to every run. | Actions → CI → run → *Summary* (artifacts **gameplay-screenshots-1** … **-4**) |
| Merge to `main` | The game is **published to GitHub Pages** | The play link above |
| Publishing a release (tag `v*`) | **Downloadable zips** are attached: offline single-file game, website files, and the UE5 project | Releases |
| Weekly | **Dependabot** opens update PRs for tools and Actions (each one is playtested by CI) | Pull requests |
| New Claude Code cloud session | Dev tools install automatically (`.claude/hooks/session-start.sh`) | — |

**One-time setup for the play link:** repository **Settings → Pages → Build and deployment →
Source: GitHub Actions**. On a free GitHub plan the repository must be public.

**To publish a release:** GitHub → **Releases → Draft a new release** → create a tag such as
`v0.3.0` → **Publish**. The zips appear on the release a few minutes later.

**Reporting bugs and feedback:** use the **Bug report** or **Playtest feedback** forms under
Issues → New issue.

---

## 🛠 For developers

```bash
npm install        # dev tools only; the game itself has no dependencies
npm start          # serve the source and open the browser (no build step)
npm run verify     # check + lint + build + playtests (what CI runs)
npm test           # playtests only; screenshots in artifacts/screenshots/
npm run build      # dist/ website + dist/Shine.html (single-file offline game)
```

- **Tune the game** in [`src/config.js`](src/config.js): the truck (`player`), the camera,
  the night look (`look`: exposure, fog, moonlight, window glow, the painterly pass), and
  the run (`dredge`: the palette, the towns and their prices, the markets, the trunk, the
  upgrades and the loot). Every number is commented.
- **Tune the game feel** in [`src/juice.js`](src/juice.js) (`JUICE`: camera spring, FOV kick,
  shake, body roll, skid marks, smoke...). With `?debug` every value has a live slider;
  press `J` in-game to switch all of it off and compare.
- **Art-direction screenshots:** `npm run shots -- mylabel` (chase, street and truck views
  plus render cost), `npm run shots -- dredge-mylabel` (the full set: skyline, county,
  truck, loot, trunk, markets and the towns, with draw-call counts), `npm run reel --
  mylabel` (a launch / brake / drift / crash contact sheet with the effect values) and
  `node scripts/playtest.mjs mylabel` (a scripted run from the title screen to both
  markets), all in `artifacts/shots/`. `node scripts/economy.mjs 10` plays ten game
  minutes on autopilot and prints what the run earns a minute, for tuning prices and
  upgrade costs (`node scripts/economy.mjs 10 0 3 rare` uses city seed 3 and fetches rare
  finds; compare a few seeds).
- URL flags: `?debug` (stats overlay + `window.shine` API), `?test` (deterministic: the
  clock stands still), `?seed=123` (a different city layout).
- Project conventions and architecture notes for AI-assisted work are in
  [`CLAUDE.md`](CLAUDE.md).

### Project layout

```
index.html, styles.css   page, HUD, menus (loading/error screens, responsive overlays)
src/
  main.js       boot, game loop, state machine, the run (loot, trunk, markets, upgrades)
  config.js     all tuning numbers
  world.js      seeded 1920s city: cobbles, rails, instanced buildings + lamps, named corners
  atlas.js      the painted building atlas (facades, trims, roofs, awnings, barns)
  county.js     Green Spring Valley: farm roads, barns, woods, fences, Monkton and Glyndon
  environment.js  day/night cycle and weather
  loot.js       loot along the roads (pooled, instanced per kind)
  trunk.js, trunkscreen.js   the trunk grid and its screen
  market.js     prices and selling (drift, gluts)
  dredgecareer.js  the save: cash, the trunk, upgrades, stats, ledger
  marker.js     the market markers
  screens.js    the market and ledger screens
  particles.js  exhaust, dust, sparks and smoke
  music.js      generated ragtime soundtrack
  collision.js  2D colliders, bounds, line of sight (for the camera)
  roadgraph.js  street graph + pathfinding
  vehicle.js    driving physics (grip, handbrake, collisions)
  models.js     the truck (the GLB, or the procedural stand-in), wheels, headlight beams
  camera.js     chase camera (+ look back)
  input.js      keyboard (remappable), gamepad, touch controls
  ui.js         menu screens, focus navigation, settings panel
  minimap.js    corner radar + full map with GPS route
  settings.js   saved preferences and key bindings
  hud.js, audio.js, juice.js, props.js, sky.js, post.js, assets.js, save.js, debug.js, rng.js
sw.js, manifest.webmanifest, favicon.svg, icons/   installable, offline-capable app
assets/         3D models (the truck, street lamps) and their credits
vendor/three/   Three.js r160 (bundled; no CDN needed)
scripts/        dev server, build, checks, CI summary, screenshots, playtest, make-truck.mjs (the truck)
tests/          Playwright playtests
ue5/            Unreal Engine 5 C++ project, frozen at the bootlegging design (see CHECKLIST.md)
```

## Credits
Street lamp model: "Arc Lamp - Victorian Street Lamp" by i-m-a-kitty-cat on Sketchfab,
licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (reduced and re-oriented
for the game; details in [assets/README.md](assets/README.md)). The truck is made in code
(`scripts/make-truck.mjs`).
