import { el } from './ui.js';
import { CONFIG } from './config.js';
import { priceOf, quote, dayOf, eventFor, eventText, buys } from './market.js';
import { RECIPES, missing, newBatch, stepBatch, pressBatch, quality, isBad, gradeOf, yieldFor, blendGrade } from './brew.js';
import { progress, wantsText } from './contracts.js';
import { kindColors, KINDS } from './trunk.js';
import { CAST } from './story.js';
import { newPry, stepPry, pressPry, newSearch, stepSearch, pickSearch, searchGlint, score } from './salvage.js';

const $ = (id) => document.getElementById(id);
const money = (n) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`;

// ---------- Town market ----------
// One row per kind of loot in the trunk: how many, what the next one fetches, SELL. Prices
// drop as you sell (the glut), so the row shows the total for selling them all.
// The contract board (markets, speakeasies and the barn): the job in hand with what's
// aboard for it, and the day's offers to take. `jobs` = { active(), offers(), hoursLeft(),
// onAccept(offer), onAbandon() }.
// A contact's face: their initials on their colour (story.js CAST).
function face(who) {
  const c = CAST[who];
  return c ? el('i', { class: 'face', style: `background:${c.color}`, 'aria-hidden': 'true' }, c.initials) : '';
}

function contractRows(body, jobs, trunk, render) {
  if (!jobs) return;
  body.append(el('h3', { class: 'market-head' }, 'CONTRACTS'));
  const active = jobs.active();
  if (active) {
    const pr = progress(active, trunk), left = Math.max(0, Math.ceil(jobs.hoursLeft()));
    const drop = el('button', { type: 'button', class: 'btn small-btn', 'data-id': 'job-drop' }, 'DROP IT');
    drop.addEventListener('click', () => { jobs.onAbandon(); render(); });
    body.append(el('div', { class: 'upgrade job active' },
      el('div', {}, face(active.who), el('b', {}, `${active.name}: ${wantsText(active.wants)}`),
        el('small', {}, `${active.place ? `${active.place} · ` : ''}pays ${money(active.pay)} · due in ${left} h · aboard: ${Object.entries(pr.rows).map(([k, [h, n]]) => `${h}/${n} ${KINDS[k].short.toLowerCase()}`).join(', ')}${pr.ready ? ' · ready to deliver' : ''}`)),
      drop));
  }
  const offers = jobs.offers();
  if (!offers.length && !active) body.append(el('p', { class: 'hint' }, 'No jobs left today. Come back tomorrow.'));
  for (const o of offers) {
    const take = el('button', { type: 'button', class: 'btn small-btn', 'data-id': `job-${o.id}` }, 'TAKE IT');
    take.disabled = !!active;
    take.addEventListener('click', () => { jobs.onAccept(o); render(); });
    body.append(el('div', { class: 'upgrade job' },
      el('div', {}, face(o.who), el('b', {}, `${o.name}: ${wantsText(o.wants)}`),
        el('small', {}, `${o.place} · pays ${money(o.pay)} · ${o.hours} h to deliver`),
        o.line ? el('small', { class: 'says' }, `“${o.line}”`) : ''),
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
          el('b', {}, `${k.name}${n > 1 ? ` × ${n}` : ''}${k.brewed ? ` · grade ${gradeLabel(career.market.blend?.[k.id])}` : ''}`),
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
      + (ev && !speakeasy ? ` ${eventText(ev)}.` : '')
      + (career.market.marketDay?.town === town.id && (career.market.clock || 0) < career.market.marketDay.until
        ? ` It's market day: everything sells for ${Math.round((career.market.marketDay.mult - 1) * 100)}% more.` : '');
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
          el('b', {}, k.brewed ? `${k.name} · grade ${gradeLabel(d.market.blend?.[k.id])}` : k.name), el('small', {}, `In the trunk: ${n} · In the stash: ${m}`)),
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
      const need = wantsText(r.needs);
      const brew = el('button', { type: 'button', class: 'btn small-btn', 'data-id': `brew-${r.id}` }, locked ? 'LOCKED' : 'BREW');
      brew.disabled = locked || !level || lacks.length > 0;
      brew.addEventListener('click', () => onBrew(r));
      body.append(el('div', { class: 'upgrade' },
        el('div', {}, el('i', { class: 'swatch', style: `background:${kindColors(r.id).main}`, 'aria-hidden': 'true' }), el('b', {}, r.name),
          el('small', {}, locked ? `Learned at a later rank. Needs ${need}.` : lacks.length ? `Needs ${need}; short of ${wantsText(Object.fromEntries(lacks))}.` : `Needs ${need}. Ready to brew.`)),
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

// A blend's grade as shown: A, B or C, and "C, tainted" for a bad one.
const gradeLabel = (bl) => (bl?.bad ? 'C, tainted' : blendGrade(bl));

// ---------- The still ----------
// A batch in three phases (brew.js). The fire: hold STOKE (W / Up / Space, RT or A, or the
// button) to raise the temperature and let go to let it fall, keeping the needle in the
// drifting band. The cuts: the run sweeps across, heads (red), hearts (gold), tails
// (grey); press to cut into the hearts and out of them. Proofing: press once as the bead
// crosses the proof line. Runs on its own clock (rAF); `onDone(quality, crates, { grade,
// bad, poured })` when it's finished and DONE (or, for a bad batch, POUR IT OUT) is pressed.
export function showStill(ui, { recipe, level, onDone }) {
  const b = newBatch(level, recipe), B = CONFIG.dredge.brew;
  let held = false, raf = 0, last = 0, finished = false, padWas = false;
  const STOKE_KEYS = new Set(['KeyW', 'ArrowUp', 'Space']);
  const PRESS_KEYS = new Set(['KeyW', 'ArrowUp', 'Space', 'Enter', 'KeyE']);
  const stokeBtn = $('still-stoke'), done = $('still-done'), pour = $('still-pour');
  const cuts = [...document.querySelectorAll('#still-gauge .still-cut')];
  const zone = (id, from, to) => { const z = $(id); z.style.display = from == null ? 'none' : ''; if (from != null) { z.style.left = `${from * 100}%`; z.style.width = `${(to - from) * 100}%`; } };
  const TEXT = {
    fire: [`${recipe.name}: keep the needle in the band.`, 'HOLD TO STOKE', 'Hold W, &uarr;, Space, RT, A or the button to stoke the fire; let go and it cools. Keep the needle inside the band, and out of the red.'],
    cuts: ['The run is coming off: cut into the hearts where the gold starts, and out where it ends.', 'CUT', 'Press Space, Enter, A or the button to cut. Early into the hearts lets the poison heads in; late out lets in the weak tails.'],
    proof: ['Shake the jar and read the bead: press as it crosses the line.', 'PROOF IT', 'One press, as the bead crosses the gold line.'],
  };
  let shown = '';
  const draw = () => {
    const ph = b.phase === 'done' ? 'proof' : b.phase;
    if (ph !== shown) {
      shown = ph;
      $('still-recipe').textContent = TEXT[ph][0];
      stokeBtn.textContent = TEXT[ph][1];
      $('still-help').innerHTML = TEXT[ph][2];
      const order = ['fire', 'cuts', 'proof'];
      for (const li of document.querySelectorAll('#still-steps li')) {
        li.classList.toggle('on', li.dataset.phase === ph);
        li.classList.toggle('past', order.indexOf(li.dataset.phase) < order.indexOf(ph));
      }
    }
    let needle, inside, progress;
    if (ph === 'fire') {
      zone('still-band', b.center - b.width / 2, b.center + b.width / 2);
      zone('still-scorch', B.scorch, 1);
      zone('still-heads', null); zone('still-tails', null);
      needle = b.temp; inside = Math.abs(b.temp - b.center) <= b.width / 2; progress = b.t / B.seconds;
    } else if (ph === 'cuts') {
      const [h1, h2] = b.cuts.marks;
      zone('still-heads', 0, h1); zone('still-band', h1, h2); zone('still-tails', h2, 1); zone('still-scorch', null);
      needle = b.cuts.pos; inside = needle >= h1 && needle <= h2; progress = b.cuts.t / B.cuts.seconds;
    } else {
      const w = B.proof.tol;
      zone('still-band', b.proof.line - w, b.proof.line + w); zone('still-heads', null); zone('still-tails', null); zone('still-scorch', null);
      needle = b.proof.at ?? b.proof.pos; inside = Math.abs(needle - b.proof.line) <= w; progress = b.proof.t / B.proof.seconds;
    }
    cuts.forEach((c, i) => { const at = ph === 'cuts' ? b.cuts.at[i] : undefined; c.style.display = at == null ? 'none' : 'block'; if (at != null) c.style.left = `${at * 100}%`; });
    $('still-needle').style.left = `${needle * 100}%`;
    $('still-needle').classList.toggle('in', inside);
    $('still-progress').firstElementChild.style.width = `${progress * 100}%`;
    if (b.done) {
      const q = quality(b), bad = isBad(b), grade = gradeOf(q, bad), crates = yieldFor(q);
      $('still-msg').textContent = bad
        ? `Heads in the hearts: ${crates} crate${crates === 1 ? '' : 's'} of poison. Kept, it taints the ${recipe.name} on hand, and sold, it could blind a man.`
        : `Grade ${grade} (${Math.round(q * 100)}%): ${crates} crate${crates === 1 ? '' : 's'} of ${recipe.name}, to the stash.`;
    }
  };
  const finish = (poured = false) => {
    if (!b.done || finished) return;
    finished = true;
    cleanup();
    ui.close('still');
    const q = quality(b), bad = isBad(b);
    onDone(q, poured ? 0 : yieldFor(q), { grade: gradeOf(q, bad), bad, poured });
  };
  const ended = () => {
    stokeBtn.classList.add('hidden');
    done.classList.remove('hidden');
    done.textContent = isBad(b) ? 'KEEP IT' : 'DONE';
    pour.classList.toggle('hidden', !isBad(b));
    (isBad(b) ? pour : done).focus();
    cancelAnimationFrame(raf);
  };
  const step = (dt, stoke = held) => {
    stepBatch(b, dt, stoke);
    draw();
    if (b.done) ended();
    return b;
  };
  const press = () => {
    const ok = pressBatch(b);
    draw();
    if (b.done) ended();
    return ok;
  };
  const padDown = () => [...(navigator.getGamepads?.() || [])].some((p) => p && ((p.buttons[7]?.value || 0) > 0.2 || p.buttons[0]?.pressed));
  const tick = (now) => {
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    const pad = padDown();
    if (b.phase !== 'fire' && pad && !padWas) press();
    padWas = pad;
    if (!b.done) step(dt, held || pad);
    if (!b.done && raf) raf = requestAnimationFrame(tick);
  };
  const keyDown = (e) => {
    if (b.done) return;
    if (b.phase === 'fire' ? STOKE_KEYS.has(e.code) : PRESS_KEYS.has(e.code)) {
      e.preventDefault(); e.stopPropagation();
      if (b.phase === 'fire') held = true;
      else if (!e.repeat) press();
    }
  };
  const keyUp = (e) => { if (STOKE_KEYS.has(e.code)) held = false; };
  const down = (e) => { e.preventDefault(); if (b.phase === 'fire') held = true; else press(); };
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
  $('still-msg').textContent = '';
  stokeBtn.classList.remove('hidden');
  done.classList.add('hidden');
  pour.classList.add('hidden');
  done.onclick = () => finish(false);
  pour.onclick = () => finish(true);
  ui.open('still', { onBack: () => finish(false) });
  draw();
  raf = requestAnimationFrame(tick);
  // `manual()` stops the screen's own clock, for stepping it by hand (tests).
  return { batch: b, step, press, finish, pour: () => finish(true), manual: () => { cancelAnimationFrame(raf); raf = 0; } };
}

// ---------- Salvage ----------
// A site's mini-game (salvage.js): Pry, a needle sweeping a ring (press in the green), or
// Search, a 3x3 cellar (remember where the goods glinted, pick before the lamp dies).
// `onDone(score)` when the player takes what's there. Returns { game, step, press, pick,
// finish, manual } so tests can play it by hand.
export function showSalvage(ui, { site, onDone }) {
  const kind = CONFIG.dredge.salvage.kinds[site.kind], P = CONFIG.dredge.salvage;
  const g = kind.game === 'pry' ? newPry() : newSearch();
  const ring = $('salvage-ring'), grid = $('salvage-grid'), pressBtn = $('salvage-press'), done = $('salvage-done');
  let raf = 0, last = 0, finished = false, padWas = false;
  const total = g.game === 'pry' ? P.pry.seconds : P.search.glint + P.search.seconds;
  const draw = () => {
    $('salvage-progress').firstElementChild.style.width = `${Math.max(0, 1 - g.t / total) * 100}%`;
    if (g.game === 'pry') {
      const c = ring.getContext('2d'), W = ring.width, R = W * 0.38;
      c.clearRect(0, 0, W, W);
      c.lineWidth = 16;
      c.strokeStyle = '#2a3640';
      c.beginPath(); c.arc(W / 2, W / 2, R, 0, Math.PI * 2); c.stroke();
      for (const a of g.arcs) {
        c.strokeStyle = a.hit ? '#6a7a5a' : '#8fd06a';
        c.beginPath(); c.arc(W / 2, W / 2, R, a.a - a.w / 2 - Math.PI / 2, a.a + a.w / 2 - Math.PI / 2); c.stroke();
      }
      const x = W / 2 + Math.sin(g.angle) * R, y = W / 2 - Math.cos(g.angle) * R;
      c.strokeStyle = '#f2e3b0'; c.lineWidth = 4;
      c.beginPath(); c.moveTo(W / 2, W / 2); c.lineTo(x, y); c.stroke();
      c.fillStyle = '#e8735a';
      for (let k = 0; k < P.pry.strikes; k++) { c.beginPath(); c.arc(W / 2 - 24 + k * 24, W / 2, 7, 0, Math.PI * 2); c[k < g.strikes ? 'fill' : 'stroke'](); }
    } else {
      const glint = searchGlint(g);
      [...grid.children].forEach((b, i) => {
        const s = g.spots[i];
        b.classList.toggle('glint', glint && s.good);
        b.classList.toggle('found', s.picked && s.good);
        b.classList.toggle('empty', s.picked && !s.good);
        b.textContent = glint && s.good ? '✦' : s.picked ? (s.good ? '✔' : '✕') : '';
        b.disabled = glint || g.done || s.picked;
      });
      if (!g.done) $('salvage-msg').textContent = glint ? 'Watch where it glints…' : `Pick ${P.search.picks - g.picks} more before the lamp dies.`;
    }
    if (g.done) {
      const sc = score(g);
      $('salvage-msg').textContent = sc >= 0.85 ? 'A clean job. The best of it is yours.' : sc >= 0.5 ? 'Not bad: some of it’s worth taking.' : sc > 0.01 ? 'You got something out of it.' : 'Nothing worth taking.';
      pressBtn.classList.add('hidden');
      done.classList.remove('hidden');
      if (document.activeElement !== done) done.focus();
    }
  };
  const step = (dt) => {
    if (g.game === 'pry') stepPry(g, dt); else stepSearch(g, dt);
    draw();
    return g;
  };
  const press = () => { if (g.game === 'pry' && !g.done) { pressPry(g); draw(); } };
  const pick = (i) => { pickSearch(g, i); draw(); };
  const finish = () => {
    if (finished) return;
    if (!g.done) { g.done = true; }
    finished = true;
    cleanup();
    ui.close('salvage');
    onDone(score(g));
  };
  const tick = (now) => {
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    // A gamepad's A presses (on the way down).
    const pad = [...(navigator.getGamepads?.() || [])].some((p) => p && p.buttons[0]?.pressed);
    if (pad && !padWas) press();
    padWas = pad;
    if (!g.done) step(dt);
    if (!g.done && raf) raf = requestAnimationFrame(tick);
  };
  const PRESS = new Set(['Space', 'Enter', 'KeyE', 'ArrowUp', 'KeyW']);
  const keyDown = (e) => {
    if (g.game !== 'pry' || g.done || !PRESS.has(e.code)) return;
    e.preventDefault(); e.stopPropagation();
    if (!e.repeat) press();
  };
  window.addEventListener('keydown', keyDown, true);
  const cleanup = () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', keyDown, true); };
  $('salvage-title').textContent = kind.name.toUpperCase();
  $('salvage-what').textContent = g.game === 'pry' ? 'Pry it open: press as the needle crosses the green.' : 'Search the place: remember where it glints, then pick your spots.';
  $('salvage-help').textContent = g.game === 'pry'
    ? 'Space, Enter, A or the button to pry. Three slips and the wood splinters.'
    : `Pick ${P.search.picks} spots with the arrows and Enter, A, or a click.`;
  $('salvage-msg').textContent = '';
  ring.classList.toggle('hidden', g.game !== 'pry');
  grid.classList.toggle('hidden', g.game === 'pry');
  grid.textContent = '';
  if (g.game === 'search') {
    g.spots.forEach((_, i) => {
      const b = el('button', { type: 'button', 'data-id': `spot-${i}`, 'aria-label': `Spot ${i + 1}` });
      b.addEventListener('click', () => pick(i));
      grid.append(b);
    });
  }
  pressBtn.classList.toggle('hidden', g.game !== 'pry');
  pressBtn.onclick = () => press();
  done.classList.add('hidden');
  done.onclick = finish;
  ui.open('salvage', { onBack: () => finish() });
  draw();
  raf = requestAnimationFrame(tick);
  return { game: g, step, press, pick, finish, manual: () => { cancelAnimationFrame(raf); raf = 0; } };
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
    table.append(el('tr', { class: r.amount < 0 ? 'spent' : 'sale' }, el('td', {}, r.text || '—'), el('td', {}, r.amount ? money(r.amount) : '—')));
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
