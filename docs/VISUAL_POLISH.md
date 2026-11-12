# Visual polish brief

The game plays through end to end (a robot plays all three endings: `npm run playthrough`), and
its systems are tested. What's left is how it looks. This brief says how to see the game
without a screen, how to show a change, and where to start. The rules in `AGENTS.md` and
`CLAUDE.md` still hold: 12 lights, under 60 draw calls, nothing compiled mid-game, the phone
layout and the tests green.

## Seeing the game headlessly
All of these start the game in headless Chromium (software rendering) and write PNGs to
`artifacts/` (git-ignored):

| Command | What you get |
|---|---|
| `npm run shots -- dredge-<label>` | The full set (about 35 views): the street, chase cam, skyline, facades by day and night, the truck front, rear and reinforced, loot, the HUD, the trunk screen, a market and its upgrades, the barn, the three county towns from the road and above. It prints draw calls, lights, programs and geometries for each, and writes `artifacts/shots/dredge-<label>-counts.json`. |
| `npm run shots -- <label> [--day] [--rain]` | Three quick frames (chase cam, a wide street, the truck close up) with frame timings. |
| `npm run reel -- <label> [--off] [--wet]` | A contact sheet of a launch, a handbrake drift, hard braking and a crash, with the effect values printed (body roll, FOV, skid marks, smoke). `--off` is juice off. |
| `node scripts/playtest.mjs <label>` | A scripted run through every system (markets, the barn and still, a speakeasy, a contract, Cockeysville, a road event, traffic) to `artifacts/shots/`. |
| `npm run playthrough -- <label> --police off` | A robot plays the whole story (about 15 minutes) and saves a shot at every story step, the endings and a contact sheet in `artifacts/playthrough/<label>/`. |

Headless timings come from a software GPU: compare them with each other, never read them as
frame rates. For before/after, shoot the same label twice (`before`, `after`), on the same
`?seed` (the default layout is 1922).

## Where the looks live
- **The HUD:** `src/hud.js` and `styles.css` (tokens at the top: `--gold`, `--ts` text scale).
- **The screens** (markets, the barn, the trunk, the notebook, dialogs, the ending):
  `src/screens.js`, `src/trunkscreen.js`, `styles.css`, the markup in `index.html`.
- **Feel and juice:** `src/juice.js` (`JUICE`), `src/camera.js`, `src/particles.js`.
- **Post-processing** (bloom, the ACES grade, vignette, grain, the painterly pass, speed lines
  `uRush`): `src/post.js`, values in `CONFIG.look.post` (`src/config.js`).
- **The city and county:** `src/world.js` (lamps, the moon's shadow box), `src/county.js`,
  `src/towson.js`, `src/sky.js`, the painted atlas in `src/atlas.js`, the models and shared
  materials in `src/models.js`.
- **The objective beacon and markers:** `src/marker.js`, `src/minimap.js`.

## A starting list
From a baseline pass (`npm run shots -- dredge-baseline` on main, November 2026). Shoot it
yourself first; each item names the view that shows it. These are what the screenshots show.
Fix what you agree with, in this order or yours.

1. **Done (stage 19a).** ~~The market and store lists hide rows behind the footer.~~ The card
   now fits the screen, the list scrolls inside it with fading edges (`screens.js`
   `scrollFades`), and a long name keeps to one line. The original note:
   **The market and store lists hide rows behind the footer.** `dredge-baseline-market`,
   `-contacts`, `-upgrades`: the list (`#market-body`, `max-height: 52vh`, 44vh on small
   screens) is cut mid-row at both ends, and nothing shows that it scrolls. The last order
   ("Lulu Banks") and the last upgrade ("All-weather tyres") sit half under the SELL EVERYTHING
   / BACK ON THE ROAD bar. A fade at the scroll edges, or a list that ends on a whole row,
   would help. "MONKTON GENERAL STORE" also wraps to two lines and takes vertical space from
   the list.
2. **Done (stage 19a).** Sub-lines are 14px on a lighter `--muted`; a disabled button is
   hollow and dashed. The original note: **Small, low-contrast text on the screens.** The grey sub-lines in the market rows ("$19
   each today (base $20, low)", the upgrade descriptions), the trunk's control hints and its
   piece labels (SMALL, BOTTLES, BOX, COIL) are hard to read at 1280x720 and will be worse on
   a phone. The disabled BUY buttons (dark amber on dark) are barely told apart from the live
   ones.
3. **The barn yard view is cut by a black wedge.** `dredge-baseline-barn`: a dark triangle
   (near geometry, most likely a tree in the county) covers the top right third of the frame.
   Check whether the chase camera can end up there in play too.
4. **The moon is a blown-out blob.** `dredge-baseline-barn`: a large soft white disc with a
   hard bloom halo. A smaller, crisper moon with less bloom would read better.
5. **The truck from the front is a dark box.** `dredge-baseline-truck`: at night only the two
   headlamps read; the grille, bumper and cab are a single dark mass.
6. **The county towns are plain.** `dredge-baseline-monkton-day`, `-glyndon`,
   `-cockeysville`: same-sized boxy barns, flat green ground, white rail fences. Variety
   (sizes, roof colours, a few props) would help, inside the draw-call budget (the towns run
   33-40 calls now).
7. **Dark streets away from the lamps.** `dredge-baseline-street`, `-truck`: the asphalt
   between pools of lamp light goes nearly black, so the road edge is hard to see at night.

Not a bug: the HUD clock reads "Thu 9:30 PM" in the daylight views. The shot tool lights the
scene for day without moving the game's clock.

## Out of scope
Gameplay, balance and tuning, story text, saves, the robot (`scripts/bot/`), `ue5/`.
