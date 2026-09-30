// Browser storage that never throws (private browsing and blocked storage just fall back
// to defaults).
export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

export function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const RECORDS_KEY = 'shine.records.v1';
const DEFAULT_RECORDS = { bestHaul: 0, bestRuns: 0, totalEarned: 0, totalRuns: 0, busts: 0 };

export function loadRecords() { return loadJSON(RECORDS_KEY, DEFAULT_RECORDS); }

// Fold one finished run into the saved records. Returns the updated records and whether
// this run set a new best haul.
export function recordRun(cash, runs) {
  const r = loadRecords();
  const isBest = cash > r.bestHaul;
  r.bestHaul = Math.max(r.bestHaul, cash);
  r.bestRuns = Math.max(r.bestRuns, runs);
  r.totalEarned += cash;
  r.totalRuns += runs;
  r.busts += 1;
  saveJSON(RECORDS_KEY, r);
  return { records: r, isBest };
}
