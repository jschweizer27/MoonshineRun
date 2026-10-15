// Story beats from the Shine treatment, shown as dialogue cards. Each plays once per save,
// when its trigger (on the save's data) is met. The spine: the Temperance Alliance burned
// Otto's Highlandtown brewery; he scavenges the roads, brews at his late father's barn up
// the valley, sells to the city's speakeasies, and finds out who paid for the fire (the
// chapters, chapters.js, which end with the deed, the paper or the crown).
// `asks`: the lines a contact says on the contract board when they post a job (one per job,
// picked with it). `wants`: the goods a contact's orders draw from, if not the usual (the
// farm's or the speakeasy's list, CONFIG.dredge.contracts); `shine`: a farm contact whose
// orders, once Otto brews, are shine after dark, like a speakeasy's. Every speakeasy and farm has its contact (world.js DROPS, county.js
// BARNS), and the Sheriff posts from the county lockup from chapter 4.
export const CAST = {
  narrator: { name: '', initials: '', color: '#b6ab90' },
  otto: { name: 'Otto Braun', initials: 'OB', color: '#d8b25a' },
  jockey: {
    name: 'The Jockey', initials: 'J', color: '#5aa7d8', shine: true, asks: [
      'The estates throw parties all steeplechase season, and they pay for what town won’t sell them.',
      'Bring it to the stables. The lads unload, and they’re paid not to remember faces.',
    ],
  },
  pruitt: {
    name: 'Ma Pruitt', initials: 'MP', color: '#c8743a', wants: ['sack', 'jugs', 'small-crate', 'barrel'], asks: [
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
  // The chapters' other people (chapters.js), who post no orders: the guard on the midnight
  // freight, Vail's man in the Bureau, and the Sun's night editor.
  guard: { name: 'Walt Purdy', initials: 'WP', color: '#a8a07a' },
  draper: { name: 'Agent Draper', initials: 'AD', color: '#7f8ea0' },
  editor: { name: 'Ned Holloway', initials: 'NH', color: '#d8d2c4' },
  // The side stories' passengers (arcs.js): Sal Romano's uncle, and Lulu Banks's band.
  vito: { name: 'Uncle Vito', initials: 'UV', color: '#c87a6a' },
  band: { name: 'The Moonlight Serenaders', initials: 'MS', color: '#e0c070' },
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
  // Act II: Towson (chapter 6 on). Ruby Dalton keeps the Courthouse Tavern on the square
  // (world.towson, contracts.js); Cyrus Vail is the Towson National Bank's president.
  dalton: {
    name: 'Ruby Dalton', initials: 'RD', color: '#c85a7a', asks: [
      'Lawyers, clerks and the county commissioners, honey. Thirsty men, every one.',
      'The judge takes his with a little water. The bank takes its without.',
    ],
  },
  vail: { name: 'Cyrus Vail', initials: 'CV', color: '#9a9a8a' },
};

// What each contact says when the goods are handed over (the handoff card).
export const THANKS = {
  kessler: 'Ach, Otto. Just like old times. Here, count it if you like.',
  orourke: 'Right on the tide. The lads will have it below decks in a minute.',
  abernathy: 'Discreet as ever, Mr. Braun. The house thanks you.',
  romano: 'Now it’s a wedding. Here, and take a cannoli for the road.',
  dalton: 'Through the back, honey, and mind the judge’s motor car.',
  hummel: 'The shift thanks you, Braun. Mind the watchman on the way out.',
  pryor: 'In with the tomatoes. Pleasure doing business.',
  healy: 'Lunch is served! Here’s yours, and a bit over.',
  banks: 'Sugar, you just saved the second set. Here.',
  wexler: 'For medicinal purposes. My patients thank you.',
  feld: 'No questions, no receipts. Here’s your money.',
  carroll: 'Bless you, Otto. Sit a minute: the coffee’s on.',
  ridgely: 'Cash on delivery, as promised. A Ridgely pays.',
  pruitt: 'That’ll do. Now get, before the mash goes sour.',
  jockey: 'Good man. The estates will drink to you tonight.',
  tolley: 'Well, look at that. A visitor, and he brought the goods.',
  gill: 'The Grange dances tonight! Here, and not a word.',
  sheriff: 'Much obliged, Mr. Braun. You were never here.',
  guard: 'Right on time, and the bumps weren’t too bad. Mags said you were good for it.',
};

// What each contact says once they trust Otto (contracts.js, CONFIG.dredge.contracts
// sceneAt): a handoff where they open up. Some of them know a little about the fire.
export const TRUSTED = {
  kessler: 'I was there the night it burned, Otto. Somebody had wedged the fire doors. Fires don’t do that.',
  orourke: 'A tanker barge tied up at Canton the week of your fire. Kerosene, the manifest said. Nobody unloaded it at Canton.',
  abernathy: 'The Alliance holds its dinners in our ballroom. The Reverend tips poorly and talks loudly about you.',
  romano: 'You’re family now, Otto. Anybody leans on you in Little Italy, they lean on me.',
  hummel: 'The night watchman at your brewery drinks here. Says he was paid to take that night off. Paid well.',
  pryor: 'Our trucks go everywhere and nobody looks inside. If you ever need to move something unseen, ask.',
  healy: 'The patrolman on my corner? He’s the Sheriff’s nephew. Small county, Otto. Smaller than you think.',
  banks: 'Rich men talk when the band plays loud. One of them laughed about a brewery fire like it was a joke he paid for.',
  wexler: 'I write prescriptions for half the Alliance. Temperance by day, my patients by night.',
  feld: 'Somebody pawned a brass key with “Braun & Sons” on the bow. I kept it back for you. No charge.',
  carroll: 'My husband sold grain to your father. Fair man. The Jockey’s been sniffing round my land too. Be careful of him.',
  ridgely: 'The Harrow estate’s been buying up every farm along the valley. Every one but yours.',
  pruitt: 'Your father’s still was the best in the valley, and I taught him. Now I’ll teach you the rest.',
  jockey: 'You and me, Otto, we’re going places. Stick with the Jockey and you’ll never want for anything.',
  tolley: 'A big black car comes up the Hollow road some nights. City plates. Goes to the Harrow place.',
  gill: 'The Grange ladies say the Reverend’s new church roof was paid for by a bank in Towson. Funny sort of tithe.',
  sheriff: 'You’re a good customer, Mr. Braun. If the Bureau ever catches you out in my county, you come to me.',
  dalton: 'Mr. Vail never sets foot in here, but his money does. The commissioners vote dry and drink on his account.',
};

// `when(data)` reads the save (dredgecareer data): stats, flags and the chapter. Beats for systems
// a save hasn't reached yet simply wait.
export const BEATS = {
  prologue: {
    when: () => false,     // played when a new game starts
    lines: [
      ['narrator', 'Baltimore, 1922. The Volstead Act has shuttered every brewery in Highlandtown.'],
      ['otto', 'Twenty years I made honest lager. Last night the Temperance Alliance came with torches, and Braun & Sons went up like kindling.'],
      ['otto', 'The bank has the deed now. What I have is a truck, my father’s old barn up the Green Spring Valley, and the roads.'],
      ['otto', 'And the county is full of what other people left behind: wrecks in the ditches, empty farmhouses, rail sidings nobody watches. Salvage it, sell it where it pays, and find out who paid for the fire.'],
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
    when: (d) => d.stats.rares >= 1 && !d.flags.betrayed,      // (not once he's sold Otto out)
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
    when: (d) => (d.chapter || 0) >= 2,       // Chapter 3 (chapters.js): the store deals with Otto from now
    lines: [
      ['narrator', 'Cockeysville, at the valley’s eastern crossroads. The marble for Baltimore’s Washington Monument came out of these hills.'],
      ['delaney', 'Braun, is it? The Jockey says you can carry a load and keep your mouth shut. The company store will deal with you now.'],
      ['delaney', 'Copper for the blasting wire, kegs for my men, crates that don’t fall apart. Bring them east and we pay better than the city.'],
    ],
  },
  sheriff: {
    when: (d) => (d.chapter || 0) >= 3,       // Chapter 4 (chapters.js)
    lines: [
      ['sheriff', 'Mr. Braun. A man in my position hears things. A man in your position might want me to stop hearing them.'],
      ['sheriff', 'An envelope now and then, and my deputies forget what your truck looks like.'],
      ['sheriff', 'They get thirsty, mind. When they do, I’ll send for you: the county lockup in Cockeysville.'],
      ['otto', 'Everyone has a price. Yours is at least written down.'],
    ],
  },
  // The York Road checkpoint, the first night it stands (chapter 3 on: main.js sets the flag).
  checkpoint: {
    when: (d) => !!d.flags?.checkpoint,
    lines: [
      ['narrator', 'Word on York Road tonight: the Prohibition Bureau has a checkpoint at the gap in the city wall. After dark they search every truck that comes through.'],
      ['otto', 'Stop there with shine aboard and they’ll find it. Run it, and every car in the county comes after me. The back roads, then, or somewhere to hide it.'],
    ],
  },
  // The Jockey's betrayal and the deed are chapter 5's and the endings' now (chapters.js).
  // Act II's own beats (stage 16). Each waits for what it's about, and none plays in a chase
  // (main._checkStory).
  // Vail's men: the first dawn after they've been out picking the county clean (main._dawn).
  sedans: {
    when: (d) => d.once?.rivals != null,
    lines: [
      ['dalton', 'Otto, honey. Two black sedans outside the tavern last night, and the men in them asked my barman about a truck. Yours.'],
      ['dalton', 'They’re not the Bureau: the Bureau buys its coats off the rack. Mr. Vail’s men were out on the county roads all night, and the salvage you meant to have is in their trunks.'],
      ['otto', 'Then I get there first. And I don’t stop for anybody in a good coat.'],
    ],
  },
  // Father's diary named a "Mr. V." (a lore scrap, lore.js) and the bank's books name Cyrus
  // Vail: a minute after the records room, Otto puts the two together.
  mrv: {
    when: (d) => !!d.clues?.mortgages && !!d.lore?.['diary-1919'] && d.stepTimes?.records != null && (d.stats?.playSeconds || 0) - d.stepTimes.records >= 60,
    lines: [
      ['otto', 'March 1919, in Father’s hand: “Mr. V. says the note can wait, if I sell him the recipes.”'],
      ['otto', 'Mr. V. Three years before the fire, the bank’s president came asking for the Braun & Sons recipes, and Father told him no.'],
      ['narrator', 'Otto reads the page again by the dash lamp. He had thought it was about money. It was about the beer.'],
    ],
  },
  // Otto's own first run off the launch (chapter 7's tool).
  launch: {
    when: (d) => d.once?.launch != null,
    lines: [
      ['orourke', 'Your own run off the schooner now, eh? Mind the harbour patrol: the Coast Guard keeps a picket boat out past Fort McHenry, and it doesn’t care whose name is on the cases.'],
      ['orourke', 'Never the same pier two nights running, lamps off on the water, and don’t ever stop to count the crates. That’s how my old man kept out of the papers.'],
    ],
  },
  // Vail's own Scotch, sold on Otto's account (the codex: the best price it's fetched).
  scotch: {
    when: (d) => (d.codex?.scotch?.best || 0) > 0 || (d.codex?.rum?.best || 0) > 0,
    lines: [
      ['abernathy', 'I hear the speakeasies are pouring a very good Scotch this month, Mr. Braun. The very label Mr. Vail serves in our private dining room.'],
      ['abernathy', 'He imports it at some trouble. It must gall him, finding his own whisky undersold on Charles Street. Do carry on.'],
    ],
  },
  // The hidden still's first crates (chapter 8 on: main._dawn).
  hollow: {
    when: (d) => !!d.flags?.hollowStill && d.once?.hollow != null,
    lines: [
      ['pruitt', 'My husband ran that still all through the war and never once got caught. The fire’s held all night and the worm runs clear: two crates by morning.'],
      ['pruitt', 'Keep the smoke low, and come and go by the creek, not the lane. The Bureau watches lanes.'],
    ],
  },
  // Braun's, the first night it's sold (chapter 8 on: main._dawn).
  brauns: {
    when: (d) => !!d.flags?.brauns && d.once?.brauns != null,
    lines: [
      ['coombs', 'Braun’s. Open again, I hear, and under the same name. You might at least have had the decency to change it.'],
      ['coombs', 'The Alliance will pray for you, Mr. Braun. Every Sunday, by name.'],
      ['otto', 'Tell them to pray in the back room, Reverend. It’s warmer, and the lager’s Father’s.'],
    ],
  },
  // Act II's long nights wear on Otto: his own voice, at the edge (chapter 6 on).
  frayed: {
    when: (d) => (d.chapter || 0) >= 5 && (d.nerves ?? 1) < 0.3,
    lines: [
      ['otto', 'Every pair of headlamps is Draper’s. Every parked car has a man in a good coat in it.'],
      ['otto', 'Father used to say a brewer sleeps when the beer’s in the barrel. The barn, then, and a night’s sleep, before I put the truck in a ditch.'],
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
