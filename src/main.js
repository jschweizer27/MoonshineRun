import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createRng } from './rng.js';
import { World } from './world.js';
import { Vehicle } from './vehicle.js';
import { Police } from './police.js';
import { Mission } from './mission.js';
import { Waypoint } from './waypoint.js';
import { ChaseCamera } from './camera.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { MiniMap } from './minimap.js';
import { Tutorial } from './tutorial.js';
import { UI, buildSettings, buildHelpKeys } from './ui.js';
import { loadSettings, saveSettings } from './settings.js';
import { loadRecords, recordRun } from './save.js';
import { installDebug } from './debug.js';

const STATE = { INTRO: 'intro', PLAYING: 'playing', PAUSED: 'paused', GAMEOVER: 'gameover' };
const $ = (id) => document.getElementById(id);

// URL options: ?debug (dev overlay + test API), ?test (test API, deterministic, no tips),
// ?seed=123 (city layout and mission randomness), ?sw (offline mode on localhost).
const params = new URLSearchParams(location.search);
export const OPTIONS = {
  debug: params.has('debug'),
  test: params.has('test'),
  seed: params.has('seed') ? Number(params.get('seed')) >>> 0 : null,
  sw: params.has('sw'),
  hints: !params.has('test') || params.has('hints'),   // tips are off in tests unless asked for
};
// Replaced with the commit id by the production build.
const BUILD_ID = typeof __SHINE_BUILD__ !== 'undefined' ? __SHINE_BUILD__ : 'dev'; // eslint-disable-line no-undef

class Game {
  constructor() {
    this.buildId = BUILD_ID;
    this.settings = loadSettings();
    this.canvas = $('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, window.innerWidth / window.innerHeight, 0.1, 1200);

    // The city is built once; restarting only resets state (no rebuild, no leaks).
    this.world = new World(this.scene, { seed: OPTIONS.seed ?? CONFIG.seed });
    this.player = new Vehicle(this.scene, this.world.collision, { style: 'player' });
    this._addHeadlight();
    this.police = new Police(this.scene, this.world);
    // Missions are random each visit, but fixed under ?seed / ?test so tests are repeatable.
    const missionSeed = OPTIONS.seed ?? (OPTIONS.test ? 7 : (Date.now() ^ 0x5eed) >>> 0);
    this.rng = createRng(missionSeed);
    this.mission = new Mission(this.scene, this.world, this.rng);
    this.waypoint = new Waypoint(this.scene);
    this.chase = new ChaseCamera(this.camera, this.world.collision);

    this.hud = new HUD();
    this.input = new Input(this.settings.bindings);
    this.ui = new UI(this.input);
    this.audio = new Audio();
    this.minimap = new MiniMap(this.world, $('minimap'), $('map-canvas'));
    this.tutorial = new Tutorial(this.hud, this.input);
    this.input.onAction = (a, dev) => this._onAction(a, dev);
    this.input.onDevice = () => { this._applyTouch(); this._updateStartHint(); };

    this.state = STATE.INTRO;
    this.time = 0;
    this.clock = new THREE.Clock();
    this._probe = { frames: 0, total: 0, done: this.settings.quality !== 'auto' || OPTIONS.test };

    this.resetRun();
    this.applySettings();
    // Compile every shader now so nothing hitches when cops or markers first appear.
    this.renderer.compile(this.scene, this.camera);
    this.world.setAnisotropy(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));

    this._bindUI();
    window.addEventListener('resize', () => this._onResize());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });
    window.addEventListener('blur', () => { if (!OPTIONS.test) this.pause(); });
    document.addEventListener('fullscreenchange', () => this._onResize());
    this.renderer.setAnimationLoop(() => this._loop());
  }

  _addHeadlight() {
    // The only moving real light; it always exists so the light count never changes.
    const lamp = new THREE.SpotLight(0xfff0cc, 90, 75, Math.PI / 5.5, 0.55, 1.2);
    lamp.position.set(0, 1.6, -2.6);
    const target = new THREE.Object3D();
    target.position.set(0, 0, -22);
    this.player.mesh.add(lamp, target);
    lamp.target = target;
  }

  // ---------- Settings ----------
  applySettings() {
    const s = this.settings;
    this.audio.setVolumes({ master: s.masterVolume, music: s.musicVolume, sfx: s.sfxVolume, muted: s.muted });
    this.hud.setMuted(s.muted);
    this.chase.distanceScale = { near: 0.78, normal: 1, far: 1.3 }[s.cameraDistance] || 1;
    document.documentElement.classList.toggle('large-text', !!s.largeText);
    document.documentElement.classList.toggle('reduced-motion', !!s.reducedMotion);
    this.minimap.rotate = !!s.minimapRotate;
    this.input.setBindings(s.bindings);
    this.tutorial.setEnabled(s.hints && OPTIONS.hints);
    buildHelpKeys($('help-keys'), s.bindings);
    this._applyTouch();
    this._applyQuality();
    this._updateStartHint();
  }

  _onSettingsChanged(s, key) {
    saveSettings(s);
    if (key === 'quality' && s.quality === 'auto') this._probe = { frames: 0, total: 0, done: false };
    this.applySettings();
  }

  _applyQuality() {
    const q = this.settings.quality === 'auto' ? (this.settings.detectedQuality || 'high') : this.settings.quality;
    const dpr = window.devicePixelRatio || 1;
    const ratio = OPTIONS.test ? 1 : { low: Math.min(dpr, 0.75), medium: Math.min(dpr, 1), high: Math.min(dpr, 2) }[q] || 1;
    this.quality = q;
    if (this.renderer.getPixelRatio() !== ratio) {
      this.renderer.setPixelRatio(ratio);
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    this.world.setDetail(q);
  }

  // "Auto" graphics: time the title screen and pick a level that keeps it smooth.
  _probeQuality(dt) {
    const p = this._probe;
    if (p.done) return;
    p.frames++;
    if (p.frames > 20) p.total += dt;
    if (p.frames < 100) return;
    const ms = (p.total / (p.frames - 20)) * 1000;
    p.done = true;
    const pick = ms > 40 ? 'low' : ms > 24 ? 'medium' : 'high';
    if (pick !== this.settings.detectedQuality) {
      this.settings.detectedQuality = pick;
      saveSettings(this.settings);
      this._applyQuality();
    }
  }

  _applyTouch() {
    const mode = this.settings.touchControls;
    let coarse = false;
    try { coarse = window.matchMedia('(pointer: coarse)').matches; } catch { /* old browser */ }
    const want = mode === 'on' || (mode === 'auto' && (this.input.lastDevice === 'touch' || (coarse && this.input.lastDevice !== 'gamepad')));
    this.input.touch.setVisible(want && this.state === STATE.PLAYING);
  }

  _updateStartHint() {
    const d = this.input.lastDevice;
    $('controls-hint').textContent = d === 'gamepad' ? 'Press A to start · Start for the menu in-game'
      : d === 'touch' ? '' : 'Press Enter to start · Esc for the menu in-game';
  }

  // ---------- Screens ----------
  _bindUI() {
    const on = (id, fn) => $(id).addEventListener('click', fn);
    on('start-btn', () => this.startRun());
    on('restart-btn', () => this.restart());
    on('intro-help', () => this.ui.open('help'));
    on('intro-settings', () => this.openSettings());
    on('pause-resume', () => this.resume());
    on('pause-map', () => this.openMap());
    on('pause-settings', () => this.openSettings());
    on('pause-help', () => this.ui.open('help'));
    on('pause-restart', async () => { if (await this.ui.confirm('RESTART?', 'Start this run over from scratch?', 'RESTART')) this.restart(); });
    on('pause-quit', async () => { if (await this.ui.confirm('QUIT?', 'Quit to the title screen? This run will end.', 'QUIT')) this.quitToTitle(); });
    on('gameover-quit', () => this.quitToTitle());
    on('settings-done', () => this.ui.back());
    on('help-done', () => this.ui.back());
    on('map-done', () => this.ui.back());
    on('btn-pause', () => this.pause());
    on('btn-map', () => this.openMap());
    on('btn-mute', () => this.toggleMute());
    on('btn-fullscreen', () => this.toggleFullscreen());
    if (!document.fullscreenEnabled) $('btn-fullscreen').classList.add('hidden');
  }

  showTitle() {
    this.ui.open('intro', { onBack: () => {} });
    const best = loadRecords().bestHaul;
    $('intro-best').textContent = best > 0 ? `Best haul so far: $${best.toLocaleString()}` : '';
  }

  openSettings() {
    const extra = [];
    const replay = document.createElement('button');
    replay.type = 'button';
    replay.className = 'text-btn';
    replay.textContent = 'Show all tips again';
    replay.addEventListener('click', () => { this.tutorial.reset(); replay.textContent = 'Tips reset ✓'; });
    extra.push(replay);
    buildSettings($('settings-body'), this.settings, { onChange: (s, k) => this._onSettingsChanged(s, k), input: this.input, extra });
    this.ui.open('settings');
  }

  openMap() {
    if (this.state === STATE.PLAYING) this.pause({ showMenu: false });
    if (this.state !== STATE.PAUSED) return;
    this.ui.open('map', {
      onBack: () => { this.ui.close('map'); if (!this.ui.anyOpen) this.resume(); },
    });
    this._drawBigMap();
  }

  _drawBigMap() {
    this.minimap.updateRoute(1, this.player.position, this.mission.target);
    this.minimap.drawBig(this.player, this._mapMarkers(), this._mapPolice(), this.time);
  }

  // ---------- Run flow ----------
  resetRun() {
    this.player.place(0, 0, 0);
    this.police.reset();
    this.mission.reset(this.player.position);
    this.chase.snap(this.player);
    this.hud.setCash(0);
    this.hud.setCargo(false);
    this.hud.setHeat(0, '', 0, '');
    this.hud.setBust(0);
    this.prevTier = 0;
    this.bustMeter = 0;
    this.runTime = 0;
    this._lastRam = -1;
    this.tutorial?.clearActive();
  }

  _enterPlaying() {
    this.ui.closeAll();
    this.hud.show();
    this.state = STATE.PLAYING;
    this.input.playing = true;
    this.audio.start();
    this.audio.setPaused(false);
    this.audio.setActive(true);
    this._applyTouch();
    this.clock.getDelta();
  }

  startRun() { this._enterPlaying(); }

  restart() {
    this.resetRun();
    this._enterPlaying();
  }

  pause({ showMenu = true } = {}) {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.PAUSED;
    this.input.playing = false;
    this.input.down.clear();
    this.audio.setPaused(true);
    this._applyTouch();
    if (showMenu) this.ui.open('pause', { onBack: () => this.resume() });
  }

  resume() {
    if (this.state !== STATE.PAUSED) return;
    this._enterPlaying();
  }

  quitToTitle() {
    this.ui.closeAll();
    this.resetRun();
    this.state = STATE.INTRO;
    this.input.playing = false;
    this.hud.hide();
    this.audio.setPaused(false);
    this.audio.setActive(false);
    this._applyTouch();
    this.chase.snap(this.player);
    this.showTitle();
  }

  bust() {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.GAMEOVER;
    this.input.playing = false;
    this.audio.setActive(false);
    this.hud.hide();
    this.hud.hideHint();
    this._applyTouch();
    const { cash, runs, carrying } = this.mission;
    const { records, isBest } = recordRun(cash, runs);
    this.hud.fillGameOver({
      cash, runs, best: records.bestHaul, isBest: isBest && cash > 0,
      msg: carrying ? 'They pinned you down with the shine still aboard.' : 'They pinned you down and hauled you in.',
    });
    this.ui.open('gameover', { onBack: () => {} });
  }

  toggleMute() {
    this.settings.muted = !this.settings.muted;
    saveSettings(this.settings);
    this.applySettings();
    this.hud.toast(this.settings.muted ? 'Sound off' : 'Sound on', '', 1200);
  }

  toggleFullscreen() {
    if (!document.fullscreenEnabled) return;
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    document.documentElement.requestFullscreen({ navigationUI: 'hide' })
      .then(() => screen.orientation?.lock?.('landscape').catch(() => {}))
      .catch(() => {});
  }

  _onAction(a, dev) {
    if (this.ui.anyOpen) {
      if (['up', 'down', 'left', 'right'].includes(a)) this.ui.nav(a);
      else if (a === 'confirm') this.ui.activate();
      else if (a === 'back') this.ui.back();
      else if (a === 'pause') { if (this.ui.top.id === 'pause' || dev === 'gamepad') this.ui.back(); }
      else if (a === 'map' && this.ui.top.id === 'map') this.ui.back();
      else if (a === 'mute') this.toggleMute();
      else if (a === 'fullscreen') this.toggleFullscreen();
      return;
    }
    if (this.state !== STATE.PLAYING) return;
    if (a === 'pause') this.pause();
    else if (a === 'map') this.openMap();
    else if (a === 'horn') this.audio.horn();
    else if (a === 'mute') this.toggleMute();
    else if (a === 'fullscreen') this.toggleFullscreen();
  }

  // ---------- Simulation ----------
  // One simulation step (also used by tests to fast-forward deterministically).
  step(dt, input) {
    this.time += dt;
    this.runTime += dt;
    this.player.update(dt, input);
    const status = this.police.update(dt, this.player, this.camera, this.time);
    const events = this.mission.update(dt, this.player.position, status, this.time);
    this._onEvents(events);

    const tier = this.mission.tier;
    if (tier !== this.prevTier) {
      this.police.setTarget(tier, this.player, this.camera);
      this.prevTier = tier;
    }

    // Bust meter: pinned = a pursuer right on you while you're nearly stopped.
    const P = CONFIG.police;
    const pinned = status.nearest < P.pinRadius && Math.abs(this.player.speed) < P.pinSpeed;
    this.bustMeter = Math.max(0, Math.min(1, this.bustMeter + (pinned ? dt / P.bustTime : -dt * P.bustRecover)));
    this.hud.setBust(this.bustMeter);

    // Collisions: a thud and a red flash when rammed.
    if (status.touching > 4 && this.time - this._lastRam > 0.4) {
      this._lastRam = this.time;
      this.hud.flash();
      this.audio.crash(Math.min(1, status.touching / 15));
    } else if (this.player.impact > 6 && this.time - this._lastRam > 0.3) {
      this._lastRam = this.time;
      this.audio.crash(Math.min(0.6, this.player.impact / 25));
    }

    this.chase.update(dt, this.player, !!input.lookBack);
    this.waypoint.update(this.player, this.mission.target, this.time);
    this._updateHud(status);
    this.audio.update(Math.min(1, Math.abs(this.player.speed) / this.player.t.maxSpeed),
      this.police.pursuing ? Math.max(0.25, 1 - status.nearest / 160) : 0);

    const m = this.mission;
    this.tutorial.update(dt, {
      time: this.runTime, speed: Math.abs(this.player.speed), carrying: m.carrying, tier,
      bust: this.bustMeter, deliveries: m.runs,
      distToTarget: Math.hypot(m.target.x - this.player.position.x, m.target.z - this.player.position.z),
    });

    if (this.bustMeter >= 1) this.bust();
  }

  _onEvents(events) {
    for (const e of events) {
      if (e.type === 'pickup') { this.hud.setCargo(true); this.hud.toast('Shine loaded — get it to the drop', 'amber'); }
      if (e.type === 'deliver') {
        this.hud.setCargo(false);
        this.hud.setCash(this.mission.cash, true);
        this.hud.cashPop(`+$${e.amount.toLocaleString()}`);
        this.hud.toast('Shine delivered', 'gold');
      }
      if (e.type === 'spotted') this.hud.toast('Tipped off! The law is on its way', 'red');
      if (e.type === 'lostTier') this.hud.toast('Shook one off — keep out of sight', 'blue');
      if (e.type === 'clear') this.hud.toast('You lost them', 'blue');
    }
  }

  _updateHud(status) {
    const m = this.mission;
    const tier = m.tier;
    let label = '', mode = '', meter = 0;
    if (tier > 0) {
      if (!status.contact && m.carrying) label = 'incoming';
      else if (status.seen) label = status.nearest < 30 ? 'closing' : 'seen';
      else label = 'evading';
      if (status.seen && m.carrying && tier < CONFIG.heat.max) { mode = 'building'; meter = m.heat - tier; }
      else if (label === 'evading') { mode = 'evading'; meter = m.evade; }
    } else if (m.carrying && m.suspicion > 0) {
      mode = 'building';
      meter = m.suspicion;
    }
    this.hud.setHeat(tier, label, meter, mode);
    const dx = m.target.x - this.player.position.x, dz = m.target.z - this.player.position.z;
    const bearing = Math.atan2(dx, -dz) - this.chase.heading;
    this.hud.setObjective(m.objective, Math.round(Math.hypot(dx, dz) / 10) * 10, m.targetKind, Math.atan2(Math.sin(bearing), Math.cos(bearing)));
    this.hud.setSpeed(this.player.speedMph);
  }

  _mapMarkers() {
    const out = [];
    const m = this.mission;
    if (m.pickup.visible) out.push({ kind: 'still', x: m.pickup.position.x, z: m.pickup.position.z });
    if (m.drop.visible) out.push({ kind: 'drop', x: m.drop.position.x, z: m.drop.position.z });
    return out;
  }

  _mapPolice() {
    return this.police.active.filter((u) => u.mode !== 'leave').map((u) => ({ kind: u.kind, x: u.car.position.x, z: u.car.position.z }));
  }

  _loop() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.input.poll();
    if (this.state === STATE.PLAYING) {
      this.step(dt, this.input.read());
      this.minimap.updateRoute(dt, this.player.position, this.mission.target);
      this.minimap.draw(this.player, this._mapMarkers(), this._mapPolice(), this.time);
      this.renderer.render(this.scene, this.camera);
    } else if (this.state === STATE.INTRO) {
      this._probeQuality(dt);
      this.renderer.render(this.scene, this.camera);
    } else if (this.ui.isOpen('map')) {
      this.time += dt;
      this._drawBigMap();
    }
    // Paused / busted: the last frame stays on screen; nothing to redraw.
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.render(this.scene, this.camera);
  }
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

// Offline play + "Add to Home Screen" on the published site.
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || OPTIONS.test) return;
  if (location.protocol !== 'https:' && !OPTIONS.sw) return;
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

async function boot() {
  // Let the loading screen paint before the city is generated.
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  if (!webglAvailable()) {
    window.__shineFail('Your browser can’t show 3D graphics (WebGL is off or unsupported).',
      'Try the latest Chrome, Edge, Firefox or Safari, and make sure hardware acceleration is turned on in your browser settings.');
    return;
  }
  const game = new Game();
  window.__shineReady = true;
  $('loading').classList.add('hidden');
  game.showTitle();
  if (OPTIONS.debug || OPTIONS.test) installDebug(game, { overlay: OPTIONS.debug });
  registerServiceWorker();
}

boot().catch((e) => window.__shineFail('The game failed to start.', e && e.message ? e.message : String(e)));
