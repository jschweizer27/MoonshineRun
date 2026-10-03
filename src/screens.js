import { el } from './ui.js';
import { CONFIG } from './config.js';
import { priceOf, quote, dayOf, eventFor, eventText } from './market.js';
import { kindColors } from './trunk.js';

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
export function showLedger(ui, career) {
  const s = career.data.stats;
  const mins = Math.round(s.playSeconds / 60);
  const upgrades = Object.keys(CONFIG.dredge.upgrades).reduce((n, id) => n + career.level(id), 0);
  $('ledger-totals').innerHTML = '';
  const rows = [
    ['Cash on hand', money(career.cash)], ['Earned, all time', money(s.earned)],
    ['Pieces sold', s.sold.toLocaleString()], ['Upgrades bought', upgrades],
    ['Time on the road', `${mins} min`],
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
