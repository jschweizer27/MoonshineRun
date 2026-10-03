// Story beats from the Shine treatment, shown as dialogue cards. Each plays once per save,
// when its trigger (on the save's data) is met. The spine: the Temperance Alliance burned
// Otto's Highlandtown brewery; he scavenges the roads, brews at his late father's barn up
// the valley, sells to the city's speakeasies, and buys the brewery back.
export const CAST = {
  narrator: { name: '', initials: '', color: '#b6ab90' },
  otto: { name: 'Otto Braun', initials: 'OB', color: '#d8b25a' },
  jockey: { name: 'The Jockey', initials: 'J', color: '#5aa7d8' },
  pruitt: { name: 'Ma Pruitt', initials: 'MP', color: '#c8743a' },
  sheriff: { name: 'Sheriff Hale', initials: 'SH', color: '#8a9aa8' },
  coombs: { name: 'Reverend Coombs', initials: 'RC', color: '#c84a3a' },
};

// `when(data)` reads the save (dredgecareer data): stats, flags and rank. Beats for systems
// a save hasn't reached yet simply wait.
export const BEATS = {
  prologue: {
    when: () => false,     // played when a new game starts
    lines: [
      ['narrator', 'Baltimore, 1922. The Volstead Act has shuttered every brewery in Highlandtown.'],
      ['otto', 'Twenty years I made honest lager. Last night the Temperance Alliance came with torches, and Braun & Sons went up like kindling.'],
      ['otto', 'The bank has the deed now. What I have is a truck, my father’s old barn up the Green Spring Valley, and the roads.'],
      ['otto', 'And the roads are full of what other people lost. Crates, kegs, copper. Pick it up, sell it where it pays, and buy back what was mine.'],
    ],
  },
  valley: {
    when: (d) => !!d.flags?.valley,
    lines: [
      ['narrator', 'Green Spring Valley. Old money, older barns, and thoroughbreds worth more than city blocks.'],
      ['jockey', 'You’re the brewer from Highlandtown? I ride the steeplechase circuit. I know every estate out here, and which barns ask no questions.'],
      ['jockey', 'Keep your eyes open for copper. A still’s worth more than its weight to the right people, and the city is thirsty.'],
      ['otto', 'Routes. Ledgers. Margins. It’s just logistics.'],
    ],
  },
  rare: {
    when: (d) => d.stats.rares >= 1,
    lines: [
      ['jockey', 'A find like that belongs to somebody who’ll miss it. Sell it where nobody asks, and sell it fast.'],
      ['otto', 'Everything on these roads belonged to somebody. Tonight it belongs to the truck.'],
    ],
  },
  temperance: {
    when: (d) => d.stats.earned >= 1500,
    lines: [
      ['narrator', 'A handbill, nailed to a telegraph pole on York Road.'],
      ['coombs', 'Citizens! The poisoner Braun is back on our roads, peddling God knows what to God knows whom.'],
      ['coombs', 'We burned his poison once, Mr. Braun. The Alliance does not tire.'],
      ['otto', 'Neither do I, Reverend.'],
    ],
  },
  still: {
    when: (d) => d.stats.brews >= 1,
    lines: [
      ['pruitt', 'So you’re the lager man. Lager’s a gentleman’s drink. Up here we make shine, and we make it right.'],
      ['pruitt', 'Keep the fire steady and the worm cool, and the city will pay double for every jar with your name on it.'],
      ['otto', 'My name is on a deed in a bank vault, Mrs. Pruitt. Let’s get it back.'],
    ],
  },
  contacts: {
    when: (d) => d.stats.contracts >= 1,
    lines: [
      ['jockey', 'Word gets around. The speakeasies have heard there’s a Braun on the roads again.'],
      ['jockey', 'They’ll send for you now: a crate here, a run there. Keep your word and they’ll keep sending.'],
    ],
  },
  sheriff: {
    when: (d) => (d.rank || 0) >= 3,
    lines: [
      ['sheriff', 'Mr. Braun. A man in my position hears things. A man in your position might want me to stop hearing them.'],
      ['sheriff', 'An envelope now and then, and my deputies forget what your truck looks like.'],
      ['otto', 'Everyone has a price. Yours is at least written down.'],
    ],
  },
  betrayal: {
    when: (d) => (d.rank || 0) >= 5,
    lines: [
      ['narrator', 'The paddock at My Lady’s Manor, the following Saturday…'],
      ['narrator', 'The Jockey, shaking hands with a Prohibition Bureau agent. An envelope changes hands, going the wrong way.'],
      ['otto', '…I should have kept better books on him.'],
    ],
  },
  deed: {
    when: (d) => !!d.flags?.deed,
    lines: [
      ['narrator', 'Highlandtown. A bank clerk slides a folded paper across the counter.'],
      ['otto', 'Braun & Sons. Mine again.'],
      ['pruitt', 'Lager and shine under one roof. The Reverend will have a fit.'],
      ['narrator', 'ACT II, THE JOCKEY’S RECKONING, is coming. Until then, the county is yours to run.'],
    ],
  },
};

// The first beat whose trigger is met and hasn't been seen in this save.
export function nextBeat(data) {
  const seen = data.story || {};
  for (const [id, beat] of Object.entries(BEATS)) {
    if (!seen[id] && beat.when(data)) return id;
  }
  return null;
}
