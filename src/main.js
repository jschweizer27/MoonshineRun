import * as THREE from 'three';
import { CONFIG, MS_TO_MPH } from './config.js';
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
import { UI, buildSettings, buildHelpKeys, el } from './ui.js';
import { loadSettings, saveSettings } from './settings.js';
import { Career } from './career.js';
import { Environment } from './environment.js';
import { BEATS, nextBeat } from './story.js';
import { showOrders, showGarage, showLedger, playDialog, money } from './screens.js';
import { Fire } from './effects.js';
import { Particles } from './particles.js';
import { JUICE, juice, VehicleFeel, Debris } from './juice.js';
import { Props } from './props.js';
import { distToSegment } from './county.js';
import { installDebug } from './debug.js';
import { PostFX } from './post.js';
import { MATERIALS, WHEELS } from './models.js';
import { MODELS, loadModels } from './assets.js';

// What the police report when there are none (the dredge run).
const IDLE_STATUS = { nearest: Infinity, touching: 0, seen: false, contact: false };
const STATE = { INTRO: 'intro', PLAYING: 'playing', PAUSED: 'paused', GAMEOVER: 'gameover' };
const $ = (id) => document.getElementById(id);

// URL options: ?debug (dev overlay + test API), ?test (test API, deterministic, no tips or
// story), ?seed=123 (city layout), ?sw (offline mode on localhost), ?story / ?hints / ?time
// (turn those back on under ?test), ?mode=dredge (the free-roam loot-and-sell loop).
const params = new URLSearchParams(location.search);
export const OPTIONS = {
  debug: params.has('debug'),
  test: params.has('test'),
  seed: params.has('seed') ? Number(params.get('seed')) >>> 0 : null,
  sw: params.has('sw'),
  hints: !params.has('test') || params.has('hints'),
  story: !params.has('test') || params.has('story'),
  time: !params.has('test') || params.has('time'),
  models: params.get('models') !== '0',   // ?models=0: the built-in procedural models only
  mode: params.get('mode') === 'dredge' ? 'dredge' : 'bootleg',
};
// Replaced with the commit id by the production build.
const BUILD_ID = typeof __SHINE_BUILD__ !== 'undefined' ? __SHINE_BUILD__ : 'dev'; // eslint-disable-line no-undef
const HIDEOUT_SPAWN = { heading: Math.PI / 2 };   // facing east, back toward York Road
const WAREHOUSE_SPAWN = { x: 176, z: 44, heading: -Math.PI / 2 };

// How long each startup phase took (shown in the ?debug overlay; used to diagnose slow
// devices and CI).
export const BOOT = { t0: performance.now(), phases: {} };
window.__shineBoot = BOOT.phases;
const mark = (name) => { BOOT.phases[name] = Math.round(performance.now() - BOOT.t0); };

class Game {
  constructor() {
    this.buildId = BUILD_ID;
    this.mode = OPTIONS.mode;
    this.settings = loadSettings();
    this.career = new Career();
    this.canvas = $('game');
    mark('start');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    mark('webgl');
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = CONFIG.look.exposure;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, window.innerWidth / window.innerHeight, 0.1, 1400);

    // The world is built once; restarting only resets state (no rebuild, no leaks).
    this.citySeed = OPTIONS.seed ?? this.settings.citySeed ?? CONFIG.seed;
    this.world = new World(this.scene, { seed: this.citySeed });
    this.post = new PostFX(this.renderer, this.scene, this.camera);
    this.world.buildReflections(this.renderer);
    // Glossy paint and chrome catch the street (the shared vehicle material, and any model's own).
    MATERIALS.body.envMap = this.world.reflections;
    for (const { material: m } of Object.values(MODELS)) if (m) { m.envMap = this.world.reflections; m.envMapIntensity = CONFIG.look.modelReflections; }
    mark('world');
    this.env = new Environment(this.world, { frozen: !OPTIONS.time });
    this.player = new Vehicle(this.scene, this.world.collision, { style: 'player' });
    this.player.addRide('rolls', 'rolls');   // the garage's Rolls-Royce, built up front
    // Dredge run: the same truck without the horse box (shares the truck's model).
    this.player.rides.runner = { model: this.player.rides.truck.model, trailer: null };
    this._addHeadlight();
    this.police = new Police(this.scene, this.world);
    WHEELS.attach(this.scene);    // every vehicle exists now: one instanced mesh per wheel shape
    this.world.enableShadows();   // the vehicles too
    // Crates, barrels and signs that cars knock flying, and debris from heavy crashes (juice).
    this.props = new Props(this.scene, this.world, this.citySeed);
    this.debris = new Debris(this.scene);
    this.hitStop = 0;
    this.slowMo = 0;
    this._nearMiss = new Float32Array(16).fill(-1e9);   // per pursuer: when it last earned slow-mo
    // Missions are random each visit, but fixed under ?seed / ?test so tests are repeatable.
    const missionSeed = OPTIONS.seed ?? (OPTIONS.test ? 7 : (Date.now() ^ 0x5eed) >>> 0);
    this.rng = createRng(missionSeed);
    this.mission = new Mission(this.scene, this.world, this.rng, this.career);
    this.waypoint = new Waypoint(this.scene);
    this.chase = new ChaseCamera(this.camera, this.world.collision);
    this.fire = new Fire(this.scene, this.world.fxLight);
    this.particles = new Particles(this.scene);
    this.feel = new VehicleFeel(this.scene, this.player, this.particles, this.headlight);
    this._cars = [this.player, ...this.police.units.map((u) => u.car)];   // what knocks props over
    this.warehouse = this.world.buildings
      .filter((b) => !b.barn && b.minX > 150 && b.maxX < 226 && b.minZ > 50 && b.maxZ < 90)
      .sort((a, b) => b.h - a.h)[0] || this.world.buildings[0];

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

    this.resetRun('loop');
    this.applySettings();
    mark('setup');
    // Compile every shader now so nothing hitches when cops, roadblocks or fire appear.
    // With post-processing the scene draws into an offscreen buffer, which needs different
    // shader variants than drawing to the screen: compile those.
    if (this.post.enabled) this.renderer.setRenderTarget(this.post.composer.renderTarget1);
    this.renderer.compile(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    mark('compile');
    this._warmUp();
    mark('shaders');
    this.world.setAnisotropy(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));

    this._bindUI();
    window.addEventListener('resize', () => this._onResize());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });
    window.addEventListener('blur', () => { if (!OPTIONS.test) this.pause(); });
    document.addEventListener('fullscreenchange', () => this._onResize());
    // Music on the title screen once the browser allows sound (after any click or key).
    const wake = () => { this.audio.start(); if (this.state !== STATE.PLAYING) this.audio.setActive(false); };
    window.addEventListener('pointerdown', wake, { once: true });
    window.addEventListener('keydown', wake, { once: true });
    this._onResize({ render: false });   // the first frame is drawn by the loop, not during loading
    this.renderer.setAnimationLoop(() => this._loop());
  }

  // Draw everything once at boot, hidden and off-screen things included (pooled police
  // cars, roadblocks, the spare car, debris), so their buffers are on the GPU before they
  // first appear mid-chase. Lights stay as they are: the light count must not change.
  _warmUp() {
    const shown = [], unculled = [];
    const reveal = (o) => {
      if (o.isLight) return;
      if (!o.visible) { shown.push(o); o.visible = true; }
      if (o.frustumCulled) { unculled.push(o); o.frustumCulled = false; }   // wherever it's parked
      for (const c of o.children) reveal(c);
    };
    this.scene.traverse((o) => { if (!o.visible && !o.isLight && !shown.includes(o)) reveal(o); });
    // One pass into the same kind of target the game draws to, clipped to a single pixel:
    // everything is processed and uploaded, almost nothing filled. The shadow pass runs too,
    // so every caster's depth shader is built now rather than when it first casts a shadow.
    const r = this.renderer, target = this.post.enabled ? this.post.composer.renderTarget1 : null;
    r.shadowMap.needsUpdate = true;
    WHEELS.update();
    if (target) { target.scissorTest = true; target.scissor.set(0, 0, 1, 1); } else { r.setScissorTest(true); r.setScissor(0, 0, 1, 1); }
    r.setRenderTarget(target);
    r.render(this.scene, this.camera);
    r.setRenderTarget(null);
    if (target) target.scissorTest = false; else r.setScissorTest(false);
    for (const o of shown) o.visible = false;
    for (const o of unculled) o.frustumCulled = true;
  }

  _addHeadlight() {
    // The only moving real light; it always exists so the light count never changes. It
    // rides on the sprung body, so the beam dips when the nose dives under braking.
    const lamp = new THREE.SpotLight(0xfff0cc, 90, 75, Math.PI / 5.5, 0.55, 1.2);
    lamp.target = new THREE.Object3D();
    this.headlight = lamp;
    this._mountHeadlight();
  }

  // The headlight moves to whichever car Otto is driving (moved, never re-added: the light
  // count stays fixed).
  _mountHeadlight() {
    const lamp = this.headlight, [z, y] = this.player.model.lamp;
    lamp.position.set(0, y, z - 0.4);
    lamp.target.position.set(0, 0, -22);
    this.player.model.body.add(lamp, lamp.target);
  }

  // J: all the game-feel effects on or off, to compare.
  toggleJuice() {
    JUICE.enabled = !JUICE.enabled;
    this.hud.toast(JUICE.enabled ? 'Juice ON' : 'Juice OFF — press J to turn it back on', '', 1600);
  }

  // ---------- Settings ----------
  applySettings() {
    const s = this.settings;
    this.audio.setVolumes({ master: s.masterVolume, music: s.musicVolume, sfx: s.sfxVolume, muted: s.muted });
    this.hud.setMuted(s.muted);
    this.chase.distanceScale = { near: 0.78, normal: 1, far: 1.3 }[s.cameraDistance] || 1;
    this.chase.reducedMotion = !!s.reducedMotion;
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
    this.world.setShadows({ low: 0, medium: 1024, high: 2048 }[q] ?? 2048);
    this.world.setLampDetail(q);
    this.post.setQuality(q);
    this.env.rainDetail = { low: 0, medium: 0.5, high: 1 }[q] ?? 1;
    this.particles.detail = { low: 0, medium: 0.5, high: 1 }[q] ?? 1;
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

  // Upgrades from the garage change how the truck drives and how hard it is to pin.
  _applyPerks() {
    if (this.mode === 'dredge') return this._applyDredgePerks();
    const p = this.career.perks, base = CONFIG.player;
    // The truck (with the horse box) or the Rolls-Royce.
    if (this.player.ride !== p.ride) {
      this.player.setRide(p.ride);
      this._mountHeadlight();
      this.feel?.reset();
    }
    this.carSuspicion = p.suspicion;
    this.chase.rideScale = p.trailer ? 1 : CONFIG.camera.noTrailer;
    Object.assign(this.player.t, { maxSpeed: base.maxSpeed * p.speed, accel: base.accel * p.accel, turnRate: base.turnRate * p.turn });
    this.gripBase = base.grip * p.grip;
    this.bustTime = CONFIG.police.bustTime + p.bustTime;
    this.ramResist = p.ramResist;
  }

  // Dredge run: the truck without its horse box, on arcade tuning (upgrades come later).
  _applyDredgePerks() {
    const car = CONFIG.dredge.car;
    if (this.player.ride !== 'runner') {
      this.player.setRide('runner');
      this._mountHeadlight();
      this.feel?.reset();
    }
    this.carSuspicion = 1;
    this.chase.rideScale = CONFIG.camera.noTrailer;
    Object.assign(this.player.t, car);
    this.gripBase = car.grip;
    this.bustTime = CONFIG.police.bustTime;
    this.ramResist = 0;
  }

  // ---------- Screens ----------
  _bindUI() {
    const on = (id, fn) => $(id).addEventListener('click', fn);
    on('start-btn', () => this.newGame());
    on('continue-btn', () => this.continueGame());
    on('restart-btn', () => this.restart());
    on('intro-help', () => this.ui.open('help'));
    on('intro-settings', () => this.openSettings());
    on('pause-resume', () => this.resume());
    on('pause-map', () => this.openMap());
    on('pause-garage', () => this.openGarage());
    on('pause-ledger', () => this.openLedger());
    on('pause-settings', () => this.openSettings());
    on('pause-help', () => this.ui.open('help'));
    on('pause-restart', async () => { if (await this.ui.confirm('BACK TO THE HIDEOUT?', 'Abandon this run and restart from the hideout? Any shine aboard is lost.', 'RESTART')) this.restart(); });
    on('pause-quit', async () => { if (await this.ui.confirm('QUIT?', 'Quit to the title screen? Your cash and upgrades are saved.', 'QUIT')) this.quitToTitle(); });
    on('gameover-quit', () => this.quitToTitle());
    on('gameover-garage', () => this.openGarage());
    on('gameover-ledger', () => this.openLedger());
    on('garage-done', () => this.ui.back());
    on('ledger-done', () => this.ui.back());
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
    const started = this.mode === 'bootleg' && this.career.started;
    $('continue-btn').classList.toggle('hidden', !started);
    $('start-btn').textContent = started ? 'NEW GAME' : 'START THE RUN';
    $('start-btn').classList.toggle('secondary', started);
    $('continue-btn').toggleAttribute('data-autofocus', started);
    $('start-btn').toggleAttribute('data-autofocus', !started);
    if (this.mode === 'dredge') $('start-btn').textContent = 'START DRIVING';
    const best = this.career.data.stats.bestStreak;
    $('intro-best').textContent = started
      ? `Cash on hand: ${money(this.career.cash)} · Best streak: ${money(best)}` : '';
    this.ui.open('intro', { onBack: () => {} });
  }

  openSettings() {
    const replay = el('button', { type: 'button', class: 'text-btn' }, 'Show all tips again');
    replay.addEventListener('click', () => { this.tutorial.reset(); replay.textContent = 'Tips reset ✓'; });
    // Seeded city (#49): same layout every visit; share or roll a new one.
    const seedLabel = el('span', {}, `City layout #${this.citySeed}`);
    const roll = el('button', { type: 'button', class: 'text-btn' }, 'New random city');
    roll.addEventListener('click', async () => {
      const seed = Math.floor(Math.random() * 100000);
      if (await this.ui.confirm('NEW CITY?', `Rebuild Baltimore with layout #${seed}? The page reloads; your progress is kept.`, 'REBUILD')) {
        this.settings.citySeed = seed;
        saveSettings(this.settings);
        location.search = '';
      }
    });
    const share = el('button', { type: 'button', class: 'text-btn' }, 'Copy share link');
    share.addEventListener('click', () => {
      const url = `${location.origin}${location.pathname}?seed=${this.citySeed}`;
      navigator.clipboard?.writeText(url).then(() => { share.textContent = 'Link copied ✓'; }, () => { share.textContent = url; });
    });
    const reset = el('button', { type: 'button', class: 'text-btn' }, 'Erase saved progress');
    reset.addEventListener('click', async () => {
      if (await this.ui.confirm('ERASE PROGRESS?', 'Delete your cash, upgrades, story progress and ledger? This can’t be undone.', 'ERASE')) {
        this.career.reset();
        reset.textContent = 'Progress erased ✓';
      }
    });
    const cityRow = el('div', { class: 'set-row' }, seedLabel, el('span', {}, roll, ' ', share));
    buildSettings($('settings-body'), this.settings, {
      onChange: (s, k) => this._onSettingsChanged(s, k), input: this.input,
      extra: [replay, cityRow, reset],
    });
    this.ui.open('settings');
  }

  openMap() {
    if (this.state === STATE.PLAYING) this.pause({ showMenu: false });
    if (this.state !== STATE.PAUSED) return;
    this.ui.open('map', { onBack: () => { this.ui.close('map'); if (!this.ui.anyOpen) this.resume(); } });
    this._drawBigMap();
  }

  openGarage() {
    showGarage(this.ui, this.career, {
      onChange: () => { this._applyPerks(); this.hud.setCash(this.career.cash); this.audio.cash?.(); },
      onLedger: () => this.openLedger(),
      bribeUnlocked: () => this.career.seen('sheriff'),
    });
  }

  openLedger() {
    showLedger(this.ui, this.career, { earned: this.mission.streakEarned, runs: this.mission.streakRuns });
  }

  _drawBigMap() {
    if (this.mode === 'bootleg') this.minimap.updateRoute(1, this.player.position, this.mission.target, this.police.blocked);
    this.minimap.drawBig(this.player, this._mapMarkers(), this._mapPolice(), this.time);
  }

  // Pause the world while a story card plays, then carry on.
  async _story(beatId) {
    const wasPlaying = this.state === STATE.PLAYING;
    if (wasPlaying) this.pause({ showMenu: false });
    this.career.markSeen(beatId);
    await playDialog(this.ui, BEATS[beatId].lines, { reducedMotion: !!this.settings.reducedMotion });
    if (BEATS[beatId].unlocks === 'disguise') {
      const where = this.player.trailer ? '' : ' — in the truck, not the Rolls';
      this.hud.toast(`Unlocked: the horse-box disguise (stay under 30 mph when loaded)${where}`, 'gold', 4000);
    }
    if (BEATS[beatId].unlocks === 'bribe') this.hud.toast('Unlocked: bribe the county sheriff at the garage', 'gold', 4000);
    if (wasPlaying && !this.ui.anyOpen) this.resume();
  }

  // ---------- Run flow ----------
  resetRun(mode = 'loop') {
    if (this.mode === 'dredge') return this._resetDredge();
    if (mode === 'escape') {
      this.player.place(WAREHOUSE_SPAWN.x, WAREHOUSE_SPAWN.z, WAREHOUSE_SPAWN.heading);
    } else {
      const h = this.world.hideout;
      this.player.place(h.laneX + 22, h.laneZ, HIDEOUT_SPAWN.heading);
    }
    this.police.reset();
    this.mission.reset(this.player.position, mode);
    this.fire.out();
    this.particles.clear();
    this.props.reset();
    this.debris.clear();
    this.hitStop = 0;
    this.slowMo = 0;
    this.feel.reset();
    this.chase.snap(this.player);
    this._applyPerks();
    this.hud.setCash(this.career.cash);
    this.hud.setCargo(false);
    this.hud.setHeat(0, '', 0, '');
    this.hud.setBust(0);
    this.prevTier = 0;
    this.bustMeter = 0;
    this.runTime = 0;
    this._lastRam = -1;
    this._surfaceTimer = 0;
    this.surface = 1;
    this.bestAtStreakStart = this.career.data.stats.bestStreak;
    this.tutorial?.clearActive();
    if (mode === 'escape') {
      // Act I: the Temperance Alliance torched the warehouse and they're right behind you.
      this.fire.ignite(this.warehouse);
      this.mission.heat = 2;
      this.police.setTarget(2, this.player, this.camera, ['zealot']);
      this.police.contact = true;
      this.prevTier = 2;
      // They're right on your tail, coming out of the smoke behind you.
      const E = CONFIG.mission.escape;
      this.police.active.forEach((u, k) => {
        u.car.place(WAREHOUSE_SPAWN.x + E.gap + k * 14, WAREHOUSE_SPAWN.z + (k ? 3 : -3), WAREHOUSE_SPAWN.heading);
        u.lastKnown.copy(this.player.position);
        u.hold = E.headStart;
      });
    }
  }

  // Dredge run: free roam from York Road. The bootlegging systems stay idle: no mission
  // markers, no police, no heat.
  _resetDredge() {
    const s = CONFIG.dredge.spawn;
    this.player.place(s.x, s.z, s.heading);
    this.police.reset();
    this.mission.reset(this.player.position, 'loop');
    for (const m of [this.mission.pickup, this.mission.drop, this.mission.hideoutMarker, this.mission.goal]) m.visible = false;
    this.waypoint.update(this.player, null, 0);
    this.minimap.route = [];
    this.fire.out();
    this.particles.clear();
    this.props.reset();
    this.debris.clear();
    this.hitStop = 0;
    this.slowMo = 0;
    this.feel.reset();
    this.chase.snap(this.player);
    this._applyPerks();
    this.hud.setMode('dredge');
    this.hud.setCash(this.career.cash);
    this.hud.setCargo(false);
    this.hud.setBust(0);
    this.hud.setStatusPill(null);
    this.hud.setObjective('Free roam', null, 'roam');
    this.prevTier = 0;
    this.bustMeter = 0;
    this.runTime = 0;
    this._lastRam = -1;
    this._surfaceTimer = 0;
    this.surface = 1;
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

  async newGame() {
    if (this.mode === 'dredge') { this.resetRun(); this._enterPlaying(); return; }
    if (this.career.started && !(await this.ui.confirm('NEW GAME?', 'Start over? Your cash, upgrades, story progress and ledger will be erased.', 'START OVER'))) return;
    this.career.reset();
    this.career.data.started = true;
    this.career.save();
    if (OPTIONS.story) {
      this.ui.closeAll();
      this.resetRun('escape');
      this.career.markSeen('prologue');
      await playDialog(this.ui, BEATS.prologue.lines, { reducedMotion: !!this.settings.reducedMotion });
      this._enterPlaying();
      this.hud.toast('Get out up York Road — the zealots are on you!', 'red', 3500);
    } else {
      this.career.markSeen('prologue');
      this.career.markSeen('valley');
      this.resetRun('loop');
      this._enterPlaying();
    }
  }

  continueGame() {
    if (this.mode === 'dredge') { this.newGame(); return; }
    this.resetRun(this.career.seen('valley') || !OPTIONS.story ? 'loop' : 'escape');
    this._enterPlaying();
  }

  startRun() { return this.career.started ? this.continueGame() : this.newGame(); }

  restart() {
    this.resetRun(this.mission.mode === 'escape' ? 'escape' : 'loop');
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
    this.resetRun('loop');
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
    const m = this.mission;
    const escape = m.mode === 'escape';
    let detail = '';
    if (!escape) {
      const o = m.carrying ? m.order : null;
      const value = o ? o.pay : 0;
      const { fine } = this.career.bust({
        jugs: o ? o.jugs : 0, value, seconds: o ? this.time - m.runStart : 0, maxHeat: m.maxHeat,
        route: o ? `${m.still.name} → ${o.drop.name}` : 'Caught on the road',
        streak: m.streakEarned, streakRuns: m.streakRuns,
      });
      detail = o ? `They seized ${o.jugs} jugs (worth ${money(value)}) and fined you ${money(fine)}.` : `They fined you ${money(fine)}.`;
    }
    const s = this.career.data.stats;
    const isBest = !escape && m.streakEarned > 0 && m.streakEarned > this.bestAtStreakStart;
    $('gameover-title').textContent = escape ? 'CAUGHT' : 'BUSTED';
    $('restart-btn').textContent = escape ? 'TRY AGAIN' : 'CONTINUE FROM THE HIDEOUT';
    $('gameover-extra').classList.toggle('hidden', escape);
    this.hud.fillGameOver({
      cash: m.streakEarned, runs: m.streakRuns, best: s.bestStreak, isBest,
      msg: escape ? 'The zealots dragged you from the cab in front of the burning warehouse.'
        : m.carrying ? 'They pinned you down with the shine still aboard.' : 'They pinned you down and hauled you in.',
    });
    $('gameover-detail').textContent = detail;
    this.hud.setCash(this.career.cash);
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
    else if (a === 'juice') this.toggleJuice();
    else if (a === 'radio') this.hud.toast(this.audio.toggleRadio() ? 'Radio on — hot jazz from the Belvedere ballroom' : 'Radio off', '', 1800);
    else if (a === 'mute') this.toggleMute();
    else if (a === 'fullscreen') this.toggleFullscreen();
  }

  // ---------- Simulation ----------
  get disguiseUnlocked() { return this.career.seen('jockey'); }
  get safeZone() { return this.career.data.bribes.county && this.world.inCounty(this.player.position); }

  // Off the dirt roads in the county the truck bogs down in the fields.
  _updateSurface(dt) {
    this._surfaceTimer -= dt;
    if (this._surfaceTimer > 0) return;
    this._surfaceTimer = 0.2;
    const p = this.player.position;
    if (!this.world.inCounty(p) || p.z > -262) { this.surface = 1; return; }
    let on = false;
    for (const [a, b, w] of this.world.countyEdges) if (distToSegment(p.x, p.z, a, b) < w / 2 + 1.5) { on = true; break; }
    this.surface = on ? 1 : 0.7;
  }

  // One simulation step (also used by tests to fast-forward deterministically).
  step(dt, input) {
    if (this.mode === 'dredge') { this._stepDredge(dt, input); return; }
    this.time += dt;
    this.runTime += dt;
    this.career.data.stats.playSeconds += dt;
    const m = this.mission;
    const fx = this.env.effects;
    this._updateSurface(dt);
    this.player.speedFactor = this.surface;
    this.player.t.grip = this.gripBase * fx.grip * (this.surface < 1 ? 0.85 : 1);
    this.player.update(dt, input);
    this._throttle = input.throttle || 0;

    // The horse-box disguise needs the horse box (not the Rolls).
    const disguised = this.disguiseUnlocked && !!this.player.trailer && m.carrying && Math.abs(this.player.speed) < CONFIG.heat.disguiseSpeed;
    const safeZone = this.safeZone;
    this.minimap.updateRoute(dt, this.player.position, m.target, this.police.blocked);
    const status = this.police.update(dt, this.player, this.camera, this.time, {
      carrying: m.carrying, disguised, sight: fx.sight, safeZone, bribed: this.career.data.bribes.county,
      tier: m.tier, route: this.minimap.route, ramResist: this.ramResist,
    });
    const events = m.update(dt, this.player.position, status, this.time, { speed: this.player.speed, disguised, safeZone, suspicion: this.carSuspicion, env: fx, camera: this.camera.position });
    this._onEvents(events, status);

    const tier = m.tier;
    if (tier !== this.prevTier) {
      this.police.setTarget(tier, this.player, this.camera, m.mode === 'escape' ? ['zealot'] : null);
      this.prevTier = tier;
    }

    // Bust meter: pinned = a pursuer right on you while you're nearly stopped.
    const P = CONFIG.police;
    const pinned = status.nearest < P.pinRadius && Math.abs(this.player.speed) < P.pinSpeed;
    this.bustMeter = Math.max(0, Math.min(1, this.bustMeter + (pinned ? dt / this.bustTime : -dt * P.bustRecover)));
    this.hud.setBust(this.bustMeter);

    // Collisions: a thud, sparks, a shake and a red flash when rammed; the hard ones throw
    // debris and hold the action for a beat (hit-stop).
    const p = this.player.position;
    if (status.touching > 4 && this.time - this._lastRam > 0.4) {
      this._lastRam = this.time;
      this.hud.flash();
      this.audio.crash(Math.min(1, status.touching / 15));
      this.chase.shake(Math.min(0.8, status.touching / 18));
      this.feel.hit(status.touching / 15);
      this.particles.sparks(p.x, p.z, status.touching / 15);
      this._impact(status.touching / 15, p.x, p.z);
    } else if (this.player.impact > 6 && this.time - this._lastRam > 0.3) {
      this._lastRam = this.time;
      this.audio.crash(Math.min(0.6, this.player.impact / 25));
      this.chase.shake(Math.min(0.5, this.player.impact / 30));
      this.feel.hit(this.player.impact / 20);
      this.particles.sparks(p.x + this.player.forwardX * 3, p.z + this.player.forwardZ * 3, this.player.impact / 20);
      this._impact(this.player.impact / 20, p.x + this.player.forwardX * 2.5, p.z + this.player.forwardZ * 2.5);
    }
    this.props.update(dt, this._cars);
    this._nearMisses(status);
    this._sirenSweep();
    this.debris.update(dt);

    this.env.update(dt, this.camera.position);
    this.fire.update(this.time);
    if (this.fire.active) {
      const b = this.warehouse;
      this.particles.fire(dt, (b.minX + b.maxX) / 2, b.h + 1, (b.minZ + b.maxZ) / 2, b.maxX - b.minX);
      if (m.mode !== 'escape' && p.distanceTo(this.fire.light.position) > 260) this.fire.out();
    }
    const county = this.world.inCounty(p);
    this.feel.update(dt, {
      brake: Math.max(0, -(input.throttle || 0)), handbrake: !!input.handbrake, wet: this.env.wet,
      ground: county ? (this.surface < 1 ? 'grass' : 'dirt') : 'cobble',
    });
    this.particles.vehicle(dt, this.player, { throttle: input.throttle, dusty: county, exhaust: juice('wheels', 'exhaust'), dust: juice('wheels', 'dust') });
    this.particles.atmosphere(dt, this.world, this.camera.position, { night: 1 - this.env.daylight, wet: this.env.wet });
    this.particles.setLight(0.5 + 0.5 * this.env.daylight);
    this.particles.update(dt);
    this.chase.update(dt, this.player, !!input.lookBack, this.feel.accel01);
    this.waypoint.update(this.player, m.target, this.time);
    this._updateHud(status, disguised, safeZone, dt);
    this._updateAudio(status);

    this.tutorial.update(dt, {
      time: this.runTime, speed: Math.abs(this.player.speed), carrying: m.carrying, tier,
      bust: this.bustMeter, deliveries: this.career.data.stats.deliveries, disguiseUnlocked: this.disguiseUnlocked,
      distToTarget: Math.hypot(m.target.x - this.player.position.x, m.target.z - this.player.position.z),
    });

    if (this.bustMeter >= 1) this.bust();
  }

  // Dredge run: drive, crash, weather and feel; no mission, police, heat or tips.
  _stepDredge(dt, input) {
    this.time += dt;
    this.runTime += dt;
    const fx = this.env.effects;
    this._updateSurface(dt);
    this.player.speedFactor = this.surface;
    this.player.t.grip = this.gripBase * fx.grip * (this.surface < 1 ? 0.85 : 1);
    this.player.update(dt, input);
    this._throttle = input.throttle || 0;
    const p = this.player.position;
    if (this.player.impact > 6 && this.time - this._lastRam > 0.3) {
      this._lastRam = this.time;
      this.audio.crash(Math.min(0.6, this.player.impact / 25));
      this.chase.shake(Math.min(0.5, this.player.impact / 30));
      this.feel.hit(this.player.impact / 20);
      this.particles.sparks(p.x + this.player.forwardX * 3, p.z + this.player.forwardZ * 3, this.player.impact / 20);
      this._impact(this.player.impact / 20, p.x + this.player.forwardX * 2.5, p.z + this.player.forwardZ * 2.5);
    }
    this.props.update(dt, this._cars);
    this.debris.update(dt);
    this.env.update(dt, this.camera.position);
    const county = this.world.inCounty(p);
    this.feel.update(dt, {
      brake: Math.max(0, -(input.throttle || 0)), handbrake: !!input.handbrake, wet: this.env.wet,
      ground: county ? (this.surface < 1 ? 'grass' : 'dirt') : 'cobble',
    });
    this.particles.vehicle(dt, this.player, { throttle: input.throttle, dusty: county, exhaust: juice('wheels', 'exhaust'), dust: juice('wheels', 'dust') });
    this.particles.atmosphere(dt, this.world, this.camera.position, { night: 1 - this.env.daylight, wet: this.env.wet });
    this.particles.setLight(0.5 + 0.5 * this.env.daylight);
    this.particles.update(dt);
    this.chase.update(dt, this.player, !!input.lookBack, this.feel.accel01);
    this.hud.setSpeed(this.player.speedMph, dt);
    const weather = { rain: ' · Rain', fog: ' · Fog', clear: '' }[this.env.weather];
    this.hud.setClock(`${this.env.daylight > 0.5 ? '☀' : '☾'} ${this.env.clock}${weather}`);
    this._updateAudio(IDLE_STATUS);
  }

  // A hard crash (strength 0..1 at x, z): debris, and a hit-stop the main loop holds.
  _impact(strength, x, z) {
    const I = JUICE.impacts;
    if (strength >= I.debrisFrom) this.debris.burst(x, 0.8, z, this.player.vx, this.player.vz, strength);
    if (strength >= I.hitStopFrom) this.hitStop = Math.max(this.hitStop, juice('impacts', 'hitStop'));
    if (strength >= JUICE.cinematic.slowMoFrom) this.slowMo = Math.max(this.slowMo, juice('cinematic', 'slowMo'));
  }

  // Game speed for the real-time loop: slow motion after a near-miss or a big crash.
  get timeScale() { return this.slowMo > 0 ? JUICE.cinematic.slowMoScale : 1; }

  // A pursuer flashing past within a car's width, fast, without touching: a near-miss.
  _nearMisses(status) {
    const C = JUICE.cinematic, v = this.player;
    if (!juice('cinematic', 'slowMo') || status.touching > 0) return;
    this.police.units.forEach((u, k) => {
      if (!u.active || this.time - this._nearMiss[k] < 3) return;
      const c = u.car, dx = c.position.x - v.position.x, dz = c.position.z - v.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 2.2 + C.nearMiss || d < 1) return;
      if (Math.hypot(c.vx - v.vx, c.vz - v.vz) < C.nearMissSpeed) return;
      this._nearMiss[k] = this.time;
      this.slowMo = Math.max(this.slowMo, C.slowMo);
      this.nearMisses = (this.nearMisses || 0) + 1;
    });
  }

  // The pursuers' red beacon throws a sweeping light across the nearest buildings (the shared
  // effects light: moved, never added, so nothing recompiles). The burning warehouse wins.
  _sirenSweep() {
    const light = this.world.fxLight;
    if (this.fire.active) return;
    let best = null, bd = 70 * 70;
    if (juice('cinematic', 'sirenSweep')) {
      for (const u of this.police.units) {
        if (!u.active || u.kind !== 'fed' || (u.mode !== 'chase' && u.mode !== 'search')) continue;
        const dd = u.car.position.distanceToSquared(this.camera.position);
        if (dd < bd) { bd = dd; best = u.car; }
      }
    }
    if (!best) { light.intensity = 0; return; }
    const a = this.time * 7.5;                   // the beacon turns ~1.2 times a second
    light.color.setHex(0xff1a0c);
    light.position.set(best.position.x + Math.sin(a) * 5, 3.2, best.position.z + Math.cos(a) * 5);
    light.intensity = 70 * JUICE.cinematic.sirenSweep * (0.15 + 0.85 * Math.pow(Math.abs(Math.sin(a)), 6));
  }

  _onEvents(events, status) {
    for (const e of events) {
      if (e.type === 'orders') {
        this.pause({ showMenu: false });
        showOrders(this.ui, e, (i) => {
          if (i >= 0) this._onEvents(this.mission.acceptOrder(i, this.time), status);
          else this.mission.declineOrders();
          if (!this.ui.anyOpen) this.resume();
        });
      }
      if (e.type === 'pickup') {
        this.hud.setCargo(true, `${e.order.jugs} JUGS · ${money(e.order.pay)}`);
        this.hud.toast(`Loaded ${e.order.jugs} jugs — deliver to ${e.order.drop.name}`, 'amber', 3000);
      }
      if (e.type === 'deliver') {
        const m = this.mission;
        this.career.deliver({ pay: e.amount, jugs: e.jugs, route: e.route, seconds: e.seconds, maxHeat: e.maxHeat, streak: m.streakEarned, streakRuns: m.streakRuns });
        this.hud.setCargo(false);
        this.hud.setCash(this.career.cash, true);
        this.hud.cashPop(`+${money(e.amount)}`);
        this.hud.toast('Shine delivered', 'gold');
        this.audio.cash?.();
        const beat = OPTIONS.story ? nextBeat(this.career) : null;
        if (beat) setTimeout(() => this._story(beat), 900);
      }
      if (e.type === 'spotted') {
        const msg = { patrol: 'Spotted by a patrol!', tipoff: 'Word of a big order got out — the law is coming', tip: 'Tipped off! The law is on its way' }[e.reason];
        this.hud.toast(msg || 'Spotted!', 'red');
        this.hud.sirenFlash();
      }
      if (e.type === 'lostTier') this.hud.toast('Shook one off — keep out of sight', 'blue');
      if (e.type === 'clear') this.hud.toast('You lost them', 'blue');
      if (e.type === 'hideout') {
        if (this.mission.heat > 0 && !status.seen) {
          this.mission.clearHeat();
          this.police.setTarget(0, this.player, this.camera);
          this.prevTier = 0;
          this.hud.toast('You laid low in the barn. The heat is off.', 'blue', 3000);
        }
        this.pause({ showMenu: false });
        this.openGarage();
        this.ui.top.onBack = () => { this.ui.close('garage'); if (!this.ui.anyOpen) this.resume(); };
      }
      if (e.type === 'escaped') this._escaped();
    }
  }

  // Engine through the gears, tyre screech, siren with Doppler shift, music, ambience.
  _updateAudio(status) {
    const v = this.player, speed = Math.abs(v.speed);
    const gears = [0, 8, 16, 26, 60];
    let g = 0;
    while (g < gears.length - 2 && speed > gears[g + 1]) g++;
    const rpm01 = Math.min(1, (speed - gears[g]) / (gears[g + 1] - gears[g]));
    let doppler = 1;
    const chasing = this.police.active.filter((u) => u.mode === 'chase' || u.mode === 'search');
    if (chasing.length) {
      const u = chasing.reduce((a, b) => (a.car.position.distanceToSquared(v.position) < b.car.position.distanceToSquared(v.position) ? a : b));
      const dx = v.position.x - u.car.position.x, dz = v.position.z - u.car.position.z, d = Math.hypot(dx, dz) || 1;
      const closing = ((u.car.vx - v.vx) * dx + (u.car.vz - v.vz) * dz) / d;   // + when approaching
      doppler = Math.max(0.8, Math.min(1.25, 343 / (343 - closing)));
    }
    const night = this.env.daylight < 0.3;
    this.audio.update({
      speed01: Math.min(1, speed / v.t.maxSpeed), rpm01,
      slip01: speed > 6 ? Math.min(1, Math.max(0, (v.slip - 3) / 8)) : 0,
      // Pursuers: louder and clearer as they close in; a faint distant wail while the heat
      // is up but they're not on you yet.
      siren01: this.police.pursuing ? Math.max(0.25, 1 - status.nearest / 160) : this.mission.tier > 0 && JUICE.enabled ? 0.18 : 0,
      near01: this.police.pursuing ? Math.max(0, 1 - status.nearest / 120) : 0,
      throttle01: Math.max(0, this._throttle || 0),
      jazz01: night ? this._jazzLevel(v.position) : 0,
      doppler, hot: this.mission.tier > 0, rain01: this.env.wet,
      crickets: night && this.env.weather === 'clear' && this.world.inCounty(v.position) && this.mission.tier === 0,
    });
  }

  // How loud the jazz from the nearest speakeasy (a buyer's corner) is: full at the door,
  // nothing past 70 m.
  _jazzLevel(p) {
    let best = Infinity;
    for (const d of this.world.drops) best = Math.min(best, Math.hypot(d.x - p.x, d.z - p.z));
    return Math.max(0, 1 - best / 70);
  }

  async _escaped() {
    this.mission.clearHeat();
    this.police.setTarget(0, this.player, this.camera);
    this.prevTier = 0;
    this.mission.reset(this.player.position, 'loop');
    this.hud.toast('You made it out of the city', 'gold', 3000);
    if (OPTIONS.story && !this.career.seen('valley')) await this._story('valley');
    else this.career.markSeen('valley');
  }

  _updateHud(status, disguised, safeZone, dt = 0) {
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
    this.hud.setSpeed(this.player.speedMph, dt);
    const weather = { rain: ' · Rain', fog: ' · Fog', clear: '' }[this.env.weather];
    this.hud.setClock(`${this.env.daylight > 0.5 ? '☀' : '☾'} ${this.env.clock}${weather}`);
    let pill = null;
    if (safeZone) pill = ['safe', 'SAFE COUNTY — the sheriff looks away'];
    else if (m.carrying && !this.player.trailer) pill = ['disguised', 'GENTLEMAN’S MOTOR CAR — slow to raise suspicion'];
    else if (m.carrying && this.disguiseUnlocked) {
      pill = disguised ? ['disguised', 'DISGUISED — just a horse box'] : ['speeding', `OVER ${Math.round(CONFIG.heat.disguiseSpeed * MS_TO_MPH)} MPH — LOOKS SUSPICIOUS`];
    }
    this.hud.setStatusPill(pill);
  }

  _mapMarkers() {
    if (this.mode === 'dredge') return [];
    const out = [];
    const m = this.mission;
    for (const [marker, kind] of [[m.pickup, 'still'], [m.drop, 'drop'], [m.hideoutMarker, 'hideout'], [m.goal, 'goal']]) {
      if (marker.visible) out.push({ kind, x: marker.position.x, z: marker.position.z });
    }
    return out;
  }

  _mapPolice() {
    const units = this.police.active.filter((u) => u.mode !== 'leave').map((u) => ({ kind: u.kind, x: u.car.position.x, z: u.car.position.z }));
    for (const r of this.police.roadblocks.active) units.push({ kind: 'fed', x: r.x, z: r.z });
    return units;
  }

  // Draw one frame of the 3D view.
  renderFrame() {
    this.world.updateShadow(this.camera);
    this.world.updateLamps(this.camera);
    this.world.sky.follow(this.camera);
    WHEELS.update();
    this.post.setDaylight(this.env.daylight);
    const s01 = Math.abs(this.player.speed) / this.player.t.maxSpeed;
    this.post.setRush(juice('cinematic', 'speedPulse') * Math.min(1, Math.max(0, (s01 - 0.85) / 0.15)));
    // Headlight beams show in the dark (and more in fog or rain), dim by day, stutter after a hit.
    const beam = this.player.model.beam;
    if (beam) beam.material.opacity = CONFIG.look.beamOpacity * (1 - 0.9 * this.env.daylight) * (1 + this.env.fog + 0.5 * this.env.wet) * this.feel.lightLevel;
    this.post.render();
  }

  // Switches for the expensive effects, for scripts/shoot.mjs cost reports.
  effectToggles() {
    const w = this.world;
    return {
      lampLights: (on) => { for (const l of w.lampLights) l.visible = on; },
      lampShadow: (on) => { w.lampSpot.castShadow = on && CONFIG.look.lampShadow; },
      cones: (on) => { w.lampCones.visible = on; },
      bloom: (on) => { this.post.bloom.enabled = on; },
      roadMaps: (on) => { const m = w.roadMaterial; m.normalScale.setScalar(on ? 1 : 0); },
      streaks: (on) => { w.lampStreaks.visible = on; },
      grade: (on) => { this.post.grade.enabled = on; },
      beams: (on) => { if (this.player.model.beam) this.player.model.beam.visible = on; },
      sky: (on) => { w.sky.mesh.visible = on; },
      props: (on) => { this.props.mesh.visible = on; },
    };
  }

  _loop() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.input.poll();
    if (this.state === STATE.PLAYING) {
      // Hit-stop: after a hard crash the action holds for a beat (the frame keeps drawing).
      const input = this.input.read();
      if (this.hitStop > 0) this.hitStop -= dt;
      else this.step(dt * this.timeScale, input);
      if (this.slowMo > 0) this.slowMo -= dt;      // real time, so it lasts the same at any speed
      this.minimap.draw(this.player, this._mapMarkers(), this._mapPolice(), this.time);
      this.renderFrame();
    } else if (this.state === STATE.INTRO) {
      // Title: a slow flyover of the city, drawn every other frame once the quality check
      // is done so the menu stays light.
      this.chase.flyover(dt);
      this._probeQuality(dt);
      this._titleFrame = !this._titleFrame;
      if (!this._probe.done || this._titleFrame) this.renderFrame();
    } else if (this.ui.isOpen('map')) {
      this.time += dt;
      this._drawBigMap();
    }
    // Paused / busted: the last frame stays on screen; nothing to redraw.
  }

  _onResize({ render = true } = {}) {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.post?.setSize(window.innerWidth, window.innerHeight);
    const h = this.renderer.domElement.height;
    const scale = h / (2 * Math.tan((CONFIG.camera.fov * Math.PI) / 360));
    this.particles.setScale(scale);
    this.fire.material.uniforms.uScale.value = scale;
    // Resizing clears the canvas; redraw so a paused game doesn't go black.
    if (render) this.renderFrame();
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
  mark('module');
  // Let the loading screen paint before the world is generated.
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  mark('painted');
  if (!webglAvailable()) {
    window.__shineFail('Your browser can’t show 3D graphics (WebGL is off or unsupported).',
      'Try the latest Chrome, Edge, Firefox or Safari, and make sure hardware acceleration is turned on in your browser settings.');
    return;
  }
  // 3D models from assets/ (the built-in ones stand in for any that fail).
  if (OPTIONS.models) await loadModels();
  mark('models');
  const game = new Game();
  mark('ready');
  window.__shineReady = true;
  $('loading').classList.add('hidden');
  game.showTitle();
  if (OPTIONS.debug || OPTIONS.test) installDebug(game, { overlay: OPTIONS.debug });
  registerServiceWorker();
}

boot().catch((e) => window.__shineFail('The game failed to start.', e && e.message ? e.message : String(e)));
