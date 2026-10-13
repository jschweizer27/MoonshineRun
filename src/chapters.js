import { trustLevel } from './contracts.js';
import { CONFIG } from './config.js';

// The story in chapters (docs/GAME_DESIGN.md "Regions as chapters"). Pure logic over the
// save (dredgecareer data): each chapter is a run of steps taken in order, each step done
// when its test on the save passes; the last ends in a clue to who burned Braun & Sons and,
// but for the last chapter, a tool that the next one needs. Story salvage sites (salvage.js
// `story`) open while their step is the current one. After the last chapter comes the
// choice between the two ENDINGS. main.js calls advance() and plays what it returns.
//  - `lines` on a step play when it's done; `open` / `close` when a chapter starts / ends.
//  - `site`: the story site this step opens, only after dark (`night`) or in a `window` of
//    game hours; working it does what `gives` (loot kinds into the trunk, `got` the toast),
//    `sets` (a save flag) and `finds` (the chapter's clue) say, and `ambush` springs a trap.
//  - `at`: another place the step leads to ('barn', 'loch').
//  - `who`: the contact the step waits on (the day's board adds an offer from them).
//  - `order`: a story order the step puts in the order book while it's current (main.js
//    `_storyOrders`): for `who`, at `at` ('load' at the freight, or a contact), wanting
//    `wants`, after dark (`night`) or in a `window`; delivered, it sets flags['order:<step>'].
//    A `passenger` (`who`, picked up at the door of the contact `from`) rides along to it;
//    a `fragile` load breaks a crate on any hard knock.
//  - `learn`: a recipe the step teaches (CONFIG.dredge.brew recipes with `learn`); `flag`: a
//    save flag it sets once done.
//  - `lost`: what the step needs that the player can lose (sell, leave behind) before it's
//    done: while `when(save, onHand)` holds, `site` opens again to give `gives` (`got` the
//    toast), and the banner reads `text`. Father's coil, before it's fitted.
const S = CONFIG.dredge.story;
const crates = (n, kind) => Array.from({ length: n }, () => kind);

export const CHAPTERS = [
  {
    id: 'ashes', title: 'Ashes', place: 'Baltimore and Highlandtown',
    open: [
      ['narrator', 'Chapter 1: Ashes. Highlandtown, where Braun & Sons stood.'],
      ['otto', 'Before I can brew a drop, I need copper. Father kept a spare coil in the brewery’s cellar. If the fire left anything, it’s down there.'],
    ],
    steps: [
      { id: 'ruins', text: 'Search the ruins of Braun & Sons in Highlandtown', site: 'ruins', gives: ['coil'], got: 'Found in the ruins: Father’s copper coil', sets: 'ruinsSearched', done: (d) => !!d.flags.ruinsSearched,
        lines: [['otto', 'Father’s copper coil, black with soot but whole. The still at the barn can run again.']] },
      { id: 'still', text: 'Fit the coil at the barn and run a batch', at: 'barn', done: (d) => (d.still || 0) >= 1 && (d.stats.brews || 0) >= 1,
        lost: { site: 'ruins', gives: ['coil'], got: 'Another coil in the ashes: Father always kept a spare', text: 'Father’s coil is gone. Search the ruins for the spare',
          when: (d, have) => (d.still || 0) < 1 && !have.coil } },
      { id: 'gus', text: 'Deliver an order to Gus Kessler at the Highlandtown Speakeasy', who: 'kessler', done: (d) => (d.delivered.kessler || 0) >= 1 },
      { id: 'gus-trust', text: 'Earn Gus Kessler’s trust (★★)', who: 'kessler', done: (d) => trustLevel(d.trust.kessler) >= 2,
        lines: [
          ['kessler', 'Otto. I didn’t want to say it before. The night of the fire, the doors to the cellar stairs were wedged shut from outside.'],
          ['kessler', 'Whoever lit it knew the building. Go and look down there yourself, after dark, when nobody’s watching the ruins.'],
        ] },
      { id: 'cellar', text: 'Search the brewery cellar', site: 'ruins', night: true, finds: 'pledge', done: (d) => !!d.clues.pledge },
    ],
    clue: { id: 'pledge', title: 'A half-burned pledge card', text: 'A Temperance Alliance pledge card, scorched at the edges, found under the cellar stairs. On the back, a Towson bank’s stamp: PAID, and the date of the fire.' },
    tool: { id: 'coil', name: 'Father’s copper coil', text: 'The still runs. Brewing is open to you.' },
    close: [
      ['otto', 'An Alliance pledge, stamped PAID by a bank in Towson, the day Braun & Sons burned. Somebody bought that fire.'],
      ['narrator', 'Chapter 1 complete. The trail leads up the Green Spring Valley, where the money lives.'],
    ],
  },
  {
    id: 'green', title: 'Green Spring', place: 'the Green Spring Valley',
    open: [
      ['narrator', 'Chapter 2: Green Spring. Old money, older barns, and the Harrow estate buying up every farm along the valley.'],
      ['otto', 'Ma Pruitt at Old Mill Barn knows every still in this valley, and the Jockey knows every estate. Time I worked for both.'],
    ],
    steps: [
      { id: 'pruitt', text: 'Deliver an order to Ma Pruitt at Old Mill Barn', who: 'pruitt', done: (d) => (d.delivered.pruitt || 0) >= 1, learn: 'applejack',
        lines: [
          ['pruitt', 'You keep your word, Braun. So I’ll show you Applejack: apples, a hot fire and a quick hand on the cuts. It burns, so mind it.'],
          ['narrator', 'Learned: Applejack. Two small crates and a jug cluster at the still.'],
        ] },
      { id: 'applejack', text: 'Brew a batch of Applejack', done: (d) => (d.best.applejack || 0) > 0 },
      { id: 'jockey-trust', text: 'Earn the Jockey’s trust (★★)', who: 'jockey', done: (d) => trustLevel(d.trust.jockey) >= 2,
        lines: [
          ['jockey', 'You’re all right, Otto. Come to the steeplechase Saturday. The Harrow crowd will be there, and the office at the stables stands empty all night.'],
          ['otto', 'Empty all night. He says it like he wants me to know.'],
        ] },
      { id: 'office', text: 'Get into the Harrow Stables office', site: 'office', night: true, finds: 'ledger', done: (d) => !!d.clues.ledger },
    ],
    clue: { id: 'ledger', title: 'A ledger page from Harrow Stables', text: 'Torn from the stables’ books: monthly payments from Harrow Stables to the Temperance Alliance of Maryland, the largest the week before the fire. In the margin, initials: J.' },
    tool: { id: 'tyres', name: 'Farm tyres', text: 'Deep-tread tyres from the Harrow sheds: no more bogging down in the fields, so you can cut across country round a roadblock.' },
    close: [
      ['otto', 'Harrow money, paid to the Alliance, the week before the fire. And a J in the margin.'],
      ['narrator', 'Chapter 2 complete. Money buys a fire, but somebody still has to carry the kerosene. Out west, the railway carries everything.'],
    ],
  },
  {
    id: 'western', title: 'The Western Line', place: 'Glyndon and the railway',
    open: [
      ['narrator', 'Chapter 3: The Western Line. Out past Glyndon, the Western Maryland Railway runs its freight up to Hagerstown and back every night, by the timetable.'],
      ['otto', 'Mags O’Rourke said a barge of kerosene came in the week of the fire, and nobody unloaded it at Canton. Freight that doesn’t come ashore goes somewhere by rail.'],
    ],
    steps: [
      { id: 'mags-trust', text: 'Earn Mags O’Rourke’s trust (★★)', who: 'orourke', done: (d) => trustLevel(d.trust.orourke) >= 2,
        lines: [
          ['orourke', 'You’re asking after that kerosene. It went up the Western Line, Otto: forty drums of it, the night your brewery burned.'],
          ['orourke', 'The midnight freight stands at Glyndon from eleven till half past one. Walt Purdy rides the guard’s van, and he owes me. Only tonight he’s asleep in my back room, and he’s missed his train.'],
          ['orourke', 'Get him to Glyndon before she pulls out, then load two crates of corn for my cousins in Hagerstown, and he’ll let you read his waybills. Mind how you drive: Walt’s got a weak stomach.'],
        ] },
      { id: 'purdy', text: 'Carry Walt Purdy from the Fells Point docks to the Glyndon siding while the freight stands (23:00–01:30)',
        order: { who: 'guard', at: 'load', place: 'the Glyndon siding', wants: {}, window: S.freight.window, pay: S.passenger.pay, passenger: { who: S.passenger.who, from: S.passenger.from } },
        done: (d) => !!d.flags['order:purdy'],
        lines: [['guard', 'In time, and my dinner still where I left it. Mags was right about you. Now, those two crates for Hagerstown.']] },
      { id: 'freight', text: 'Load 2 crates of Corn Shine onto the midnight freight at Glyndon (23:00–01:30)',
        order: { who: 'guard', at: 'load', place: 'the Glyndon siding', wants: { [S.freight.kind]: S.freight.count }, window: S.freight.window, pay: S.freight.pay },
        done: (d) => !!d.flags['order:freight'],
        lines: [['guard', 'Two crates for Hagerstown, and nobody the wiser. Mags said you’d want the waybills: they’re in my van. Be quick about it. We pull out at half past one.']] },
      { id: 'waybills', text: 'Search the guard’s van before the freight pulls out (23:00–01:30)', site: 'van', window: S.freight.window, finds: 'manifest', done: (d) => !!d.clues.manifest },
    ],
    clue: { id: 'manifest', title: 'A freight waybill from the night of the fire', text: 'Forty drums of kerosene off a harbour barge, sent up the Western Line to the Highlandtown siding the night Braun & Sons burned. Consigned to the Temperance Alliance of Maryland. Charges paid by Harrow Stables.' },
    tool: { id: 'falsebottom', name: 'A false bottom', text: 'The railway lads fitted the truck with a false floor like the ones in their boxcars: a checkpoint search misses two crates of shine.' },
    close: [
      ['otto', 'Harrow money paid for the kerosene, and the Alliance took delivery. Somebody at Harrow Stables wanted my brewery gone.'],
      ['narrator', 'Chapter 3 complete. A fire in Baltimore County gets written up by the Sheriff. Cockeysville, then.'],
    ],
  },
  {
    id: 'stone', title: 'Stone and Iron', place: 'Cockeysville and the quarry',
    open: [
      ['narrator', 'Chapter 4: Stone and Iron. Cockeysville, where the quarries cut the marble for the Washington Monument, and Sheriff Hale keeps the county’s peace for a consideration.'],
      ['otto', 'If a building burns in this county, the Sheriff writes it up. I want to read what he wrote.'],
    ],
    steps: [
      { id: 'consignment', text: 'Collect Moss Delaney’s consignment at the Cockeysville quarry', site: 'quarry', night: true,
        gives: crates(S.consignment.count, S.consignment.kind), got: 'Moss Delaney’s men load two crates of corn shine', sets: 'consignment', done: (d) => !!d.flags.consignment,
        lines: [
          ['delaney', 'Two crates of my own corn, for Gus Kessler in Highlandtown. The Bureau stops every truck at the York Road gap after dark, so let’s see that false floor earn its keep.'],
          ['delaney', 'Get them through, and Gus will tell you what I know about Sheriff Hale and your fire.'],
        ] },
      { id: 'run', text: 'Get Delaney’s crates to Gus Kessler, past the York Road checkpoint (fragile: no hard knocks)',
        order: { who: 'kessler', at: 'kessler', wants: { [S.run.kind]: S.run.count }, night: true, pay: S.run.pay, fragile: true },
        done: (d) => !!d.flags['order:run'],
        lines: [['kessler', 'Through the Bureau’s own checkpoint! Moss Delaney sends word, Otto: the Sheriff wrote a report on your fire, and somebody paid him to bury it.']] },
      { id: 'hale-trust', text: 'Earn Sheriff Hale’s trust (★★★)', who: 'sheriff', flag: 'bribery', done: (d) => trustLevel(d.trust.sheriff) >= 3,
        lines: [
          ['sheriff', 'So Delaney’s been talking. Fine. My report on your fire is in a box at the lockup marked CLOSED, and a closed box can be opened, for a consideration. Come by after dark.'],
          ['sheriff', 'And Mr. Braun: if the Bureau ever catches you out in my county, you come to me. Bring an envelope.'],
          ['narrator', 'Bribery opens up: out in the county, Sheriff Hale can make a bust go away, for a price.'],
        ] },
      { id: 'report', text: 'Buy Sheriff Hale’s report at the Cockeysville lockup', site: 'lockup', night: true, finds: 'report', done: (d) => !!d.clues.report },
    ],
    clue: { id: 'report', title: 'Sheriff Hale’s report on the fire', text: 'Arson: kerosene on the cellar floor, the doors wedged shut from outside. A witness saw a Harrow Stables motor car on the Highlandtown road at midnight. Stamped CLOSED, by order of the county, the day after the Alliance’s cheque cleared.' },
    tool: { id: 'policeband', name: 'A police-band radio', text: 'Thrown in with the report: every Bureau car shows on the radar, wherever it is and whichever way it’s looking, and you hear their roadblocks go up.' },
    close: [
      ['otto', 'Harrow’s car on the road that night, Harrow’s money for the kerosene, and a J in Harrow’s ledger.'],
      ['narrator', 'Chapter 4 complete. The Jockey has been asking to see you.'],
    ],
  },
  {
    id: 'warren', title: 'Drowned Warren', place: 'Loch Raven',
    open: [
      ['narrator', 'Chapter 5: Drowned Warren. East of Cockeysville, Baltimore has dammed the Gunpowder for its water, and the mill town of Warren went under Loch Raven.'],
      ['kessler', 'Otto. Before you go chasing the rest of it: the copper kettle from Braun & Sons. My boys pulled it out of the ashes the week after, and it’s been in my cellar ever since.'],
      ['kessler', 'A still makes shine. A kettle makes lager. Brew your father’s Highlandtown Lager one more time, down in my cellar. Bring malt and a cask.'],
    ],
    steps: [
      { id: 'brewery', text: 'Brew Highlandtown Lager in Gus’s cellar (3 sacks of malt, a barrel)', site: 'brewery', learn: 'lager', done: (d) => (d.best.lager || 0) > 0,
        lines: [
          ['kessler', 'That’s it. That’s the taste of Highlandtown. Your father would have stood you a glass of it.'],
          ['narrator', 'Learned: Highlandtown Lager, brewed only in Gus’s cellar. The speakeasies will ask for it now. Then a boy at the cellar door, with a note.'],
          ['jockey', 'Otto! I hear you’ve been reading Harrow’s mail. It was old Harrow, not me. The proof’s at Warren: the estate kept its papers in the mill office, and the water’s low this autumn.'],
          ['jockey', 'Go at night, and go alone. Nobody watches a drowned town.'],
          ['otto', 'Kind of you to tell me, Jockey.'],
        ] },
      { id: 'loch', text: 'Drive out to Loch Raven, east of Cockeysville', at: 'loch', done: (d) => !!d.flags.loch,
        lines: [['narrator', 'Loch Raven. Rooftops stand out of the water where Warren used to be, and a church steeple, and by the landing the old mill, half under.']] },
      { id: 'mill', text: 'Search the drowned mill at Warren', site: 'mill', night: true, finds: 'letters', ambush: true, done: (d) => !!d.clues.letters,
        lines: [
          ['narrator', 'A tin box in the mill office, under a foot of water: letters, in a hand Otto knows. Then headlights along the dam road, a whole line of them.'],
          ['draper', 'Evening, Mr. Braun. Agent Draper, Prohibition Bureau. The Reverend sends his regards, and so does a friend of yours from the stables. Out of the truck.'],
          ['otto', 'Not tonight.'],
        ] },
      { id: 'escape', text: 'Get away from Loch Raven with the letters', at: 'barn', flag: 'betrayed', done: (d) => !!d.flags.escaped,
        lines: [['otto', 'The Jockey sent me to Warren, and the Bureau was waiting. He sold me out, the way he sold out Father’s brewery.']] },
    ],
    clue: { id: 'letters', title: 'The Jockey’s letters', text: 'Letters to the Reverend Coombs from the Warren mill office, in the Jockey’s hand: the Braun barn’s land for him once Otto is ruined, and the fire for the Alliance’s headline. Signed: J.' },
    tool: null,
    close: [
      ['otto', 'The Alliance wanted a headline, and the Jockey wanted Father’s land. Now I have it in his own hand.'],
      ['narrator', 'The end is yours to choose. Buy back the Braun & Sons deed at Lexington Market and go legit, waiting for Repeal. Or take the letters to the Baltimore Sun and bring the Alliance down.'],
    ],
  },
];

// The two endings, chosen once the last chapter is done (main._end): the deed bought back
// at Lexington Market, or the letters taken to the Sun. `lines` play, then the ending screen
// shows `title`, `sub` and the `epilogue`; `after` is the title screen's line from then on.
export const ENDINGS = {
  deed: {
    title: 'The Deed', sub: 'Braun & Sons, Highlandtown', after: 'Braun & Sons is yours again', ledger: 'The Braun & Sons deed',
    lines: [
      ['narrator', 'Highlandtown. A bank clerk slides a folded paper across the counter.'],
      ['otto', 'Braun & Sons. Mine again.'],
      ['otto', 'The letters can stay in Father’s strongbox. Let the Jockey keep his saddle and the Reverend his pulpit. I have a brewery to wait for.'],
      ['pruitt', 'Lager and shine under one roof. The Reverend will have a fit.'],
    ],
    epilogue: 'Otto Braun bought back Braun & Sons and went legit, as near as a man could in 1922. The brewery stood shuttered for eleven years. The day Repeal came, the first barrel of Highlandtown Lager rolled out of its doors, and Gus Kessler drew the first glass. The Jockey rode on, the Reverend preached on, and Otto never told anyone what was in the letters.',
  },
  paper: {
    title: 'The Paper', sub: 'The Baltimore Sun', after: 'The Alliance has fallen; York Road is yours', ledger: 'The Jockey’s letters, to the Baltimore Sun',
    lines: [
      ['narrator', 'The Baltimore Sun, after midnight. The night editor reads the letters twice, then reaches for the telephone.'],
      ['editor', 'This runs on the front page, Mr. Braun. The Alliance won’t last the week.'],
      ['narrator', 'TEMPERANCE CHIEF PAID FOR BREWERY FIRE, says the morning edition. By noon the Jockey has gone from Harrow Stables. By Friday the Reverend Coombs has resigned.'],
      ['otto', 'The Alliance wanted a headline. They got one.'],
    ],
    epilogue: 'The Temperance Alliance of Maryland was finished within the week, and the Jockey was never seen at a steeplechase again. Braun & Sons stayed a ruin, but the roads were Otto’s: from the harbour to the Pennsylvania line, nothing moved on York Road without the King of York Road knowing.',
  },
};

// The chapter and its current step (null once the chapter's steps are all done, or when
// every chapter is).
export function current(d) {
  const chapter = CHAPTERS[d.chapter || 0] || null;
  if (!chapter) return { chapter: null, step: null, index: d.chapter || 0 };
  return { chapter, step: chapter.steps.find((s) => !d.steps[s.id]) || null, index: d.chapter || 0 };
}

// Every chapter done and no ending chosen yet: the deed or the paper.
export const choiceOpen = (d) => (d.chapter || 0) >= CHAPTERS.length && !d.ending;

// What the current step needs and the player has lost (its `lost`, see above), or null.
// `have`: what's on hand, { kind: count } (the trunk and the stash, brew.js onHand).
export function lostNow(d, have) {
  const { step } = current(d);
  return step?.lost && have && step.lost.when(d, have) ? step.lost : null;
}

// The story sites open now: { [site]: { night, window } } for the current step, if it has
// one (or the site that gives back what it needs, if that's lost); the Sun while the
// ending's choice is open; and Gus's cellar (the brewery) for good once Lager is learned.
export function openSites(d, have = null) {
  const out = d.flags?.['learned:lager'] ? { brewery: { night: false, window: null } } : {};
  if (choiceOpen(d)) return { ...out, sun: { night: false, window: null } };
  const { step } = current(d), lost = lostNow(d, have);
  if (lost) return { ...out, [lost.site]: { night: false, window: null } };
  return step?.site ? { ...out, [step.site]: { night: !!step.night, window: step.window || null } } : out;
}

// Move the story on as far as the save allows. Returns what happened, in order:
// { type: 'open', chapter }, { type: 'step', chapter, step }, { type: 'clue', chapter, clue },
// { type: 'tool', chapter, tool }, { type: 'close', chapter }. Mutates the save.
export function advance(d) {
  const out = [];
  for (let guard = 0; guard < 30; guard++) {
    const { chapter } = current(d);
    if (!chapter) break;
    if (!d.opened[chapter.id]) { d.opened[chapter.id] = true; out.push({ type: 'open', chapter }); }
    const step = chapter.steps.find((s) => !d.steps[s.id]);
    if (step) {
      if (!step.done(d)) break;
      d.steps[step.id] = true;
      if (step.learn) d.flags[`learned:${step.learn}`] = true;
      if (step.flag) d.flags[step.flag] = true;
      out.push({ type: 'step', chapter, step });
      continue;
    }
    // Every step done: the clue (already in hand from its site), the tool if there is one, and on.
    d.clues[chapter.clue.id] = true;
    out.push({ type: 'clue', chapter, clue: chapter.clue });
    if (chapter.tool) { d.tools[chapter.tool.id] = true; out.push({ type: 'tool', chapter, tool: chapter.tool }); }
    out.push({ type: 'close', chapter });
    d.chapter = (d.chapter || 0) + 1;
  }
  return out;
}
