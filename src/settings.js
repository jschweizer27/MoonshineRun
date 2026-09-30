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
  minimapRotate: true,
  touchControls: 'auto',    // auto | on | off
  hints: true,
  bindings: DEFAULT_BINDINGS,
};

export function loadSettings() {
  const s = loadJSON(KEY, DEFAULT_SETTINGS);
  s.bindings = { ...DEFAULT_BINDINGS, ...(s.bindings || {}) };
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
