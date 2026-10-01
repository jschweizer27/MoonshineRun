# SHINE — A Prohibition Bootlegging Demo

Baltimore, 1922. You are **Otto Braun**, a Highlandtown brewer turned moonshine runner. Load
shine at the still, deliver it across the city, and beat the heat as Prohibition Bureau
Feds and Temperance Alliance zealots run you down.

This repository has two parts:

- **The playable demo** (repo root): a 3D browser game built with Three.js.
- **`ue5/`**: an Unreal Engine 5 C++ project for the full game, following the *Moonshine Run
  Dev Guide*, with the same rules and tuning as the web demo. Start with the step-by-step
  [`ue5/CHECKLIST.md`](ue5/CHECKLIST.md).

---

## ▶ Play

| Option | Setup | How |
|---|---|---|
| **In your browser** | Nothing | Open **https://jschweizer27.github.io/Shine-Demo/** *(live once GitHub Pages is on; see below)* |
| **Offline, no install** | Nothing | Download `Shine-offline-*.zip` from [Releases](../../releases), unzip it, and double-click **Shine.html** (uses the simpler built-in car and lamp models) |
| **From this folder** | [Node.js](https://nodejs.org) (free) | Double-click **`Play (Mac).command`** or **`Play (Windows).bat`**, or run `npm start` |

### Controls

Play with a **keyboard**, a **controller** (Xbox / PlayStation / most USB pads) or **touch**:
on-screen pedals appear automatically on phones and tablets.

| Action | Keyboard | Controller | Touch |
|---|---|---|---|
| Throttle / brake & reverse | `W` `S` or `↑` `↓` | RT / LT | GAS / BRAKE |
| Steer | `A` `D` or `←` `→` | Left stick | Drag on the left side |
| Handbrake (slide) | `Space` | A | DRIFT |
| Horn | `H` | B | HORN |
| Radio (the jazz soundtrack) | `R` | — | — |
| Look back | `C` | Y | — |
| Map | `Tab` or `N` | View / Back | map button |
| Pause menu | `Esc` or `P` | Start | ❚❚ button |
| Mute / fullscreen | `M` / `F` | — | buttons, top right |
| Game-feel effects on/off (to compare) | `J` | — | — |

Every key can be changed in **Settings → Controls**. Menus work with the arrow keys and
Enter, the D-pad and A/B, or touch.

### How to play

1. Press **Enter** (or click **START THE RUN**). A new game opens with **Act I**: the Temperance
   Alliance has torched your Highlandtown warehouse. Get out of the city up **York Road**.
2. In **Green Spring Valley** the stills hide in farm barns. Follow the **gold arrow**, the
   compass and the **gold GPS route** on the minimap to the **● still** and pick an order from
   the **order book**. Bigger loads pay more but draw more heat.
3. Deliver to the named buyer in Baltimore (**◆ drop**) to get paid.
4. While you haul, informants tip off the law and **patrols** can spot you. **Heat stars** send
   Prohibition Feds (they cut you off) and Temperance zealots (they ram) after you. At
   ★★ they set up **roadblocks** ahead (the GPS routes around them), and at ★★★ they're faster.
   - They need **line of sight**. Duck around corners or into the woods. When the bar reads
     *LOSING THEM…* and fills blue, you shed a star.
   - If they **pin you down while you're slow**, the red bar fills and you're **BUSTED**: you
     lose the cargo, pay a fine and continue from the hideout.
5. Roll slowly into the **⌂ hideout** to lie low (clears the heat if nobody sees you) and visit the
   **garage**. Hire the County Specialists (Mechanic, Wheelman, Still-master, Enforcer),
   buy a **1925 Rolls-Royce Phantom I** ($8,000: faster, and informants are slow to suspect
   a gentleman, but it can't tow the horse box, so no disguise, no armour and small loads
   only; switch between it and the truck at the garage), and later **bribe the sheriff** to
   make the county a safe zone.
6. As the story unfolds the Jockey teaches you the **horse-box disguise**: with shine aboard,
   stay **under 30 mph** and patrols see a thoroughbred, not a bootlegger.
7. Night runs are safer than daylight; rain makes the cobbles slick; fog hides you. **Otto's
   Ledger** keeps your books. Everything is saved: **Continue** picks up where you left off.

Tips pop up the first time you need them (turn them off or replay them in Settings).
Settings → Help also lets you **roll a new city layout** or **copy a link** to share yours.

**Sights and sounds:** everything is generated in the browser, with no image or audio files.
You get a stride-piano ragtime soundtrack that turns to hot jazz in a chase, a Model TT
truck towing a swinging horse trailer, 1920s Bureau sedans and Temperance pickups, neon
blade signs, rooftop water towers, and exhaust, dust and sparks. The engine shifts gears,
the tyres screech, sirens have Doppler shift, and you hear rain on the cobbles and
crickets in the valley.

### Settings

Volume (master / music / effects), graphics quality (**Auto** picks what your device can
handle), camera distance, minimap style, **large text**, **reduce motion and flashing**,
touch controls and key bindings. Everything is remembered between visits.

Graphics quality: **High** has shadows from the moon and the nearest lamp, 8 real lamp
lights and full bloom; **Medium** fewer lamp lights and half-resolution bloom; **Low** skips
shadows and post-processing for older machines.

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
| Every pull request / push to `main` | Syntax check, lint, build, and **automated playtests** in a real browser. Gameplay **screenshots** are attached to every run. | Actions → CI → run → *Summary* (artifact **gameplay-screenshots**) |
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

- **Tune the game** in [`src/config.js`](src/config.js): speeds, heat rates, rewards, police,
  camera and the night look (`look`: exposure, fog, moonlight, window glow). Every number
  is commented.
- **Tune the game feel** in [`src/juice.js`](src/juice.js) (`JUICE`: camera spring, FOV kick,
  shake, body roll, skid marks, smoke...). With `?debug` every value has a live slider;
  press `J` in-game to switch all of it off and compare.
- **Art-direction screenshots:** `npm run shots -- mylabel` (chase, street and truck views
  plus render cost) and `npm run reel -- mylabel` (a launch / brake / drift / crash contact
  sheet with the effect values), in `artifacts/shots/`.
- URL flags: `?debug` (stats overlay + `window.shine` API), `?test` (deterministic missions),
  `?seed=123` (a different city layout).
- Project conventions and architecture notes for AI-assisted work are in
  [`CLAUDE.md`](CLAUDE.md).

### Project layout

```
index.html, styles.css   page, HUD, menus (loading/error screens, responsive overlays)
src/
  main.js       boot, game loop, state machine, career flow
  config.js     all tuning numbers
  world.js      seeded 1920s city: cobbles, rails, instanced buildings + lamps, drops
  county.js     Green Spring Valley: farm roads, barns, woods, fences
  environment.js  day/night cycle and weather
  career.js     saved progress: cash, upgrades, story, stats, ledger
  story.js      story beats from the treatment
  screens.js    order book, garage, ledger, dialogue cards
  effects.js    the Act I warehouse fire
  particles.js  exhaust, dust, sparks, smoke and embers
  music.js      generated ragtime soundtrack
  collision.js  2D colliders, bounds, line of sight
  roadgraph.js  street graph + pathfinding
  vehicle.js    driving physics (grip, handbrake, collisions)
  models.js     procedural 1920s trucks, sedans and pickups
  police.js     pursuer AI (pooled cars, road navigation, search, give up)
  mission.js    bootlegger loop + heat / evasion
  camera.js     chase camera (+ look back)
  input.js      keyboard (remappable), gamepad, touch controls
  ui.js         menu screens, focus navigation, settings panel
  minimap.js    corner radar + full map with GPS route
  tutorial.js   first-run tips
  settings.js   saved preferences and key bindings
  hud.js, waypoint.js, audio.js, save.js, debug.js, rng.js
sw.js, manifest.webmanifest, favicon.svg, icons/   installable, offline-capable app
assets/         3D models (truck, Rolls-Royce, Bureau sedans, street lamps) and their credits
vendor/three/   Three.js r160 (bundled; no CDN needed)
scripts/        dev server, build, checks, CI summary
tests/          Playwright playtests
ue5/            Unreal Engine 5 C++ project (open MoonshineRun.uproject; see CHECKLIST.md)
```

## Credits
3D models from Sketchfab, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
(reduced and re-oriented for the game; details in [assets/README.md](assets/README.md)):
"Moonshine Runner" by car-go, "Volvo PV4 V2" by Libau Media, "Arc Lamp - Victorian Street
Lamp" by i-m-a-kitty-cat, "1925 Rolls Royce Phantom I Jonckheere Coupe" by Antonio Sagistiano.
