// Story beats from the Shine treatment, shown as dialogue cards. Each plays once per save,
// when its trigger (on the save's data) is met. The spine: the Temperance Alliance burned
// Otto's Highlandtown brewery; he scavenges the roads, brews at his late father's barn up
// the valley, sells to the city's speakeasies, and buys the brewery back.
// `asks`: the lines a contact says on the contract board when they post a job (one per job,
// picked with it). Every speakeasy and farm has its contact (world.js DROPS, county.js
// BARNS), and the Sheriff posts from the county lockup once Otto is a Brewer.
export const CAST = {
  narrator: { name: '', initials: '', color: '#b6ab90' },
  otto: { name: 'Otto Braun', initials: 'OB', color: '#d8b25a' },
  jockey: {
    name: 'The Jockey', initials: 'J', color: '#5aa7d8', asks: [
      'The estates throw parties all steeplechase season, and they pay for what town won’t sell them.',
      'Bring it to the stables. The lads unload, and they’re paid not to remember faces.',
    ],
  },
  pruitt: {
    name: 'Ma Pruitt', initials: 'MP', color: '#c8743a', asks: [
      'A still’s only as good as what goes in it. Fetch me these, and don’t dawdle.',
      'Mash won’t wait, Otto, and neither will I.',
    ],
  },
  sheriff: {
    name: 'Sheriff Hale', initials: 'SH', color: '#8a9aa8', asks: [
      'The deputies’ smoker is Friday. A sheriff has to look after his men.',
      'Bring it to the lockup. Nobody searches a jail.',
    ],
  },
  coombs: { name: 'Reverend Coombs', initials: 'RC', color: '#c84a3a' },
  delaney: { name: 'Moss Delaney', initials: 'MD', color: '#bdb6a6' },
  // The speakeasies' contacts.
  kessler: {
    name: 'Gus Kessler', initials: 'GK', color: '#d89a4a', asks: [
      'The old crowd still asks after your lager, Otto. Till then, bring me this.',
      'Same street, same thirst. Only now the door’s got a peephole.',
    ],
  },
  orourke: {
    name: 'Mags O’Rourke', initials: 'MO', color: '#4aa88a', asks: [
      'The boats came in light this week. Fill the gap and I’ll pay dock rates.',
      'Pier 5, after dark. My lads won’t ask what’s in it.',
    ],
  },
  abernathy: {
    name: 'Mr. Abernathy', initials: 'MA', color: '#a89ad8', asks: [
      'Our guests expect discretion, Mr. Braun, and a well-stocked cellar.',
      'The tradesmen’s entrance, please. There’s a senator in the lobby.',
    ],
  },
  romano: {
    name: 'Sal Romano', initials: 'SR', color: '#d85a5a', asks: [
      'A wedding Saturday. Two hundred guests, and not one of them drinks water.',
      'You bring, I pay, nobody talks. That’s how a club stays a club.',
    ],
  },
  hummel: {
    name: 'Dutch Hummel', initials: 'DH', color: '#8ab05a', asks: [
      'Twelve-hour shifts at the mill, Braun. That’s a twelve-hour thirst.',
      'The back gate, by the loom shed. Don’t wake the watchman.',
    ],
  },
  pryor: {
    name: 'Nell Pryor', initials: 'NP', color: '#d8785a', asks: [
      'The cannery cans anything: peaches, tomatoes, and whatever you bring me.',
      'It goes out with the tomato crates. The inspectors never look twice.',
    ],
  },
  healy: {
    name: 'Big Tom Healy', initials: 'TH', color: '#5a8ad8', asks: [
      'The tavern’s a lunch counter now, officially. The lunches are very wet.',
      'Round the back, and mind the patrolman on the corner. He’s mine, but still.',
    ],
  },
  banks: {
    name: 'Lulu Banks', initials: 'LB', color: '#d85aa8', asks: [
      'The band plays till four and the crowd drinks till five. Keep us swinging, sugar.',
      'Before the first set, please. Nobody dances dry.',
    ],
  },
  wexler: {
    name: 'Doc Wexler', initials: 'DW', color: '#5ad8c8', asks: [
      'Medicinal purposes only, of course. I have a great many patients.',
      'A pint for every prescription, and I write a lot of prescriptions.',
    ],
  },
  feld: {
    name: 'Izzy Feld', initials: 'IF', color: '#c8b85a', asks: [
      'I take anything in pawn, and I sell anything from the back room.',
      'The side door, Otto. The front’s for honest people.',
    ],
  },
  // The farms' contacts.
  carroll: {
    name: 'Widow Carroll', initials: 'WC', color: '#b89ad8', asks: [
      'My husband left me a farm and a mortgage. Help me with one and I’ll help you with the other.',
      'Bring what I asked, and stay for coffee. It’s quiet out here.',
    ],
  },
  ridgely: {
    name: 'Amos Ridgely', initials: 'AR', color: '#9ab05a', asks: [
      'The harvest’s in and the house wants fitting out. Cash on delivery.',
      'Ridgelys have farmed this hill since before the Revolution. We pay our debts.',
    ],
  },
  tolley: {
    name: 'Clem Tolley', initials: 'CT', color: '#a8885a', asks: [
      'Frog Hollow don’t see many visitors. Bring it and you can be one.',
      'Mind the ruts in the lane. My own truck’s still in one.',
    ],
  },
  gill: {
    name: 'Hattie Gill', initials: 'HG', color: '#d8c85a', asks: [
      'The Grange is holding a dance, and a dance needs more than lemonade.',
      'The Grange votes dry every year and drinks wet every Saturday.',
    ],
  },
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
  quarry: {
    when: (d) => (d.rank || 0) >= 2,
    lines: [
      ['narrator', 'Cockeysville, at the valley’s eastern crossroads. The marble for Baltimore’s Washington Monument came out of these hills.'],
      ['delaney', 'Braun, is it? The Jockey says you can carry a load and keep your mouth shut. The company store will deal with you now.'],
      ['delaney', 'Copper for the blasting wire, kegs for my men, crates that don’t fall apart. Bring them east and we pay better than the city.'],
    ],
  },
  sheriff: {
    when: (d) => (d.rank || 0) >= 3,
    lines: [
      ['sheriff', 'Mr. Braun. A man in my position hears things. A man in your position might want me to stop hearing them.'],
      ['sheriff', 'An envelope now and then, and my deputies forget what your truck looks like.'],
      ['sheriff', 'They get thirsty, mind. When they do, I’ll send for you: the county lockup in Cockeysville.'],
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
