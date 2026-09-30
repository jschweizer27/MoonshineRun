// Story beats from the Shine treatment, shown as dialogue cards between runs. Each beat
// plays once per career; some unlock mechanics (the horse-box disguise, the sheriff's
// price).
export const CAST = {
  narrator: { name: '', initials: '', color: '#b6ab90' },
  otto: { name: 'Otto Braun', initials: 'OB', color: '#d8b25a' },
  jockey: { name: 'The Jockey', initials: 'J', color: '#5aa7d8' },
};

export const BEATS = {
  prologue: {
    when: () => false,     // played explicitly when a new career starts
    lines: [
      ['narrator', 'Baltimore, 1922. The Volstead Act has shuttered every brewery in Highlandtown.'],
      ['otto', 'Twenty years I made honest lager. The Temperance Alliance calls it poison — and tonight they came with torches.'],
      ['otto', 'The warehouse is burning. The trailer is still hitched. Get out of the city — north, up York Road.'],
    ],
  },
  valley: {
    when: () => false,     // played when the Act I escape succeeds
    lines: [
      ['narrator', 'Green Spring Valley. Old money, older barns, and thoroughbreds worth more than city blocks.'],
      ['jockey', 'You’re the brewer? I ride the steeplechase circuit. I know every estate out here — and which barns ask no questions.'],
      ['jockey', 'There’s shine cooking in a barn up the valley. Load it, sell it to a buyer in the city, and we’ll talk partnership.'],
      ['otto', 'Routes. Ledgers. Margins. It’s just logistics.'],
    ],
  },
  jockey: {
    when: (c) => c.stats.deliveries >= 1,
    unlocks: 'disguise',
    lines: [
      ['jockey', 'Not bad, Otto. Now the trick: nobody searches a horse box on the steeplechase circuit.'],
      ['jockey', 'Haul it like there’s a thoroughbred inside — nice and easy, under 30 — and the law sees a rich man’s horse.'],
    ],
  },
  specialists: {
    when: (c) => c.stats.deliveries >= 3,
    lines: [
      ['otto', 'Three runs, three payouts. Time to reinvest.'],
      ['otto', 'There are good hands in these hollows: a mechanic, a wheelman, a still-master, an enforcer. They’ll work out of the hideout garage.'],
    ],
  },
  sheriff: {
    when: (c) => c.stats.deliveries >= 5,
    unlocks: 'bribe',
    lines: [
      ['jockey', 'The county sheriff has a weakness for envelopes. Four thousand, and his deputies forget what your truck looks like.'],
      ['otto', 'A county where the law looks the other way. That’s worth paying for.'],
    ],
  },
  betrayal: {
    when: (c) => c.stats.deliveries >= 8,
    lines: [
      ['narrator', 'The paddock at My Lady’s Manor, the following Saturday…'],
      ['narrator', 'The Jockey, shaking hands with a Prohibition Bureau agent. An envelope changes hands — going the wrong way.'],
      ['otto', '…I should have kept better books on him.'],
      ['narrator', 'ACT II — THE JOCKEY’S BETRAYAL — is coming. Until then, the county is yours to run.'],
    ],
  },
};

// The first beat whose trigger is met and hasn't been seen yet.
export function nextBeat(career) {
  for (const [id, beat] of Object.entries(BEATS)) {
    if (!career.seen(id) && beat.when(career.data)) return id;
  }
  return null;
}
