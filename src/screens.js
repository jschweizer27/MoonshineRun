import { el } from './ui.js';
import { CONFIG } from './config.js';
import { priceOf, quote, dayOf, eventFor, eventText, buys } from './market.js';
import { RECIPES, missing, newBatch, stepBatch, quality, yieldFor } from './brew.js';
import { progress, wantsText } from './contracts.js';
import { kindColors, KINDS } from './trunk.js';
import { CAST } from './story.js';

const $ = (id) => document.getElementById(id);
const money = (n) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`;

// ---------- Town market ----------
// One row per kind of loot in the trunk: how many, what the next one fetches, SELL. Prices
// drop as you sell (the glut), so the row shows the total for selling them all.
// The contract board (markets, speakeasies and the barn): the job in hand with what's
// aboard for it, and the day's offers to take. `jobs` = { active(), offers(), hoursLeft(),
// onAccept(offer), onAbandon() }.
function contractRows(body, jobs, trunk, render) {
  if (!jobs) return;
  body.append(el('h3', { class: 'market-head' }, 'CONTRACTS'));
  const active = jobs.active();
  if (active) {
    const pr = progress(active, trunk), left = Math.max(0, Math.ceil(jobs.hoursLeft()));
    const drop = el('button', { type: 'button', class: 'btn small-btn', 'data-id': 'job-drop' }, 'DROP IT');
    drop.addEventListener('click', () => { jobs.onAbandon(); render(); });
    body.append(el('div', { class: 'upgrade job active' },
      el('div', {}, el('b', {}, `${active.name}: ${wantsText(active.wants)}`),
        el('small', {}, `Pays ${money(active.pay)} · due in ${left} h · aboard: ${Object.entries(pr.rows).map(([k, [h, n]]) => `${h}/${n} ${KINDS[k].short.toLowerCase()}`).join(', ')}${pr.ready ? ' · ready to deliver' : ''}`)),
      drop));
  }
  const offers = jobs.offers();
  if (!offers.length && !active) body.append(el('p', { class: 'hint' }, 'No jobs left today. Come back tomorrow.'));
  for (const o of offers) {
    const take = el('button', { type: 'button', class: 'btn small-btn', 'data-id': `job-${o.id}` }, 'TAKE IT');
    take.disabled = !!active;
    take.addEventListener('click', () => { jobs.onAccept(o); render(); });
    body.append(el('div', { class: 'upgrade job' },
      el('div', {}, el('b', {}, `${o.name}: ${wantsText(o.wants)}`),
        el('small', {}, `Pays ${money(o.pay)} · ${o.hours} h to deliver · ${o.kind === 'farm' ? 'a farm in the valley' : 'a speakeasy in the city'}`)),
      take));
  }
}

export function showMarket(ui, { town, trunk: trunkIn, getTrunk = () => trunkIn, career, jobs = null, deed = null, onSell, onBuy, onTrunk, onBack }) {
  const render = () => {
    const trunk = getTrunk();
    $('market-title').textContent = town.name.toUpperCase();
    $('market-cash').textContent = money(career.cash);
    const body = $('market-body');
    const focusedId = document.activeElement?.dataset?.id;
    body.textContent = '';
    const counts = {};
    for (const p of trunk.pieces.values()) counts[p.kind] = (counts[p.kind] || 0) + 1;
    const ev = eventFor(dayOf(career.market));
    let unsold = 0;
    for (const k of CONFIG.dredge.loot.kinds) {
      const n = counts[k.id];
      if (!n) continue;
      if (!buys(town.id, k.id)) { unsold += n; continue; }
      const each = priceOf(town.id, k.id, career.market);
      const q = quote(town.id, trunk, career.market, k.id);
      const btn = el('button', { type: 'button', class: 'btn small-btn', 'data-id': k.id, 'data-total': q.total },
        n === 1 ? `SELL ${money(q.total)}` : `SELL ${n} FOR ${money(q.total)}`);
      btn.addEventListener('click', () => { onSell(k.id); render(); });
      body.append(el('div', { class: 'upgrade' },
        el('div', {}, el('i', { class: 'swatch', style: `background:${kindColors(k).main}`, 'aria-hidden': 'true' }),
          el('b', {}, `${k.name}${n > 1 ? ` × ${n}` : ''}`),
          ev && ev.town === town.id && ev.kind === k.id ? el('span', { class: 'event-badge' }, `${ev.mult}× TODAY`) : '',
          el('small', {}, `${money(each)} each today (base ${money(k.value)}, ${k.paysAt ? `rare: pays best in ${CONFIG.dredge.towns.find((t) => t.id === k.paysAt).town}` : k.tier})`)), btn));
    }
    // The ending, at Lexington Market once Otto is King of York Road.
    if (deed && !career.data.flags.deed) {
      body.append(el('h3', { class: 'market-head' }, 'THE DEED'));
      const buy = el('button', { type: 'button', class: 'btn small-btn', 'data-id': 'deed' }, `BUY ${money(deed.cost)}`);
      buy.disabled = career.cash < deed.cost;
      buy.addEventListener('click', () => deed.onBuy());
      body.append(el('div', { class: 'upgrade deed' }, el('div', {}, el('b', {}, 'Braun & Sons, Highlandtown'),
        el('small', {}, 'The bank will sell the brewery back. This is what it was all for.')), buy));
    }
    contractRows(body, jobs, trunk, render);
    // Upgrades for the truck, paid from the same cash.
    if (onBuy) {
      body.append(el('h3', { class: 'market-head' }, 'UPGRADES'));
      for (const [id, u] of Object.entries(CONFIG.dredge.upgrades)) {
        const lvl = career.level(id), cost = career.nextCost(id), max = u.costs.length;
        const pips = el('span', { class: 'pips', 'aria-label': `level ${lvl} of ${max}` }, ...u.costs.map((_, k) => el('i', { class: k < lvl ? 'on' : '' })));
        const locked = career.lockedRank(id);
        const btn = el('button', { type: 'button', class: 'btn small-btn', 'data-id': `up-${id}` },
          cost == null ? 'MAXED' : locked != null ? `AT ${CONFIG.dredge.ranks[locked].name.toUpperCase()}` : `BUY ${money(cost)}`);
        if (cost == null || locked != null || career.cash < cost) btn.disabled = true;
        btn.addEventListener('click', () => { onBuy(id); render(); });
        body.append(el('div', { class: 'upgrade' }, el('div', {}, el('b', {}, u.name), pips, el('small', {}, u.desc)), btn));
      }
    }
    const all = quote(town.id, trunk, career.market);
    const sellAll = $('market-sell-all');
    sellAll.textContent = all.count ? `SELL EVERYTHING (${money(all.total)})` : 'SELL EVERYTHING';
    sellAll.dataset.total = all.total;
    sellAll.disabled = !all.count;
    const speakeasy = String(town.id).startsWith('drop:');
    $('market-note').textContent = (all.count
      ? 'Prices change day to day, and drop as you sell more of the same thing here.'
      : speakeasy ? 'Nothing aboard they want: a speakeasy only buys shine.' : 'Nothing in the trunk to sell. Drive the roads and pick up what you find.')
      + (unsold && all.count ? (speakeasy ? ' They only buy shine.' : ' Shine sells at the speakeasies, not the markets.') : '')
      + (ev && !speakeasy ? ` ${eventText(ev)}.` : '');
    const again = focusedId && body.querySelector(`[data-id="${focusedId}"]`);
    if (again && !again.disabled) again.focus();
    else if (!ui.top?.el.contains(document.activeElement) && ui.isOpen('market')) ui.focusFirst();
  };
  $('market-sell-all').onclick = () => { onSell(null); render(); };
  $('market-trunk').onclick = () => onTrunk();
  $('market-done').onclick = () => onBack();
  ui.open('market', { onBack });
  render();
  return render;
}

// ---------- Otto's ledger ----------
// The totals, then the latest entries: what sold where, and what the upgrades cost.
// Time played, as "42 min" or "2 h 05 min".
export function playTime(seconds) {
  const m = Math.round((seconds || 0) / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

// ---------- Otto's barn ----------
// The stash (loot kept at the barn, in trunk cells up to `cap`) and the garage (repairs for
// the truck's wear). Callbacks do the work; this draws and re-draws.
export function showBarn(ui, { career, getTrunk, cap, rank = () => 0, jobs = null, onStore, onTake, onStoreAll, onRepair, onInstall, onBrew, onTrunk, onBack }) {
  const render = () => {
    const trunk = getTrunk(), d = career.data, body = $('barn-body');
    const focusedId = document.activeElement?.dataset?.id;
    $('barn-cash').textContent = money(career.cash);
    body.textContent = '';
    const inTrunk = {};
    for (const p of trunk.pieces.values()) inTrunk[p.kind] = (inTrunk[p.kind] || 0) + 1;
    const used = career.stashCells();
    body.append(el('h3', { class: 'market-head' }, `THE STASH · ${used}/${cap} CELLS`));
    const kinds = CONFIG.dredge.loot.kinds.filter((k) => inTrunk[k.id] || d.stash[k.id]);
    if (!kinds.length) body.append(el('p', { class: 'hint' }, 'Nothing in the trunk or the stash. What you store here waits for you between runs.'));
    for (const k of kinds) {
      const n = inTrunk[k.id] || 0, m = d.stash[k.id] || 0;
      const store = el('button', { type: 'button', class: 'btn small-btn', 'data-id': `store-${k.id}` }, 'STORE');
      store.disabled = !n || used + k.cells.length > cap;
      store.addEventListener('click', () => { onStore(k.id); render(); });
      const take = el('button', { type: 'button', class: 'btn small-btn', 'data-id': `take-${k.id}` }, 'TAKE');
      take.disabled = !m || !trunk.findSpot(k.id);
      take.addEventListener('click', () => { onTake(k.id); render(); });
      body.append(el('div', { class: 'upgrade' },
        el('div', {}, el('i', { class: 'swatch', style: `background:${kindColors(k).main}`, 'aria-hidden': 'true' }),
          el('b', {}, k.name), el('small', {}, `In the trunk: ${n} · In the stash: ${m}`)),
        el('span', { class: 'slot-buttons' }, store, take)));
    }
    // The still: copper coils raise it a level; recipes need their ingredients and a rank.
    const level = d.still || 0, have = { ...d.stash };
    for (const p of trunk.pieces.values()) have[p.kind] = (have[p.kind] || 0) + 1;
    body.append(el('h3', { class: 'market-head' }, `THE STILL · LEVEL ${level}/${CONFIG.dredge.brew.maxLevel}`));
    const install = el('button', { type: 'button', class: 'btn small-btn', 'data-id': 'install-coil' }, 'INSTALL');
    install.disabled = !have.coil || level >= CONFIG.dredge.brew.maxLevel;
    install.addEventListener('click', () => { onInstall(); render(); });
    body.append(el('div', { class: 'upgrade' },
      el('div', {}, el('b', {}, level ? 'Another copper coil' : 'A copper coil'),
        el('small', {}, level >= CONFIG.dredge.brew.maxLevel ? 'The still is as good as it gets.'
          : level ? 'Each coil makes the still easier to run: a wider band to keep it in.' : 'The still needs a copper coil before it can run. They turn up on the roads.')),
      install));
    for (const r of RECIPES) {
      const lacks = missing(r, have), locked = rank() < r.rank;
      const need = Object.entries(r.needs).map(([kind, n]) => `${n} ${KINDS[kind].name.toLowerCase()}${n > 1 ? ' ×' : ''}`).join(', ');
      const brew = el('button', { type: 'button', class: 'btn small-btn', 'data-id': `brew-${r.id}` }, locked ? 'LOCKED' : 'BREW');
      brew.disabled = locked || !level || lacks.length > 0;
      brew.addEventListener('click', () => onBrew(r));
      body.append(el('div', { class: 'upgrade' },
        el('div', {}, el('i', { class: 'swatch', style: `background:${kindColors(r.id).main}`, 'aria-hidden': 'true' }), el('b', {}, r.name),
          el('small', {}, locked ? `Learned at a later rank. Needs ${need}.` : lacks.length ? `Needs ${need}; short of ${lacks.map(([k, n]) => `${n} ${KINDS[k].name.toLowerCase()}`).join(', ')}.` : `Needs ${need}. Ready to brew.`)),
        brew));
    }
    contractRows(body, jobs, trunk, render);
    // The garage.
    body.append(el('h3', { class: 'market-head' }, 'THE GARAGE'));
    const cost = career.repairCost(), health = Math.round((1 - d.wear) * 100);
    const fix = el('button', { type: 'button', class: 'btn small-btn', 'data-id': 'repair' }, cost ? `REPAIR ${money(cost)}` : 'SOUND');
    fix.disabled = !cost || career.cash < cost;
    fix.addEventListener('click', () => { onRepair(); render(); });
    body.append(el('div', { class: 'upgrade' },
      el('div', {}, el('b', {}, `The truck: ${health}%`),
        el('small', {}, d.wear > 0.01 ? 'Knocks and crashes wear it; a worn truck is slower until it’s mended.' : 'In good shape.')),
      fix));
    $('barn-store-all').disabled = !trunk.count || used >= cap;
    $('barn-note').textContent = 'Store loot here to make room in the trunk, and take it when you need it.';
    const again = focusedId && body.querySelector(`[data-id="${focusedId}"]`);
    if (again && !again.disabled) again.focus();
    else if (!ui.top?.el.contains(document.activeElement) && ui.isOpen('barn')) ui.focusFirst();
  };
  $('barn-store-all').onclick = () => { onStoreAll(); render(); };
  $('barn-trunk').onclick = () => onTrunk();
  $('barn-done').onclick = () => onBack();
  render();
  ui.open('barn', { onBack });
  return render;
}

// ---------- The still ----------
// A batch: hold STOKE (W / Up / Space, RT or A, or the button) to raise the temperature and
// let go to let it fall, keeping the needle in the drifting band. Runs on its own clock
// (the drive is paused under it); `step(dt, stoke)` drives it by hand in tests. Calls
// `onDone(quality, crates)` when the batch is finished and DONE is pressed.
export function showStill(ui, { recipe, level, onDone }) {
  const b = newBatch(level);
  let held = false, raf = 0, last = 0, finished = false;
  const STOKE_KEYS = new Set(['KeyW', 'ArrowUp', 'Space']);
  const stokeBtn = $('still-stoke'), done = $('still-done');
  const draw = () => {
    const B = CONFIG.dredge.brew;
    $('still-band').style.left = `${(b.center - b.width / 2) * 100}%`;
    $('still-band').style.width = `${b.width * 100}%`;
    $('still-scorch').style.left = `${B.scorch * 100}%`;
    $('still-needle').style.left = `${b.temp * 100}%`;
    $('still-needle').classList.toggle('in', Math.abs(b.temp - b.center) <= b.width / 2);
    $('still-progress').firstElementChild.style.width = `${(b.t / B.seconds) * 100}%`;
    if (b.done) {
      const q = quality(b), crates = yieldFor(q);
      $('still-msg').textContent = `Quality ${Math.round(q * 100)}%: ${crates} crate${crates === 1 ? '' : 's'} of ${recipe.name}, to the stash.`;
    }
  };
  const finish = () => {
    if (!b.done || finished) return;
    finished = true;
    cleanup();
    ui.close('still');
    onDone(quality(b), yieldFor(quality(b)));
  };
  const step = (dt, stoke = held) => {
    stepBatch(b, dt, stoke);
    draw();
    if (b.done) { stokeBtn.classList.add('hidden'); done.classList.remove('hidden'); done.focus(); cancelAnimationFrame(raf); }
    return b;
  };
  const padStoke = () => [...(navigator.getGamepads?.() || [])].some((p) => p && ((p.buttons[7]?.value || 0) > 0.2 || p.buttons[0]?.pressed));
  const tick = (now) => {
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    if (!b.done) step(dt, held || padStoke());
    if (!b.done && raf) raf = requestAnimationFrame(tick);
  };
  const keyDown = (e) => { if (STOKE_KEYS.has(e.code) && !b.done) { held = true; e.preventDefault(); e.stopPropagation(); } };
  const keyUp = (e) => { if (STOKE_KEYS.has(e.code)) held = false; };
  const down = (e) => { held = true; e.preventDefault(); };
  const up = () => { held = false; };
  window.addEventListener('keydown', keyDown, true);
  window.addEventListener('keyup', keyUp, true);
  stokeBtn.addEventListener('pointerdown', down);
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) stokeBtn.addEventListener(ev, up);
  const cleanup = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', keyDown, true);
    window.removeEventListener('keyup', keyUp, true);
    stokeBtn.removeEventListener('pointerdown', down);
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) stokeBtn.removeEventListener(ev, up);
  };
  $('still-recipe').textContent = `${recipe.name}: keep the needle in the band.`;
  $('still-msg').textContent = '';
  stokeBtn.classList.remove('hidden');
  done.classList.add('hidden');
  done.onclick = finish;
  ui.open('still', { onBack: () => finish() });
  draw();
  raf = requestAnimationFrame(tick);
  // `manual()` stops the screen's own clock, for stepping it by hand (tests).
  return { batch: b, step, finish, manual: () => { cancelAnimationFrame(raf); raf = 0; } };
}

// ---------- Saved games ----------
// Three slots, each with what it holds and PLAY / NEW GAME / ERASE. `onPlay(slot)` loads a
// slot and starts; `onNew(slot)` wipes it and starts fresh; `onErase(slot)` wipes it.
export function showSlots(ui, { summary, current, onPlay, onNew, onErase, onBack }) {
  const render = () => {
    const body = $('slots-body');
    body.textContent = '';
    for (const s of [1, 2, 3].map(summary)) {
      const what = s.started
        ? `${money(s.cash)} on hand · ${s.sold} piece${s.sold === 1 ? '' : 's'} sold · ${playTime(s.playSeconds)}`
        : 'Empty';
      const btn = (label, id, fn) => {
        const b = el('button', { type: 'button', class: 'btn small-btn', 'data-id': `${id}-${s.slot}` }, label);
        b.addEventListener('click', fn);
        return b;
      };
      const buttons = [btn(s.started ? 'PLAY' : 'START', 'slot-play', () => onPlay(s.slot))];
      if (s.started) {
        buttons.push(btn('NEW GAME', 'slot-new', async () => {
          if (await ui.confirm('START OVER?', `Wipe slot ${s.slot} and start a new game in it? This can’t be undone.`, 'START OVER')) onNew(s.slot);
        }));
        buttons.push(btn('ERASE', 'slot-erase', async () => {
          if (await ui.confirm('ERASE SLOT?', `Erase slot ${s.slot}? This can’t be undone.`, 'ERASE')) { onErase(s.slot); render(); ui.focusFirst(); }
        }));
      }
      body.append(el('div', { class: `upgrade slot${s.slot === current() ? ' current' : ''}` },
        el('div', {}, el('b', {}, `Slot ${s.slot}${s.slot === current() ? ' · current' : ''}`), el('small', {}, what)),
        el('span', { class: 'slot-buttons' }, ...buttons)));
    }
  };
  $('slots-done').onclick = () => onBack();
  render();
  ui.open('slots', { onBack });
}

export function showLedger(ui, career) {
  const s = career.data.stats;
  const upgrades = Object.keys(CONFIG.dredge.upgrades).reduce((n, id) => n + career.level(id), 0);
  $('ledger-totals').innerHTML = '';
  const rows = [
    ['Cash on hand', money(career.cash)], ['Earned, all time', money(s.earned)],
    ['Pieces sold', s.sold.toLocaleString()], ['Upgrades bought', upgrades],
    ['Rare finds', (s.rares || 0).toLocaleString()], ['Jobs done', (s.contracts || 0).toLocaleString()],
    ['Rank', `${CONFIG.dredge.ranks[career.data.rank || 0].name} (${(career.data.rep || 0).toLocaleString()} rep)`], ['Miles driven', ((s.distance || 0) / 1609).toFixed(1)],
    ['Time on the road', playTime(s.playSeconds)],
  ];
  for (const [k, v] of rows) $('ledger-totals').append(el('div', {}, el('span', {}, k), el('b', {}, String(v))));
  const table = $('ledger-runs');
  table.textContent = '';
  table.append(el('tr', {}, el('th', {}, 'Entry'), el('th', {}, 'Money')));
  if (!career.data.ledger.length) table.append(el('tr', {}, el('td', { colspan: '2' }, 'Nothing sold yet. The first page is always blank.')));
  for (const r of career.data.ledger.slice(0, 15)) {
    table.append(el('tr', { class: r.amount < 0 ? 'spent' : 'sale' }, el('td', {}, r.text || '—'), el('td', {}, money(r.amount || 0))));
  }
  ui.open('ledger');
}

export { money };

// ---------- Story dialogue ----------
// Plays lines one card at a time (typed out unless motion is reduced). Resolves when
// finished or skipped.
export function playDialog(ui, lines, { reducedMotion = false } = {}) {
  return new Promise((resolve) => {
    let i = 0, typing = null, full = '';
    const text = $('dialog-text'), who = $('dialog-name'), face = $('dialog-face');
    const next = $('dialog-next'), skip = $('dialog-skip');
    const show = () => {
      const [speaker, line] = lines[i];
      const c = CAST[speaker];
      who.textContent = c.name;
      face.textContent = c.initials;
      face.style.borderColor = c.color;
      face.style.color = c.color;
      face.classList.toggle('hidden', !c.initials);
      $('dialog').classList.toggle('narration', !c.name);
      next.textContent = i === lines.length - 1 ? 'CONTINUE' : 'NEXT';
      full = line;
      clearInterval(typing);
      if (reducedMotion) { text.textContent = full; typing = null; return; }
      let n = 0;
      text.textContent = '';
      typing = setInterval(() => {
        n += 2;
        text.textContent = full.slice(0, n);
        if (n >= full.length) { clearInterval(typing); typing = null; }
      }, 24);
    };
    const done = () => {
      clearInterval(typing);
      next.onclick = skip.onclick = null;
      ui.close('dialog');
      resolve();
    };
    next.onclick = () => {
      if (typing) { clearInterval(typing); typing = null; text.textContent = full; return; }
      if (++i >= lines.length) done(); else show();
    };
    skip.onclick = done;
    ui.open('dialog', { onBack: done });
    show();
  });
}
