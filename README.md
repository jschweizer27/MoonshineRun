# SHINE — A Prohibition Bootlegging Demo

Baltimore, 1922. You are **Otto Braun**, a Highlandtown brewer turned moonshine runner. Load
shine at the still, deliver it across the city, and beat the heat as Prohibition Bureau
Feds and Temperance Alliance zealots run you down.

This repository has two parts:

- **The playable demo** (repo root): a 3D browser game built with Three.js.
- **`ue5/`**: a C++ starting point for the full Unreal Engine 5 game, following the
  *Moonshine Run Dev Guide*. See [`ue5/README.md`](ue5/README.md).

---

## ▶ Play

| Option | Setup | How |
|---|---|---|
| **In your browser** | Nothing | Open **https://jschweizer27.github.io/Shine-Demo/** *(live once GitHub Pages is on; see below)* |
| **Offline, no install** | Nothing | Download `Shine-offline-*.zip` from [Releases](../../releases), unzip it, and double-click **Shine.html** |
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
| Look back | `C` | Y | — |
| Map | `Tab` or `N` | View / Back | map button |
| Pause menu | `Esc` or `P` | Start | ❚❚ button |
| Mute / fullscreen | `M` / `F` | — | buttons, top right |

Every key can be changed in **Settings → Controls**. Menus work with the arrow keys and
Enter, the D-pad and A/B, or touch.

### How to play

1. Press **Enter** (or click **START THE RUN**).
2. Follow the **gold arrow** (on the road, and the compass in the objective banner) and the
   **gold route** on the minimap to the **● still**. Drive into its ring to load shine.
3. Deliver it to the **◆ drop** to get paid. A new still appears after each delivery.
4. While you haul, informants tip off the law. **Heat stars** send Feds and zealots after you.
   - They need **line of sight** to see you. Duck around corners and stay out of view.
     When the heat bar reads *LOSING THEM…* and fills blue, you shed a star.
   - If they **pin you down while you're slow**, the red bar fills and you're **BUSTED**.
     Keep moving! Your best haul is saved in your browser.
5. Tips pop up the first time you need them (turn them off or replay them in Settings).

### Settings

Volume (master / music / effects), graphics quality (**Auto** picks what your device can
handle), camera distance, minimap style, **large text**, **reduce motion and flashing**,
touch controls and key bindings. Everything is remembered between visits.

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
| Publishing a release (tag `v*`) | **Downloadable zips** are attached: offline single-file game + website files | Releases |
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

- **Tune the game** in [`src/config.js`](src/config.js): speeds, heat rates, rewards, police
  and camera. Every number is commented.
- URL flags: `?debug` (stats overlay + `window.shine` API), `?test` (deterministic missions),
  `?seed=123` (a different city layout).
- Project conventions and architecture notes for AI-assisted work are in
  [`CLAUDE.md`](CLAUDE.md).

### Project layout

```
index.html, styles.css   page, HUD, menus (loading/error screens, responsive overlays)
src/
  main.js       boot, game loop, state machine
  config.js     all tuning numbers
  world.js      seeded 1920s city: cobbles, rails, instanced buildings + lamps
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
vendor/three/   Three.js r160 (bundled; no CDN needed)
scripts/        dev server, build, checks, CI summary
tests/          Playwright playtests
ue5/            Unreal Engine 5 C++ scaffold
```
