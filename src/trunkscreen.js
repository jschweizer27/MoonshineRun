import { el } from './ui.js';
import { KINDS, shape, shapeSize, kindColors, inkFor } from './trunk.js';

const $ = (id) => document.getElementById(id);

// The trunk screen (dredge run): pack loot into the grid. A piece "in hand" follows the
// cursor; Enter / A / click puts it down, lifts the piece under the cursor, or swaps the two
// when the one in hand overlaps exactly one piece. R, Q / E, the shoulder buttons or a
// right-click turn it; X / Backspace leaves it on the road. Esc / B closes the trunk (a new
// piece still in hand is left behind; a lifted one goes back where it was).
export class TrunkScreen {
  constructor(ui, { onDiscard = () => {}, onChange = () => {}, onClose = () => {} } = {}) {
    this.ui = ui;
    this.onDiscard = onDiscard;
    this.onChange = onChange;
    this.onClose = onClose;
    this.grid = $('trunk-grid');
    this.hand = null;          // { kind, rot, from: null | { x, y, rot } }
    this.cursor = { x: 0, y: 0 };
    this.grid.addEventListener('pointermove', (e) => {
      const c = e.target.closest('.cell');
      if (c && this.trunk) { this._moveTo(+c.dataset.x, +c.dataset.y); }
    });
    this.grid.addEventListener('click', (e) => {
      const c = e.target.closest('.cell');
      if (c) this._moveTo(+c.dataset.x, +c.dataset.y);
      this.confirm();
    });
    this.grid.addEventListener('contextmenu', (e) => { e.preventDefault(); this.rotate(); });
  }

  get isOpen() { return this.ui.isOpen('trunk'); }

  // Open with `newKind` in hand (just picked up), or empty-handed to rearrange.
  open(trunk, newKind = null) {
    this.trunk = trunk;
    this.hand = null;
    this.cursor = { x: 0, y: 0 };
    if (newKind) {
      const spot = trunk.findSpot(newKind);
      this.hand = { kind: newKind, rot: spot ? spot.rot : 0, from: null };
      if (spot) this.cursor = { x: spot.x, y: spot.y };
      this._msg(spot ? '' : 'No room as it is: lift and swap pieces, or leave something behind.');
    } else this._msg('');
    this.ui.open('trunk', {
      onBack: () => this.close(),
      onNav: (dir) => this.move(...{ up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir]),
      onConfirm: () => this.confirm(),
      onKey: (e) => this._key(e),
      onAction: (a, dev) => {
        if (a === 'rotate') { this.rotate(); return true; }
        if (a === 'trunk') { if (dev === 'gamepad') this.discard(); else this.close(); return true; }
        return false;
      },
    });
    this._render();
  }

  _key(e) {
    const k = e.code;
    if (k === 'KeyR' || k === 'KeyE') { this.rotate(); return true; }
    if (k === 'KeyQ') { this.rotate(-1); return true; }
    if (k === 'KeyX' || k === 'Backspace' || k === 'Delete') { this.discard(); return true; }
    if (k === 'Enter' || k === 'NumpadEnter' || k === 'Space') { this.confirm(); return true; }
    const wasd = { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] }[k];
    if (wasd) { this.move(...wasd); return true; }
    return false;
  }

  _cells() { return this.hand ? shape(this.hand.kind, this.hand.rot) : [[0, 0]]; }

  // Keep the whole piece in hand inside the grid.
  _clamp() {
    const { w, h } = shapeSize(this._cells());
    this.cursor.x = Math.max(0, Math.min(this.trunk.cols - w, this.cursor.x));
    this.cursor.y = Math.max(0, Math.min(this.trunk.rows - h, this.cursor.y));
  }

  _moveTo(x, y) {
    if (this.cursor.x === x && this.cursor.y === y) return;
    this.cursor = { x, y };
    this._clamp();
    this._render();
  }

  move(dx, dy) {
    this.cursor.x += dx;
    this.cursor.y += dy;
    this._clamp();
    this._render();
  }

  rotate(dir = 1) {
    if (!this.hand) return;
    this.hand.rot = (this.hand.rot + dir + 4) % 4;
    this._clamp();
    this._render();
  }

  // Put down, lift, or swap.
  confirm() {
    const t = this.trunk, { x, y } = this.cursor;
    if (!this.hand) {
      const p = t.pieceAt(x, y);
      if (!p) return;
      t.remove(p.id);
      this.hand = { kind: p.kind, rot: p.rot, from: { x: p.x, y: p.y, rot: p.rot } };
      this.cursor = { x: p.x, y: p.y };
      this._msg('');
      this._changed();
      return;
    }
    const h = this.hand;
    if (t.place(h.kind, x, y, h.rot)) {
      this.hand = null;
      this._msg('');
      this._changed();
      return;
    }
    const o = t.overlaps(h.kind, x, y, h.rot);
    if (o.inside && o.ids.length === 1) {
      const other = t.remove(o.ids[0]);
      t.place(h.kind, x, y, h.rot);
      this.hand = { kind: other.kind, rot: other.rot, from: null };
      this._msg(`Swapped: now holding the ${KINDS[other.kind].name.toLowerCase()}.`);
      this._changed();
      return;
    }
    this._msg('It doesn’t fit there.');
    this.grid.classList.remove('nope');
    void this.grid.offsetWidth;
    this.grid.classList.add('nope');
  }

  // Leave the piece in hand on the road.
  discard() {
    if (!this.hand) return;
    const kind = this.hand.kind;
    this.hand = null;
    this._msg(`Left the ${KINDS[kind].name.toLowerCase()} behind.`);
    this.onDiscard(KINDS[kind]);
    this._changed();
  }

  close() {
    if (this.hand) {
      const h = this.hand, t = this.trunk;
      // A lifted piece goes back where it was (or anywhere it fits); a new one is left behind.
      const back = h.from && (t.place(h.kind, h.from.x, h.from.y, h.from.rot) || (() => { const s = t.findSpot(h.kind); return s && t.place(h.kind, s.x, s.y, s.rot); })());
      if (!back) this.onDiscard(KINDS[h.kind]);
      this.hand = null;
      this.onChange();
    }
    this.ui.close('trunk');
    this.onClose();
  }

  _changed() {
    this._clamp();
    this._render();
    this.onChange();
  }

  _msg(text) { $('trunk-msg').textContent = text; }

  _render() {
    const t = this.trunk;
    if (!t) return;
    const g = this.grid;
    g.style.setProperty('--cols', t.cols);
    g.style.setProperty('--rows', t.rows);
    if (g.children.length !== t.size) {
      g.textContent = '';
      for (let y = 0; y < t.rows; y++) for (let x = 0; x < t.cols; x++) g.append(el('div', { class: 'cell', 'data-x': x, 'data-y': y }));
    }
    const ghost = new Map(), handCol = this.hand ? kindColors(this.hand.kind) : null;
    if (this.hand) {
      const ok = t.canPlace(this.hand.kind, this.cursor.x, this.cursor.y, this.hand.rot);
      for (const [c, r] of shape(this.hand.kind, this.hand.rot)) ghost.set(`${this.cursor.x + c},${this.cursor.y + r}`, ok ? 'ok' : 'bad');
    }
    for (const cell of g.children) {
      const x = +cell.dataset.x, y = +cell.dataset.y, p = t.pieceAt(x, y);
      const gh = ghost.get(`${x},${y}`);
      cell.className = `cell${p ? ' filled' : ''}${gh ? ` ghost ${gh}` : ''}${!this.hand && this.cursor.x === x && this.cursor.y === y ? ' cursor' : ''}`;
      cell.dataset.kind = p ? p.kind : '';
      // Pieces in their palette colours, edged in their accent where the neighbour is
      // another piece; the piece in hand shows through where it would go.
      const col = p ? kindColors(p.kind) : null;
      cell.style.background = gh ? `color-mix(in srgb, ${handCol.main} 72%, ${col ? col.main : 'transparent'})` : col ? col.main : '';
      cell.style.color = col ? inkFor(col.main) : '';
      if (p) {
        const edge = (dx, dy) => (t.pieceAt(x + dx, y + dy)?.id === p.id ? 'transparent' : col.accent);
        cell.style.borderTopColor = edge(0, -1);
        cell.style.borderBottomColor = edge(0, 1);
        cell.style.borderLeftColor = edge(-1, 0);
        cell.style.borderRightColor = edge(1, 0);
      } else cell.style.borderColor = '';
      const first = p && p.cells[0][0] === x && p.cells[0][1] === y;
      cell.textContent = first ? KINDS[p.kind].short : '';
    }
    $('trunk-hand').textContent = this.hand
      ? `In hand: ${KINDS[this.hand.kind].name} ($${KINDS[this.hand.kind].value})`
      : 'Hands free: pick up a piece to move it, or close the trunk.';
    $('trunk-fill').textContent = `${t.used} / ${t.size} spaces · ${t.count} piece${t.count === 1 ? '' : 's'} · worth about $${t.value}`;
  }
}
