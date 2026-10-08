import { trustLevel } from './contracts.js';

// The story in chapters (docs/GAME_DESIGN.md "Regions as chapters"). Pure logic over the
// save (dredgecareer data): each chapter is a run of steps taken in order, each step done
// when its test on the save passes; the last ends in a clue to who burned Braun & Sons and a
// tool that opens the next chapter. Story salvage sites (salvage.js `story`) open while
// their step is the current one. main.js calls advance() and plays what it returns.
//  - `lines` on a step play when it's done; `open` / `close` when a chapter starts / ends.
//  - `site`: the story site this step opens (and whether only after dark, `night`); `at`:
//    another place it leads to ('barn').
//  - `learn`: a recipe the step teaches (CONFIG.dredge.brew recipes with `learn`).
export const CHAPTERS = [
  {
    id: 'ashes', title: 'Ashes', place: 'Baltimore and Highlandtown',
    open: [
      ['narrator', 'Chapter 1: Ashes. Highlandtown, where Braun & Sons stood.'],
      ['otto', 'Before I can brew a drop, I need copper. Father kept a spare coil in the brewery’s cellar. If the fire left anything, it’s down there.'],
    ],
    steps: [
      { id: 'ruins', text: 'Search the ruins of Braun & Sons in Highlandtown', site: 'ruins', done: (d) => !!d.flags.ruinsSearched,
        lines: [['otto', 'Father’s copper coil, black with soot but whole. The still at the barn can run again.']] },
      { id: 'still', text: 'Fit the coil at the barn and run a batch', at: 'barn', done: (d) => (d.still || 0) >= 1 && (d.stats.brews || 0) >= 1 },
      { id: 'gus', text: 'Deliver an order to Gus Kessler at the Highlandtown Speakeasy', done: (d) => (d.delivered.kessler || 0) >= 1 },
      { id: 'gus-trust', text: 'Earn Gus Kessler’s trust (★★)', done: (d) => trustLevel(d.trust.kessler) >= 2,
        lines: [
          ['kessler', 'Otto. I didn’t want to say it before. The night of the fire, the doors to the cellar stairs were wedged shut from outside.'],
          ['kessler', 'Whoever lit it knew the building. Go and look down there yourself, after dark, when nobody’s watching the ruins.'],
        ] },
      { id: 'cellar', text: 'Search the brewery cellar', site: 'ruins', night: true, done: (d) => !!d.clues.pledge },
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
      { id: 'pruitt', text: 'Deliver an order to Ma Pruitt at Old Mill Barn', done: (d) => (d.delivered.pruitt || 0) >= 1, learn: 'applejack',
        lines: [
          ['pruitt', 'You keep your word, Braun. So I’ll show you Applejack: apples, a hot fire and a quick hand on the cuts. It burns, so mind it.'],
          ['narrator', 'Learned: Applejack. Two small crates and a jug cluster at the still.'],
        ] },
      { id: 'applejack', text: 'Brew a batch of Applejack', done: (d) => (d.best.applejack || 0) > 0 },
      { id: 'jockey-trust', text: 'Earn the Jockey’s trust (★★)', done: (d) => trustLevel(d.trust.jockey) >= 2,
        lines: [
          ['jockey', 'You’re all right, Otto. Come to the steeplechase Saturday. The Harrow crowd will be there, and the office at the stables stands empty all night.'],
          ['otto', 'Empty all night. He says it like he wants me to know.'],
        ] },
      { id: 'office', text: 'Get into the Harrow Stables office', site: 'office', night: true, done: (d) => !!d.clues.ledger },
    ],
    clue: { id: 'ledger', title: 'A ledger page from Harrow Stables', text: 'Torn from the stables’ books: monthly payments from Harrow Stables to the Temperance Alliance of Maryland, the largest the week before the fire. In the margin, initials: J.' },
    tool: { id: 'tyres', name: 'Farm tyres', text: 'Deep-tread tyres from the Harrow sheds: no more bogging down in the fields, so you can cut across country round a roadblock.' },
    close: [
      ['otto', 'Harrow money, paid to the Alliance, the week before the fire. And a J in the margin.'],
      ['narrator', 'Chapter 2 complete. Chapter 3, The Western Line, is still to come. The roads stay open until then.'],
    ],
  },
];

// The chapter and its current step (null once the chapter's steps are all done, or when
// every chapter is).
export function current(d) {
  const chapter = CHAPTERS[d.chapter || 0] || null;
  if (!chapter) return { chapter: null, step: null, index: d.chapter || 0 };
  return { chapter, step: chapter.steps.find((s) => !d.steps[s.id]) || null, index: d.chapter || 0 };
}

// The story site open now: { [site]: { night } } for the current step, if it has one.
export function openSites(d) {
  const { step } = current(d);
  return step?.site ? { [step.site]: { night: !!step.night } } : {};
}

// Move the story on as far as the save allows. Returns what happened, in order:
// { type: 'open', chapter }, { type: 'step', chapter, step }, { type: 'clue', chapter, clue },
// { type: 'tool', chapter, tool }, { type: 'close', chapter }. Mutates the save.
export function advance(d) {
  const out = [];
  for (let guard = 0; guard < 20; guard++) {
    const { chapter } = current(d);
    if (!chapter) break;
    if (!d.opened[chapter.id]) { d.opened[chapter.id] = true; out.push({ type: 'open', chapter }); }
    const step = chapter.steps.find((s) => !d.steps[s.id]);
    if (step) {
      if (!step.done(d)) break;
      d.steps[step.id] = true;
      if (step.learn) d.flags[`learned:${step.learn}`] = true;
      out.push({ type: 'step', chapter, step });
      continue;
    }
    // Every step done: the clue (already in hand from its site), the tool, and on.
    d.clues[chapter.clue.id] = true;
    d.tools[chapter.tool.id] = true;
    out.push({ type: 'clue', chapter, clue: chapter.clue }, { type: 'tool', chapter, tool: chapter.tool }, { type: 'close', chapter });
    d.chapter = (d.chapter || 0) + 1;
  }
  return out;
}
