import { CONFIG } from './config.js';

// The game's night, by the season: [dusk, dawn] in game hours (19:30–06:00; in Act II's
// winter, CONFIG.dredge.winter.night, 17:30–07:00). Everything that asks "is it night?" or
// "when does night start / dawn come?" comes here: the Bureau's checkpoint and patrols, the
// night salvage sites and orders, the dawn, sleeping, and the light itself (daylightAt). The
// day's bookkeeping (market.dayOf) still turns at midnight. Pure: scripts/progress.mjs uses it.
export const nightHours = (winter = false) => (winter ? CONFIG.dredge.winter.night : CONFIG.dredge.police.checkpoint.hours);
export const duskHour = (winter = false) => nightHours(winter)[0];
export const dawnHour = (winter = false) => nightHours(winter)[1];

export function isNight(h, winter = false) {
  const [a, b] = nightHours(winter);
  h = ((h % 24) + 24) % 24;
  return h >= a || h < b;
}

// The first dawn at least `min` game hours after `clock` (an order taken at night is due by it).
export function nextDawn(clock, winter = false, min = 0) {
  let due = Math.floor(clock / 24) * 24 + dawnHour(winter);
  while (due - clock < min) due += 24;
  return due;
}

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 0 at night, 1 at full day: the light comes up over two hours from half an hour before dawn
// and goes over the two hours before dusk (19:30–06:00 gives the summer curve: 05:30–07:30
// up, 17:30–19:30 down).
export function daylightAt(h, winter = false) {
  const [dusk, dawn] = nightHours(winter);
  return smooth(dawn - 0.5, dawn + 1.5, h) * (1 - smooth(dusk - 2, dusk, h));
}
