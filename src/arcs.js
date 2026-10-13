import { trustLevel } from './contracts.js';

// Side stories (docs/EXPANSION.md): a contact's own arc, opened at their trust (`at` stars,
// from chapter `chapter`, and `also` if given) and run alongside the chapters on the same
// step machinery (chapters.js: `site`, `order` with `passenger` / `fragile` / `window`,
// `price`). Steps' `done(save, arcState)`; step ids are unique across the chapters and the
// arcs (the save's `steps`). Done, an arc gives its `reward` (a `tool`, a recipe to `learn`
// or a `flag`, with its `name` and `text`). The save keeps `arcs`: { [id]: { open: true, done } } and
// `follow`: the arc whose step the banner and the route show (null: the chapter's).
// Pure logic; main.js plays what advanceArcs returns and puts the steps' orders and sites
// in play like a chapter step's.
const ordered = (step) => (d) => !!d.flags[`order:${step}`];

export const ARCS = [
  {
    id: 'key', who: 'feld', title: 'The Brass Key', at: 2, chapter: 1,
    open: [
      ['feld', 'That brass key I kept back for you, Otto. A key like that opens something, and the man who pawned it wants it back. He’s offering good money.'],
      ['feld', 'I’m a businessman. Bring me a radio set for the window, and it’s yours, and I never saw him.'],
    ],
    steps: [
      { id: 'key-trade', text: 'Bring Izzy Feld a radio set for the key', order: { who: 'feld', at: 'feld', wants: { radio: 1 }, pay: 60 }, done: ordered('key-trade'),
        lines: [['feld', 'A pleasure. Here: “Braun & Sons, cellar door”. Your father’s cellar had a cellar under it, the old men say. Look under the stairs after dark.']] },
      { id: 'key-vault', text: 'Open Father’s vault under the brewery cellar, after dark', site: 'ruins', night: true, sets: 'vault', got: 'Father’s vault: his ledgers, a strongbox, and his recipe book.', done: (d) => !!d.flags.vault,
        lines: [
          ['narrator', 'Behind the cellar stairs, a door Otto never knew was there. The key turns. Inside: Father’s ledgers, a strongbox, and a recipe book in his hand.'],
          ['otto', 'Kümmel. Caraway, from the old country. He made it every Christmas for the men.'],
        ] },
    ],
    reward: { learn: 'kummel', name: 'Braun’s Kümmel', text: 'Learned: Braun’s Kümmel (a sack, a small crate and jugs at the still). The speakeasies will pay for a taste of the old country.' },
  },
  {
    id: 'pad', who: 'wexler', title: 'The Prescription Pad', at: 3, chapter: 1,
    open: [
      ['wexler', 'Whiskey is legal with a prescription, Otto, and I write a great many. What I need is someone to fill them, by daylight, like an honest pharmacy.'],
      ['wexler', 'Three crates of corn shine at my door by day. Then the State Board wants its fee for a dispensing licence, and they don’t take shine.'],
    ],
    steps: [
      { id: 'pad-fill', text: 'Fill Doc Wexler’s prescriptions: 3 crates of Corn Shine, by day (08:00–17:00)', order: { who: 'wexler', at: 'wexler', wants: { 'corn-shine': 3 }, window: [8, 17], pay: 450 }, done: ordered('pad-fill'),
        lines: [['wexler', 'Medicinal, every drop. Now the licence: the State Board of Pharmacy, on Mount Vernon Place. Mind you pay in cash.']] },
      { id: 'pad-board', text: 'Pay the State Board of Pharmacy for Doc Wexler’s licence', site: 'board', price: 400, deal: { title: 'THE LICENCE?', text: 'Pay the State Board of Pharmacy $400 for a dispensing licence in Doc Wexler’s name?', short: 'The State Board wants $400 for the licence, in cash. Come back with it.', ledger: 'Doc Wexler’s dispensing licence' }, sets: 'licence', got: 'Paid. The licence will be in Doc Wexler’s name by morning.', done: (d) => !!d.flags.licence },
    ],
    reward: { tool: 'prescriptions', name: 'Doc Wexler’s licence', text: 'Doc Wexler’s dispensary buys shine by day now: medicinal, at a pharmacy’s price.' },
  },
  {
    id: 'labels', who: 'pryor', title: 'The Tomato Crates', at: 3, chapter: 2,
    open: [
      ['pryor', 'You’ve seen my trucks: tomato crates, front to back, and not a revenue man in Maryland looks inside. Ride my route once and I’ll show you how it’s done.'],
      ['pryor', 'Bring me two good wooden crates. Then take a load to Dutch Hummel at the mill, packed my way.'],
    ],
    steps: [
      { id: 'labels-crates', text: 'Bring Nell Pryor two wooden crates for the cannery', order: { who: 'pryor', at: 'pryor', wants: { crate: 2 }, pay: 180 }, done: ordered('labels-crates') },
      { id: 'labels-run', text: 'Take 2 crates of Corn Shine to Dutch Hummel in Nell Pryor’s tomato crates, after dark', order: { who: 'hummel', at: 'hummel', wants: { 'corn-shine': 2 }, night: true, pay: 380 }, done: ordered('labels-run'),
        lines: [['hummel', 'Tomatoes, says the label. Best tomatoes I ever drank.']] },
    ],
    reward: { tool: 'labels', name: 'Cannery labels', text: 'Earned: Nell Pryor’s cannery labels. Once a night, a checkpoint search reads the label and waves you through.' },
  },
  {
    id: 'note', who: 'carroll', title: 'The Widow’s Note', at: 2, chapter: 1,
    open: [
      ['carroll', 'The bank wrote again, Otto. The Harrow estate bought my note, and if I miss the payment they’ll have the farm by spring.'],
      ['carroll', 'I can pay the next one if somebody pays this one. And I need seed and feed for the winter.'],
    ],
    steps: [
      { id: 'note-pay', text: 'Pay Widow Carroll’s note at Stone Hollow Farm', site: 'note', price: 600, deal: { title: 'THE NOTE?', text: 'Pay $600 on Widow Carroll’s note, so the Harrow estate can’t take Stone Hollow Farm?', short: 'The Harrow estate’s man wants $600 on the note, in cash. Come back with it.', ledger: 'Widow Carroll’s note' }, sets: 'notePaid', got: 'Paid. The Harrow estate’s man writes a receipt, sour as vinegar.', done: (d) => !!d.flags.notePaid },
      { id: 'note-feed', text: 'Bring Widow Carroll 2 sacks and a barrel for the winter', order: { who: 'carroll', at: 'carroll', wants: { sack: 2, barrel: 1 }, pay: 160 }, done: ordered('note-feed') },
      { id: 'note-clerk', text: 'Drive Widow Carroll to the county clerk in Cockeysville before noon (08:00–12:00)', order: { who: 'carroll', at: 'sheriff', place: 'the county clerk’s office', wants: {}, window: [8, 12], pay: 60, passenger: { who: 'carroll', from: 'carroll' } }, done: ordered('note-clerk'),
        lines: [['carroll', 'Filed, stamped and paid. They’ll not have Stone Hollow while I’m living. Otto, my husband’s still is in the barn loft. It’s yours, and I’ll mind it for you.']] },
    ],
    reward: { tool: 'farmstill', name: 'Stone Hollow’s still', text: 'Widow Carroll runs Father’s friend’s old still at Stone Hollow: a crate of Corn Shine in your stash every dawn.' },
  },
  {
    id: 'wedding', who: 'romano', title: 'The Wedding', at: 3, chapter: 2,
    open: [
      ['romano', 'My niece marries Saturday. Two hundred guests, Otto, and Uncle Vito comes in from Highlandtown, and he don’t ride the streetcar.'],
      ['romano', 'Wine for the tables first. Then Vito, then the good stuff. Do this right and you’re family.'],
    ],
    steps: [
      { id: 'wedding-wine', text: 'Bring Sal Romano 2 bottle cases of wine for the wedding', order: { who: 'romano', at: 'romano', wants: { 'bottle-case': 2 }, pay: 260 }, done: ordered('wedding-wine') },
      { id: 'wedding-vito', text: 'Drive Uncle Vito from Gus Kessler’s to Sal Romano’s, in the evening (19:30–23:00)', order: { who: 'vito', at: 'romano', wants: {}, window: [19.5, 23], pay: 100, passenger: { who: 'vito', from: 'kessler' } }, done: ordered('wedding-vito'),
        lines: [['vito', 'You drive like my brother. That’s a compliment: he’s dead, but he drove beautiful.']] },
      { id: 'wedding-toast', text: 'The toast: 4 crates of shine for the wedding (2 Corn, 2 Applejack), after dark, fragile', order: { who: 'romano', at: 'romano', wants: { 'corn-shine': 2, applejack: 2 }, night: true, fragile: true, pay: 1100 }, done: ordered('wedding-toast'),
        lines: [['romano', 'Salute! Otto, you’re family now. In Little Italy, nobody touches you.']] },
    ],
    reward: { tool: 'family', name: 'Family', text: 'You’re family: once a day, a bust in the city goes away. Romano’s lawyer is already waiting at the precinct.' },
  },
  {
    id: 'band', who: 'banks', title: 'The Band’s Night', at: 3, chapter: 4, also: (d) => !!d.flags['learned:lager'],
    open: [
      ['banks', 'Sugar, the Belvedere wants a Saturday like they had before the Volstead Act: a big band, a full bar, and nobody asking where it came from.'],
      ['banks', 'Bottles for the bar, Lager for the swells, and the band brought over from Federal Hill before the first set. Can you do it?'],
    ],
    steps: [
      { id: 'band-bar', text: 'Stock Lulu Banks’s bar: 2 bottle cases', order: { who: 'banks', at: 'banks', wants: { 'bottle-case': 2 }, pay: 220 }, done: ordered('band-bar') },
      { id: 'band-lager', text: 'Bring Lulu Banks 2 crates of Highlandtown Lager, after dark', order: { who: 'banks', at: 'banks', wants: { lager: 2 }, night: true, pay: 700 }, done: ordered('band-lager') },
      { id: 'band-ride', text: 'Bring the band from Big Tom Healy’s to Lulu Banks’s before the first set (19:30–21:00)', order: { who: 'band', at: 'banks', wants: {}, window: [19.5, 21], pay: 150, passenger: { who: 'band', from: 'healy' } }, done: ordered('band-ride'),
        lines: [['band', 'Five, six, seven, eight!'], ['banks', 'Listen to that room, sugar. You did that.']] },
    ],
    reward: { tool: 'belvedere', name: 'The Belvedere', text: 'The Belvedere is yours on Saturdays: Lulu Banks pays double for shine every Saturday night.' },
  },
];

const byId = Object.fromEntries(ARCS.map((a) => [a.id, a]));
export const arcById = (id) => byId[id] || null;

// Whether an arc can open now (its contact's trust, the chapter, and anything `also` asks).
export const arcReady = (d, arc) => trustLevel(d.trust?.[arc.who]) >= arc.at && (d.chapter || 0) >= (arc.chapter || 0) && (!arc.also || arc.also(d));

// An open arc's current step (null if it's not open, or done).
export function arcStep(d, arc) {
  const a = d.arcs?.[arc.id];
  if (!a?.open || a.done) return null;
  return arc.steps.find((s) => !d.steps[s.id]) || null;
}

// The arcs open and not done: [{ arc, step }].
export const activeArcs = (d) => ARCS.map((arc) => ({ arc, step: arcStep(d, arc) })).filter((x) => x.step);

// Move the side stories on as far as the save allows. Returns, in order:
// { type: 'open', arc }, { type: 'step', arc, step }, { type: 'reward', arc }. Mutates the save.
export function advanceArcs(d) {
  const out = [];
  d.arcs ??= {};
  for (const arc of ARCS) {
    const a = d.arcs[arc.id];
    if (a?.done) continue;
    if (!a?.open) {
      if (!arcReady(d, arc)) continue;
      d.arcs[arc.id] = { open: true, done: false };
      out.push({ type: 'open', arc });
    }
    for (let step = arcStep(d, arc); step && step.done(d, d.arcs[arc.id]); step = arcStep(d, arc)) {
      d.steps[step.id] = true;
      out.push({ type: 'step', arc, step });
    }
    if (!arc.steps.every((s) => d.steps[s.id])) continue;
    d.arcs[arc.id].done = true;
    const R = arc.reward;
    if (R.tool) d.tools[R.tool] = true;
    if (R.learn) d.flags[`learned:${R.learn}`] = true;
    if (R.flag) d.flags[R.flag] = true;
    if (d.follow === arc.id) d.follow = null;
    out.push({ type: 'reward', arc });
  }
  return out;
}
