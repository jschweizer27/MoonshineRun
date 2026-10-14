// Lore scraps (after DREDGE's messages in bottles): Father's diary pages, clippings from the
// Sun and the Bureau's memos, turned up at the salvage sites at night. They fill the
// notebook's LETTERS and quietly point at Act II: Cyrus Vail and the Towson National Bank.
// One scrap waits at each site that has one (`siteFor`: by the site's index, so the layout
// decides where, and nothing random is drawn); found when the site is worked well after dark.
// The save keeps `lore`: { [id]: true }. Pure data and logic; main.js says what's found.
export const LORE = [
  { id: 'diary-1919', kind: 'Father’s diary', text: 'March 1919. The bank’s man came again. Mr. V. says the note can wait, if I sell him the recipes. I told him a brewer doesn’t sell his recipes, he sells his beer.' },
  { id: 'sun-breweries', kind: 'The Sun', text: 'TOWSON NATIONAL BANK BUYS CLOSED BREWERIES. “An investment in Maryland’s future,” says the bank’s president, Mr. Cyrus Vail.' },
  { id: 'memo-trucks', kind: 'A Bureau memo', text: 'To all agents, York Road district: trucks of the Towson National Bank are not to be stopped or searched. Initialled, R. Draper.' },
  { id: 'diary-cellar', kind: 'Father’s diary', text: 'Gus says a man from Towson asked about our cellar, how deep it goes. Why would a bank care how deep a cellar goes?' },
  { id: 'receipt-alliance', kind: 'A receipt', text: 'Temperance Alliance of Maryland. Received of C. V., five thousand dollars, for the Cause. With the Reverend’s thanks.' },
  { id: 'sun-canton', kind: 'The Sun', text: 'CANTON PIER CHANGES HANDS. The old Lazaretto warehouse is sold to a Towson concern, which declined to say what it will store there.' },
  { id: 'letter-schooner', kind: 'A letter', text: '…the schooner stands off the Patapsco light on Tuesdays. Lamps twice, then once. Bring the bank’s money in small notes. R.' },
  { id: 'diary-coil', kind: 'Father’s diary', text: 'Otto asked again about the old copper. One day I’ll tell him what Grandfather’s coil is really for.' },
  { id: 'memo-expenses', kind: 'A Bureau memo', text: 'Agent Draper’s expenses, May: informant, Towson, $200. Informant, Towson, $200. Informant, Towson, $200.' },
  { id: 'notice-auction', kind: 'A notice', text: 'PUBLIC AUCTION of brewery properties, Baltimore City, upon the Repeal of the Eighteenth Amendment, by order of the Towson National Bank.' },
  { id: 'sun-hijack', kind: 'The Sun', text: 'HIJACKERS ON YORK ROAD? Valley farmers tell of trucks stopped at night by men “not from the Bureau, and not from around here.”' },
  { id: 'diary-last', kind: 'Father’s diary', text: 'The last page. If anything happens to me, the strongbox under the cellar stairs. Otto will know the key when he sees it.' },
];

// The scrap waiting at a regular site (by its index in the salvage list: every `every`th
// site holds one), or null.
export const siteFor = (index, every = 2) => (index % every ? null : LORE[index / every] || null);
