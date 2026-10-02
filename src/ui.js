import { ACTIONS, DEFAULT_BINDINGS, keyLabel } from './settings.js';

// Menu screens as a stack. The top screen gets focus; arrow keys, the d-pad or the left
// stick move between buttons, Enter / A activates, Esc / B goes back.
export class UI {
  constructor(input) {
    this.input = input;
    this.stack = [];          // [{ id, el, onBack }]
    window.addEventListener('keydown', (e) => this._key(e), true);
  }

  get top() { return this.stack[this.stack.length - 1] || null; }
  isOpen(id) { return this.stack.some((s) => s.id === id); }
  get anyOpen() { return this.stack.length > 0; }

  // A screen with its own controls (the trunk grid) passes handlers: onNav(dir) for the
  // arrows / d-pad, onConfirm() for Enter / A, onKey(e) for other keys (return true when
  // handled) and onAction(action, device) for game actions such as 'rotate'.
  open(id, { onBack = null, focus = true, onNav = null, onConfirm = null, onKey = null, onAction = null } = {}) {
    const el = document.getElementById(id);
    if (this.isOpen(id)) this.close(id);
    el.classList.remove('hidden');
    this.stack.push({ id, el, onBack, onNav, onConfirm, onKey, onAction, returnFocus: document.activeElement });
    if (focus) this.focusFirst();
    return el;
  }

  close(id = this.top?.id) {
    const i = this.stack.findIndex((s) => s.id === id);
    if (i < 0) return;
    const [s] = this.stack.splice(i, 1);
    s.el.classList.add('hidden');
    if (this.top) this.focusFirst();
    // Back in the game: drop focus so Space (handbrake) can't "click" a leftover button.
    else document.activeElement?.blur?.();
  }

  closeAll() { while (this.stack.length) this.close(); }

  back() {
    const t = this.top;
    if (!t) return;
    if (t.onBack) t.onBack();
    else this.close();
  }

  _focusables() {
    if (!this.top) return [];
    return [...this.top.el.querySelectorAll('button:not([disabled]), input, [tabindex="0"]')]
      .filter((el) => el.offsetParent !== null);
  }

  focusFirst() {
    const el = this.top.el.querySelector('[data-autofocus]') || this._focusables()[0];
    if (el) this._focus(el);
  }

  _focus(el) {
    el.focus({ preventScroll: false });
    el.scrollIntoView?.({ block: 'nearest' });
  }

  // dir: 'up' | 'down' | 'left' | 'right'
  nav(dir) {
    if (this.top?.onNav) { this.top.onNav(dir); return; }
    const list = this._focusables();
    if (!list.length) return;
    const cur = document.activeElement;
    const i = list.indexOf(cur);
    if ((dir === 'left' || dir === 'right') && cur && cur.type === 'range') {
      if (dir === 'left') cur.stepDown(); else cur.stepUp();
      cur.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    if ((dir === 'left' || dir === 'right') && cur && cur.closest('.seg')) {
      const seg = [...cur.closest('.seg').querySelectorAll('button')];
      const j = seg.indexOf(cur) + (dir === 'right' ? 1 : -1);
      if (seg[j]) { this._focus(seg[j]); seg[j].click(); }
      return;
    }
    const step = dir === 'up' || dir === 'left' ? -1 : 1;
    const next = i < 0 ? list[0] : list[(i + step + list.length) % list.length];
    this._focus(next);
  }

  activate() {
    if (this.top?.onConfirm) { this.top.onConfirm(); return; }
    const el = document.activeElement;
    if (el && this.top && this.top.el.contains(el)) el.click();
  }

  _key(e) {
    if (!this.top || this.input._capture) return;
    if (this.top.onKey && this.top.onKey(e)) { e.preventDefault(); e.stopPropagation(); return; }
    const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    if (map[e.code]) {
      e.preventDefault();
      e.stopPropagation();
      this.nav(map[e.code]);
    } else if (e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.back();
    } else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !this.top.el.contains(document.activeElement)) {
      // Focus wandered off (e.g. a click on the background): Enter still presses the
      // screen's main button.
      e.preventDefault();
      this.focusFirst();
      document.activeElement?.click();
    }
  }

  confirm(title, text, yes = 'YES') {
    return new Promise((resolve) => {
      document.getElementById('confirm-title').textContent = title;
      document.getElementById('confirm-text').textContent = text;
      const yesBtn = document.getElementById('confirm-yes');
      const noBtn = document.getElementById('confirm-no');
      yesBtn.textContent = yes;
      const done = (v) => { yesBtn.onclick = noBtn.onclick = null; this.close('confirm'); resolve(v); };
      yesBtn.onclick = () => done(true);
      noBtn.onclick = () => done(false);
      this.open('confirm', { onBack: () => done(false) });
    });
  }
}

// ---------- Settings screen ----------
export const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of kids) n.append(c);
  return n;
};

export function buildSettings(container, settings, { onChange, input, extra = [] }) {
  container.textContent = '';
  const change = (key, value) => { settings[key] = value; onChange(settings, key); };

  const slider = (label, key) => {
    const r = el('input', { type: 'range', min: '0', max: '1', step: '0.05', 'aria-label': label });
    r.value = settings[key];
    r.addEventListener('input', () => change(key, Number(r.value)));
    return el('label', { class: 'set-row' }, label, r);
  };
  const toggle = (label, key) => {
    const c = el('input', { type: 'checkbox', 'aria-label': label });
    c.checked = !!settings[key];
    c.addEventListener('change', () => change(key, c.checked));
    return el('label', { class: 'set-row' }, label, c);
  };
  const seg = (label, key, options, note = '') => {
    const group = el('div', { class: 'seg', role: 'group', 'aria-label': label });
    for (const [value, text] of options) {
      const b = el('button', { type: 'button', 'aria-pressed': String(settings[key] === value) }, text);
      b.addEventListener('click', () => {
        group.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        change(key, value);
      });
      group.append(b);
    }
    const title = el('span', {}, label);
    if (note) title.append(el('br'), el('small', { class: 'hint' }, note));
    return el('div', { class: 'set-row' }, title, group);
  };
  const section = (title, ...rows) => el('div', { class: 'set-section' }, el('h3', {}, title), ...rows);

  const detected = settings.quality === 'auto' && settings.detectedQuality ? `Auto picked: ${settings.detectedQuality}` : '';
  container.append(
    section('Sound',
      slider('Master volume', 'masterVolume'),
      slider('Music', 'musicVolume'),
      slider('Effects', 'sfxVolume'),
      toggle('Mute everything', 'muted')),
    section('Display',
      seg('Graphics quality', 'quality', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], detected),
      toggle('Painterly look', 'painterly'),
      seg('Camera distance', 'cameraDistance', [['near', 'Near'], ['normal', 'Normal'], ['far', 'Far']]),
      seg('Minimap', 'minimapRotate', [[true, 'Turns with you'], [false, 'North up']]),
      toggle('Large text', 'largeText'),
      toggle('Reduce motion and flashing', 'reducedMotion')),
    section('Controls',
      seg('On-screen touch controls', 'touchControls', [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']]),
      keyTable(settings, input, onChange)),
    section('Help',
      ...extra),
  );
}

function keyTable(settings, input, onChange) {
  const table = el('table', { class: 'keys' });
  const render = () => {
    table.textContent = '';
    for (const [action, label] of ACTIONS) {
      const keys = settings.bindings[action] || [];
      const btn = el('button', { type: 'button', class: 'text-btn', 'aria-label': `Change key for ${label}` }, 'Change');
      btn.addEventListener('click', () => {
        btn.textContent = 'Press a key…';
        btn.classList.add('listening');
        input.captureKey((code) => {
          if (code) {
            // A key can only do one thing: take it away from any other action first.
            for (const a of Object.keys(settings.bindings)) {
              settings.bindings[a] = settings.bindings[a].filter((c) => c !== code);
            }
            settings.bindings[action] = [code, ...(settings.bindings[action] || []).slice(0, 1)];
            onChange(settings, 'bindings');
          }
          render();
          table.querySelectorAll('button')[ACTIONS.findIndex(([a]) => a === action)]?.focus();
        });
      });
      const caps = el('td', {}, ...keys.map((k) => el('span', { class: 'keycap' }, keyLabel(k))), ' ', btn);
      table.append(el('tr', {}, el('td', {}, label), caps));
    }
    const reset = el('button', { type: 'button', class: 'text-btn' }, 'Reset keys to default');
    reset.addEventListener('click', () => {
      settings.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
      onChange(settings, 'bindings');
      render();
    });
    table.append(el('tr', {}, el('td', { colspan: '2' }, reset)));
  };
  render();
  return table;
}

export function buildHelpKeys(table, bindings) {
  table.textContent = '';
  for (const [action, label] of ACTIONS) {
    const keys = (bindings[action] || []).map(keyLabel).join(' / ');
    table.append(el('tr', {}, el('td', {}, keys), el('td', {}, label)));
  }
}
