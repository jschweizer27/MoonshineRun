# Shine: game design (v4)

*Status: approved direction. The numbers are targets to test, not promises.*

## Why this rewrite

The playtest of v3 found a driving toy, not a game:
- picking loot off the street is no challenge;
- jobs have no point, and their deliveries are short;
- there's no story pulling you forward, and nothing like Dredge's fishing at the heart of it.

v4 keeps what works and rebuilds the game around it. What works:
- the city and the valley;
- the truck and its handling;
- the trunk grid and the radar;
- the barn, the music, and the save slots.

The model is **Dredge**. One skill moment, fishing, feeds everything else:
- what you catch has to be packed into a cramped hold;
- going out at night pays more but frightens you;
- each region hides a piece of a mystery you need new gear to reach.

Shine maps onto that one for one:

| Dredge | Shine |
|---|---|
| Fishing mini-game | **Running the still**: making the cuts, keeping the fire |
| Cramped hold, fish that rot | **The trunk**: fragile jars that break in a crash |
| Night: panic, things in the fog | **Night: revenue agents**, roadblocks, chases |
| The Collector's relics | **Clues to who burned Braun & Sons** |
| Regions that need new gear | **County chapters** that need new tools |
| Two endings | **Two endings** |

## The pitch

Baltimore County, 1922. Last night the Temperance Alliance burned Otto Braun's Highlandtown brewery to the ground. What's left: a truck, his late father's barn up the Green Spring Valley, and a copper still the family swore they'd never use.

Otto brews shine by day and runs it by night, past Prohibition agents, to the people who'll pay for it. Every run brings him closer to two things:
- buying back the deed;
- finding out who really paid for the fire.

## One day, the core loop

A game day is about 16 real minutes. Dawn is the save point.

1. **Morning, at the barn.** Read the order book. Plan what to brew, and decide which orders you can fill tonight.
2. **Day: gather.** Drive to salvage sites and the stores for what the recipes need:
   - grain, sugar and apples;
   - jars and kegs;
   - copper and parts.

   The roads are safe by day, so this is the calm part of the day.
3. **Brew.** Run the still at the barn (the main mini-game, below). The batch's quality sets its price and what customers think of you.
4. **Pack.** Jars, cases and kegs go into the trunk grid. Pack well, because crashes break what's loose.
5. **Night: the run.** Deliver the orders across the county:
   - agents patrol;
   - a roadblock may go up at the York Road gap;
   - you can drive with your lights off.

   It pays far more than day work, and it's where the game is won or lost.
6. **Dawn.** Back at the barn: cash in, trust goes up, the day is saved. Anything still in the trunk at dawn is "hot". You'll need to stash it or keep running.

**The day/night tension:** day is safe but pays little, night pays well but is dangerous. As in Dredge, you choose how far to push your luck each night.

## The skill moments (our "fishing")

### 1. Running the still: the core mini-game

A batch has three short phases, about 45–60 seconds in all, each a different skill:
- **Fire (hold):** keep the temperature needle in its band as it drifts. We have this today; it becomes phase 1.
- **The cuts (timing):** spirit comes off the still in three parts. The heads are poison and get thrown out, the hearts are the good stuff, and the tails are weak. A Dredge-style ring sweeps round, and you press to switch jars as it crosses the marks. A clean cut gives top quality; a late cut ruins the batch.
- **Proofing (aim):** set the proof by eye: shake the jar, read the bead. One press on a moving gauge.

Quality is graded C to A. A-grade shine is what the best contacts order, and only at A can Otto "sign" a batch.

A bad batch can still be sold, but it costs trust. It also feeds the Temperance Alliance's "poison" story in the papers.

Each recipe changes the pattern:
- **Corn Shine** is forgiving.
- **Applejack** burns hot.
- **Barrel Rye** has narrow hearts.
- **Highlandtown Lager** is a different, brewery-scale mini-game in the finale.

Upgrades include a better thermometer, a second worm and a doubler. They widen the bands; they don't skip the skill.

### 2. Salvage sites: the supporting mini-game

Loose loot in the streets goes. About 20 fixed sites take its place, each with a short (about 10 s) timing mini-game:
- **Wrecks in the ditch:** pry the crate. A timing ring with two green zones.
- **Abandoned farmhouses:** search the cellar. Pick 3 of 9 spots before the lamp burns down.
- **Rail sidings:** siphon copper and kerosene. Hold and release on the pressure.
- **Strongboxes:** pick the lock. Feel the pins, one press per pin.

Sites refill over a few days. The best ones are out in the far county, or open only at night.

## The danger: agents and heat

- **Patrols.** Prohibition Bureau sedans drive the roads with headlights and sight cones. They're few by day and many at night, and thickest in the city and on York Road.
- **Heat (0–3).** Being seen with contraband aboard raises heat:
  - **heat 1:** they follow;
  - **heat 2:** they chase, and a roadblock goes up ahead on your route;
  - **heat 3:** every patrol in the county joins in.

  Break line of sight and heat cools. The old police AI (pursuers on the road graph, line of sight, roadblocks; in git history, `ffa627d^:src/police.js`) comes back and is adapted.
- **Lights off.** At night you can kill the headlamps. Agents spot you from much closer, but you see very little. That's a Dredge-style trade.
- **Getting caught.** Boxed in and stopped means a **bust**:
  - everything illegal in the trunk is confiscated;
  - you pay a fine;
  - you wake at the barn.

  With enough trust, Sheriff Hale can be bribed to make it go away.
- **Checkpoints.** A roadblock searches the trunk. A **false-bottom compartment** (an upgrade) hides a few cells from them.
- **Breakage.** A hard crash breaks jars: a cell is lost and its contents spill. Padding upgrades help.
- **Suspicion over days.** Too many busts or hot nights draw a raid on the barn, which costs part of the stash. Lie low for a day or pay off the Sheriff to clear it.

## Orders and the people who give them

The named contacts stay; there are 17 already. Each **order** says:
- who wants it, and the recipe, quality and how many;
- the deadline (usually tonight);
- what they'll pay.

Orders come from far across the county, so a city speakeasy can be the far end of the map from the barn. The run itself is the job.

- **The handoff.** Stop in their ring: the door opens, they come out, a short line of dialogue, the jars go across, you're paid. It must be impossible to miss.
- **Trust (0–5 per contact)** replaces ranks. Trust brings better orders, prices, story scenes, tools, and the next chapter.
- **Story orders.** These are fixed, chapter-defining runs with a twist: a tail, a deadline, a passenger, a cargo that must not break.

## Regions as chapters

Each region is a chapter with its own character, its own danger, its own salvage, and a **clue** hidden somewhere hard to reach. Getting to the clue needs a tool from the chapter before.

1. **Ashes: Baltimore and Highlandtown.**
   - Gus Kessler, Otto's old brewmaster, now runs a speakeasy.
   - The burned brewery is a salvage site.
   - **Clue:** a half-burned Temperance pledge card with a bank stamp on it.
   - Teaches the loop.
   - **Tool earned:** the still's copper coil.
2. **Green Spring: the valley.**
   - The Jockey and Ma Pruitt. Better recipes (Applejack).
   - **Clue:** a ledger page from Harrow Stables, showing payments to the Alliance.
   - Needs a night run onto the estates.
   - **Tool earned:** farm tyres, to cut across fields round roadblocks.
3. **The Western Line: Glyndon and the railway.**
   - Freight smuggling by the train timetable.
   - **Clue:** a freight manifest showing kerosene shipped to Highlandtown the night of the fire.
   - **Tool earned:** the false-bottom trunk.
4. **Stone and Iron: Cockeysville and the quarry.**
   - Sheriff Hale and Moss Delaney.
   - **Clue:** the Sheriff's buried report on the fire.
   - Bribery opens up.
   - **Tool earned:** a police-band radio that shows patrols on the radar.
5. **Drowned Warren: Loch Raven (new region, the finale).**
   - A real village drowned for the reservoir in the 1920s.
   - **The last clue** is in the flooded town, reached by night.
   - The Jockey's betrayal, and the Reverend's agent.

## The mystery and the endings

- **The answer.** The clues add up: the fire was paid for by the Reverend Coombs's Alliance, and the Jockey sold Otto out. The Jockey wanted the Braun barn's land; the Alliance wanted a headline.
- **The final choice:**
  - **The deed:** buy Braun & Sons back and go legit, waiting for Repeal. A quiet, bittersweet ending.
  - **The paper:** take the evidence to the *Baltimore Sun*. The Alliance falls, and Otto stays a bootlegger, king of York Road.

## Progression

- **Upgrades** cost cash *plus parts* from salvage, as in Dredge's research parts:
  - the still: thermometer, worm, doubler;
  - the truck: engine, springs, tyres, lamps, padding, false bottom;
  - the barn: a bigger stash, an aging rack.
- **Tools** open regions and clues (above).
- **Recipes** come from people: Ma Pruitt, Gus, the Jockey.
- **A notebook** (Dredge's encyclopedia) holds the orders, clues found, recipes, contacts and their trust, and your best batches.

## What's cut or changed

- **Loose loot in the streets** goes, and so does selling junk at markets. One scrapyard buys scrap. The general stores sell ingredients.
- **Ranks and abilities** become trust and tools. The Jockey's Tip becomes the radio.
- **Rare finds** become chapter clues and curios.
- **Lamp posts** knock over with a crunch, like the street props, instead of acting as walls (and some being passable). Telegraph poles in the county do the same.
- **Traffic and road events** stay as night hazards and cover.

## The build, in stages

Each stage ends playable. You play it before the next one starts.

1. **Foundations.**
   - Lamp posts knock over.
   - A clear delivery handoff.
   - Salvage sites replace street loot, with their first two mini-games.
   - The day/night clock on, with dawn saves.
2. **The still as the core.** The three-phase brewing mini-game, quality grades, recipes with their own patterns, breakable jars.
3. **Agents and heat.** Patrols, sight cones, lights off, chases, roadblocks, busts, the false bottom.
4. **Night runs and orders.**
   - Long orders with deadlines, from the contacts.
   - Trust.
   - The handoff scenes.
   - The notebook.
5. **Chapters 1–2.** Ashes and Green Spring, with their clues and tools.
6. **Chapters 3–5 and the endings.** Including the new Loch Raven region.
7. **Polish and balance.** A playtest pass, tuning, and real-device checks.

**Targets:** a first chapter of about 45–60 minutes, and the whole story in 5–7 hours.

## Decided

1. **Length of a day:** 16 minutes.
2. **Busts:** you lose the cargo and pay a fine.
3. **Tone:** yes, a bad batch can blind a customer and make the papers.
4. **Name:** **Shine**.
