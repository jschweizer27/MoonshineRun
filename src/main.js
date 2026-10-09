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
import { showLedger, showNotebook, showMarket, showSlots, showBarn, showStill, showSalvage, showEnding, showBrewery, playDialog, money, supplyPrice } from './screens.js';
import { Salvage, payout, rareFind } from './salvage.js';
import { createRng } from './rng.js';
import { Police } from './police.js';
import { Railway, RAILWAY, inWindow } from './railway.js';
import { LOCH_NODES, WARREN } from './loch.js';
import { advance, current, openSites, lostNow, choiceOpen, ENDINGS } from './chapters.js';
import { consume, onHand, blend, missing, RECIPES } from './brew.js';
import { contacts, offersFor, progress, handOver, wantsText, trustLevel, nextDawn } from './contracts.js';
import { KINDS } from './trunk.js';
import { BEATS, nextBeat, CAST, THANKS, TRUSTED } from './story.js';
import { Particles } from './particles.js';
import { JUICE, juice, VehicleFeel, Debris } from './juice.js';
import { Props } from './props.js';
import { Loot } from './loot.js';
import { Traffic } from './traffic.js';
import { RoadEvents } from './roadevents.js';
import { TrunkScreen } from './trunkscreen.js';
import { DredgeCareer } from './dredgecareer.js';
import { sell, passTime, dayOf, eventFor, eventText, townOpen } from './market.js';
import { distToSegment } from './county.js';
import { installDebug } from './debug.js';
import { PostFX } from './post.js';
import { MATERIALS, WHEELS } from './models.js';
import { MODELS, loadModels } from './assets.js';

const STATE = { INTRO: 'intro', PLAYING: 'playing', PAUSED: 'paused' };
// A game hour as a clock reads it ("19:30"), and a window of them ("23:00–01:30").
const clockAt = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const hoursText = ([a, b]) => `${clockAt(a)}–${clockAt(b)}`;
const $ = (id) => document.getElementById(id);

// URL options: ?debug (dev overlay + test API), ?test (test API, deterministic: the clock
// stands still and the painterly look is off), ?seed=123 (city layout), ?sw (offline mode
// on localhost), ?time / ?painterly (turn those back on under ?test), ?models=0 (the
// built-in procedural models only), &story / &hints (the story cards and first-run tips,
// off under ?test).
const params = new URLSearchParams(location.search);
export const OPTIONS = {
  debug: params.has('debug'),
  test: params.has('test'),
  seed: params.has('seed') ? Number(params.get('seed')) >>> 0 : null,
  sw: params.has('sw'),
  time: !params.has('test') || params.has('time'),
  models: params.get('models') !== '0',
  painterly: !params.has('test') || params.has('painterly'),
  story: !params.has('test') || params.has('story'),
  hints: !params.has('test') || params.has('hints'),
  traffic: !params.has('test') || params.has('traffic'),
  police: !params.has('test') || params.has('police'),
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
    this.loot = new Loot(this.scene, this.world, this.citySeed);   // pieces thrown onto the road in a crash
    this.salvage = new Salvage(this.scene, this.world, this.citySeed);   // the sites where loot is found
    this.railway = new Railway(this.scene, this.world);                   // the line down the west edge, and the midnight freight
    this.railway.train.castShadow = true;
    this._breakRng = createRng((this.citySeed ^ 0xb4ea6) >>> 0);           // what breaks in a crash
    this.police = new Police(this.scene, this.world, this.citySeed);   // revenue agents, heat and the checkpoint
    this.police.enabled = OPTIONS.police;
    this.traffic = new Traffic(this.scene, this.world, this.citySeed);   // cars, vans and carts on the roads
    this.traffic.enabled = OPTIONS.traffic;
    this.roadEvents = new RoadEvents(this.world, this.traffic);   // washouts, breakdowns, fog, market days
    this.dredge = new DredgeCareer();                                // the save: cash, trunk, upgrades
    // Town markets: a marker each, built now and shown only near the camera (_updateMarkers).
    this.marketMarkers = CONFIG.dredge.towns.map((t) => {
      const m = makeMarker(this.scene, CONFIG.dredge.palette.amber);
      m.position.set(t.x, 0, t.z);
      return m;
    });
    this._marketLeft = true;                                          // left the market since it last opened
    // Otto's barn, the home base: its marker shares the rule (only the nearest shows).
    const home = this.world.home;
    this.barnMarker = makeMarker(this.scene, CONFIG.dredge.palette.cream, 'BARN', 'barn');
    this.barnMarker.position.set(home.stopX, 0, home.stopZ);
    // A contract's delivery: one marker for a speakeasy, one for a farm, shown only for the
    // job in hand (under the same nearest-marker rule).
    this.contactList = contacts(this.world);
    this.jobMarkers = {
      speakeasy: makeMarker(this.scene, CONFIG.dredge.palette.copper, 'DELIVERY', 'bottle'),
      farm: makeMarker(this.scene, CONFIG.dredge.palette.copper, 'DELIVERY', 'barn'),
    };
    for (const m of Object.values(this.jobMarkers)) { m.userData.off = true; m.visible = false; }
    // The nearest salvage site that can be worked: one marker, moved to it.
    this.siteMarker = makeMarker(this.scene, CONFIG.dredge.palette.copper, 'SALVAGE', 'stall');
    this.siteMarker.userData.off = true;
    this.siteMarker.visible = false;
    this.markers = [...this.marketMarkers, this.barnMarker, ...Object.values(this.jobMarkers), this.siteMarker];
    this._barnLeft = true;
    this.debris = new Debris(this.scene);
    this.hitStop = 0;
    this.slowMo = 0;
    this.chase = new ChaseCamera(this.camera, this.world.collision);
    this.particles = new Particles(this.scene);
    this.feel = new VehicleFeel(this.scene, this.player, this.particles, this.headlight);
    this._cars = [this.player, ...this.traffic.cars];   // what knocks props over

    this.hud = new HUD();
    this.input = new Input(this.settings.bindings);
    this.ui = new UI(this.input);
    this.trunkScreen = new TrunkScreen(this.ui, {
      onDiscard: (k) => this.hud.toast(`Left behind: ${k.name}`, '', 1400),
      onChange: () => { this._updateTrunkPill(); this.dredge.saveTrunk(this.trunk); },
      onClose: () => {
        // More from a salvage site: the next piece comes straight up to pack.
        if (this._pending?.length) { this.trunkScreen.open(this.trunk, this._pending.shift()); return; }
        if (this._marketRender && this.ui.isOpen('market')) this._marketRender(); else if (!this.ui.anyOpen) this.resume();
      },
    });
    this.audio = new Audio();
    this.minimap = new MiniMap(this.world, $('minimap'), $('map-canvas'));
    this.minimap.blocked = this.roadEvents.blocked;              // the route goes around closed roads
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
    // A hidden tab pauses and goes silent; back again over a market or the barn, it's hushed.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.pause(); this.audio.setPaused(true); }
      else if (this.state === STATE.PAUSED && !this.ui.isOpen('pause')) this.audio.setPaused('hush');
    });
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

  // "Auto" graphics during play: if the frames stay slow (two 5-second stretches under
  // ~25 fps), drop a level and remember it. Never under ?test.
  _watchQuality(raw) {
    if (this.settings.quality !== 'auto' || OPTIONS.test || this.quality === 'low' || raw > 0.25) return;
    const w = (this._slow ??= { t: 0, n: 0, bad: 0 });
    w.t += raw; w.n++;
    if (w.t < 5) return;
    const ms = (w.t / w.n) * 1000;
    w.bad = ms > 40 ? w.bad + 1 : 0;
    w.t = w.n = 0;
    if (w.bad < 2) return;
    w.bad = 0;
    this.settings.detectedQuality = this.quality === 'high' ? 'medium' : 'low';
    saveSettings(this.settings);
    this._applyQuality();
    this.hud.toast(`Graphics turned down to ${this.quality} to keep it smooth (Settings to change).`, '', 3500);
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
    // Lead Foot opens the engine up (wear's lost speed is applied each step, in step()).
    const boost = this._leadFoot ? D.abilities.leadfoot : { speed: 1, accel: 1 };
    const car = {
      ...base,
      maxSpeed: (base.maxSpeed + U.engine.step.maxSpeed * lv('engine')) * boost.speed,
      accel: (base.accel + U.engine.step.accel * lv('engine')) * boost.accel,
      grip: base.grip + U.handling.step.grip * lv('handling'),
      turnRate: base.turnRate + U.handling.step.turnRate * lv('handling'),
    };
    const [cols, rows] = U.trunk.sizes[Math.min(lv('trunk'), U.trunk.sizes.length - 1)];
    this.perks = {
      pickupRadius: D.loot.pickupRadius,
      mapRange: D.loot.mapRange,                           // pieces spilled on the road
      // salvage sites on the radar: further with each Spotter level, all of them at the top
      siteRange: lv('spotter') >= U.spotter.costs.length ? Infinity : D.salvage.mapRange + U.spotter.step.siteRange * lv('spotter'),
      padding: 1 - U.padding.step.padding * lv('padding'),   // share of a crash's breakage chance felt
      field: this.dredge.data.tools?.tyres ? 1 : 0.7 + U.tyres.step.field * lv('tyres'),   // speed kept in the fields (all of it on farm tyres)
      wet: 1 - U.tyres.step.wet * lv('tyres'),             // share of the rain's grip loss felt
      light: 1 + U.lamps.step.light * lv('lamps'),         // headlamps and beams
      wear: 1 - U.plating.step.wear * lv('plating'),       // share of a knock's wear taken
      // crates of shine a search misses (the upgrade's levels, and chapter 3's false bottom)
      hidden: U.falsebottom.step.hidden * (lv('falsebottom') + (this.dredge.data.tools?.falsebottom ? 1 : 0)),
      agentRange: this.dredge.data.tools?.policeband ? Infinity : D.police.mapRange,   // the radar's Bureau cars (all of them on the police band)
      cols, rows,
    };
    if (this.feel) { this._lampBase ??= this.feel.headlightBase; this.feel.headlightBase = this._lampBase * this.perks.light * (this.lightsOff ? 0 : 1); }
    // The trunk grows with its upgrade (pieces stay where they were).
    if (this.trunk && (this.trunk.cols < cols || this.trunk.rows < rows)) {
      this.trunk = this.trunk.resized(Math.max(cols, this.trunk.cols), Math.max(rows, this.trunk.rows));
      this.dredge.saveTrunk(this.trunk);
      this._updateTrunkPill();
    }
    this.player.setLook(lv('trunk') > 0 ? 'reinforced' : 'stock');
    Object.assign(this.player.t, car);
    this.gripBase = car.grip;
    this._updateWearPill();
  }

  // ---------- Screens ----------
  _bindUI() {
    const on = (id, fn) => $(id).addEventListener('click', fn);
    on('start-btn', () => this.start());
    on('intro-saves', () => this.openSlots());
    on('intro-help', () => this.ui.open('help'));
    on('intro-settings', () => this.openSettings());
    on('pause-resume', () => this.resume());
    on('pause-map', () => this.openMap());
    on('pause-ledger', () => this.openLedger());
    on('pause-notebook', () => this.openNotebook());
    on('notebook-done', () => this.ui.back());
    on('pause-settings', () => this.openSettings());
    on('pause-help', () => this.ui.open('help'));
    on('pause-skip-tips', () => { this.endGuide(true); $('pause-skip-tips').classList.add('hidden'); this.ui.focusFirst(); });
    on('guide-skip', () => this.endGuide(true));
    // Quitting with the Bureau on your tail is a bust (no getting away by quitting).
    on('pause-quit', async () => {
      const heat = this.police.tier > 0;
      const text = heat ? 'The Bureau is on your tail: quitting now counts as a bust. The shine aboard is taken, and the fine paid.' : 'Quit to the title screen? Your cash, upgrades and what’s in the trunk are saved.';
      if (!(await this.ui.confirm('QUIT?', text, 'QUIT'))) return;
      if (heat) this._bust('You quit with the Bureau on your tail.');
      this.quitToTitle();
    });
    on('ledger-done', () => this.ui.back());
    on('settings-done', () => this.ui.back());
    on('help-done', () => this.ui.back());
    on('map-done', () => this.ui.back());
    on('btn-pause', () => this.pause());
    on('btn-map', () => this.openMap());
    on('btn-mute', () => this.toggleMute());
    on('btn-fullscreen', () => this.toggleFullscreen());
    // Touch only: the headlamps, the trunk and the notebook (keys and buttons elsewhere).
    on('btn-lights', () => { if (this.state === STATE.PLAYING) this.toggleLights(); });
    on('btn-trunk', () => { if (this.state === STATE.PLAYING) this.openTrunk(); });
    on('btn-notebook', () => this.openNotebook());
    if (!document.fullscreenEnabled) $('btn-fullscreen').classList.add('hidden');
  }

  showTitle() {
    this._updateIntroBest();
    this.ui.open('intro', { onBack: () => {} });
  }

  // The title screen's line about the save (cash on hand and what's been sold so far), and
  // CONTINUE once this slot has been played.
  _updateIntroBest() {
    const s = this.dredge.data.stats, slot = this.dredge.slot;
    $('start-btn').textContent = this.dredge.started ? 'CONTINUE' : 'START DRIVING';
    const d = this.dredge.data, parts = [`Slot ${slot}`];
    if (s.sold) parts.push(`Cash on hand: ${money(this.dredge.cash)}`, `Sold so far: ${s.sold} piece${s.sold === 1 ? '' : 's'} for ${money(s.earned)}`);
    if (d.ending) parts.push(ENDINGS[d.ending].after);
    else if (d.flags.deed) parts.push('Braun & Sons is yours again');
    $('intro-best').textContent = this.dredge.started || s.sold ? parts.join(' · ') : '';
  }

  // The saved games: play a slot, start a new game in one, or erase one.
  openSlots() {
    showSlots(this.ui, {
      summary: (slot) => DredgeCareer.summary(slot),
      current: () => this.dredge.slot,
      onPlay: (slot) => { this._loadSlot(slot); this.start(); },
      onNew: (slot) => { this.dredge.erase(slot); this._loadSlot(slot); this.start(); },
      onErase: (slot) => { this.dredge.erase(slot); if (slot === this.dredge.slot) this._loadSlot(slot); this._updateIntroBest(); },
      onBack: () => { this.ui.close('slots'); this._updateIntroBest(); },
    });
  }

  // Switch to a save slot: its cash, upgrades and trunk.
  _loadSlot(slot) {
    this.dredge.useSlot(slot);
    this._syncHour();
    this.trunk = this.dredge.loadTrunk();
    this._applyPerks();
    this.hud.setCash(this.dredge.cash);
    this._updateTrunkPill();
    this._updateIntroBest();
    this._updateGuide();
    this._updateJobMarker();
    this._buildAbilities();
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
    const reset = el('button', { type: 'button', class: 'text-btn' }, `Erase saved progress (slot ${this.dredge.slot})`);
    reset.addEventListener('click', async () => {
      if (await this.ui.confirm('ERASE PROGRESS?', `Delete slot ${this.dredge.slot}: your cash, upgrades, what’s in the trunk and the ledger? This can’t be undone.`, 'ERASE')) {
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

  // A clean slate: no cash, no upgrades, an empty trunk (the truck back to stock). Mid-run,
  // it's back to the title screen (nothing of the old run is left on the road).
  eraseProgress() {
    this.dredge.reset();
    if (this.state !== STATE.INTRO) { this.quitToTitle(); return; }
    this.resetRun();
    this._updateIntroBest();
  }

  // The hour on the clock face (env.hour: the sky, the lamps, the night's rules) is the
  // save's clock (market.clock: days, deadlines, refills), so they never disagree.
  _syncHour() {
    this.env.hour = ((this.dredge.market.clock % 24) + 24) % 24;
    this.env.update(0, this.camera.position);
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

  // Otto's notebook: from the pause menu, or B while driving (the drive waits under it).
  openNotebook() {
    const fromRoad = this.state === STATE.PLAYING;
    if (fromRoad) this.pause({ showMenu: false });
    if (this.state !== STATE.PAUSED) return;
    showNotebook(this.ui, {
      career: this.dredge, contacts: this.contactList, clock: this.dredge.market.clock,
      onBack: () => { this.ui.close('notebook'); if (fromRoad && !this.ui.anyOpen) this.resume(); },
    });
  }

  _drawBigMap() {
    this.minimap.drawBig(this.player, this._mapMarkers());
  }

  // ---------- Run flow ----------
  // A run starts on York Road, just inside the city. Cash, upgrades, the clock and whatever
  // is in the trunk carry over from the save.
  resetRun() {
    const s = CONFIG.dredge.spawn;
    this._syncHour();
    this.player.place(s.x, s.z, s.heading);
    this.minimap.clearRoute();
    this.particles.clear();
    this.props.reset();
    this.world.standLamps();
    this.loot.reset(this.player.position);
    this.roadEvents.reset(this.dredge.market);
    this.traffic.clear();
    this.police.reset();
    this.lightsOff = false;
    this.trunk = this.dredge.loadTrunk();
    this._marketLeft = true;
    this._closedLeft = true;
    this._barnLeft = true;
    this._dropLeft = true;
    this._siteLeft = true;
    this._pending = [];
    this._jobWhy = this._siteWhy = this._dropWhy = '';
    // A run cut short mid-ambush (quit, reload): Otto got away with the letters.
    if (this.dredge.data.flags.ambush && !this.dredge.data.flags.escaped) { this.dredge.data.flags.escaped = true; this.dredge.save(); }
    this._ambushOn = false;
    this._updatePassenger();
    this._nightFrom = this._tally();
    this.salvage.state = this.dredge.data.sites;
    this.salvage.story = this._openSites();
    this.salvage.refresh(dayOf(this.dredge.market));
    this._jobLeft = true;
    this._updateJobMarker();
    // Abilities start each run ready (times are game time).
    this.abil = Object.fromEntries(Object.keys(CONFIG.dredge.abilities).map((id) => [id, { until: -1, ready: 0 }]));
    this._leadFoot = false;
    this._sweet = false;
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
    this._updateGuide();
    this._buildAbilities();
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

  // START DRIVING / CONTINUE on the title screen. A new game opens with the prologue.
  start() {
    this.resetRun();
    const fresh = !this.dredge.data.started;
    if (fresh) { this.dredge.data.started = true; this.dredge.data.guide = OPTIONS.hints; this.dredge.save(); }
    this._enterPlaying();
    this._updateGuide();
    if (fresh) this._story('prologue');
  }

  // ---------- The first run's tips ----------
  // Read from where the save stands (an empty trunk, a packed piece, the first sale), so
  // they can't fall out of step. They end at the first sale, or when skipped.
  // While a chapter step points somewhere they step aside (the banner and the route say
  // where), but for how to work a story site.
  _guideText() {
    if (!this.dredge.data.guide) return '';
    const { step } = current(this.dredge.data);
    if (step && this._stepGoal(step)) return step.site || this._lost() ? 'Follow the gold route on the radar to the site, and stop beside its sign to work it.' : '';
    if (this.trunk.count) return 'Follow the gold route on the radar to a ⬢ market, and stop inside its ring to sell.';
    return 'Find salvage: drive to a SALVAGE sign (⊗ on the radar), stop beside it, and work it for what’s there.';
  }

  _updateGuide() {
    if (this.dredge.data.guide && this.dredge.data.stats.sold > 0) this.endGuide(false);
    const text = this._guideText();
    $('guide').classList.toggle('hidden', !text);
    if ($('guide-text').textContent !== text) $('guide-text').textContent = text;
  }

  endGuide(skipped) {
    if (!this.dredge.data.guide) return;
    this.dredge.data.guide = false;
    this.dredge.save();
    $('guide').classList.add('hidden');
    $('trunk-guide').classList.add('hidden');
    $('market-guide').classList.add('hidden');
    if (!skipped) this.hud.toast('That’s the job. The roads are yours.', 'gold', 3500);
  }

  // A tip line on the trunk or market screen while the tips run.
  _guideLine(id, text) {
    const on = !!this.dredge.data.guide;
    $(id).classList.toggle('hidden', !on);
    $(id).textContent = on ? text : '';
  }

  // Play a story beat's cards (once per save): the drive pauses under them.
  // The chapters (chapters.js): open the story site the current step needs, and when the
  // save moves the story on, say so (toasts) and play its cards (under ?test only with
  // &story). Returns whether cards are playing.
  _chapters() {
    const d = this.dredge.data, open = this._openSites();
    if (JSON.stringify(open) !== JSON.stringify(this.salvage.story)) { this.salvage.story = open; this.salvage.refresh(dayOf(this.dredge.market)); }
    this._storyOrders();
    // The story moves on only out on the road, so its cards are never lost under a screen.
    if (this.state !== STATE.PLAYING) return false;
    const events = advance(d);
    if (!events.length) return false;
    const lines = [];
    let tool = false;
    for (const e of events) {
      if (e.type === 'open') lines.push(...e.chapter.open);
      else if (e.type === 'step') { d.stepTimes[e.step.id] = Math.round(d.stats.playSeconds); if (e.step.lines) lines.push(...e.step.lines); }
      else if (e.type === 'clue') lines.push(['narrator', `A clue for the notebook: ${e.clue.title}. ${e.clue.text}`]);
      else if (e.type === 'tool') { lines.push(['narrator', `Earned: ${e.tool.name}. ${e.tool.text}`]); tool = true; }
      else if (e.type === 'close') lines.push(...e.chapter.close);
    }
    this.salvage.story = this._openSites();
    this.salvage.refresh(dayOf(this.dredge.market));
    if (tool) this._applyPerks();
    this._storyOrders();
    this.dredge.save();
    const { chapter, step } = current(d), done = events.filter((e) => e.type === 'step').pop();
    if (events.some((e) => e.type === 'clue')) this.hud.toast('A clue for the notebook (B)', 'gold', 4000);
    else if (done && step) this.hud.toast(`Done. ${chapter.title}: ${step.text}`, 'gold', 4000);
    else if (done && choiceOpen(d)) this.hud.toast('The choice is yours: the deed, or the paper', 'gold', 4000);
    this._updateObjective();
    this._updateGuide();
    // The trap at Warren springs once its cards are read (or at once without them).
    const trap = events.some((e) => e.type === 'step' && e.step.ambush);
    if (!OPTIONS.story || !lines.length) { if (trap) this._ambush(); return false; }
    this.pause({ showMenu: false });
    playDialog(this.ui, lines, { reducedMotion: !!this.settings.reducedMotion })
      .then(() => { if (this.state === STATE.PAUSED && !this.ui.anyOpen) this.resume(); if (trap) this._ambush(); });
    return true;
  }

  // The story sites open now (chapters.js openSites), with what's on hand: a lost coil opens
  // the ruins again.
  _openSites() { return openSites(this.dredge.data, onHand(this.trunk, this.dredge.data.stash)); }

  // What the chapter step needs that's been lost (chapters.js lostNow), or null.
  _lost() { return lostNow(this.dredge.data, onHand(this.trunk, this.dredge.data.stash)); }

  // The chapter step's story order (chapters.js `order`) is in the book while the step is
  // current, and only then. Once the Jockey has sold Otto out, his orders quietly go.
  _storyOrders() {
    const d = this.dredge.data, { step } = current(d);
    const want = step?.order && !d.flags[`order:${step.id}`] ? step : null, had = d.orders.length;
    d.orders = d.orders.filter((o) => (!o.story || o.story === want?.id) && !(d.flags.betrayed && o.who === 'jockey'));
    let added = null;
    if (want && !d.orders.some((o) => o.story === want.id)) d.orders.push(added = this._storyOrder(want));
    if (!added && d.orders.length === had) return;
    this.dredge.save();
    this._updateJobMarker();
    if (added) this.hud.toast(`In the book: ${added.passenger ? `carry ${added.name} from ${added.pickup.place} to ${added.drop.place}` : `${wantsText(added.wants)} for ${added.name}, ${added.place}`}${added.window ? ` · ${hoursText(added.window)}` : added.night ? ' · after dark' : ''}`, 'gold', 4000);
  }

  // A story order (chapters.js `order`): no deadline (`due` null), only after dark or in its
  // `window`, and not to be dropped. `at` is 'load' (the midnight freight) or a contact.
  // A `passenger` rides along: the order points at his pickup (a contact's door) until he's
  // aboard (`aboard`, main._checkPassenger), then at where he's going (`drop`). A `fragile`
  // load breaks a crate on any hard knock (main._breakage).
  _storyOrder(step) {
    const O = step.order, c = O.at === 'load' ? { ...RAILWAY.load, place: O.place } : this.contactList.find((x) => x.who === O.at);
    const o = {
      id: `story:${step.id}`, story: step.id, contact: c.id || null, who: O.who, name: CAST[O.who].name, place: O.place || c.place, kind: 'speakeasy', x: c.x, z: c.z,
      wants: { ...O.wants }, grade: null, night: !!O.night, window: O.window || null, pay: O.pay, hours: 0, km: 0, line: '', due: null, fragile: !!O.fragile,
    };
    if (O.passenger) {
      const from = this.contactList.find((x) => x.who === O.passenger.from);
      Object.assign(o, { passenger: O.passenger.who, aboard: false, pickup: { x: from.x, z: from.z, place: from.place }, drop: { x: o.x, z: o.z, place: o.place }, x: from.x, z: from.z, place: from.place });
    }
    return o;
  }

  // A passenger waiting at his pickup: stopped there, he climbs in, and the order now points
  // where he's going.
  _checkPassenger() {
    const d = this.dredge.data, o = d.orders.find((x) => x.passenger && !x.aboard), p = this.player.position;
    if (!o || Math.hypot(p.x - o.pickup.x, p.z - o.pickup.z) > CONFIG.dredge.contracts.radius || Math.abs(this.player.speed) > CONFIG.dredge.market.stopSpeed * 2) return;
    Object.assign(o, { aboard: true, x: o.drop.x, z: o.drop.z, place: o.drop.place });
    this.dredge.save();
    this._updateJobMarker();
    this._updatePassenger();
    this.hud.toast(`${CAST[o.passenger].name} climbs in: “${o.drop.place}, and mind the bumps. She pulls out at ${hoursText(o.window).split('–')[1]}.”`, 'gold', 4500);
  }

  // Put the passenger off (a bust): he goes back to his pickup to wait, and the run can be tried again.
  _passengerOff() {
    const o = this.dredge.data.orders.find((x) => x.passenger && x.aboard);
    if (!o) return null;
    Object.assign(o, { aboard: false, x: o.pickup.x, z: o.pickup.z, place: o.pickup.place });
    this._updatePassenger();
    this._updateJobMarker();
    return o;
  }

  // The HUD's passenger pill, while someone rides along.
  _updatePassenger() {
    const o = this.dredge.data.orders.find((x) => x.passenger && x.aboard), el = $('passenger');
    el.classList.toggle('hidden', !o);
    if (o) el.textContent = `${CAST[o.passenger].name.toUpperCase()} ABOARD`;
  }

  // A hard knock with a passenger aboard: he lets you know, and Mags hears of it.
  _passengerKnock(impact) {
    const S = CONFIG.dredge.story.passenger, o = this.dredge.data.orders.find((x) => x.passenger && x.aboard);
    if (!o || impact < S.crash || this.time - (this._knockAt ?? -10) < 3) return;
    this._knockAt = this.time;
    const lines = ['“Mind the road! Mags said you could drive.”', '“My dinner, Braun. My dinner.”', '“I’ll be telling Mags about this.”'];
    this._knocks = (this._knocks || 0) + 1;
    this._trust(S.from, -S.trust);
    this.dredge.save();
    this.hud.toast(`${CAST[o.passenger].name}: ${lines[this._knocks % lines.length]} Mags O’Rourke’s trust slips.`, 'red', 3500);
  }

  // Chapter 5's trap at Warren: the Bureau comes at once, every car (police.alert), and
  // getting away with the letters is the chapter's last step. With the agents off (?test
  // without &police) there's nobody to get away from.
  _ambush() {
    const d = this.dredge.data, A = CONFIG.dredge.story.ambush;
    if (!d.flags.ambush || d.flags.escaped || this._ambushOn) return;
    if (!this.police.enabled) { d.flags.escaped = true; this.dredge.save(); return; }
    this._ambushOn = true;
    for (const e of this.police.alert(this.player.position, A.tier, { hold: A.hold, range: A.range })) this._onPolice(e);
    this._updateHeat();
  }

  // Away from the ambush: lost them, or busted (the letters were in Otto's coat).
  _escaped() {
    const d = this.dredge.data;
    if (!d.flags.ambush || d.flags.escaped) return;
    d.flags.escaped = true;
    this._ambushOn = false;
    this.dredge.save();
  }

  async _story(id) {
    if (!OPTIONS.story || this.dredge.data.story[id]) return;
    this.dredge.data.story[id] = true;
    this.dredge.save();
    if (this.state === STATE.PLAYING) this.pause({ showMenu: false });
    await playDialog(this.ui, BEATS[id].lines, { reducedMotion: !!this.settings.reducedMotion });
    if (this.state === STATE.PAUSED && !this.ui.anyOpen) this.resume();
  }

  // Twice a second: a beat whose moment has come plays, when nothing else is on screen.
  _checkStory(dt) {
    if ((this._storyT = (this._storyT || 0) - dt) > 0) return;
    this._storyT = 0.5;
    this._updateGuide();
    this._updateAbilities();
    if (this._chapters() || this.state !== STATE.PLAYING) return;    // a beat never plays over another screen
    this._trustGifts({ say: true });                                   // (one earned off the road: an old save)
    const id = OPTIONS.story && nextBeat(this.dredge.data);
    if (id) this._story(id);
  }

  pause({ showMenu = true } = {}) {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.PAUSED;
    this.input.playing = false;
    this.input.down.clear();
    // The pause menu freezes every sound; a screen over the road (a market, the barn, the
    // trunk, the map, a story card) only hushes the road, so its own sounds play.
    this.audio.setPaused(showMenu ? true : 'hush');
    this.dredge.save();                  // the time on the road, for the ledger
    this._applyTouch();
    $('pause-skip-tips').classList.toggle('hidden', !this.dredge.data.guide);
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
      else if ((a === 'map' && this.ui.top.id === 'map') || (a === 'notebook' && this.ui.top.id === 'notebook')) this.ui.back();
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
    else if (a === 'lights') this.toggleLights();
    else if (a === 'notebook') this.openNotebook();
    else if (a === 'ability2') this.useAbility('leadfoot');
    else if (a === 'ability3') this.useAbility('sweet');
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
    this.surface = on ? 1 : this.perks.field;
  }

  // One simulation step (also used by tests to fast-forward deterministically): drive,
  // crash, pick up loot, trade, and the weather, feel, camera, HUD and sound.
  step(dt, input) {
    this.time += dt;
    this.runTime += dt;
    this.dredge.data.stats.playSeconds += dt;
    this.dredge.data.stats.distance += Math.abs(this.player.speed) * dt;
    const fx = this.env.effects;
    this._updateSurface(dt);
    // The fields slow the truck, and so does wear (until it's mended at the barn).
    this.player.speedFactor = this.surface * (1 - this.dredge.data.wear * CONFIG.dredge.wear.maxSlow);
    this.player.t.grip = this.gripBase * (1 - (1 - fx.grip) * this.perks.wet) * (this.surface < 1 ? 0.85 : 1);
    this.player.update(dt, input);
    this._throttle = input.throttle || 0;
    // Hitting a wall: a thud, sparks and a shake; the hard ones throw debris and hold the
    // action for a beat (hit-stop).
    const p = this.player.position;
    if (this.player.impact > 6) this._crash(this.player.impact, p.x + this.player.forwardX * 2.5, p.z + this.player.forwardZ * 2.5);
    for (const e of this.traffic.update(dt, this.player, this.camera.position, this.env.hour)) this._onTraffic(e);
    // Revenue agents: patrols, heat, the bust meter and the York Road checkpoint.
    const night = this._night(), d = this.dredge.data;
    const law = this.police.update(dt, this.player, this.camera, this.time, {
      contraband: this._contraband() > 0, night, lightsOff: this.lightsOff && night, route: this.minimap.route,
      checkpoint: (d.chapter || 0) >= CONFIG.dredge.police.checkpoint.chapter,
    });
    if (this.police.checkpoint.on && !d.flags.checkpoint) { d.flags.checkpoint = true; this.dredge.save(); }   // its warning card (story.js)
    if (law.touching > 6) this._crash(law.touching, p.x, p.z);
    this._updateHeat();
    for (const e of law.events) if (this._onPolice(e)) return;
    this.props.update(dt, this._cars);
    // Lamp posts give way: the truck knocks them over and loses a little speed.
    for (const h of this.world.knockLamps([this.player])) {
      this.player.vx *= 0.85; this.player.vz *= 0.85; this.player.speed *= 0.85;
      this.audio.crash(Math.min(0.35, h.impact / 50));
      this.chase.shake(Math.min(0.25, h.impact / 60));
      this.particles.sparks(h.x, h.z, 0.3);
      this.dredge.data.stats.lamps = (this.dredge.data.stats.lamps || 0) + 1;
    }
    this.world.updateFallenLamps(dt);
    // One piece at a time: picking one up opens the trunk, which pauses the drive.
    let taken = 0;
    const found = this.loot.update(dt, this.time, this.player, { radius: this.perks.pickupRadius, canTake: () => taken++ === 0, camera: this.camera.position });
    for (const e of found) if (e.type !== 'loot') this._onRare(e);
    const got = found.find((e) => e.type === 'loot');
    if (got) this._onLoot(got);
    // Markets: the clock turns the day and eases gluts; stop in one to trade.
    passTime(this.dredge.market, dt * this.env.hoursPerSecond);
    const road = this.roadEvents.update(this.dredge.market.clock, this.env, this.dredge.market);
    if (road) this.hud.toast(road.what === 'start' ? road.ev.text : RoadEvents.endText(road.ev), road.what === 'start' ? 'gold' : '', road.what === 'start' ? 5000 : 2500);
    this._checkEvent();
    this._updateMarkers();
    this._tickAbilities();
    // The stops: once one opens a screen (the game pauses), the rest wait for the next step,
    // so two never open on one stop.
    for (const check of [this._checkPassenger, this._checkContract, this._checkMarket, this._checkBarn, this._checkDrop, this._checkSalvage]) {
      if (this.state !== STATE.PLAYING) break;
      check.call(this);
    }
    this._checkPlace();
    this._checkStory(dt);
    this.debris.update(dt);
    // The midnight freight at Glyndon: in and out on its timetable, a whistle as it pulls in.
    if (this.railway.update(this.env.hour, this.camera.position) === 'arrived' && Math.hypot(p.x - this.railway.train.position.x, p.z - this.railway.train.position.z) < 400) this.audio.whistle?.();
    const hour0 = this.env.hour;
    this.env.update(dt, this.camera.position);
    if (hour0 < 6 && this.env.hour >= 6) this._dawn();
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
    this.hud.setClock(this._clockText());
    this._updateObjective();
    this._updateAudio();
  }

  // The HUD's clock: sun or moon, the time, the weather.
  _clockText() {
    const weather = { rain: ' · Rain', fog: ' · Fog', clear: '' }[this.env.weather];
    return `${this.env.daylight > 0.5 ? '☀' : '☾'} ${this.env.clock}${weather}`;
  }

  // A rare find turned up (word of it, and where), or was lost to someone else.
  _onRare(e) {
    const name = e.kind.name.toLowerCase();
    if (e.type === 'rare') { this.hud.toast(`Word of a ${name} out near ${this._landmark(e.x, e.z)}`, 'gold', 5000); this.audio.fanfare?.('rare'); }
    else this.hud.toast(`Too late: someone else found the ${name}`, '', 3000);
  }

  // The named place nearest a spot in the county: a farm or a village.
  _landmark(x, z) {
    if (this.world.regionOf(x) === 'loch') return Math.hypot(x - WARREN.x, z - WARREN.z) < 120 ? 'Warren' : 'Loch Raven';
    if (!this.world.inCounty({ x, z })) {   // in the city: its nearest named quarter
      let best = 'the city', bd = Infinity;
      for (const l of this.world.mapLabels) if (l.z > -250 && Math.hypot(l.x - x, l.z - z) < bd) { bd = Math.hypot(l.x - x, l.z - z); best = l.text.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()); }
      return best;
    }
    let best = 'the valley', bd = Infinity;
    for (const p of [...(this.world.barns || []), ...(this.world.villages || [])]) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (p.name && d < bd) { bd = d; best = p.name; }
    }
    return best;
  }

  // Picked up a piece of loot: the trunk opens with it in hand to pack it.
  _onLoot(e) {
    if (e.rare) this.dredge.data.stats.rares++;
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
    this._guideLine('trunk-guide', newKind ? 'Move it with the arrows, turn it with R, and press Enter to put it down. Pieces can’t overlap; X leaves it on the road.' : '');
  }

  // The nearest market that deals with Otto yet, and whether the truck is inside it.
  _nearestMarket(p = this.player.position) {
    let best = null, bd = Infinity;
    const chapter = this.dredge.data.chapter || 0;
    for (const t of CONFIG.dredge.towns) {
      if (!townOpen(t, chapter)) continue;
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      if (d < bd) { bd = d; best = t; }
    }
    return { town: best, dist: bd, inside: best && bd < best.radius };
  }

  // Only the market nearest the camera shows its marker, and only within range: each costs
  // four draw calls, so however many towns there are it's four at most (the radar always
  // shows every market).
  // ---------- Dawn ----------
  _tally() {
    const st = this.dredge.data.stats;
    return { earned: st.earned || 0, contracts: st.contracts || 0, salvaged: st.salvaged || 0, brews: st.brews || 0 };
  }

  // ---------- The law ----------
  _night(h = this.env.hour) { const [a, b] = CONFIG.dredge.police.checkpoint.hours; return h >= a || h < b; }

  // Crates of shine aboard (what the Bureau is after).
  _contraband() {
    let n = 0;
    for (const p of this.trunk.pieces.values()) if (KINDS[p.kind].brewed) n++;
    return n;
  }

  // Headlamps off at night: agents see you from much closer, and you see much less.
  toggleLights() {
    this.lightsOff = !this.lightsOff;
    this._applyPerks();
    this.hud.toast(this.lightsOff ? 'Lights off: harder to spot, harder to see' : 'Lights on', '', 1600);
    $('lights').classList.toggle('hidden', !this.lightsOff);
  }

  // The heat pill: stars, and the bust meter filling while an agent has you pinned.
  _updateHeat() {
    const pol = this.police, el = $('heat'), t = pol.tier;
    el.classList.toggle('hidden', t === 0 && pol.bust < 0.01);
    el.querySelector('b').textContent = `${'★'.repeat(t)}${'☆'.repeat(CONFIG.dredge.police.max - t)}`;
    el.querySelector('i').style.width = `${Math.round(pol.bust * 100)}%`;
    el.classList.toggle('bad', pol.bust > 0.01);
    this.audio.setSiren?.(t > 0 ? Math.max(0.15, 1 - pol.chaseDistance() / 150) : 0);
  }

  // What the agents did. Returns true when the step should stop (a bust).
  _onPolice(e) {
    const P = CONFIG.dredge.police;
    if (e.type === 'spotted') { this.hud.toast('Spotted! A Bureau car has seen the shine.', 'red', 3000); this.dredge.data.stats.spotted = (this.dredge.data.stats.spotted || 0) + 1; }
    else if (e.type === 'tier' && e.up && e.tier >= 2) this.hud.toast(e.tier >= P.max ? 'Every car in the county is after you!' : 'They’ve radioed ahead: watch for a roadblock.', 'red', 3500);
    else if (e.type === 'tier' && !e.up) this.hud.toast('Fewer of them now. Keep out of sight.', '', 2500);
    else if (e.type === 'clear') { this.hud.toast('You lost them. The heat’s off.', 'gold', 3000); this.dredge.data.stats.escapes = (this.dredge.data.stats.escapes || 0) + 1; if (this._ambushOn) this._escaped(); }
    else if (e.type === 'roadblock' && this.dredge.data.tools.policeband) this.hud.toast(`Police band: a roadblock going up near ${this._landmark(e.x, e.z)}`, 'red', 3500);
    else if (e.type === 'ran') this.hud.toast('You ran the checkpoint! They’re coming.', 'red', 3500);
    else if (e.type === 'search') return this._searched();
    else if (e.type === 'bust') { this._bust('The Bureau boxed you in.'); return true; }
    this._updateObjective();
    return false;
  }

  // Stopped at the checkpoint: the agents look over the trunk. The false bottom hides a few
  // crates; any more and it's a bust.
  _searched() {
    const n = this._contraband(), hidden = this.perks.hidden;
    if (n > hidden) { this._bust('The checkpoint searched the truck and found the shine.'); return true; }
    this.hud.toast(n ? 'They poke around the bed and find nothing. “Drive on.”' : '“Evening. Drive on.”', 'gold', 3000);
    return false;
  }

  // Busted: the shine is taken, a fine paid, and Otto wakes at the barn.
  _bust(how) {
    const P = CONFIG.dredge.police, d = this.dredge.data, C = CONFIG.dredge.contracts;
    // The fine: a share of the cash, between fineMin and fineMax. Out in the county, a Sheriff
    // who trusts Otto makes it go away, for a price.
    const fine = Math.min(d.cash, Math.max(P.fineMin, Math.min(P.fineMax, Math.round(d.cash * P.fine))));
    const bribe = Math.round(Math.max(P.fineMin, Math.min(P.fineMax, d.cash * P.fine)) * C.bribe);
    this._escaped();
    const offloaded = this._passengerOff();          // a passenger goes back to wait (and the run can be tried again)
    if (offloaded) this.hud.toast(`${CAST[offloaded.passenger].name} has had enough: he’s gone back to ${offloaded.place} to wait.`, '', 4000);
    if (this.world.inCounty(this.player.position) && d.flags.bribery && trustLevel(d.trust.sheriff) >= C.bribeAt && d.cash >= bribe) {
      d.cash -= bribe;
      d.stats.bribes = (d.stats.bribes || 0) + 1;
      d.ledger.unshift({ t: Date.now(), text: 'Sheriff Hale made a bust go away', amount: -bribe });
      d.ledger.length = Math.min(d.ledger.length, 40);
      this.police.reset();
      this.audio.setSiren?.(0);
      this.dredge.save();
      this.hud.setCash(this.dredge.cash, true);
      this._updateHeat();
      this._updateObjective();
      this.lastBust = { taken: 0, fine: 0, bribe };
      if (this.state !== STATE.PLAYING) { this.hud.toast(`Sheriff Hale made it go away: ${money(bribe)}.`, 'gold', 5000); return; }
      this.pause({ showMenu: false });
      playDialog(this.ui, [['sheriff', 'Evening, boys. This one’s mine; county business. I’ll take it from here.'], ['narrator', `The Bureau men drive off grumbling. Sheriff Hale’s price for the favour: ${money(bribe)}.`]], { reducedMotion: !!this.settings.reducedMotion })
        .then(() => { if (this.state === STATE.PAUSED && !this.ui.anyOpen) this.resume(); });
      return;
    }
    let taken = 0;
    for (const p of [...this.trunk.pieces.values()]) if (KINDS[p.kind].brewed) { this.trunk.remove(p.id); taken++; }
    d.cash -= fine;
    d.stats.busts = (d.stats.busts || 0) + 1;
    d.ledger.unshift({ t: Date.now(), text: `Busted: ${taken} crate${taken === 1 ? '' : 's'} of shine taken, fined`, amount: -fine });
    d.ledger.length = Math.min(d.ledger.length, 40);
    this.dredge.saveTrunk(this.trunk);
    this.police.reset();
    this.audio.setSiren?.(0);
    const h = this.world.home;
    this.player.place(h.stopX, h.stopZ + 14, Math.PI);
    this._barnLeft = false;                          // waking there doesn't open the barn
    this.chase.snap(this.player);
    this.dredge.save();
    this.hud.setCash(this.dredge.cash, true);
    this._updateTrunkPill();
    this._updateHeat();
    this._updateObjective();
    const text = `${how} ${taken ? `They took ${taken} crate${taken === 1 ? '' : 's'} of shine` : 'They found nothing to take'} and fined you ${money(fine)}. You wake at the barn.`;
    this.lastBust = { taken, fine };
    if (this.state !== STATE.PLAYING) { this.hud.toast(text, 'red', 5000); return; }
    this.pause({ showMenu: false });
    playDialog(this.ui, [['narrator', text], ['otto', 'Next time, the back roads. And the lights off.']], { reducedMotion: !!this.settings.reducedMotion })
      .then(() => { if (this.state === STATE.PAUSED && !this.ui.anyOpen) this.resume(); });
  }

  // Six in the morning: the night is over. Its take on a card, the lamps the truck knocked
  // down stood back up, the sites refreshed, and the day saved.
  _dawn() {
    const day = dayOf(this.dredge.market), now = this._tally(), was = this._nightFrom || now;
    this._nightFrom = now;
    this.world.standLamps();
    this.salvage.refresh(day);
    this.dredge.save();
    const earned = now.earned - was.earned, jobs = now.contracts - was.contracts, sites = now.salvaged - was.salvaged;
    const n = (k, one) => `${k} ${one}${k === 1 ? '' : 's'}`;
    const take = `Dawn. Since the last one: ${money(earned)} earned, ${n(jobs, 'job')} delivered, ${n(sites, 'site')} worked.`;
    const otto = earned > 0 ? 'A night’s work. Sleep, then do it again.' : 'Nothing to show for the night. Tonight, then.';
    this.dawns = (this.dawns || 0) + 1;
    if (this.state !== STATE.PLAYING) { this.hud.toast(take, 'gold', 4000); return; }
    this.pause({ showMenu: false });
    playDialog(this.ui, [['narrator', take], ['otto', otto]], { reducedMotion: !!this.settings.reducedMotion })
      .then(() => { if (this.state === STATE.PAUSED && !this.ui.anyOpen) this.resume(); });
  }

  // ---------- Salvage ----------
  // Stop at a site to work it (if it can be: not picked clean, not a night site by day).
  _checkSalvage() {
    const s = this.salvage.at(this.player.position);
    if (!s) { this._siteLeft = true; this._siteWhy = ''; return; }
    if (!this._siteLeft || Math.abs(this.player.speed) > CONFIG.dredge.market.stopSpeed * 2) return;
    this._siteLeft = false;
    const st = this.salvage.status(s, dayOf(this.dredge.market), this.env.hour);
    if (st === 'empty') { this.hud.toast(`The ${s.name.toLowerCase()} has been picked clean. Try again in a day or two.`, '', 3000); return; }
    // Too early: said once, and it opens as soon as its hours come (waiting there).
    if (st === 'day' || st === 'closed') {
      const why = st === 'day' ? `Too many eyes about by day. Come back to the ${s.name.toLowerCase()} after dark.` : CONFIG.dredge.salvage.kinds[s.kind].wait || 'Not now. Come back later.';
      if (this._siteWhy !== why) this.hud.toast(why, '', 3500);
      this._siteWhy = why;
      this._siteLeft = true;
      return;
    }
    this.openSalvage(s);
  }

  openSalvage(site) {
    if (this.state === STATE.PLAYING) this.pause({ showMenu: false });
    if (this.state !== STATE.PAUSED) return;
    const game = CONFIG.dredge.salvage.kinds[site.kind].game;
    if (game === 'none') { this._storySalvaged(site, 1); return; }
    if (game === 'pay' || game === 'give') { this._storyDeal(site, game); return; }
    if (game === 'lager') { this.openBrewery(); return; }
    this.salvageScreen = showSalvage(this.ui, { site, onDone: (sc) => this._onSalvaged(site, sc) });
  }

  // Gus's cellar: a batch of Highlandtown Lager at the brewery (its makings from the trunk and
  // the stash), the crates to the stash at the barn. Short of the makings, it says what's
  // wanted.
  openBrewery() {
    const d = this.dredge.data, r = RECIPES.find((x) => x.id === 'lager'), lacks = missing(r, onHand(this.trunk, d.stash));
    if (lacks.length) {
      this.hud.toast(`Gus’s cellar: a batch wants ${wantsText(r.needs)}. You’re short of ${wantsText(Object.fromEntries(lacks))}.`, '', 4000);
      if (!this.ui.anyOpen) this.resume();
      return;
    }
    consume(r, this.trunk, d.stash);
    this.dredge.saveTrunk(this.trunk);
    this._updateTrunkPill();
    this.breweryScreen = showBrewery(this.ui, {
      onDone: (q, crates, grade) => {
        blend(d.market.blend, 'lager', onHand(this.trunk, d.stash).lager || 0, crates, q, false);
        if (q > (d.best.lager || 0)) d.best.lager = q;
        d.stash.lager = (d.stash.lager || 0) + crates;
        d.stats.brews++;
        d.ledger.unshift({ t: Date.now(), text: `Brewed ${crates} crates of Highlandtown Lager in Gus’s cellar (grade ${grade}, ${Math.round(q * 100)}%)`, amount: 0 });
        d.ledger.length = Math.min(d.ledger.length, 40);
        this.dredge.save();
        this.breweryScreen = null;
        this.audio.cash?.();
        this.hud.toast(`${crates} crates of Highlandtown Lager, grade ${grade}: they’re in the stash at the barn.`, 'gold', 4000);
        if (!this.ui.anyOpen) this.resume();
      },
    });
  }

  // A story stop that's a deal, not a mini-game: Sheriff Hale's report for a price, or the
  // letters to the Sun (one of the endings). A confirm, then on.
  async _storyDeal(site, game) {
    const d = this.dredge.data;
    if (game === 'give') {
      if (await this.ui.confirm('THE PAPER?', 'Give the Jockey’s letters to the Baltimore Sun? The Alliance falls, and Otto stays a bootlegger. This ends the story; the roads stay open after it.', 'TAKE THEM IN')) { this._end('paper'); return; }
    } else {
      const price = CONFIG.dredge.story.report;
      if (d.cash < price) this.hud.toast(`Sheriff Hale wants ${money(price)} for his report. Come back with it.`, '', 3500);
      else if (await this.ui.confirm('THE REPORT?', `Pay Sheriff Hale ${money(price)} for his report on the Braun & Sons fire?`, `PAY ${money(price)}`)) {
        d.cash -= price;
        d.ledger.unshift({ t: Date.now(), text: 'Sheriff Hale’s report on the fire', amount: -price });
        d.ledger.length = Math.min(d.ledger.length, 40);
        this.hud.setCash(this.dredge.cash, true);
        this.hud.cashPop(`−${money(price)}`);
        this._storySalvaged(site, 1);
        return;
      }
    }
    if (this.state === STATE.PAUSED && !this.ui.anyOpen) this.resume();
  }

  // A site worked: it's empty for a day or two, and what it gave up goes into the trunk,
  // one piece at a time.
  _onSalvaged(site, sc) {
    const day = dayOf(this.dredge.market), d = this.dredge.data;
    if (site.story) { this._storySalvaged(site, sc); return; }
    this.salvage.worked(site, day);
    this.salvage.refresh(day);
    d.stats.salvaged = (d.stats.salvaged || 0) + 1;
    this.dredge.save();
    const pieces = payout(site.kind, sc), rare = rareFind(site, day, sc);
    if (rare) {
      // A rare find on top: first up to pack, with word of where it pays.
      pieces.unshift(rare);
      d.stats.rares = (d.stats.rares || 0) + 1;
      const k = KINDS[rare], pays = CONFIG.dredge.towns.find((t) => t.id === k.paysAt);
      d.ledger.unshift({ t: Date.now(), text: `A rare find: the ${k.name.toLowerCase()}, at the ${site.name.toLowerCase()}`, amount: 0 });
      d.ledger.length = Math.min(d.ledger.length, 40);
      this.audio.fanfare?.('rare');
      this.dredge.save();
      this.hud.toast(`A rare find: the ${k.name.toLowerCase()}! It pays best in ${pays.town}.`, 'gold', 4500);
    }
    if (!pieces.length) {
      this.hud.toast(`Nothing worth taking from the ${site.name.toLowerCase()}.`, '', 2500);
      if (!this.ui.anyOpen) this.resume();
      return;
    }
    const counts = {};
    for (const k of pieces) counts[k] = (counts[k] || 0) + 1;
    if (!rare) this.hud.toast(`From the ${site.name.toLowerCase()}: ${wantsText(counts)}`, 'gold', 3000);
    this.audio.pickup?.();
    this._pending = pieces.slice(1);
    this.openTrunk(pieces[0]);
  }

  // A story site worked (chapters.js): what its step `gives` goes into the trunk one piece
  // at a time (Father's coil, Delaney's crates, which join the blend on hand), it `sets` a
  // flag or `finds` the chapter's clue, and at Warren it springs the trap. A miss can be
  // tried again. The chapter moves on at the next story check (main._chapters).
  _storySalvaged(site, sc) {
    const d = this.dredge.data, lost = this._lost(), job = lost?.site === site.story ? lost : current(d).step;
    if (sc <= 0.01 || !job || (job !== lost && job.site !== site.story)) {
      this.hud.toast(`Nothing found this time. Try the ${site.name.toLowerCase()} again.`, '', 3000);
      if (!this.ui.anyOpen) this.resume();
      return;
    }
    d.stats.salvaged = (d.stats.salvaged || 0) + 1;
    if (job.sets) d.flags[job.sets] = true;
    if (job.finds) d.clues[job.finds] = true;
    if (job.ambush) d.flags.ambush = true;
    if (job.gives) {
      const kind = job.gives[0];
      if (KINDS[kind].brewed) blend(d.market.blend, kind, onHand(this.trunk, d.stash)[kind] || 0, job.gives.length, CONFIG.dredge.story.consignment.q, false);
      this.dredge.save();
      this.hud.toast(job.got || `Found: ${wantsText({ [kind]: job.gives.length })}`, 'gold', 3000);
      this.audio.pickup?.();
      this._pending = job.gives.slice(1);
      this.openTrunk(kind);
      return;
    }
    this.dredge.save();
    this.audio.fanfare?.('rare');
    this.hud.toast('Found something. A clue for the notebook.', 'gold', 3000);
    if (!this.ui.anyOpen) this.resume();
  }

  // The SALVAGE marker stands at the nearest site that can be worked, within 220 m.
  _updateSiteMarker() {
    const s = this.salvage.nearest(this.player.position, dayOf(this.dredge.market), this.env.hour, 220), m = this.siteMarker;
    m.userData.off = !s;
    if (s) m.position.set(s.x, 0, s.z);
  }

  _updateMarkers() {
    this._updateSiteMarker();
    const cam = this.camera.position, range = CONFIG.dredge.market.markerRange, chapter = this.dredge.data.chapter || 0;
    // A town that doesn't deal with Otto yet shows no marker.
    CONFIG.dredge.towns.forEach((t, i) => { this.marketMarkers[i].userData.off = !townOpen(t, chapter); });
    // One marker on screen (the draw budget): the nearest market or job; the salvage sign only
    // when neither is in range (the radar shows every site).
    let near = null, nd = range;
    for (const m of this.markers) {
      if (m.userData.off || m === this.siteMarker) continue;
      const d = Math.hypot(m.position.x - cam.x, m.position.z - cam.z);
      if (d < nd) { nd = d; near = m; }
    }
    if (!near && !this.siteMarker.userData.off) near = this.siteMarker;
    for (const m of this.markers) {
      m.visible = m === near;
      animateMarker(m, this.time, cam);
    }
  }

  // Where the truck is: a town, or the valley between. Arriving somewhere new shows its name.
  _placeName(p = this.player.position) {
    if (!this.world.inCounty(p)) return 'Baltimore';
    if (this.world.regionOf(p.x) === 'loch') return 'Loch Raven';
    const t = CONFIG.dredge.towns.find((x) => x.area && Math.hypot(p.x - x.x, p.z - x.z) < x.area);
    return t ? t.town : 'Green Spring Valley';
  }

  _checkPlace() {
    const place = this._placeName();
    if (place !== this.place) {
      if (this.place && !this.police.tier) this.hud.toast(place, 'gold', 2200);   // not over a chase's news
      this.place = place;
      // The first valley town reached (the Jockey's beat); Loch Raven (chapter 5's first step).
      if (place !== 'Baltimore' && place !== 'Green Spring Valley') this.dredge.data.flags.valley = true;
      if (place === 'Loch Raven') this.dredge.data.flags.loch = true;
    }
  }

  // Stop in a market to open it; it won't open again until you've driven out.
  _checkMarket() {
    this._checkClosed();
    const { town, inside } = this._nearestMarket();
    if (!inside) { this._marketLeft = true; return; }
    if (!this._marketLeft || Math.abs(this.player.speed) > CONFIG.dredge.market.stopSpeed) return;
    this._marketLeft = false;
    this.openMarket(town);
  }

  // A market that doesn't deal with Otto yet (a town's `chapter`): stopping there says when it
  // will, once a visit.
  _checkClosed() {
    const p = this.player.position, chapter = this.dredge.data.chapter || 0;
    const t = CONFIG.dredge.towns.find((x) => !townOpen(x, chapter) && Math.hypot(x.x - p.x, x.z - p.z) < x.radius);
    if (!t) { this._closedLeft = true; return; }
    if (!this._closedLeft || Math.abs(this.player.speed) > CONFIG.dredge.market.stopSpeed) return;
    this._closedLeft = false;
    this.hud.toast(`The ${t.name} doesn’t deal with strangers. The story brings you here in Chapter ${t.chapter + 1}.`, '', 4000);
  }

  // Stop in the barn's yard to open it; like a market, it waits until you've driven out.
  _checkBarn() {
    const h = this.world.home, p = this.player.position;
    if (Math.hypot(p.x - h.stopX, p.z - h.stopZ) > CONFIG.dredge.barn.radius) { this._barnLeft = true; return; }
    if (!this._barnLeft || Math.abs(this.player.speed) > CONFIG.dredge.market.stopSpeed) return;
    this._barnLeft = false;
    this.openBarn();
  }

  // Otto's barn: the stash and the garage.
  openBarn() {
    if (this.state === STATE.PLAYING) this.pause({ showMenu: false });
    if (this.state !== STATE.PAUSED) return;
    const d = this.dredge.data, cap = CONFIG.dredge.barn.stashCells;
    const changed = () => { this.dredge.saveTrunk(this.trunk); this._updateTrunkPill(); };
    const store = (kind) => {
      const p = [...this.trunk.pieces.values()].find((q) => q.kind === kind);
      if (!p || this.dredge.stashCells() + p.cells.length > cap) return false;
      this.trunk.remove(p.id);
      d.stash[kind] = (d.stash[kind] || 0) + 1;
      return true;
    };
    this._barnRender = showBarn(this.ui, {
      career: this.dredge, getTrunk: () => this.trunk, cap, jobs: this._jobs(),
      // A copper coil for the still: from the stash first, then the trunk.
      onInstall: () => {
        if ((d.still || 0) >= CONFIG.dredge.brew.maxLevel) return;
        if (d.stash.coil) { if (--d.stash.coil <= 0) delete d.stash.coil; } else {
          const p = [...this.trunk.pieces.values()].find((q) => q.kind === 'coil');
          if (!p) return;
          this.trunk.remove(p.id);
        }
        d.still = (d.still || 0) + 1;
        changed();
        this.hud.toast(d.still === 1 ? 'The still is ready to run.' : `The still is at level ${d.still}.`, 'gold', 2500);
      },
      // A batch: the ingredients go in, the still screen runs it, the crates go to the stash.
      onBrew: (recipe) => {
        consume(recipe, this.trunk, d.stash);
        changed();
        this.stillScreen = showStill(this.ui, {
          recipe, level: d.still,
          onDone: (q, crates, { grade, bad, poured }) => {
            // Into the blend on hand (the crates in the stash and the trunk), then the stash.
            const had = onHand(this.trunk, d.stash)[recipe.id] || 0;
            if (crates) blend(d.market.blend, recipe.id, had, crates, q, bad);
            if (!bad && q > (d.best[recipe.id] || 0)) d.best[recipe.id] = q;
            d.stash[recipe.id] = (d.stash[recipe.id] || 0) + crates;
            d.stats.brews++;
            const text = poured ? `Poured out a bad batch of ${recipe.name}`
              : `Brewed ${crates} crate${crates === 1 ? '' : 's'} of ${recipe.name} (grade ${grade}${bad ? ', bad' : ''}, ${Math.round(q * 100)}%)`;
            d.ledger.unshift({ t: Date.now(), text, amount: 0 });
            d.ledger.length = Math.min(d.ledger.length, 40);
            this.dredge.save();
            this.stillScreen = null;
            this.audio.cash?.();
            this._barnRender?.();
          },
        });
      },
      onStore: (kind) => { if (store(kind)) changed(); },
      onStoreAll: () => { for (const p of [...this.trunk.pieces.values()]) store(p.kind); changed(); },
      onTake: (kind) => {
        const spot = d.stash[kind] && this.trunk.findSpot(kind);
        if (!spot) return;
        this.trunk.place(kind, spot.x, spot.y, spot.rot);
        if (--d.stash[kind] <= 0) delete d.stash[kind];
        changed();
      },
      onRepair: () => {
        const cost = this.dredge.repairCost();
        if (!this.dredge.repair()) return;
        this._updateWearPill();
        this.hud.setCash(this.dredge.cash, true);
        this.hud.cashPop(`−${money(cost)}`);
        this.audio.cash?.();
      },
      sleeps: () => this._sleeps(),
      onSleep: (id) => this.sleep(id),
      onTrunk: () => this.trunkScreen.open(this.trunk),
      onBack: () => { this.ui.close('barn'); this._barnRender = null; if (!this.ui.anyOpen) this.resume(); },
    });
  }

  // Sleeping at the barn, to skip the waiting: by day, till dusk (when the night's work
  // starts); in the freight's steps, till it stands at Glyndon. [{ id, name, text, to }]
  _sleeps() {
    const h = this.env.hour, dusk = CONFIG.dredge.police.checkpoint.hours[0], W = CONFIG.dredge.story.freight.window, out = [];
    const { step } = current(this.dredge.data);
    if (h >= 6 && h < dusk - 0.25) out.push({ id: 'dusk', name: 'Sleep till dusk', text: `Till ${clockAt(dusk)}, when the night’s work starts.`, to: dusk });
    if ((step?.order?.window || step?.window) && h >= 6 && h < W[0] - 0.25) out.push({ id: 'freight', name: 'Sleep till the freight', text: `Till ${clockAt(W[0])}, when the midnight freight stands at Glyndon.`, to: W[0] });
    return out;
  }

  // Sleep: the save's clock and the hour move on together (orders due before then go late,
  // after a warning). Returns whether Otto slept.
  async sleep(id) {
    const nap = this._sleeps().find((x) => x.id === id), M = this.dredge.market;
    if (!nap) return false;
    const hours = nap.to - this.env.hour, late = this.dredge.data.orders.filter((o) => o.due != null && o.due < M.clock + hours);
    if (late.length && !(await this.ui.confirm('SLEEP?', `${late.length === 1 ? 'An order' : `${late.length} orders`} in the book will be late by then (${late.map((o) => o.name).join(', ')}). Sleep anyway?`, 'SLEEP'))) return false;
    passTime(M, hours);
    this.env.hour = nap.to;
    this.env.update(0, this.camera.position);
    this.dredge.data.stats.slept = (this.dredge.data.stats.slept || 0) + hours;
    this.dredge.save();
    this.hud.setClock(this._clockText());
    this.hud.toast(`Otto sleeps till ${this.env.clock}.`, '', 2500);
    return true;
  }

  // Hitting a car, van or cart: a crash like a wall's (the impact is picked up with the
  // player's), and a hard one throws a piece out of the trunk onto the road.
  _onTraffic(e) {
    if (e.impact > 6) this._crash(e.impact, e.x, e.z);
    if (e.impact < CONFIG.dredge.traffic.spill || !this.trunk.count) return;
    const pieces = [...this.trunk.pieces.values()];
    const p = pieces[Math.floor(Math.random() * pieces.length)];
    const kind = this.loot.kindIndex(p.kind);
    const back = this.perks.pickupRadius + 4;               // past the magnet's reach, so it isn't picked straight back up
    if (!this.loot.drop(kind, e.x - this.player.forwardX * back, e.z - this.player.forwardZ * back)) return;
    this.trunk.remove(p.id);
    this.dredge.saveTrunk(this.trunk);
    this._updateTrunkPill();
    this.hud.toast(`The ${KINDS[p.kind].name.toLowerCase()} bounced out of the trunk!`, '', 2500);
  }

  // A crash (a wall, a car): a thud, sparks and a shake; the hard ones throw debris, hold
  // the action for a beat (hit-stop) and wear the truck.
  _crash(impact, x, z) {
    if (this.time - this._lastRam <= 0.3) return;
    this._lastRam = this.time;
    this.audio.crash(Math.min(0.6, impact / 25));
    this.chase.shake(Math.min(0.5, impact / 30));
    this.feel.hit(impact / 20);
    this.particles.sparks(x, z, impact / 20);
    this._impact(impact / 20, x, z);
    this._wear(impact);
    this._breakage(impact);
    this._passengerKnock(impact);
  }

  // A hard knock can break what's fragile aboard: jars, bottles, every crate of shine. A
  // fragile order's load (Delaney's crates) loses a crate for certain.
  _breakage(impact) {
    const K = CONFIG.dredge.breakage;
    if (impact <= K.from || !this.trunk.count) return;
    const chance = Math.min(K.max, (impact - K.from) * K.perMs) * this.perks.padding;
    const broke = [], fragile = this.dredge.data.orders.find((o) => o.fragile);
    const jumped = fragile && [...this.trunk.pieces.values()].find((p) => fragile.wants[p.kind]);
    if (jumped) { this.trunk.remove(jumped.id); broke.push(KINDS[jumped.kind].name.toLowerCase()); }
    for (const p of [...this.trunk.pieces.values()]) {
      if (!(KINDS[p.kind].brewed || K.kinds.includes(p.kind)) || this._breakRng() >= chance) continue;
      this.trunk.remove(p.id);
      broke.push(KINDS[p.kind].name.toLowerCase());
    }
    if (!broke.length) return;
    this.dredge.data.stats.broken = (this.dredge.data.stats.broken || 0) + broke.length;
    this.dredge.saveTrunk(this.trunk);
    this._updateTrunkPill();
    this.audio.glass?.();
    this.hud.toast(`${jumped ? 'Delaney’s crates jump in the bed. ' : ''}Glass breaking: ${broke.length === 1 ? `a ${broke[0]}` : `${broke.length} pieces (${[...new Set(broke)].join(', ')})`} smashed in the crash.${jumped ? ' Make it up with your own.' : ''}`, 'red', 4000);
  }

  // A hard knock wears the truck (it slows until mended at the barn).
  _wear(impact) {
    const W = CONFIG.dredge.wear, d = this.dredge.data;
    if (impact <= W.from || d.wear >= 1) return;
    const before = d.wear;
    d.wear = Math.min(1, d.wear + (impact - W.from) * W.perImpact * this.perks.wear);
    this._updateWearPill();
    if (before < W.warnAt && d.wear >= W.warnAt) this.hud.toast('The truck’s knocking. Get it to the barn for repairs.', '', 3500);
  }

  _updateWearPill() {
    const w = this.dredge.data.wear, el = $('wear');
    el.classList.toggle('hidden', w < 0.05);
    el.classList.toggle('bad', w >= CONFIG.dredge.wear.warnAt);
    el.textContent = `TRUCK ${Math.round((1 - w) * 100)}%`;
  }

  // ---------- Trust and tools ----------
  // A contact who trusts Otto enough gives him something, once (CONFIG.dredge.gifts): a
  // recipe or an ability. Returns the news lines (for the handoff card); `say` toasts them too.
  _trustGifts({ say = false } = {}) {
    const d = this.dredge.data, news = [];
    for (const [who, G] of Object.entries(CONFIG.dredge.gifts)) {
      if (d.flags[`gift:${who}`] || trustLevel(d.trust[who]) < G.at) continue;
      d.flags[`gift:${who}`] = true;
      if (G.learn) d.flags[`learned:${G.learn}`] = true;
      if (G.tool) d.tools[G.tool] = true;
      const what = G.learn ? `${CAST[who].name} taught you ${KINDS[G.learn].name}.` : `${CAST[who].name} gave you ${CONFIG.dredge.abilities[G.tool].name} (${CONFIG.dredge.abilities[G.tool].key}, or the chip by the speedometer).`;
      news.push(what);
      if (say) this.hud.toast(what, 'gold', 5000);
    }
    if (news.length) { this.audio.fanfare?.('rank'); this.dredge.save(); this._buildAbilities(); }
    return news;
  }

  // Sweet Talk, if it's waiting: the bonus on a sale or a job (and it's used up).
  _sweetTalk(amount) {
    if (!this._sweet) return 0;
    this._sweet = false;
    this._updateAbilities();
    return Math.round(amount * CONFIG.dredge.abilities.sweet.bonus);
  }

  useAbility(id) {
    const A = CONFIG.dredge.abilities[id], s = this.abil[id], d = this.dredge.data;
    if (this.state !== STATE.PLAYING) return false;
    if (!d.tools[id]) return false;                    // not earned yet (a contact's gift)
    if (this.time < s.ready || (id === 'sweet' && this._sweet)) { this.hud.toast(this._sweet && id === 'sweet' ? 'Sweet Talk is waiting for the next sale' : `${A.name} is ready in ${Math.ceil(s.ready - this.time)} s`, '', 1800); return false; }
    s.ready = this.time + A.cooldown;
    if (id === 'leadfoot') { s.until = this.time + A.seconds; this._leadFoot = true; this._applyPerks(); this.hud.toast('Lead Foot!', 'gold', 1500); }
    if (id === 'sweet') { this._sweet = true; this.hud.toast('Sweet Talk: the next sale or job pays 20% more', 'gold', 2500); }
    this._updateAbilities();
    return true;
  }

  // Lead Foot runs out; the HUD chips count down.
  _tickAbilities() {
    if (this._leadFoot && this.time > this.abil.leadfoot.until) { this._leadFoot = false; this._applyPerks(); }
  }

  // The HUD's ability chips: one per ability earned (tap or press its key).
  _buildAbilities() {
    const box = $('abilities'), tools = this.dredge.data.tools || {};
    box.textContent = '';
    for (const id of Object.keys(CONFIG.dredge.abilities)) {
      if (!tools[id]) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ability';
      b.dataset.id = id;
      b.addEventListener('click', () => this.useAbility(id));
      box.append(b);
    }
    this._updateAbilities();
  }

  _updateAbilities() {
    for (const b of $('abilities').children) {
      const id = b.dataset.id, A = CONFIG.dredge.abilities[id], s = this.abil[id];
      const active = (id === 'sweet' && this._sweet) || this.time < s.until, wait = Math.ceil(s.ready - this.time);
      const state = active ? 'on' : wait > 0 ? `${wait}s` : 'ready';
      const text = `${A.key} · ${A.name} · ${state}`;
      if (b.textContent !== text) b.textContent = text;
      b.classList.toggle('on', active);
      b.classList.toggle('ready', !active && wait <= 0);
    }
  }

  // One of the two endings: buy back the brewery deed at Lexington Market, once the story's
  // last chapter is done (free for a save that bought it before the endings came).
  _deed(town) {
    const D = CONFIG.dredge.deed, d = this.dredge.data;
    if (town.id !== D.town || !choiceOpen(d)) return null;
    const cost = d.flags.deed ? 0 : D.cost;
    return {
      cost,
      onBuy: async () => {
        if (d.cash < cost) return;
        if (!(await this.ui.confirm('BUY THE DEED?', `Pay ${money(cost)} for the Braun & Sons deed and go legit? The letters stay in Father’s strongbox. This ends the story; the roads stay open after it.`, 'BUY IT BACK'))) return;
        d.cash -= cost;
        this.hud.setCash(this.dredge.cash, true);
        if (cost) this.hud.cashPop(`−${money(cost)}`);
        this._end('deed', cost);
      },
    };
  }

  // An ending (chapters.js ENDINGS): saved, its cards played, then the ending screen. The
  // roads stay open after it (KEEP DRIVING), or it's back to the title screen.
  async _end(id, cost = 0) {
    const d = this.dredge.data, E = ENDINGS[id];
    if (d.ending) return;
    d.ending = id;
    if (id === 'deed') d.flags.deed = true;
    d.ledger.unshift({ t: Date.now(), text: E.ledger, amount: -cost });
    d.ledger.length = Math.min(d.ledger.length, 40);
    this.dredge.save();
    this.salvage.story = this._openSites();
    this.salvage.refresh(dayOf(this.dredge.market));
    this.audio.fanfare?.('deed');
    this.ui.closeAll();
    this._marketRender = null;
    if (this.state === STATE.PLAYING) this.pause({ showMenu: false });
    if (OPTIONS.story) await playDialog(this.ui, E.lines, { reducedMotion: !!this.settings.reducedMotion });
    this._updateObjective();
    this._updateIntroBest();
    showEnding(this.ui, {
      ending: E, career: this.dredge, days: dayOf(this.dredge.market) + 1,
      onKeep: () => { this.ui.close('ending'); if (this.state === STATE.PAUSED && !this.ui.anyOpen) this.resume(); },
      onTitle: () => this.quitToTitle(),
    });
  }

  // ---------- Orders ----------
  // The board the markets, speakeasies and barn show: the order book and today's offers.
  _jobs() {
    const d = this.dredge.data, day = dayOf(this.dredge.market), h = this.world.home;
    return {
      active: () => d.orders,
      full: () => d.orders.filter((o) => !o.story).length >= CONFIG.dredge.contracts.book,
      offers: () => offersFor(day, this.contactList, {
        brewing: (d.still || 0) > 0 || d.stats.brews > 0, chapter: d.chapter || 0, trust: d.trust, home: { x: h.stopX, z: h.stopZ }, learned: d.flags,
        focus: current(d).step?.who, focusN: d.delivered[current(d).step?.who] || 0, exclude: d.flags.betrayed ? ['jockey'] : [],
      }).filter((o) => !d.taken[o.id]),
      hoursLeft: (o) => (o.due == null ? null : o.due - this.dredge.market.clock),
      trust: (who) => trustLevel(d.trust[who]),
      blends: () => this.dredge.market.blend,
      onAccept: (o) => this.takeContract(o),
      onAbandon: (o) => this.dropContract(o),
    };
  }

  takeContract(offer) {
    const d = this.dredge.data, clock = this.dredge.market.clock;
    if (d.orders.filter((o) => !o.story).length >= CONFIG.dredge.contracts.book || d.orders.some((o) => o.id === offer.id)) return false;
    // Shine is handed over after dark, by the next dawn; goods within their hours.
    d.orders.push({ ...offer, due: offer.night ? nextDawn(clock) : clock + offer.hours });
    // Taken offers don't come back; only today's and yesterday's are worth remembering.
    const day = dayOf(this.dredge.market);
    for (const id of Object.keys(d.taken)) if (Number(id.split('-')[0]) < day - 1) delete d.taken[id];
    d.taken[offer.id] = true;
    this.dredge.save();
    this._updateJobMarker();
    this.hud.toast(`Order taken: ${wantsText(offer.wants)}${offer.grade ? ` (grade ${offer.grade}+)` : ''} for ${offer.name}${offer.place ? `, ${offer.place}` : ''}${offer.night ? ' · after dark, by dawn' : ''}`, 'gold', 3500);
    return true;
  }

  // Dropping an order costs a little trust; missing its deadline more. (A story order can't
  // be dropped: it's the chapter's.)
  dropContract(order = this.dredge.data.orders.find((o) => !o.story), late = false) {
    const d = this.dredge.data;
    if (!order || order.story || !d.orders.includes(order)) return;
    d.orders.splice(d.orders.indexOf(order), 1);
    this._trust(order.who, late ? -2 : -1);
    this.dredge.save();
    this._updateJobMarker();
    this.hud.toast(late ? `Too late: ${order.name} found someone else.` : `Dropped the order for ${order.name}.`, '', 3000);
  }

  // A contact's trust moves by `delta` points; a new level says so. Returns { before, after }.
  _trust(who, delta) {
    const d = this.dredge.data, before = trustLevel(d.trust[who]);
    d.trust[who] = Math.max(0, (d.trust[who] || 0) + delta);
    const after = trustLevel(d.trust[who]);
    if (after > before) this.hud.toast(`${CAST[who]?.name || 'They'} trusts you more: ${'★'.repeat(after)}${'☆'.repeat(5 - after)}`, 'gold', 3000);
    return { before, after };
  }

  // The order the banner, the marker and the route point at: the nearest one ready to hand
  // over, else the nearest.
  _focusOrder(p = this.player.position) {
    const orders = this.dredge.data.orders, blends = this.dredge.market.blend;
    let best = null, bd = Infinity, ready = false;
    for (const o of orders) {
      const pr = progress(o, this.trunk, blends), ok = pr.ready && pr.gradeOk, dist = Math.hypot(o.x - p.x, o.z - p.z);
      if ((ok && !ready) || (ok === ready && dist < bd)) { best = o; bd = dist; ready = ok; }
    }
    return best;
  }

  _updateJobMarker() {
    const c = this._focusOrder();
    for (const [kind, m] of Object.entries(this.jobMarkers)) {
      m.userData.off = !c || c.kind !== kind;
      if (!m.userData.off) m.position.set(c.x, 0, c.z);
      else m.visible = false;
    }
  }

  // The order book: late ones lost; at a contact's door, stopped, what's ready is handed over
  // (shine only after dark, and only at the grade asked for).
  _checkContract() {
    const d = this.dredge.data;
    if (!d.orders.length) return;
    for (const o of [...d.orders]) if (o.due != null && this.dredge.market.clock > o.due) this.dropContract(o, true);
    const p = this.player.position, R = CONFIG.dredge.contracts.radius;
    const here = d.orders.filter((o) => Math.hypot(p.x - o.x, p.z - o.z) <= R && !(o.passenger && !o.aboard));
    if (!here.length) { this._jobLeft = true; this._jobWhy = ''; return; }
    if (!this._jobLeft || Math.abs(this.player.speed) > CONFIG.dredge.market.stopSpeed * 2) return;
    this._jobLeft = false;
    const done = [];
    let why = '', wait = false;
    for (const o of here) {
      const pr = progress(o, this.trunk, this.dredge.market.blend);
      if (o.window && !inWindow(this.env.hour, o.window)) { why = `${o.name}: “The freight’s not in yet. It stands here ${hoursText(o.window)}.”`; wait = true; }
      else if (o.night && !this._night()) { why = `${o.name}: “Not in daylight, Otto. Come back after dark.”`; wait = true; }
      else if (!pr.ready) why = `${o.name} is waiting on ${wantsText(o.wants)}.`;
      else if (!pr.gradeOk) why = `${o.name} wants grade ${o.grade} or better. The ${KINDS[Object.keys(o.wants)[0]].name} you’ve got is grade ${pr.grade}.`;
      else done.push(this._deliver(o, pr));
    }
    // Too early (daylight, or the freight not in): said once, and waiting at the door hands
    // it over as soon as the hour comes.
    if (!done.length) {
      if (why && why !== this._jobWhy) this.hud.toast(why, '', 3500);
      this._jobWhy = why;
      if (wait) this._jobLeft = true;
      return;
    }
    this._updateJobMarker();
    this._updateTrunkPill();
    this.hud.setCash(this.dredge.cash, true);
    const paid = done.reduce((s, x) => s + x.paid, 0);
    this.hud.cashPop(`+${money(paid)}`);
    this.audio.cash?.();
    this.hud.toast(`Delivered to ${[...new Set(done.map((x) => x.order.name))].join(' and ')}: ${money(paid)}${done.some((x) => x.bonus) ? ' (sweet-talked)' : ''}`, 'gold', 3000);
    // The news on the card: whose trust went up, and what it earned.
    const news = done.filter((x) => x.trust.after > x.trust.before).map((x) => `${x.order.name} trusts you more: ${'★'.repeat(x.trust.after)}${'☆'.repeat(5 - x.trust.after)}.`);
    news.push(...this._trustGifts());
    this._handoff(done, news);
    this.audio.chime?.();
  }

  // One order handed over: paid, standing and trust, the ledger; tainted shine blinds
  // someone and costs most of that trust. Returns what happened.
  _deliver(o, pr) {
    const d = this.dredge.data;
    handOver(o, this.trunk);
    const bonus = this._sweetTalk(o.pay), paid = o.pay + bonus;
    d.cash += paid;
    d.stats.earned += paid;
    d.stats.contracts++;
    d.delivered[o.who] = (d.delivered[o.who] || 0) + 1;
    if (o.story) d.flags[`order:${o.story}`] = true;
    d.ledger.unshift({ t: Date.now(), text: o.passenger ? `Carried ${o.name} to ${o.place}` : `Order for ${o.name}: ${wantsText(o.wants)}${o.grade ? ` (grade ${pr.grade})` : ''}`, amount: paid });
    d.ledger.length = Math.min(d.ledger.length, 40);
    d.orders.splice(d.orders.indexOf(o), 1);
    // Walt Purdy delivered: Mags O'Rourke hears of it.
    if (o.passenger) this._trust(CONFIG.dredge.story.passenger.from, 1);
    // Trust is the contacts' (the freight's guard is a story's, not a contact).
    const t = CAST[o.who]?.asks ? this._trust(o.who, pr.tainted ? -3 : 1 + (pr.grade === 'A' ? 1 : 0)) : { before: 0, after: 0 };
    if (pr.tainted) this._blinded(Object.keys(o.wants)[0], { name: o.place || o.name });
    // Trusted enough, they open up (once).
    const scene = !pr.tainted && t.after >= CONFIG.dredge.contracts.sceneAt && !d.scenes[o.who] && !!TRUSTED[o.who];
    if (scene) d.scenes[o.who] = true;
    this.dredge.saveTrunk(this.trunk);
    this.dredge.save();
    return { order: o, paid, bonus, scene, trust: t };
  }

  // The handoff: each contact comes out, says their piece (and once they trust Otto, a little
  // more), and the money changes hands; one card lists every order handed over and the news
  // (trust, and what it earned), so a delivery can't pass unnoticed. The drive waits under it.
  async _handoff(done, news = []) {
    const lines = [], said = new Set();
    for (const { order: o, scene } of done) {
      if (!CAST[o.who]) continue;
      if (!said.has(o.who)) lines.push([o.who, THANKS[o.who] || 'Much obliged.']);
      said.add(o.who);
      if (scene) lines.push([o.who, TRUSTED[o.who]]);
    }
    if (!lines.length) return;
    const what = done.map(({ order: o, paid }) => (o.passenger ? `set ${o.name} down at ${o.place}: ${money(paid)}` : `handed over ${wantsText(o.wants)} to ${o.name}${o.place ? ` at ${o.place}` : ''}: ${money(paid)}`));
    lines.push(['narrator', `${what.join('; ').replace(/^./, (ch) => ch.toUpperCase())}.${news.length ? ` ${news.join(' ')}` : ''}`]);
    if (this.state === STATE.PLAYING) this.pause({ showMenu: false });
    await playDialog(this.ui, lines, { reducedMotion: !!this.settings.reducedMotion });
    if (this.state === STATE.PAUSED && !this.ui.anyOpen) this.resume();
  }

  // Where the loot aboard sells: the nearest market, unless it's all shine, which only the
  // speakeasies buy. { kind: 'market' | 'drop', place: { x, z, ... }, dist, name }
  _destination(p = this.player.position) {
    let goods = false, shine = false;
    for (const q of this.trunk.pieces.values()) { if (KINDS[q.kind].brewed) shine = true; else goods = true; }
    if (goods || !shine) { const m = this._nearestMarket(p); return { kind: 'market', place: m.town, dist: m.dist, name: m.town?.town }; }
    let best = null, bd = Infinity;
    this.world.drops.forEach((d, i) => { const dist = Math.hypot(d.x - p.x, d.z - p.z); if (dist < bd) { bd = dist; best = { ...d, id: `drop:${i}` }; } });
    return { kind: 'drop', place: best, dist: bd, name: best.name };
  }

  _carryingShine() {
    for (const q of this.trunk.pieces.values()) if (KINDS[q.kind].brewed) return true;
    return false;
  }

  // With shine aboard, stop at a speakeasy (a named city corner) to sell it, after dark (by
  // day it's said once, and waiting at the door opens it when night comes).
  _checkDrop() {
    const p = this.player.position, R = CONFIG.dredge.speakeasy.radius;
    const i = this.world.drops.findIndex((d) => Math.hypot(d.x - p.x, d.z - p.z) < R);
    if (i < 0) { this._dropLeft = true; this._dropWhy = ''; return; }
    if (!this._dropLeft || Math.abs(this.player.speed) > CONFIG.dredge.market.stopSpeed || !this._carryingShine()) return;
    const d = this.world.drops[i];
    if (!this._night()) {
      const why = `${CAST[d.who]?.name || d.name}: “Not in daylight, Otto. Come back after dark.”`;
      if (why !== this._dropWhy && !this._jobWhy) this.hud.toast(why, '', 3500);
      this._dropWhy = why;
      return;
    }
    this._dropLeft = false;
    this.openMarket({ id: `drop:${i}`, name: d.name, town: d.name }, { upgrades: false });
  }

  openMarket(town = this._nearestMarket().town, { upgrades = true } = {}) {
    if (this.state === STATE.PLAYING) this.pause({ showMenu: false });
    if (this.state !== STATE.PAUSED) return;
    // The shop's door bell, or a knock on a speakeasy's door.
    if (String(town.id).startsWith('drop:')) this.audio.knock?.(); else this.audio.bell?.();
    const close = () => { this.ui.close('market'); this._marketRender = null; if (!this.ui.anyOpen) this.resume(); };
    this._marketRender = showMarket(this.ui, {
      town, getTrunk: () => this.trunk, career: this.dredge, jobs: this._jobs(), deed: this._deed(town), keep: () => this._keepBack(),
      onSell: (kind) => {
        // SELL EVERYTHING keeps back what the orders and the story need; one kind's SELL sells it all.
        const blends = this.dredge.market.blend, before = onHand(this.trunk, {});
        const r = sell(town.id, this.trunk, this.dredge.market, kind, kind ? {} : this._keepBack());
        if (!r.count) return;
        r.total += this._sweetTalk(r.total);
        this.dredge.sold({ ...r, town: town.name, trunk: this.trunk });
        // Tainted shine in the sale (a bad batch in its blend): someone will drink it.
        const after = onHand(this.trunk, {});
        for (const k of Object.keys(before)) {
          if (!KINDS[k].brewed || !blends[k]?.bad || (after[k] || 0) >= before[k]) continue;
          this._blinded(k, town);
          const drop = this.world.drops[Number(String(town.id).split(':')[1])];   // the speakeasy that was sold it
          if (drop?.who) this._trust(drop.who, -CONFIG.dredge.brew.badTrust);
        }
        this.hud.setCash(this.dredge.cash, true);
        this.hud.cashPop(`+${money(r.total)}`);
        this.audio.cash?.();
        this._updateTrunkPill();
      },
      onBuy: upgrades ? (id) => {
        if (!this.dredge.buy(id)) return;
        this._applyPerks();
        this.hud.setCash(this.dredge.cash, true);
        this.hud.cashPop(`−${money(CONFIG.dredge.upgrades[id].costs[this.dredge.level(id) - 1])}`);
        this.audio.cash?.();
      } : null,
      onSupply: town.supplies ? (kind) => this.buySupply(kind, town) : null,
      onTrunk: () => this.trunkScreen.open(this.trunk),
      onBack: close,
    });
    this._guideLine('market-guide', 'SELL EVERYTHING turns the trunk into cash. Each town pays differently, and a price drops as you sell more of one thing; upgrades come once you’ve saved up.');
  }

  // A county store's supplies: one piece of `kind` for cash, into the trunk if it fits.
  buySupply(kind, town) {
    const d = this.dredge.data, price = supplyPrice(kind), spot = this.trunk.findSpot(kind);
    if (!spot || d.cash < price) return false;
    this.trunk.place(kind, spot.x, spot.y, spot.rot);
    d.cash -= price;
    d.ledger.unshift({ t: Date.now(), text: `Bought ${KINDS[kind].name.toLowerCase()} at ${town.name}`, amount: -price });
    d.ledger.length = Math.min(d.ledger.length, 40);
    this.dredge.saveTrunk(this.trunk);
    this.hud.setCash(this.dredge.cash, true);
    this.hud.cashPop(`−${money(price)}`);
    this.audio.cash?.();
    this._updateTrunkPill();
    return true;
  }

  // What SELL EVERYTHING holds back: the goods the orders in the book want, and what the
  // chapter step needs and could lose (Father's coil, before it's fitted). { kind: count }
  _keepBack() {
    const keep = {}, d = this.dredge.data, { step } = current(d);
    for (const o of d.orders) for (const [k, n] of Object.entries(o.wants)) keep[k] = (keep[k] || 0) + n;
    if (step?.lost && step.lost.when(d, {})) for (const k of step.lost.gives) keep[k] = (keep[k] || 0) + 1;
    return keep;
  }

  // Tainted shine sold: a customer goes blind and the papers have it (the trust it costs is
  // the caller's: the speakeasy's contact, or the order's).
  _blinded(kind, town) {
    const d = this.dredge.data;
    d.stats.blinded = (d.stats.blinded || 0) + 1;
    d.flags.blinded = true;
    const text = `From the Sun: a man blinded by bad ${KINDS[kind].name.toLowerCase()} near ${town.name}. The Temperance Alliance calls it poison.`;
    d.ledger.unshift({ t: Date.now(), text, amount: 0 });
    d.ledger.length = Math.min(d.ledger.length, 40);
    this.dredge.save();
    this.hud.toast(text, 'red', 6000);
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
    if (this.police.tier > 0) {
      this.hud.setObjective(`${'★'.repeat(this.police.tier)} The Bureau is after you: get out of sight to lose them`, null, 'roam');
      return;
    }
    const c = this._focusOrder();
    if (c?.passenger) {
      const p = this.player.position, dx = c.x - p.x, dz = c.z - p.z, b = Math.atan2(dx, -dz) - this.chase.heading, name = CAST[c.passenger].name;
      this.hud.setObjective(c.aboard ? `Get ${name} to ${c.place} · ${hoursText(c.window)}` : `Pick up ${name} at ${c.place}`,
        `${Math.max(0.1, Math.hypot(dx, dz) / 1609.34).toFixed(1)} mi`, 'market', Math.atan2(Math.sin(b), Math.cos(b)));
      return;
    }
    if (c) {
      const p = this.player.position, dx = c.x - p.x, dz = c.z - p.z;
      const left = c.due == null ? (c.window ? hoursText(c.window) : 'tonight') : `${Math.max(0, Math.ceil(c.due - this.dredge.market.clock))} h`;
      const bearing = Math.atan2(dx, -dz) - this.chase.heading;
      const pr = progress(c, this.trunk, this.dredge.market.blend), ready = pr.ready && pr.gradeOk, near = Math.hypot(dx, dz) < 40;
      const at = c.place ? ` at ${c.place}` : '';
      const dark = (c.window && !inWindow(this.env.hour, c.window) ? ' · when the freight is in' : c.night && !this._night() ? ' · after dark' : '') + (c.fragile ? ' · fragile' : '');
      this.hud.setObjective(ready && near && !dark ? `Pull up at ${c.name}’s door and stop` : ready ? `Deliver to ${c.name}${at}${dark} · ${left}`
        : `Order: ${wantsText(c.wants)}${c.grade ? ` (grade ${c.grade}+)` : ''} for ${c.name} · ${left}`,
        `${Math.max(0.1, Math.hypot(dx, dz) / 1609.34).toFixed(1)} mi`, 'market', Math.atan2(Math.sin(bearing), Math.cos(bearing)));
      return;
    }
    // The chapter's next step. One that takes what's aboard somewhere (the coil to the barn)
    // comes before selling it; a story site to search, after (with an empty trunk).
    const { chapter, step } = current(this.dredge.data), lost = this._lost();
    const goal = step && this._stepGoal(step);
    const arrow = (x, z) => {
      const dx = x - this.player.position.x, dz = z - this.player.position.z, b = Math.atan2(dx, -dz) - this.chase.heading;
      return [`${Math.max(0.1, Math.hypot(dx, dz) / 1609.34).toFixed(1)} mi`, 'market', Math.atan2(Math.sin(b), Math.cos(b))];
    };
    const stepText = step && `${chapter.title}: ${lost ? lost.text : `${step.text}${step.night && !this._night() ? ', after dark' : ''}`}`;
    if (goal && (step.at || lost)) { this.hud.setObjective(stepText, ...arrow(goal.x, goal.z)); return; }
    const { place: town, name } = this._destination();
    if (!town || !this.trunk.count) {
      if (goal) { this.hud.setObjective(stepText, ...arrow(goal.x, goal.z)); return; }
      if (step) { this.hud.setObjective(stepText, null, 'roam'); return; }
      if (choiceOpen(this.dredge.data)) {
        const g = this._choiceGoal();
        this.hud.setObjective('The choice: buy back the deed at Lexington Market, or take the letters to the Sun', ...arrow(g.x, g.z));
        return;
      }
      const ev = eventFor(dayOf(this.dredge.market));
      this.hud.setObjective(ev ? `Find salvage · ${eventText(ev).replace(' today', '')}` : 'Find salvage: SALVAGE signs mark the sites', null, 'roam');
      return;
    }
    this.hud.setObjective(`Deliver to ${name}`, ...arrow(town.x, town.z));
  }

  // Where a chapter step leads, if anywhere: its story site (or the one that gives back what
  // it needs, if that's lost), the barn, or Loch Raven's Warren landing.
  _stepGoal(step) {
    const lost = this._lost();
    if (lost) return this.salvage.sites.find((x) => x.story === lost.site) || null;
    if (step.site) return this.salvage.sites.find((x) => x.story === step.site) || null;
    if (step.at === 'barn') return { x: this.world.home.stopX, z: this.world.home.stopZ };
    if (step.at === 'loch') return { x: LOCH_NODES.R2[0], z: LOCH_NODES.R2[1] };
    return null;
  }

  // The ending's choice: whichever is nearer, Lexington Market (the deed) or the Sun.
  _choiceGoal(p = this.player.position) {
    const market = CONFIG.dredge.towns.find((t) => t.id === CONFIG.dredge.deed.town), sun = this.salvage.sites.find((x) => x.story === 'sun');
    return !sun || Math.hypot(market.x - p.x, market.z - p.z) < Math.hypot(sun.x - p.x, sun.z - p.z) ? market : sun;
  }

  // The radar's gold route: to an order ready to hand over (or the chapter's story order,
  // ready or not: the banner points there too), the chapter step's place, or with loot aboard
  // the nearest market.
  _updateRoute(dt) {
    const c = this._focusOrder(), pr = c && progress(c, this.trunk, this.dredge.market.blend);
    const { step } = current(this.dredge.data), goal = step ? this._stepGoal(step) : choiceOpen(this.dredge.data) ? this._choiceGoal() : null;
    const cargo = this.trunk.count ? this._destination().place : null;
    const place = c && ((pr.ready && pr.gradeOk) || c.story) ? c : (goal && (step?.at || this._lost())) ? goal : cargo || goal;
    if (place) this.minimap.updateRoute(dt, this.player.position, place);
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
      place: this.place, night, harbor01: Math.min(1, Math.max(0, (v.position.z - 120) / 120)),
    });
    this._updateTune();
  }

  // The radio's tune for where and when (music.js TUNES): a fast rag under Lead Foot, a waltz
  // in the valley at night, the blues in the city at night, stride by day.
  _tuneFor() {
    if (this.time < (this.abil?.leadfoot?.until ?? -1)) return 'rag';
    const night = this.env.daylight < 0.3;
    return night ? (this.world.inCounty(this.player.position) ? 'waltz' : 'blues') : 'stride';
  }

  // A new tune fades in once it's been called for a couple of seconds (so driving along the
  // edge of town doesn't flip it back and forth); Lead Foot's rag comes in and goes at once.
  _updateTune() {
    const want = this._tuneFor(), now = this.audio.music?.tune;
    if (want !== this._tuneWant) { this._tuneWant = want; this._tuneSince = this.time; }
    if (!now || want === now) return;
    const quick = want === 'rag' || now === 'rag';
    if (quick || this.time - this._tuneSince > 2) this.audio.setTune(want, quick ? 0.8 : 3);
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
    const h = this.world.home;
    const drops = this._carryingShine() ? this.world.drops.map((d) => ({ kind: 'drop', x: d.x, z: d.z })) : [];
    // Salvage sites within the spotter's range (picked-clean ones dim).
    const day = dayOf(this.dredge.market), pp = this.player.position, range = this.perks.siteRange;
    for (const st of this.salvage.sites) {
      const status = this.salvage.status(st, day, this.env.hour);
      if (st.story) { if (status !== 'hidden') drops.push({ kind: 'story', x: st.x, z: st.z }); continue; }   // at any range
      if (Math.hypot(st.x - pp.x, st.z - pp.z) > range) continue;
      drops.push({ kind: status === 'ok' ? 'site' : 'site-empty', x: st.x, z: st.z });
    }
    for (const o of this.dredge.data.orders) drops.push({ kind: 'job', x: o.x, z: o.z });
    const re = this.roadEvents.active;
    if (re?.edge) drops.push({ kind: 'roadblock', x: re.x, z: re.z });
    const chapter = this.dredge.data.chapter || 0;
    return [...CONFIG.dredge.towns.map((t) => ({ kind: townOpen(t, chapter) ? 'market' : 'market-closed', x: t.x, z: t.z })), { kind: 'barn', x: h.stopX, z: h.stopZ }, ...drops,
      ...this.loot.near(this.player.position, this.perks.mapRange), ...this.police.near(this.player.position, this.perks.agentRange, { look: !!this.dredge.data.tools.policeband })];
  }

  // Draw one frame of the 3D view.
  renderFrame() {
    this.world.updateFar(this.camera.position);
    this.world.updateShadow(this.camera);
    this.world.updateLamps(this.camera);
    this.world.sky.follow(this.camera);
    WHEELS.update();
    this.post.setDaylight(this.env.daylight);
    const s01 = Math.abs(this.player.speed) / this.player.t.maxSpeed;
    this.post.setRush(juice('cinematic', 'speedPulse') * Math.min(1, Math.max(0, (s01 - 0.85) / 0.15)));
    // Headlight beams show in the dark (and more in fog or rain), dim by day, stutter after a hit.
    const beam = this.player.model.beam;
    if (beam) beam.material.opacity = CONFIG.look.beamOpacity * (this.perks?.light || 1) * (this.lightsOff ? 0 : 1) * (1 - 0.9 * this.env.daylight) * (1 + this.env.fog + 0.5 * this.env.wet) * this.feel.lightLevel;
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
    const raw = this.clock.getDelta(), dt = Math.min(raw, 0.05);
    this.input.poll();
    if (this.state === STATE.PLAYING) {
      this._watchQuality(raw);
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
