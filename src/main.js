import * as THREE from 'three';
import { CONFIG } from './config.js';
import { World } from './world.js';
import { Vehicle } from './vehicle.js';
import { makeMarker, animateMarker } from './marker.js';
import { ChaseCamera } from './camera.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { MiniMap } from './minimap.js';
import { UI, buildSettings, buildHelpKeys, el } from './ui.js';
import { loadSettings, saveSettings } from './settings.js';
import { Environment } from './environment.js';
import { showLedger, showMarket, money } from './screens.js';
import { Particles } from './particles.js';
import { JUICE, juice, VehicleFeel, Debris } from './juice.js';
import { Props } from './props.js';
import { Loot } from './loot.js';
import { TrunkScreen } from './trunkscreen.js';
import { DredgeCareer } from './dredgecareer.js';
import { sell, passTime, dayOf, eventFor, eventText } from './market.js';
import { distToSegment } from './county.js';
import { installDebug } from './debug.js';
import { PostFX } from './post.js';
import { MATERIALS, WHEELS } from './models.js';
import { MODELS, loadModels } from './assets.js';

const STATE = { INTRO: 'intro', PLAYING: 'playing', PAUSED: 'paused' };
const $ = (id) => document.getElementById(id);

// URL options: ?debug (dev overlay + test API), ?test (test API, deterministic: the clock
// stands still and the painterly look is off), ?seed=123 (city layout), ?sw (offline mode
// on localhost), ?time / ?painterly (turn those back on under ?test), ?models=0 (the
// built-in procedural models only).
const params = new URLSearchParams(location.search);
export const OPTIONS = {
  debug: params.has('debug'),
  test: params.has('test'),
  seed: params.has('seed') ? Number(params.get('seed')) >>> 0 : null,
  sw: params.has('sw'),
  time: !params.has('test') || params.has('time'),
  models: params.get('models') !== '0',
  painterly: !params.has('test') || params.has('painterly'),
};
// Replaced with the commit id by the production build.
const BUILD_ID = typeof __SHINE_BUILD__ !== 'undefined' ? __SHINE_BUILD__ : 'dev'; // eslint-disable-line no-undef

// How long each startup phase took (shown in the ?debug overlay; used to diagnose slow
// devices and CI).
export const BOOT = { t0: performance.now(), phases: {} };
window.__shineBoot = BOOT.phases;
const mark = (name) => { BOOT.phases[name] = Math.round(performance.now() - BOOT.t0); };

class Game {
  constructor() {
    this.buildId = BUILD_ID;
    this.settings = loadSettings();
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
    // Otto's truck: the bevelled flatbed from assets/ (scripts/make-truck.mjs), or the
    // built-in one if that doesn't load.
    this.player = new Vehicle(this.scene, this.world.collision);
    this._addHeadlight();
    WHEELS.attach(this.scene);    // every vehicle exists now: one instanced mesh per wheel shape
    this.world.enableShadows();   // the truck too
    // Crates, barrels and signs the truck knocks flying, and debris from heavy crashes (juice).
    this.props = new Props(this.scene, this.world, this.citySeed);
    this.loot = new Loot(this.scene, this.world, this.citySeed);   // pickups along the roads
    this.dredge = new DredgeCareer();                                // the save: cash, trunk, upgrades
    // Town markets: a marker each, built now and shown only near the camera (_updateMarkers).
    this.marketMarkers = CONFIG.dredge.towns.map((t) => {
      const m = makeMarker(this.scene, CONFIG.dredge.palette.amber);
      m.position.set(t.x, 0, t.z);
      return m;
    });
    this._marketLeft = true;                                          // left the market since it last opened
    this.debris = new Debris(this.scene);
    this.hitStop = 0;
    this.slowMo = 0;
    this.chase = new ChaseCamera(this.camera, this.world.collision);
    this.particles = new Particles(this.scene);
    this.feel = new VehicleFeel(this.scene, this.player, this.particles, this.headlight);
    this._cars = [this.player];   // what knocks props over

    this.hud = new HUD();
    this.input = new Input(this.settings.bindings);
    this.ui = new UI(this.input);
    this.trunkScreen = new TrunkScreen(this.ui, {
      onDiscard: (k) => this.hud.toast(`Left behind: ${k.name}`, '', 1400),
      onChange: () => { this._updateTrunkPill(); this.dredge.saveTrunk(this.trunk); },
      onClose: () => { if (this._marketRender && this.ui.isOpen('market')) this._marketRender(); else if (!this.ui.anyOpen) this.resume(); },
    });
    this.audio = new Audio();
    this.minimap = new MiniMap(this.world, $('minimap'), $('map-canvas'));
    this.input.onAction = (a, dev) => this._onAction(a, dev);
    this.input.onDevice = () => { this._applyTouch(); this._updateStartHint(); };

    this.state = STATE.INTRO;
    this.time = 0;
    this.clock = new THREE.Clock();
    this._probe = { frames: 0, total: 0, done: this.settings.quality !== 'auto' || OPTIONS.test };

    this.resetRun();
    this.applySettings();
    mark('setup');
    // Compile every shader now so nothing hitches when loot, debris or a market first
    // appears. With post-processing the scene draws into an offscreen buffer, which needs
    // different shader variants than drawing to the screen: compile those.
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

  // Draw everything once at boot, hidden and off-screen things included (loot, the far
  // market's marker, the truck's other body, debris), so their buffers are on the GPU
  // before they first appear. Lights stay as they are: the light count must not change.
  _warmUp() {
    // Everything, hidden or not, and wherever it is: an object that's visible but off
    // screen at boot (loot behind the truck, a barn up the county) would otherwise upload
    // the first time it comes into view.
    const shown = [], unculled = [], casters = [];
    // Shadow depth shaders: three.js draws every shadow caster with one shared depth
    // material and only rebuilds its shader when instancing changes between casters, so
    // which depth variants (instanced or not, textured or not, which side) get built would
    // depend on draw order, and a new order mid-game could compile one. Here each caster
    // asks for its own variant, so they all exist up front.
    const ownVariant = (r, o, cam, sc, geo, depthMaterial) => { depthMaterial.needsUpdate = true; };
    this.scene.traverse((o) => {
      if (o.isLight) return;
      if (!o.visible) { shown.push(o); o.visible = true; }
      if (o.frustumCulled) { unculled.push(o); o.frustumCulled = false; }
      if (o.castShadow) { casters.push(o); o.onBeforeShadow = ownVariant; }
    });
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
    for (const o of casters) delete o.onBeforeShadow;      // back to three.js' no-op
  }

  // The only moving real light; it always exists so the light count never changes. It
  // rides on the sprung body, so the beam dips when the nose dives under braking.
  _addHeadlight() {
    const lamp = new THREE.SpotLight(0xfff0cc, 90, 75, Math.PI / 5.5, 0.55, 1.2);
    lamp.target = new THREE.Object3D();
    this.headlight = lamp;
    const [z, y] = this.player.model.lamp;
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
    this.post.setPainterly(this.settings.painterly !== false && OPTIONS.painterly);
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

  // The truck's tuning (CONFIG.player) plus the upgrades bought at the markets
  // (CONFIG.dredge.upgrades): how it drives, how far it reaches for loot, what the radar
  // shows, how big the trunk is and which body it wears.
  _applyPerks() {
    const base = CONFIG.player, D = CONFIG.dredge, U = D.upgrades, lv = (id) => this.dredge.level(id);
    const car = {
      ...base,
      maxSpeed: base.maxSpeed + U.engine.step.maxSpeed * lv('engine'),
      accel: base.accel + U.engine.step.accel * lv('engine'),
      grip: base.grip + U.handling.step.grip * lv('handling'),
      turnRate: base.turnRate + U.handling.step.turnRate * lv('handling'),
    };
    const [cols, rows] = U.trunk.sizes[Math.min(lv('trunk'), U.trunk.sizes.length - 1)];
    this.perks = {
      pickupRadius: D.loot.pickupRadius + U.magnet.step.pickupRadius * lv('magnet'),
      mapRange: D.loot.mapRange + U.spotter.step.mapRange * lv('spotter'),
      cols, rows,
    };
    // The trunk grows with its upgrade (pieces stay where they were).
    if (this.trunk && (this.trunk.cols < cols || this.trunk.rows < rows)) {
      this.trunk = this.trunk.resized(Math.max(cols, this.trunk.cols), Math.max(rows, this.trunk.rows));
      this.dredge.saveTrunk(this.trunk);
      this._updateTrunkPill();
    }
    this.player.setLook(lv('trunk') > 0 ? 'reinforced' : 'stock');
    Object.assign(this.player.t, car);
    this.gripBase = car.grip;
  }

  // ---------- Screens ----------
  _bindUI() {
    const on = (id, fn) => $(id).addEventListener('click', fn);
    on('start-btn', () => this.start());
    on('intro-help', () => this.ui.open('help'));
    on('intro-settings', () => this.openSettings());
    on('pause-resume', () => this.resume());
    on('pause-map', () => this.openMap());
    on('pause-ledger', () => this.openLedger());
    on('pause-settings', () => this.openSettings());
    on('pause-help', () => this.ui.open('help'));
    on('pause-quit', async () => { if (await this.ui.confirm('QUIT?', 'Quit to the title screen? Your cash, upgrades and what’s in the trunk are saved.', 'QUIT')) this.quitToTitle(); });
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
    this._updateIntroBest();
    this.ui.open('intro', { onBack: () => {} });
  }

  // The title screen's line about the save: cash on hand and what's been sold so far.
  _updateIntroBest() {
    const s = this.dredge.data.stats;
    $('intro-best').textContent = s.sold
      ? `Cash on hand: ${money(this.dredge.cash)} · Sold so far: ${s.sold} piece${s.sold === 1 ? '' : 's'} for ${money(s.earned)}` : '';
  }

  openSettings() {
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
      if (await this.ui.confirm('ERASE PROGRESS?', 'Delete your cash, upgrades, what’s in the trunk and the ledger? This can’t be undone.', 'ERASE')) {
        this.eraseProgress();
        reset.textContent = 'Progress erased ✓';
      }
    });
    const cityRow = el('div', { class: 'set-row' }, seedLabel, el('span', {}, roll, ' ', share));
    buildSettings($('settings-body'), this.settings, {
      onChange: (s, k) => this._onSettingsChanged(s, k), input: this.input,
      extra: [cityRow, reset],
    });
    this.ui.open('settings');
  }

  // A clean slate: no cash, no upgrades, an empty trunk (the truck back to stock).
  eraseProgress() {
    this.dredge.reset();
    this.trunk = this.dredge.loadTrunk();
    this._applyPerks();
    this.hud.setCash(this.dredge.cash);
    this._updateTrunkPill();
    this._updateIntroBest();
  }

  openMap() {
    if (this.state === STATE.PLAYING) this.pause({ showMenu: false });
    if (this.state !== STATE.PAUSED) return;
    this.ui.open('map', { onBack: () => { this.ui.close('map'); if (!this.ui.anyOpen) this.resume(); } });
    this._drawBigMap();
  }

  openLedger() {
    showLedger(this.ui, this.dredge);
  }

  _drawBigMap() {
    this.minimap.drawBig(this.player, this._mapMarkers());
  }

  // ---------- Run flow ----------
  // A run starts on York Road, just inside the city, with fresh loot along the roads. Cash,
  // upgrades and whatever is in the trunk carry over from the save.
  resetRun() {
    const s = CONFIG.dredge.spawn;
    this.player.place(s.x, s.z, s.heading);
    this.minimap.clearRoute();
    this.particles.clear();
    this.props.reset();
    this.loot.reset(this.player.position);
    this.trunk = this.dredge.loadTrunk();
    this._marketLeft = true;
    this.place = this._placeName();
    this._eventDay = dayOf(this.dredge.market);    // the day's event is announced when the day turns
    this.debris.clear();
    this.hitStop = 0;
    this.slowMo = 0;
    this.feel.reset();
    this.chase.snap(this.player);
    this._applyPerks();
    this.hud.setCash(this.dredge.cash);
    this._updateTrunkPill();
    this._updateObjective();
    this._updateMarkers();
    this.runTime = 0;
    this._lastRam = -1;
    this._surfaceTimer = 0;
    this.surface = 1;
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

  // START DRIVING on the title screen.
  start() {
    this.resetRun();
    this._enterPlaying();
  }

  pause({ showMenu = true } = {}) {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.PAUSED;
    this.input.playing = false;
    this.input.down.clear();
    this.audio.setPaused(true);
    this.dredge.save();                  // the time on the road, for the ledger
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
      if (this.ui.top.onAction?.(a, dev)) return;
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
    else if (a === 'trunk') this.openTrunk();
    else if (a === 'radio') this.hud.toast(this.audio.toggleRadio() ? 'Radio on — hot jazz from the Belvedere ballroom' : 'Radio off', '', 1800);
    else if (a === 'mute') this.toggleMute();
    else if (a === 'fullscreen') this.toggleFullscreen();
  }

  // ---------- Simulation ----------
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

  // One simulation step (also used by tests to fast-forward deterministically): drive,
  // crash, pick up loot, trade, and the weather, feel, camera, HUD and sound.
  step(dt, input) {
    this.time += dt;
    this.runTime += dt;
    this.dredge.data.stats.playSeconds += dt;
    const fx = this.env.effects;
    this._updateSurface(dt);
    this.player.speedFactor = this.surface;
    this.player.t.grip = this.gripBase * fx.grip * (this.surface < 1 ? 0.85 : 1);
    this.player.update(dt, input);
    this._throttle = input.throttle || 0;
    // Hitting a wall: a thud, sparks and a shake; the hard ones throw debris and hold the
    // action for a beat (hit-stop).
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
    // One piece at a time: picking one up opens the trunk, which pauses the drive.
    let taken = 0;
    const found = this.loot.update(dt, this.time, this.player, { radius: this.perks.pickupRadius, canTake: () => taken++ === 0, camera: this.camera.position });
    for (const e of found) if (e.type !== 'loot') this._onRare(e);
    const got = found.find((e) => e.type === 'loot');
    if (got) this._onLoot(got);
    // Markets: the clock turns the day and eases gluts; stop in one to trade.
    passTime(this.dredge.market, dt * this.env.hoursPerSecond);
    this._checkEvent();
    this._updateMarkers();
    this._checkMarket();
    this._checkPlace();
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
    this._updateRoute(dt);
    this.hud.setSpeed(this.player.speedMph, dt);
    const weather = { rain: ' · Rain', fog: ' · Fog', clear: '' }[this.env.weather];
    this.hud.setClock(`${this.env.daylight > 0.5 ? '☀' : '☾'} ${this.env.clock}${weather}`);
    this._updateObjective();
    this._updateAudio();
  }

  // A rare find turned up (word of it, and where), or was lost to someone else.
  _onRare(e) {
    const name = e.kind.name.toLowerCase();
    if (e.type === 'rare') this.hud.toast(`Word of a ${name} out near ${this._landmark(e.x, e.z)}`, 'gold', 5000);
    else this.hud.toast(`Too late: someone else found the ${name}`, '', 3000);
  }

  // The named place nearest a spot in the county: a farm or a village.
  _landmark(x, z) {
    let best = 'the valley', bd = Infinity;
    for (const p of [...(this.world.barns || []), ...(this.world.villages || [])]) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (p.name && d < bd) { bd = d; best = p.name; }
    }
    return best;
  }

  // Picked up a piece of loot: the trunk opens with it in hand to pack it.
  _onLoot(e) {
    const pays = e.kind.paysAt && CONFIG.dredge.towns.find((t) => t.id === e.kind.paysAt);
    this.hud.toast(e.rare && pays ? `Found the ${e.kind.name.toLowerCase()}! It pays best in ${pays.town}` : `Picked up: ${e.kind.name}`, 'gold', e.rare ? 3500 : 1600);
    this.audio.pickup?.();
    this.particles.sparks(e.x, e.z, 0.25);
    this.openTrunk(e.kind.id);
  }

  // The trunk screen, with a new piece in hand or empty-handed to rearrange.
  openTrunk(newKind = null) {
    if (this.state === STATE.PLAYING) this.pause({ showMenu: false });
    if (this.state !== STATE.PAUSED) return;
    this.trunkScreen.open(this.trunk, newKind);
  }

  // The nearest market, and whether the truck is inside it.
  _nearestMarket(p = this.player.position) {
    let best = null, bd = Infinity;
    for (const t of CONFIG.dredge.towns) {
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      if (d < bd) { bd = d; best = t; }
    }
    return { town: best, dist: bd, inside: best && bd < best.radius };
  }

  // Only the market nearest the camera shows its marker, and only within range: each costs
  // four draw calls, so however many towns there are it's four at most (the radar always
  // shows every market).
  _updateMarkers() {
    const cam = this.camera.position, range = CONFIG.dredge.market.markerRange;
    let near = null, nd = range;
    for (const m of this.marketMarkers) {
      const d = Math.hypot(m.position.x - cam.x, m.position.z - cam.z);
      if (d < nd) { nd = d; near = m; }
    }
    for (const m of this.marketMarkers) {
      m.visible = m === near;
      animateMarker(m, this.time, cam);
    }
  }

  // Where the truck is: a town, or the valley between. Arriving somewhere new shows its name.
  _placeName(p = this.player.position) {
    if (!this.world.inCounty(p)) return 'Baltimore';
    const t = CONFIG.dredge.towns.find((x) => x.area && Math.hypot(p.x - x.x, p.z - x.z) < x.area);
    return t ? t.town : 'Green Spring Valley';
  }

  _checkPlace() {
    const place = this._placeName();
    if (place !== this.place) {
      if (this.place) this.hud.toast(place, 'gold', 2200);
      this.place = place;
    }
  }

  // Stop in a market to open it; it won't open again until you've driven out.
  _checkMarket() {
    const { town, inside } = this._nearestMarket();
    if (!inside) { this._marketLeft = true; return; }
    if (!this._marketLeft || Math.abs(this.player.speed) > CONFIG.dredge.market.stopSpeed) return;
    this._marketLeft = false;
    this.openMarket(town);
  }

  openMarket(town = this._nearestMarket().town) {
    if (this.state === STATE.PLAYING) this.pause({ showMenu: false });
    if (this.state !== STATE.PAUSED) return;
    const close = () => { this.ui.close('market'); this._marketRender = null; if (!this.ui.anyOpen) this.resume(); };
    this._marketRender = showMarket(this.ui, {
      town, getTrunk: () => this.trunk, career: this.dredge,
      onSell: (kind) => {
        const r = sell(town.id, this.trunk, this.dredge.market, kind);
        if (!r.count) return;
        this.dredge.sold({ ...r, town: town.name, trunk: this.trunk });
        this.hud.setCash(this.dredge.cash, true);
        this.hud.cashPop(`+${money(r.total)}`);
        this.audio.cash?.();
        this._updateTrunkPill();
      },
      onBuy: (id) => {
        if (!this.dredge.buy(id)) return;
        this._applyPerks();
        this.hud.setCash(this.dredge.cash, true);
        this.hud.cashPop(`−${money(CONFIG.dredge.upgrades[id].costs[this.dredge.level(id) - 1])}`);
        this.audio.cash?.();
      },
      onTrunk: () => this.trunkScreen.open(this.trunk),
      onBack: close,
    });
  }

  // A new in-game day posts a new market event: say so.
  _checkEvent() {
    const day = dayOf(this.dredge.market);
    if (day === this._eventDay) return;
    this._eventDay = day;
    const ev = eventFor(day);
    if (ev) this.hud.toast(eventText(ev), 'gold', 4000);
  }

  // The banner: where to sell (with the arrow) once there's something aboard; before that,
  // the day's market event if there is one.
  _updateObjective() {
    const { town, dist } = this._nearestMarket();
    if (!town || !this.trunk.count) {
      const ev = eventFor(dayOf(this.dredge.market));
      this.hud.setObjective(ev ? `Pick up loot · ${eventText(ev).replace(' today', '')}` : 'Pick up loot along the roads', null, 'roam');
      return;
    }
    const dx = town.x - this.player.position.x, dz = town.z - this.player.position.z;
    const bearing = Math.atan2(dx, -dz) - this.chase.heading;
    this.hud.setObjective(`Deliver to ${town.town}`, `${Math.max(0.1, dist / 1609.34).toFixed(1)} mi`, 'market', Math.atan2(Math.sin(bearing), Math.cos(bearing)));
  }

  // With loot aboard, the radar draws the way along the roads to the nearest market.
  _updateRoute(dt) {
    const { town } = this._nearestMarket();
    if (town && this.trunk.count) this.minimap.updateRoute(dt, this.player.position, town);
    else if (this.minimap.route.length) this.minimap.clearRoute();
  }

  _updateTrunkPill() {
    const t = this.trunk;
    this.hud.setCargo(`TRUNK ${t.used}/${t.size}`);
  }

  // A hard crash (strength 0..1 at x, z): debris, and a hit-stop the main loop holds.
  _impact(strength, x, z) {
    const I = JUICE.impacts;
    if (strength >= I.debrisFrom) this.debris.burst(x, 0.8, z, this.player.vx, this.player.vz, strength);
    if (strength >= I.hitStopFrom) this.hitStop = Math.max(this.hitStop, juice('impacts', 'hitStop'));
    if (strength >= JUICE.cinematic.slowMoFrom) this.slowMo = Math.max(this.slowMo, juice('cinematic', 'slowMo'));
  }

  // Game speed for the real-time loop: slow motion after a big crash.
  get timeScale() { return this.slowMo > 0 ? JUICE.cinematic.slowMoScale : 1; }

  // Engine through the gears, tyre screech, wind and rain, and the night: jazz from the
  // speakeasies in the city, crickets in the county.
  _updateAudio() {
    const v = this.player, speed = Math.abs(v.speed);
    const gears = [0, 8, 16, 26, 60];
    let g = 0;
    while (g < gears.length - 2 && speed > gears[g + 1]) g++;
    const rpm01 = Math.min(1, (speed - gears[g]) / (gears[g + 1] - gears[g]));
    const night = this.env.daylight < 0.3;
    this.audio.update({
      speed01: Math.min(1, speed / v.t.maxSpeed), rpm01,
      slip01: speed > 6 ? Math.min(1, Math.max(0, (v.slip - 3) / 8)) : 0,
      throttle01: Math.max(0, this._throttle || 0),
      jazz01: night ? this._jazzLevel(v.position) : 0,
      rain01: this.env.wet,
      crickets: night && this.env.weather === 'clear' && this.world.inCounty(v.position),
    });
  }

  // How loud the jazz from the nearest speakeasy (on the city's named corners) is: full at
  // the door, nothing past 70 m.
  _jazzLevel(p) {
    let best = Infinity;
    for (const d of this.world.drops) best = Math.min(best, Math.hypot(d.x - p.x, d.z - p.z));
    return Math.max(0, 1 - best / 70);
  }

  // What the radar and the map show: the markets, then loot within the spotter's range on
  // top (the rare find last, so it shows even on the rim over a far market).
  _mapMarkers() {
    return [...CONFIG.dredge.towns.map((t) => ({ kind: 'market', x: t.x, z: t.z })),
      ...this.loot.near(this.player.position, this.perks.mapRange)];
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
      this.minimap.draw(this.player, this._mapMarkers());
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
    // Paused: the last frame stays on screen; nothing to redraw.
  }

  _onResize({ render = true } = {}) {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.post?.setSize(window.innerWidth, window.innerHeight);
    const h = this.renderer.domElement.height;
    this.particles.setScale(h / (2 * Math.tan((CONFIG.camera.fov * Math.PI) / 360)));
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
