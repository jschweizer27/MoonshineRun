# Shine: the 10–15 hour game (v5)

v4 tells one story (who burned Braun & Sons) in five chapters, in about 5 hours for a player
who plays well and buys upgrades. v5 doubles to triples that. It adds more of what already
works (people, places, night runs), a second act with two new regions, and a late game where
Otto runs an operation instead of a truck.

## What it adds

### 1. Side stories: the contacts' own arcs (about +3 h)
Every contact already has a voice, trust and a "trusted" line. At ★ to ★★★, six of them open a
story of their own: three or four steps on the chapter engine (orders, story sites, cards,
passengers, fragile loads). Each ends in a reward the main story doesn't give. They run
alongside the chapters; the notebook lists them, and you choose which one the banner follows.
One whose chapter has come but whose contact's trust falls short can be courted from the
notebook: that contact posts an order at the player's pace until it opens.
- **Izzy Feld, the pawned key.** A brass key stamped "Braun & Sons". It opens Father's sealed
  vault under the ruins: his recipe book, and a new recipe, **Braun's Kümmel**.
- **Doc Wexler, the prescription pad.** Medicinal whiskey is legal with a doctor's
  prescription. Run his "patients'" orders by day, and the pharmacies buy shine in daylight.
- **Nell Pryor, the tomato crates.** Her cannery's trucks are never searched. Ride along on
  her route once, and Otto gets **cannery labels**: one checkpoint search a night is waved
  through.
- **Widow Carroll, the mortgage.** The Harrow estate wants her farm. Pay down her note in
  instalments, and beat the bank's man to the courthouse one night. Her barn becomes a
  **second still** for Otto.
- **Sal Romano, the wedding.** Two hundred guests: a huge order, delivered in three runs in
  one night, fragile, with a passenger (the bride's uncle). It pays a fortune, and Romano
  owes Otto: the Bureau's raids in Little Italy pass him by.
- **Lulu Banks, the band's night.** A jazz night at the Belvedere: bottle cases and Lager,
  then drive the band to the club before the first set. It opens **the Belvedere** as a
  buyer that pays double on Saturday nights.

### 2. Act II: the bank (chapters 6–9, about +4 h)
The chapter 1 clue was a pledge card stamped PAID by a Towson bank, and Act I never paid that
thread off. In Act II the letters from Warren name "Mr. V.": **Cyrus Vail**, president of the
Towson National Bank. His bank holds the Braun & Sons deed and every foreclosed brewery in
Baltimore, waiting for Repeal. The two endings move to the end of Act II, and a third joins
them.
- **Chapter 6, the County Seat:** a new region, **Towson**, east of the county wall (a town
  of streets, the courthouse, the bank, a market and a new speakeasy). Win over the
  courthouse tavern-keeper, and get into the bank's records room at night.
- **Chapter 7, Rum Row:** a new region, **the Canton waterfront** (piers, warehouses, a
  schooner riding offshore at night). Vail's partners bring imported Scotch and rum in by
  launch. Otto works Rum Row with Mags O'Rourke: pier pickups at night, a new premium cargo,
  and the **harbour patrol**.
- **Chapter 8, the Crackdown:** Agent Draper's Bureau goes after Otto's network. Raids hit
  the speakeasies (trust is at stake), the barn is watched, and the still has to move. Before
  the Bureau finds it, set up somewhere they won't look.
- **Chapter 9, King of York Road:** the auction of the foreclosed breweries. Three endings:
  - **The deed:** buy Braun & Sons back at the auction and go legit.
  - **The paper:** the whole story, Vail and the Alliance, to the Sun.
  - **The crown:** the Vail syndicate's routes become Otto's. This needs the operation (below)
    and the trust of half the city.

### 3. The operation: Otto's own outfit (late game, about +1–2 h)
- **More stills:** a second still at Widow Carroll's barn (her side story) and later a hidden
  one (chapter 8). They brew on their own over game days; collect the crates.
- **Aging:** Barrel Rye ages in the stash and grades up over a few days.
- **Braun's:** Otto's own speakeasy in the ruins' cellar. It sells what's stocked there
  every night, and pays.

### 4. Rivals (Act II)
Vail's hired trucks work the same salvage sites, beat Otto to orders, and at heat they try to
box him in and take the cargo (a hijack, not a bust). Losing them is like losing the Bureau,
and they're gone for good in chapter 9.

### 5. Winter (Act II)
The calendar turns to winter in Act II: snow on the roofs and fields, snow for rain, and ice
on the roads at night (less grip), and short days: the night runs 17:30–07:00 instead of
19:30–06:00, for the Bureau's checkpoint, the night sites, the night orders and the light
alike (`src/hours.js`; stage 16).

### 6. Night and nerve: the core loop, after DREDGE (the whole game, from the first night)
DREDGE (Black Salt Games) is a design touchstone for Shine's salvage-and-sell loop. These are
its ideas, rebuilt in Shine's own art, sound and code, applied to the whole game, Act I
included (nothing of DREDGE's is used):
- **Nerves** (DREDGE's panic): every hour on the road after dark wears Otto's nerves down;
  sleeping at the barn restores them, and his headlamps (and the lamps upgrade) slow the
  wear. On frayed nerves the night plays tricks: phantom headlights on the radar, a siren
  that isn't there, shapes at the roadside, a wobble at the wheel. All of it is drawn with
  what already exists (radar blips, the siren's sound, the fxLight), so no light is added.
- **The Finds codex** (DREDGE's encyclopedia): the notebook's catalogue of every kind of
  salvage, where it turns up, the best price paid, and its rare **odd** variants (a scorched
  coil, a bank-stamped strongbox: worth more, and found mostly at night). Completing a set
  pays (a contact's favour, a tool or cash).
- **Upgrades need parts** (DREDGE's research parts and materials): each level from 2 up
  takes salvaged parts (coils, barrels, radio sets...) as well as cash, so salvage has a
  use beyond selling.
- **Work takes time** (DREDGE's hours at the rod): working a site moves the clock on (a pry
  less than a search), so a night has a budget, and dawn comes sooner the greedier Otto is.

More from the same touchstone, in the same spirit:
- **Gear takes trunk space** (the hold's equipment slots): lamps, a spare tyre, the crowbar
  and the false bottom take trunk cells, so a run starts with a packing choice.
- **Cargo that spoils** (fish rot without ice): Lager and fresh makings sour with time; an
  ice block (a cell of its own, from the icehouse) keeps them. Shine never spoils.
- **Damage that bites** (hull breaches): a hard crash puts out a lamp or cracks a trunk cell
  until a garage fixes it.
- **Lore scraps** (messages in bottles): Father's diary pages, clippings and Bureau memos at
  night sites, collected in the notebook, foreshadowing Act II.
- **Bounties** (the collectors' requests): contacts ask for a named odd find by a day, and
  pay well over the market for it.
- Later, if the pacing has room: a tool for each kind of site (crowbar, lantern, grappling
  hook), drop boxes that fill over days (crab pots), the Black Car on frayed nerves (stage
  13), and charged late-game abilities.

## The build, in stages (each one PR, green, then merged)
8. **Side stories:** the engine (parallel arcs on the chapter machinery, a followed story)
   and the six arcs, with their rewards.
9. **Night and nerve (after DREDGE):** nerves, the Finds codex with odd variants, upgrades
   that take parts, work that takes time, gear in the trunk, spoiling cargo, damage that
   bites, lore scraps and bounties, across the whole game.
10. **Towson and chapter 6.** The endings move to after the last chapter.
11. **The Canton waterfront, Rum Row and chapter 7:** imported liquor, pier pickups, the
    harbour patrol.
12. **The operation and chapter 8:** more stills, aging, Braun's; the raids and moving the
    still.
13. **Rivals and chapter 9:** hijackers, the auction and the three endings.
14. **Winter, balance and polish:** the pacing model extended and tuned to 10–15 hours, docs,
    and phone checks.

## Status: built (stages 8–14, PRs #22–#29)
All of the above is in the game (with the differences listed below), plus the courting of a side story's contact (stage 14). The
pacing model (`node scripts/progress.mjs`, which plays the real chapters, offers and side
stories over a save) gives:

| Player | The story (9 chapters) | With the side stories |
|---|---|---|
| Rusher (plays well, story only, sleeps through the days) | 2.2 h | (none) |
| Steady (plays well, salvages by day, two more orders a night) | 8.6 h | 14.0 h |
| Casual (plays fairly, drives slower, one more order a night) | 14.2 h | 24.8 h |

So the game is 10–15 hours for most players: a steady player who does everything, or a
casual one who plays the story. Stage 14 lowered three side stories' trust (Widow Carroll
★, Nell Pryor and Sal Romano ★★), counted the night's side orders toward trust as the game
does, and added courting, which the model's trust-building assumed.

Built differently from the design above:
- Vail is named by the bank's records room in chapter 6 (a letter among the salvage hints at
  him earlier), not by the letters from Warren.
- The Crackdown raids Otto's barn, not the speakeasies, and the still stays put: a hidden one
  in the hollow joins it.
- The deed is bought back at Lexington Market, by paying off the bank's note, not at the
  auction.
- Vail's men hijack loads and pick salvage sites clean at dawn; they don't take orders. They
  come once Vail is named.
- Gear is spotlamps, a crowbar, a storm lantern, a grappling hook, a toolbox, ice and drop
  boxes (no spare tyre; the false bottom stays an upgrade), and only Lager spoils.
- The tool for a kind of site (stage 16): the crowbar for a pry, the lantern for a search, and
  the grappling hook for a new kind, the shallows (four sunk wrecks, with the ship's bell as
  their own find). Drop boxes: three at most, a piece a day up to four, emptied or taken back
  at the site.

Stage 16 added what was left out: shorter winter days (above), DREDGE's tool for each kind
of site, drop boxes that fill over days, charged late-game abilities and Act II's own story
beats. The UE5 project (`ue5/`) keeps the first design and is frozen, so none of
v5 is mirrored there.

**Constraints, as before:**
- 12 lights, and under 60 draw calls.
- Nothing compiled or allocated mid-game.
- Seeded layouts stay put: new regions use their own random streams, and the layout lock
  stays green.
