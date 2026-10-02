import { el } from './ui.js';
import { UPGRADES, BRIBE_COST } from './career.js';
import { CAST } from './story.js';
import { CONFIG } from './config.js';
import { priceOf, quote } from './market.js';

const $ = (id) => document.getElementById(id);
const money = (n) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`;
const stars = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

// ---------- Order book (at the still) ----------
export function showOrders(ui, { still, options }, onPick) {
  $('orders-title').textContent = `THE ORDER BOOK — ${still.name.toUpperCase()}`;
  const body = $('orders-body');
  body.textContent = '';
  options.forEach((o, i) => {
    const risk = o.heat < 1.3 ? 1 : o.heat < 2 ? 2 : 3;
    const card = el('button', { type: 'button', class: `order${o.locked ? ' locked' : ''}`, 'aria-label': `${o.label}: ${o.jugs} jugs to ${o.drop.name}, pays ${money(o.pay)}` },
      el('span', { class: 'order-key' }, String(i + 1)),
      el('span', { class: 'order-main' },
        el('b', {}, o.label),
        el('span', {}, `${o.jugs} jugs → ${o.drop.name}`),
        el('small', {}, `${(o.dist / 1000).toFixed(1)} km · heat ${stars(risk)}${o.tipOff ? ' · the law gets tipped off' : ''}`)),
      el('span', { class: 'order-pay' }, o.locked ? (o.lockReason || 'Needs Still-master') : money(o.pay)));
    if (o.locked) card.setAttribute('aria-disabled', 'true');
    card.addEventListener('click', () => { if (!o.locked) finish(i); });
    body.append(card);
  });
  const onKey = (e) => {
    const n = Number(e.key);
    if (n >= 1 && n <= options.length && !options[n - 1].locked) { e.preventDefault(); finish(n - 1); }
  };
  const finish = (i) => {
    window.removeEventListener('keydown', onKey, true);
    ui.close('orders');
    onPick(i);
  };
  window.addEventListener('keydown', onKey, true);
  // Leaving without an order just drops you back in the truck.
  ui.open('orders', { onBack: () => finish(-1) });
}

// ---------- Town market (dredge run) ----------
// One row per kind of loot in the trunk: how many, what the next one fetches, SELL. Prices
// drop as you sell (the glut), so the row shows the total for selling them all.
export function showMarket(ui, { town, trunk, career, onSell, onTrunk, onBack }) {
  const render = () => {
    $('market-title').textContent = town.name.toUpperCase();
    $('market-cash').textContent = money(career.cash);
    const body = $('market-body');
    const focusedId = document.activeElement?.dataset?.id;
    body.textContent = '';
    const counts = {};
    for (const p of trunk.pieces.values()) counts[p.kind] = (counts[p.kind] || 0) + 1;
    for (const k of CONFIG.dredge.loot.kinds) {
      const n = counts[k.id];
      if (!n) continue;
      const each = priceOf(town.id, k.id, career.market);
      const q = quote(town.id, trunk, career.market, k.id);
      const btn = el('button', { type: 'button', class: 'btn small-btn', 'data-id': k.id, 'data-total': q.total },
        n === 1 ? `SELL ${money(q.total)}` : `SELL ${n} FOR ${money(q.total)}`);
      btn.addEventListener('click', () => { onSell(k.id); render(); });
      body.append(el('div', { class: 'upgrade' },
        el('div', {}, el('b', {}, `${k.name}${n > 1 ? ` × ${n}` : ''}`), el('small', {}, `${money(each)} each today (base ${money(k.value)})`)), btn));
    }
    const all = quote(town.id, trunk, career.market);
    const sellAll = $('market-sell-all');
    sellAll.textContent = all.count ? `SELL EVERYTHING (${money(all.total)})` : 'SELL EVERYTHING';
    sellAll.dataset.total = all.total;
    sellAll.disabled = !all.count;
    $('market-note').textContent = all.count
      ? 'Prices change day to day, and drop as you sell more of the same thing here.'
      : 'Nothing in the trunk to sell. Drive the roads and pick up what you find.';
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

// ---------- Garage (County Specialists) ----------
export function showGarage(ui, career, { onChange, onLedger, bribeUnlocked }) {
  const render = () => {
    $('garage-cash').textContent = money(career.cash);
    const body = $('garage-body');
    const focusedId = document.activeElement?.dataset?.id;
    body.textContent = '';
    for (const [id, u] of Object.entries(UPGRADES)) {
      const lvl = career.level(id), cost = career.nextCost(id);
      const pips = el('span', { class: 'pips', 'aria-label': `level ${lvl} of 3` }, ...[0, 1, 2].map((k) => el('i', { class: k < lvl ? 'on' : '' })));
      const btn = el('button', { type: 'button', class: 'btn small-btn', 'data-id': id }, cost == null ? 'MAXED' : `HIRE ${money(cost)}`);
      if (cost == null || career.cash < cost) btn.disabled = true;
      btn.addEventListener('click', () => { if (career.buy(id)) { onChange(); render(); } });
      // In the Rolls some specialists' work doesn't apply: say so.
      const note = career.ride === 'rolls' ? { armor: ' Truck only: the Rolls tows no horse box.', cargo: ' Big orders won’t fit the Rolls’ trunk.' }[id] || '' : '';
      body.append(el('div', { class: 'upgrade' },
        el('div', {}, el('b', {}, `${u.name} — ${u.what}`), pips, el('small', {}, u.desc + note)), btn));
    }
    // The motor car: buy the Rolls-Royce once, then switch between it and the truck.
    {
      const owned = career.data.cars.rolls, inRolls = career.ride === 'rolls';
      const label = !owned ? `BUY ${money(CONFIG.rolls.cost)}` : inRolls ? 'DRIVE THE TRUCK' : 'DRIVE THE ROLLS';
      const btn = el('button', { type: 'button', class: 'btn small-btn', 'data-id': 'rolls' }, label);
      if (!owned && career.cash < CONFIG.rolls.cost) btn.disabled = true;
      btn.addEventListener('click', () => {
        const ok = !owned ? career.buyRolls() : career.setRide(inRolls ? 'truck' : 'rolls');
        if (ok) { onChange(); render(); }
      });
      const desc = inRolls
        ? 'Driving the Rolls: faster, and informants suspect a gentleman less. No horse box: no disguise, no armour, and the trunk takes small loads only.'
        : 'A gentleman’s motor car: faster, and informants suspect it less. It can’t tow the horse box (no disguise, no armour) and the trunk takes small loads only.';
      body.append(el('div', { class: 'upgrade rolls' },
        el('div', {}, el('b', {}, `Motor car — 1925 Rolls-Royce Phantom I${owned ? (inRolls ? ' (driving)' : ' (in the garage)') : ''}`), el('small', {}, desc)), btn));
    }
    if (bribeUnlocked()) {
      const paid = career.data.bribes.county;
      const btn = el('button', { type: 'button', class: 'btn small-btn', 'data-id': 'bribe' }, paid ? 'ON THE PAYROLL' : `PAY ${money(BRIBE_COST)}`);
      if (paid || career.cash < BRIBE_COST) btn.disabled = true;
      btn.addEventListener('click', () => { if (career.bribeCounty()) { onChange(); render(); } });
      body.append(el('div', { class: 'upgrade bribe' },
        el('div', {}, el('b', {}, 'County Sheriff — an envelope'), el('small', {}, 'The county becomes a safe zone: no patrols, no tip-offs, and pursuers give up at the county line.')), btn));
    }
    const again = focusedId && body.querySelector(`[data-id="${focusedId}"]`);
    if (again && !again.disabled) again.focus();
  };
  render();
  $('garage-ledger').onclick = () => onLedger();
  ui.open('garage');
}

// ---------- Otto's ledger ----------
export function showLedger(ui, career, streak) {
  const s = career.data.stats;
  const mins = Math.round(s.playSeconds / 60);
  $('ledger-totals').innerHTML = '';
  const rows = [
    ['Cash on hand', money(career.cash)], ['Earned, all time', money(s.earned)],
    ['Deliveries', s.deliveries], ['Jugs moved', s.jugs.toLocaleString()],
    ['Current streak', `${money(streak.earned)} (${streak.runs} runs)`], ['Best streak', `${money(s.bestStreak)} (${s.bestStreakRuns} runs)`],
    ['Busts', s.busts], ['Fines paid', money(s.fines)], ['Time on the road', `${mins} min`],
  ];
  for (const [k, v] of rows) $('ledger-totals').append(el('div', {}, el('span', {}, k), el('b', {}, String(v))));
  const table = $('ledger-runs');
  table.textContent = '';
  table.append(el('tr', {}, ...['', 'Route', 'Jugs', 'Money', 'Time', 'Heat'].map((h) => el('th', {}, h))));
  if (!career.data.ledger.length) table.append(el('tr', {}, el('td', { colspan: '6' }, 'No runs yet. The first page is always blank.')));
  for (const r of career.data.ledger.slice(0, 15)) {
    table.append(el('tr', { class: r.result },
      el('td', {}, r.result === 'delivered' ? '✓' : '✗'),
      el('td', {}, r.route || '—'),
      el('td', {}, String(r.jugs ?? '')),
      el('td', {}, money(r.pay)),
      el('td', {}, r.seconds ? `${Math.floor(r.seconds / 60)}:${String(r.seconds % 60).padStart(2, '0')}` : ''),
      el('td', {}, '★'.repeat(r.maxHeat || 0))));
  }
  ui.open('ledger');
}

// ---------- Story dialogue ----------
// Plays lines one card at a time. Resolves when finished or skipped.
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

export { money };
