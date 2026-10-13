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
| Open the trunk | `T` | X | box button, top right |
| Headlamps on/off | `L` | d-pad down | lamp button, top right |
| Otto's notebook | `B` | left stick click | book button, top right |
| Abilities (from rank 1 up) | `1` `2` `3` | D-pad ← ↑ → | chips above the speedometer |
| Horn | `H` | B | HORN |
| Radio (the jazz soundtrack) | `R` | — | — |
| Look back | `C` | Y | — |
| Map | `Tab` or `N` | View / Back | map button |
| Pause menu | `Esc` or `P` | Start | ❚❚ button |
| Mute / fullscreen | `M` / `F` | — | buttons, top right |
| Game-feel effects on/off (to compare) | `J` | — | — |

**In the trunk:** the arrows (or D-pad) move the piece, **R** / **Q** (or LB / RB) turn it,
**Enter** (A) puts it down, lifts a piece or swaps the two, **X** leaves it on the road, and
**Esc** (B) closes the trunk. You can also drag pieces with the mouse. On a touch screen,
tap a cell to aim and tap it again to put the piece down; **TURN IT**, **LEAVE IT** and
**DONE** do the rest. On a phone the game is best held sideways.

Every key can be changed in **Settings → Controls**. Menus work with the arrow keys and
Enter, the D-pad and A/B, or touch.

### How to play

1. Press **Enter** (or click **START DRIVING**). Otto's truck starts on **York Road**, just
   inside the city. On a new game, short tips walk you through the first pickup, packing the
   trunk and the first sale (skip them from the tip card or the pause menu).
   **The story** runs in chapters, one step at a time. The banner and the gold route on the
   radar show the next step when nothing more pressing is on (a chase, an order, cargo to
   sell). **Chapter 1, Ashes:**
   - search the ruins of Braun & Sons in Highlandtown (★ on the radar) for Father's copper coil;
   - get the still running;
   - earn Gus Kessler's trust;
   - go back to the brewery cellar after dark.

   **Chapter 2, Green Spring:**
   - Ma Pruitt teaches Applejack;
   - win over the Jockey;
   - get into the Harrow Stables office one night.

   **Chapter 3, The Western Line:**
   - win Mags O'Rourke's trust;
   - load two crates of Corn Shine onto the **midnight freight**, which stands at the Glyndon
     siding only from 23:00 to 01:30;
   - search the guard's van before it pulls out.

   **Chapter 4, Stone and Iron:**
   - collect Moss Delaney's crates at the Cockeysville quarry after dark;
   - get them to Gus Kessler past the York Road checkpoint;
   - win Sheriff Hale's trust (from then on, he can make a bust in the county go away, for a
     price);
   - buy his buried report on the fire at the lockup.

   **Chapter 5, Drowned Warren:** drive out east of Cockeysville to **Loch Raven**, where the
   mill town of Warren went under the reservoir, and search the drowned mill after dark. Then
   get away.

   Each chapter ends in a **clue** to who paid for the fire, and the first four in a tool:
   - the farm tyres stop the fields slowing you, so you can go round a roadblock across country;
   - the **false bottom** hides two crates from a search;
   - the **police-band radio** shows every Bureau car on the radar, and which way it's looking.

   While a step waits on someone, they post an order every day. Some steps put a **story order**
   in the book: no deadline, but it can't be dropped. The notebook keeps the steps and the clues.

   **The endings.** After chapter 5 the choice is yours, and it ends the story:
   - **the deed:** buy back Braun & Sons at Lexington Market ($12,000) and go legit;
   - **the paper:** take the letters to the Baltimore Sun and bring the Alliance down.

   Either way the roads stay open afterwards.
2. Find **salvage**. Wrecked trucks in the ditch, abandoned farmhouses and rail sidings out in
   the county, and back-alley cellars in the city hold crates, bottle cases, sacks, barrels,
   jugs, kegs, copper and more. A **SALVAGE** sign marks the nearest one, and ⊗ marks them
   on the radar. Stop beside one to work it:
   - **Pry** (wrecks, sidings): press as the needle crosses the green; three slips and the
     wood splinters.
   - **Search** (farmhouses, cellars): watch where the goods glint, then pick your spots
     before the lamp dies.

   The better you do, the more you get (up to three pieces) and the better they are. A
   worked site is picked clean for a day or two. The best ones can only be worked at night,
   and a clean job at one of those can turn up a **rare find**: a gold pocket watch or a case
   of bonds, which pays big in one town. If Father's coil is lost before it's fitted (sold, or
   left on the road), the ruins open again: he always kept a spare.
   Lamp posts give way if you hit them; they're back up by dawn.
3. Everything you find goes into the **trunk**, one piece at a time: turn it and fit it in;
   pieces can't overlap. Leave behind what won't fit, or press **T** any time to rearrange.
   A hard crash can throw a piece out onto the road.
4. With loot aboard, the banner's arrow and the **gold route** on the radar lead to the
   nearest **⬢ market**. Stop inside its ring to sell: **Lexington Market** in the city, the
   **Monkton General Store** at the crossroads up York Road, or the **Glyndon Depot** out west
   in the valley. Out east, the quarry town of **Cockeysville** has a company store that pays
   best for copper, kegs and barrels, but it only deals with a **Runner** (see ranks, below);
   until then its mark on the radar is barred. Each town pays differently,
   prices drift day to day, and selling a lot of one thing in one place drives its price down.
   From the second day on, one town each day pays **double** for one kind of loot: the
   banner and the market say which.
5. Spend your cash at any market on **upgrades**: a bigger bed (the trunk grows and the
   truck gets reinforced rails), a tuned engine, stiffer springs, **padding** (fewer
   breakages in a crash) and a **spotter** (salvage sites further off on the radar; at the top
   level, all of them). The county stores (Monkton, Glyndon, Cockeysville) also sell the
   still's makings: sacks, jugs and small crates, straight into the trunk.
6. **Otto's barn** (⌂ on the radar, just off York Road outside the city) is home: store loot in
   its stash between trips, and mend the truck in its garage. Hard knocks wear the truck and
   slow it down until it's repaired.
7. The roads aren't empty: motor cars, delivery vans and horse carts go about their
   business, busier in the city than the valley and quieter late at night. Hit one and it's a
   crash like any other: it wears the truck, and a hard one can throw a piece out of the
   trunk onto the road. Now and then something happens out there for a few hours: rain
   washes out a valley road, a farm cart breaks down across one (a ⚠ on the radar; the
   route goes around), a fog bank rolls in, or a town holds its **market day** and pays 15%
   more for everything.
8. The barn's **still** turns loot into shine. Install a copper coil, then brew from what you've
   gathered (Corn Shine takes a sack and jugs; better recipes come later). A batch has three
   parts:
   - **The fire:** hold the throttle to stoke it, and keep the needle in the drifting band.
   - **The cuts:** the run comes off as heads (poison), hearts (the good stuff) and tails.
     Press to cut into the hearts as the gold starts and out as it ends. Cut early and the
     batch is poison.
   - **Proofing:** press once as the bead crosses the line.

   The batch is graded A, B or C, and a better one makes more crates. Each recipe's crates on
   hand are one blend, and its grade sets the price. A bad batch can be poured out. Kept, it
   taints the blend, and selling tainted shine blinds someone and costs you your name. Each
   recipe runs differently: Applejack burns hot, and Rye has narrow hearts. Jars, bottles and
   shine break in a hard crash.
   Shine sells only at the city's **speakeasies**, after dark; with crates aboard, the radar
   shows them. With nothing to do till dark, **sleep** at the barn till dusk.
9. **Revenue agents** patrol the roads, more of them at night. Each watches the road ahead in a
   cone. If one sees shine aboard, you have **heat** (the ★ pill):
   - at one star, the agent follows you;
   - at two, a second car comes and a **roadblock** goes up on your route;
   - at three, every car in the county is after you.

   Get out of their sight to lose them. Boxed in and stopped, you're **busted**: the shine is
   taken, you pay a fine (a quarter of your cash, at most $750), and you wake at the barn.
   Quitting to the title with the Bureau on your tail counts as a bust. At night, turn
   the **headlamps off** (L, or d-pad down) to be harder to spot, though you'll see less. A
   **checkpoint** stands at the York Road gap at night from chapter 3. Stop and they search the trunk; run it
   and they chase you. The **false bottom** upgrade (from Runner) hides a couple of crates.
10. **Orders**: the people at the speakeasies and the farms post orders each day, on the
   board at any market, speakeasy or the barn: Gus Kessler at the Highlandtown Speakeasy,
   Ma Pruitt at Old Mill Barn, the Jockey at Harrow Stables and a dozen more, each in their
   own words. Once you're a Brewer, Sheriff Hale sends for things too, to the county lockup in
   Cockeysville.
   - **The book:** keep up to three orders at once (a chapter's own orders don't count).
     Whoever the chapter is waiting on always has an order on the board, and a fresh one
     after each you deliver. SELL EVERYTHING keeps back what the orders in the book want.
   - **Farms** want goods, any time before the order is due. Ma Pruitt wants the still's
     makings; the Jockey, once you brew, wants shine for the estates' parties.
   - **Shine:** once you brew, the speakeasies want shine of a grade (C, B or A), handed over
     only **after dark** and by the next dawn. That's the night run past the Bureau.
   - **Delivering:** stop at their door (the banner tells you when you're there). They come
     out, hand over the money and say their piece; one card lists everything handed over. Orders pay well over the market, and more
     the further they are from the barn.
   - **Trust:** each contact's trust (one to five stars) grows with every order kept. Grade A
     shine earns extra; dropping an order costs some, missing one more, and tainted shine most
     of it. Trusted contacts pay more and order more and better. At three stars they open up
     at the handoff, and some of them know things about the fire. Once Sheriff Hale trusts
     you, a bust out in the county goes away for a price; in the city, the Bureau answers to no
     sheriff.
   - **Otto's notebook** (`B`, or the pause menu) keeps the order book, every contact and their
     trust, what they've told you, the recipes with your best batches, and the clues.
11. Reputation (from jobs, good brews and rare finds) earns **ranks**: Junk Hauler, Scavenger,
   Runner, Brewer, Bootlegger and King of York Road. Each unlocks something: the better
   recipes, upgrade levels 4 and 5, new upgrades (farm tyres, spotlamps, steel plating) and
   three **abilities**: the **Jockey's Tip** (every salvage site on the radar for a while),
   **Lead Foot** (a burst of speed) and **Sweet Talk** (the next sale or job pays 20% more).
12. The story ends with **the deed or the paper** (above). The roads stay open after it.
13. Rain makes the cobbles slick; off the dirt lanes in the valley the truck bogs down in the
   fields. **Otto's Ledger** (in the pause menu) keeps your books, and how long each chapter
   took you. Everything is saved: your
   cash, upgrades and whatever is in the trunk. **Saved games** on the title screen holds
   three slots: continue one, start a new game in another, or erase one.

Settings → Help also lets you **roll a new city layout** or **copy a link** to share yours.

**Sights and sounds:** everything but the street lamp model is generated in the browser,
with no image or audio files: a painted brick-and-stone city with neon blade signs, bay
windows and rooftop water towers, three villages in the valley, and exhaust, dust and
sparks. The radio plays four tunes of its own, fading from one to the next: stride piano by
day, the blues in the city at night, a waltz in the valley after dark and a fast rag when
you put your foot down. The engine shifts gears, the tyres screech, and you hear rain on the
cobbles, jazz from the speakeasies at night, crickets in the valley, the city's crowds and
the ships on the harbour, Monkton's cattle and church bell, the train at Glyndon and the
quarry blasting at Cockeysville. A market's door bell rings when you stop, and the till
rings when you sell.

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
  `node scripts/playtest.mjs mylabel` (a scripted run from the title screen through every
  system: the markets, the barn and the still, a speakeasy, a contract, a rank and Lead
  Foot, Cockeysville, a road event and the traffic), all in `artifacts/shots/`.
  `node scripts/economy.mjs 20 0.85` drives a salvage bot for twenty minutes (working each
  site at a score of 0.85) and prints what salvage earns a real minute and the still's makings
  it finds (`node scripts/economy.mjs 20 0.5 0 7`: a fair job, city seed 7; compare a few
  seeds). `node scripts/progress.mjs` models the story's pacing from the tuning: each
  chapter's minutes, the hours to the ending's choice and the cash then, for a rusher, a
  steady player and a casual one.
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
  county.js     Green Spring Valley: farm roads, barns, woods, fences, Monkton, Glyndon and
                Cockeysville (with its quarry yard)
  environment.js  day/night cycle and weather
  loot.js       loot along the roads (pooled, one instanced mesh for every kind)
  traffic.js    cars, vans and carts on the roads near the view (pooled, one instanced mesh)
  roadevents.js washouts, broken-down carts, fog banks and market days
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
