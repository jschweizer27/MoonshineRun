import { el } from './ui.js';
import { CONFIG } from './config.js';
import { priceOf, quote, dayOf, eventFor, eventText } from './market.js';
import { kindColors } from './trunk.js';
import { CAST } from './story.js';

const $ = (id) => document.getElementById(id);
const money = (n) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`;

// ---------- Town market ----------
// One row per kind of loot in the trunk: how many, what the next one fetches, SELL. Prices
// drop as you sell (the glut), so the row shows the total for selling them all.
export function showMarket(ui, { town, trunk: trunkIn, getTrunk = () => trunkIn, career, onSell, onBuy, onTrunk, onBack }) {
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
    for (const k of CONFIG.dredge.loot.kinds) {
      const n = counts[k.id];
      if (!n) continue;
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
    // Upgrades for the truck, paid from the same cash.
    if (onBuy) {
      body.append(el('h3', { class: 'market-head' }, 'UPGRADES'));
      for (const [id, u] of Object.entries(CONFIG.dredge.upgrades)) {
        const lvl = career.level(id), cost = career.nextCost(id), max = u.costs.length;
        const pips = el('span', { class: 'pips', 'aria-label': `level ${lvl} of ${max}` }, ...u.costs.map((_, k) => el('i', { class: k < lvl ? 'on' : '' })));
        const btn = el('button', { type: 'button', class: 'btn small-btn', 'data-id': `up-${id}` }, cost == null ? 'MAXED' : `BUY ${money(cost)}`);
        if (cost == null || career.cash < cost) btn.disabled = true;
        btn.addEventListener('click', () => { onBuy(id); render(); });
        body.append(el('div', { class: 'upgrade' }, el('div', {}, el('b', {}, u.name), pips, el('small', {}, u.desc)), btn));
      }
    }
    const all = quote(town.id, trunk, career.market);
    const sellAll = $('market-sell-all');
    sellAll.textContent = all.count ? `SELL EVERYTHING (${money(all.total)})` : 'SELL EVERYTHING';
    sellAll.dataset.total = all.total;
    sellAll.disabled = !all.count;
    $('market-note').textContent = (all.count
      ? 'Prices change day to day, and drop as you sell more of the same thing here.'
      : 'Nothing in the trunk to sell. Drive the roads and pick up what you find.') + (ev ? ` ${eventText(ev)}.` : '');
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
export function showBarn(ui, { career, getTrunk, cap, onStore, onTake, onStoreAll, onRepair, onTrunk, onBack }) {
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
    ['Rare finds', (s.rares || 0).toLocaleString()], ['Miles driven', ((s.distance || 0) / 1609).toFixed(1)],
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
