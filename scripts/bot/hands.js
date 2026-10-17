/* global document */
// The robot's hands (scripts/playthrough.mjs): it plays whatever screen is up the way the
// tests prove a player can, through the screens' own buttons and their play API (the
// mini-games as in tests/salvage.spec.js, tests/brew.spec.js and tests/runs.spec.js). One
// action a call; the brain calls again while a screen is up. Runs in the page.
import { CONFIG } from '../../src/config.js';
import { KINDS } from '../../src/trunk.js';
import { isBad, lagerRest } from '../../src/brew.js';

const $ = (sel) => document.querySelector(sel);
const live = (sel) => { const b = $(sel); return b && !b.disabled && b.offsetParent !== null ? b : null; };
const press = (sel) => { const b = live(sel); if (b) b.click(); return !!b; };

// Play the still's batch (tests/brew.spec.js PLAY): a steady fire, the cuts on their marks,
// the proof read on the line.
function playStill(S) {
  const b = S.batch;
  S.manual();
  for (let k = 0; k < 20000 && b.phase === 'fire'; k++) S.step(1 / 60, b.temp < b.center);
  let cut = 0;
  for (let k = 0; k < 40000 && b.phase === 'cuts'; k++) {
    S.step(1 / 120);
    if (cut < 2 && b.cuts.pos >= b.cuts.marks[cut]) { S.press(); cut++; }
  }
  let prev = b.proof.pos;
  for (let k = 0; k < 40000 && b.phase === 'proof'; k++) {
    S.step(1 / 240);
    const now = b.proof.pos;
    if (b.proof.t > 0.5 && (prev - b.proof.line) * (now - b.proof.line) <= 0) S.press();
    prev = now;
  }
}

// The lager at Gus's cellar (tests/runs.spec.js): the mash on its rests, the hops on their
// marks, tapped in the middle of the window.
function playBrewery(B) {
  const b = B.batch, L = CONFIG.dredge.brew.lager, dt = 1 / 30;
  B.manual();
  for (let k = 0; k < 20000 && b.phase === 'mash'; k++) B.step(dt, b.temp < lagerRest(b));
  for (const h of L.boil.hops) { for (let k = 0; k < 20000 && b.boil.pos < h && b.phase === 'boil'; k++) B.step(dt); B.press(); }
  for (let k = 0; k < 20000 && b.phase === 'boil'; k++) B.step(dt);
  for (let k = 0; k < 20000 && b.lager.pos < (L.lager.window[0] + L.lager.window[1]) / 2 && b.phase === 'lager'; k++) B.step(dt);
  B.press();
}

// A salvage mini-game, played clean: the pry's needle pressed in the green, the search's
// glinting spots remembered and picked.
function playSalvage(S) {
  const s = S.game;
  S.manual();
  if (s.game === 'pry') {
    for (let k = 0; k < 4000 && !s.done; k++) {
      S.step(1 / 120);
      if (s.arcs.some((a) => !a.hit && Math.abs(Math.atan2(Math.sin(s.angle - a.a), Math.cos(s.angle - a.a))) < a.w / 4)) S.press();
    }
  } else {
    const good = s.spots.map((x, i) => (x.good ? i : -1)).filter((i) => i >= 0);
    S.step((s.glint ?? CONFIG.dredge.salvage.search.glint) + 0.05);
    for (const i of good) if (!s.done) S.pick(i);
  }
}

// The screen on top, handled one action at a time. Returns a short note of what it did.
export function handle(bot) {
  const g = bot.g, top = g.ui.top?.id;
  switch (top) {
    case 'dialog': bot.count('cards'); return press('#dialog-skip') || press('#dialog-next') ? 'dialog' : (g.ui.close(), 'dialog closed');
    case 'confirm': {
      const title = $('#confirm-title').textContent, text = $('#confirm-text').textContent, yes = bot.brain.confirm(title, text);
      bot.note(`confirm “${title}” → ${yes ? 'yes' : 'no'}`);
      $(yes ? '#confirm-yes' : '#confirm-no').click();
      return 'confirm';
    }
    case 'trunk': return packOne(bot);
    case 'salvage': {
      const S = g.salvageScreen;
      if (!S) { g.ui.close('salvage'); return 'salvage (no screen)'; }
      if (!S.game.done) { playSalvage(S); bot.count('salvage'); }
      if (!press('#salvage-done')) S.finish();
      return 'salvage';
    }
    case 'still': {
      const S = g.stillScreen;
      if (!S) { g.ui.close('still'); return 'still (no screen)'; }
      if (!S.batch.done && S.batch.phase !== 'done') { playStill(S); bot.count('brew'); }
      if (isBad(S.batch)) { bot.note('a bad batch: poured out'); if (!press('#still-pour')) S.pour(); } else if (!press('#still-done')) S.finish();
      return 'still';
    }
    case 'brewery': {
      const B = g.breweryScreen;
      if (!B) { g.ui.close('brewery'); return 'brewery (no screen)'; }
      if (!B.batch.done) { playBrewery(B); bot.count('brew'); }
      if (!press('#brewery-done')) B.finish();
      return 'brewery';
    }
    case 'market': return bot.brain.atMarket() || (press('#market-done') ? 'market done' : (g.ui.close('market'), 'market closed'));
    case 'barn': return bot.brain.atBarn() || (press('#barn-done') ? 'barn done' : (g.ui.close('barn'), 'barn closed'));
    case 'ending': bot.event({ t: 'ending', id: g.dredge.data.ending }); press('#ending-keep'); return 'ending';
    case 'notebook': return bot.brain.atNotebook() || (press('#notebook-done') ? 'notebook done' : (g.ui.close('notebook'), 'notebook closed'));
    case 'pause': return press('#pause-resume') ? 'resumed' : (g.ui.close(), 'pause closed');
    default: g.ui.close(); return `closed ${top}`;
  }
}

// One piece in hand: put it where it fits. A piece Otto needs (an order's, the story's) that
// doesn't fit makes room by leaving the least valuable unneeded piece; anything else that
// won't fit is left behind (noted).
function packOne(bot) {
  const g = bot.g, s = g.trunkScreen, T = g.trunk;
  if (!s.isOpen) { g.ui.close('trunk'); return 'trunk closed'; }
  if (s.hand) {
    let spot = T.findSpot(s.hand.kind);
    const kind = s.hand.kind, want = bot.brain.wanted();
    if (!spot && (want[kind] || 0) > 0) {
      const spare = [...T.pieces.values()].filter((p) => !(want[p.kind] > 0) && !KINDS[p.kind].gear).sort((a, b) => KINDS[a.kind].value - KINDS[b.kind].value);
      for (const p of spare) { T.remove(p.id); bot.note(`left a ${KINDS[p.kind].name.toLowerCase()} to make room`); spot = T.findSpot(kind); if (spot) break; }
    }
    if (spot) { s.cursor = { x: spot.x, y: spot.y }; s.hand.rot = spot.rot; s.confirm(); bot.count('pieces'); }
    else bot.note(`no room for a ${KINDS[kind].name.toLowerCase()}: left behind`);
  }
  s.close();
  return 'trunk';
}
