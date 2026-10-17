import { loadJSON, saveJSON } from './save.js';

// Player preferences, remembered between visits.
const KEY = 'shine.settings.v1';

export const ACTIONS = [
  ['throttle', 'Throttle'],
  ['brake', 'Brake / reverse'],
  ['left', 'Steer left'],
  ['right', 'Steer right'],
  ['handbrake', 'Handbrake'],
  ['horn', 'Horn'],
  ['radio', 'Radio on/off'],
  ['lookBack', 'Look back'],
  ['map', 'Map'],
  ['pause', 'Pause'],
  ['mute', 'Mute'],
  ['fullscreen', 'Fullscreen'],
  ['juice', 'Effects on/off (compare)'],
  ['trunk', 'Open the trunk'],
  ['lights', 'Headlamps on/off'],
  ['notebook', 'Otto’s notebook'],
  ['ability2', 'Lead Foot'],
  ['ability3', 'Sweet Talk'],
  ['ability4', 'Smoke Screen'],
  ['ability5', 'Second Wind'],
];

export const DEFAULT_BINDINGS = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
  horn: ['KeyH'],
  radio: ['KeyR'],
  lookBack: ['KeyC'],
  map: ['Tab', 'KeyN'],
  pause: ['Escape', 'KeyP'],
  mute: ['KeyM'],
  fullscreen: ['KeyF'],
  juice: ['KeyJ'],
  trunk: ['KeyT'],
  lights: ['KeyL'],
  notebook: ['KeyB'],
  ability2: ['Digit2'],
  ability3: ['Digit3'],
  ability4: ['Digit4'],
  ability5: ['Digit5'],
};

const prefersReducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

export const DEFAULT_SETTINGS = {
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.9,
  muted: false,
  quality: 'auto',          // auto | low | medium | high
  detectedQuality: null,    // what "auto" picked last time
  cameraDistance: 'normal', // near | normal | far
  reducedMotion: null,      // null = follow the operating system setting
  largeText: false,
  painterly: true,          // the painterly post pass (Medium and High graphics)
  minimapRotate: true,
  touchControls: 'auto',    // auto | on | off
  bindings: DEFAULT_BINDINGS,
};

export function loadSettings() {
  const s = loadJSON(KEY, DEFAULT_SETTINGS);
  // Saved keys win; an action that's gone is dropped; a new action's default key is left off
  // when the player already gave that key to something else (no key fires two actions).
  const saved = Object.fromEntries(Object.entries(s.bindings || {}).filter(([a, keys]) => DEFAULT_BINDINGS[a] && Array.isArray(keys)));
  const taken = new Set(Object.values(saved).flat());
  s.bindings = Object.fromEntries(Object.keys(DEFAULT_BINDINGS).map((a) => [a, saved[a] ?? DEFAULT_BINDINGS[a].filter((k) => !taken.has(k))]));
  if (s.reducedMotion === null) s.reducedMotion = prefersReducedMotion();
  return s;
}

export function saveSettings(s) { saveJSON(KEY, s); }

// Friendly names for keyboard codes.
export function keyLabel(code) {
  if (!code) return '—';
  const named = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space', Escape: 'Esc',
    Enter: 'Enter', Tab: 'Tab', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl',
    ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt', Backspace: 'Backspace',
  };
  if (named[code]) return named[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}
