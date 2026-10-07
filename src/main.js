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
import { showLedger, showMarket, showSlots, showBarn, showStill, showSalvage, playDialog, money } from './screens.js';
import { Salvage, payout } from './salvage.js';
import { consume } from './brew.js';
import { contacts, offersFor, progress, handOver, wantsText } from './contracts.js';
import { KINDS } from './trunk.js';
import { BEATS, nextBeat, CAST, THANKS } from './story.js';
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
      pickupRadius: D.loot.pickupRadius + U.magnet.step.pickupRadius * lv('magnet'),
      mapRange: D.loot.mapRange + U.spotter.step.mapRange * lv('spotter'),
      field: 0.7 + U.tyres.step.field * lv('tyres'),       // speed kept in the fields
      wet: 1 - U.tyres.step.wet * lv('tyres'),             // share of the rain's grip loss felt
      light: 1 + U.lamps.step.light * lv('lamps'),         // headlamps and beams
      wear: 1 - U.plating.step.wear * lv('plating'),       // share of a knock's wear taken
      cols, rows,
    };
    if (this.feel) { this._lampBase ??= this.feel.headlightBase; this.feel.headlightBase = this._lampBase * this.perks.light; }
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
    on('pause-settings', () => this.openSettings());
    on('pause-help', () => this.ui.open('help'));
    on('pause-skip-tips', () => { this.endGuide(true); $('pause-skip-tips').classList.add('hidden'); this.ui.focusFirst(); });
    on('guide-skip', () => this.endGuide(true));
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

  // The title screen's line about the save (cash on hand and what's been sold so far), and
  // CONTINUE once this slot has been played.
  _updateIntroBest() {
    const s = this.dredge.data.stats, slot = this.dredge.slot;
    $('start-btn').textContent = this.dredge.started ? 'CONTINUE' : 'START DRIVING';
    const d = this.dredge.data, parts = [`Slot ${slot}`];
    if (d.rank) parts.push(CONFIG.dredge.ranks[d.rank].name);
    if (s.sold) parts.push(`Cash on hand: ${money(this.dredge.cash)}`, `Sold so far: ${s.sold} piece${s.sold === 1 ? '' : 's'} for ${money(s.earned)}`);
    if (d.flags.deed) parts.push('Braun & Sons is yours again');
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
    this.world.standLamps();
    this.loot.reset(this.player.position);
    this.roadEvents.reset(this.dredge.market);
    this.traffic.clear();
    this.trunk = this.dredge.loadTrunk();
    this._marketLeft = true;
    this._closedLeft = true;
    this._barnLeft = true;
    this._dropLeft = true;
    this._siteLeft = true;
    this._pending = [];
    this._nightFrom = this._tally();
    this.salvage.state = this.dredge.data.sites;
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
  _guideText() {
    if (!this.dredge.data.guide) return '';
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
    else if (a === 'ability1') this.useAbility('tip');
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
    this._checkContract();
    this._checkMarket();
    this._checkBarn();
    this._checkDrop();
    this._checkSalvage();
    this._checkPlace();
    this._checkStory(dt);
    this.debris.update(dt);
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
    const weather = { rain: ' · Rain', fog: ' · Fog', clear: '' }[this.env.weather];
    this.hud.setClock(`${this.env.daylight > 0.5 ? '☀' : '☾'} ${this.env.clock}${weather}`);
    this._updateObjective();
    this._updateAudio();
  }

  // A rare find turned up (word of it, and where), or was lost to someone else.
  _onRare(e) {
    const name = e.kind.name.toLowerCase();
    if (e.type === 'rare') { this.hud.toast(`Word of a ${name} out near ${this._landmark(e.x, e.z)}`, 'gold', 5000); this.audio.fanfare?.('rare'); }
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
    if (e.rare) { this.dredge.data.stats.rares++; this._addRep(CONFIG.dredge.repPerFind); }
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

  // The nearest market that deals with Otto at his rank, and whether the truck is inside it.
  _nearestMarket(p = this.player.position) {
    let best = null, bd = Infinity;
    const rank = this.dredge.data.rank || 0;
    for (const t of CONFIG.dredge.towns) {
      if (!townOpen(t, rank)) continue;
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
    if (!s) { this._siteLeft = true; return; }
    if (!this._siteLeft || Math.abs(this.player.speed) > CONFIG.dredge.market.stopSpeed * 2) return;
    this._siteLeft = false;
    const st = this.salvage.status(s, dayOf(this.dredge.market), this.env.hour);
    if (st === 'empty') { this.hud.toast(`The ${s.name.toLowerCase()} has been picked clean. Try again in a day or two.`, '', 3000); return; }
    if (st === 'day') { this.hud.toast(`Too many eyes about by day. Come back to the ${s.name.toLowerCase()} after dark.`, '', 3000); return; }
    this.openSalvage(s);
  }

  openSalvage(site) {
    if (this.state === STATE.PLAYING) this.pause({ showMenu: false });
    if (this.state !== STATE.PAUSED) return;
    this.salvageScreen = showSalvage(this.ui, { site, onDone: (sc) => this._onSalvaged(site, sc) });
  }

  // A site worked: it's empty for a day or two, and what it gave up goes into the trunk,
  // one piece at a time.
  _onSalvaged(site, sc) {
    const day = dayOf(this.dredge.market), d = this.dredge.data;
    this.salvage.worked(site, day);
    this.salvage.refresh(day);
    d.stats.salvaged = (d.stats.salvaged || 0) + 1;
    this.dredge.save();
    const pieces = payout(site.kind, sc);
    if (!pieces.length) {
      this.hud.toast(`Nothing worth taking from the ${site.name.toLowerCase()}.`, '', 2500);
      if (!this.ui.anyOpen) this.resume();
      return;
    }
    const counts = {};
    for (const k of pieces) counts[k] = (counts[k] || 0) + 1;
    this.hud.toast(`From the ${site.name.toLowerCase()}: ${wantsText(counts)}`, 'gold', 3000);
    this.audio.pickup?.();
    this._pending = pieces.slice(1);
    this.openTrunk(pieces[0]);
  }

  // The SALVAGE marker stands at the nearest site that can be worked, within 220 m.
  _updateSiteMarker() {
    const s = this.salvage.nearest(this.player.position, dayOf(this.dredge.market), this.env.hour, 220), m = this.siteMarker;
    m.userData.off = !s;
    if (s) m.position.set(s.x, 0, s.z);
  }

  _updateMarkers() {
    this._updateSiteMarker();
    const cam = this.camera.position, range = CONFIG.dredge.market.markerRange, rank = this.dredge.data.rank || 0;
    // A town that doesn't deal with Otto yet shows no marker.
    CONFIG.dredge.towns.forEach((t, i) => { this.marketMarkers[i].userData.off = !townOpen(t, rank); });
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
    const t = CONFIG.dredge.towns.find((x) => x.area && Math.hypot(p.x - x.x, p.z - x.z) < x.area);
    return t ? t.town : 'Green Spring Valley';
  }

  _checkPlace() {
    const place = this._placeName();
    if (place !== this.place) {
      if (this.place) this.hud.toast(place, 'gold', 2200);
      this.place = place;
      // The first valley town reached (the Jockey's beat).
      if (place !== 'Baltimore' && place !== 'Green Spring Valley') this.dredge.data.flags.valley = true;
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

  // A market that doesn't deal with Otto yet (a town's `rank`): stopping there says when it
  // will, once a visit.
  _checkClosed() {
    const p = this.player.position, rank = this.dredge.data.rank || 0;
    const t = CONFIG.dredge.towns.find((x) => !townOpen(x, rank) && Math.hypot(x.x - p.x, x.z - p.z) < x.radius);
    if (!t) { this._closedLeft = true; return; }
    if (!this._closedLeft || Math.abs(this.player.speed) > CONFIG.dredge.market.stopSpeed) return;
    this._closedLeft = false;
    this.hud.toast(`The ${t.name} only deals with runners it knows. Come back when you’re a ${CONFIG.dredge.ranks[t.rank].name}.`, '', 4000);
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
      career: this.dredge, getTrunk: () => this.trunk, cap, rank: () => d.rank || 0, jobs: this._jobs(),
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
          onDone: (q, crates) => {
            d.stash[recipe.id] = (d.stash[recipe.id] || 0) + crates;
            d.stats.brews++;
            this._addRep(Math.round(q * CONFIG.dredge.repPerBrew));
            d.ledger.unshift({ t: Date.now(), text: `Brewed ${crates} crate${crates === 1 ? '' : 's'} of ${recipe.name} (${Math.round(q * 100)}%)`, amount: 0 });
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
      onTrunk: () => this.trunkScreen.open(this.trunk),
      onBack: () => { this.ui.close('barn'); this._barnRender = null; if (!this.ui.anyOpen) this.resume(); },
    });
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

  // ---------- Reputation, ranks and abilities ----------
  _addRep(n) {
    const d = this.dredge.data;
    d.rep = (d.rep || 0) + n;
    const R = CONFIG.dredge.ranks;
    let r = 0;
    R.forEach((x, i) => { if (d.rep >= x.rep) r = i; });
    if (r > (d.rank || 0)) {
      d.rank = r;
      this.hud.toast(`New rank: ${R[r].name}${R[r].unlocks ? ` · ${R[r].unlocks}` : ''}`, 'gold', 5000);
      this.audio.fanfare?.('rank');
      this._buildAbilities();
    }
    this.dredge.save();
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
    if ((d.rank || 0) < A.rank) { this.hud.toast(`${A.name} comes at ${CONFIG.dredge.ranks[A.rank].name}`, '', 2000); return false; }
    if (this.time < s.ready || (id === 'sweet' && this._sweet)) { this.hud.toast(this._sweet && id === 'sweet' ? 'Sweet Talk is waiting for the next sale' : `${A.name} is ready in ${Math.ceil(s.ready - this.time)} s`, '', 1800); return false; }
    s.ready = this.time + A.cooldown;
    if (id === 'tip') { s.until = this.time + A.seconds; this.hud.toast('The Jockey’s tip: every salvage site in the county is on the radar', 'gold', 2500); }
    if (id === 'leadfoot') { s.until = this.time + A.seconds; this._leadFoot = true; this._applyPerks(); this.hud.toast('Lead Foot!', 'gold', 1500); }
    if (id === 'sweet') { this._sweet = true; this.hud.toast('Sweet Talk: the next sale or job pays 20% more', 'gold', 2500); }
    this._updateAbilities();
    return true;
  }

  // Lead Foot runs out; the HUD chips count down.
  _tickAbilities() {
    if (this._leadFoot && this.time > this.abil.leadfoot.until) { this._leadFoot = false; this._applyPerks(); }
  }

  // The HUD's ability chips: one per ability the rank allows (tap or press its key).
  _buildAbilities() {
    const box = $('abilities'), rank = this.dredge.data.rank || 0;
    box.textContent = '';
    for (const [id, A] of Object.entries(CONFIG.dredge.abilities)) {
      if (rank < A.rank) continue;
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

  // The ending: buy back the brewery deed at Lexington Market, once King of York Road.
  _deed(town) {
    const D = CONFIG.dredge.deed, d = this.dredge.data;
    if (town.id !== D.town || (d.rank || 0) < D.rank || d.flags.deed) return null;
    return {
      cost: D.cost,
      onBuy: async () => {
        if (d.cash < D.cost) return;
        if (!(await this.ui.confirm('BUY THE DEED?', `Pay ${money(D.cost)} for the Braun & Sons brewery deed?`, 'BUY IT BACK'))) return;
        d.cash -= D.cost;
        d.flags.deed = true;
        this.audio.fanfare?.('deed');
        d.ledger.unshift({ t: Date.now(), text: 'The Braun & Sons deed', amount: -D.cost });
        this.dredge.save();
        this.hud.setCash(this.dredge.cash, true);
        this.hud.cashPop(`−${money(D.cost)}`);
        this._marketRender?.();
      },
    };
  }

  // ---------- Contracts ----------
  // The board the markets, speakeasies and barn show: the job in hand and today's offers.
  _jobs() {
    const d = this.dredge.data, day = dayOf(this.dredge.market);
    return {
      active: () => d.contract,
      offers: () => offersFor(day, this.contactList, { brewing: (d.still || 0) > 0 || d.stats.brews > 0, rank: d.rank || 0 }).filter((o) => !d.taken[o.id]),
      hoursLeft: () => (d.contract ? d.contract.due - this.dredge.market.clock : 0),
      onAccept: (o) => this.takeContract(o),
      onAbandon: () => this.dropContract(),
    };
  }

  takeContract(offer) {
    const d = this.dredge.data;
    if (d.contract) return false;
    d.contract = { ...offer, due: this.dredge.market.clock + offer.hours };
    // Taken offers don't come back; only today's and yesterday's are worth remembering.
    const day = dayOf(this.dredge.market);
    for (const id of Object.keys(d.taken)) if (Number(id.split('-')[0]) < day - 1) delete d.taken[id];
    d.taken[offer.id] = true;
    this.dredge.save();
    this._updateJobMarker();
    this.hud.toast(`Job taken: ${wantsText(offer.wants)} for ${offer.name}${offer.place ? `, ${offer.place}` : ''}`, 'gold', 3000);
    return true;
  }

  // Dropping a job costs a little standing; missing its deadline costs more.
  dropContract(late = false) {
    const d = this.dredge.data, c = d.contract;
    if (!c) return;
    const C = CONFIG.dredge.contracts;
    d.rep = Math.max(0, (d.rep || 0) - (late ? C.failRep : Math.round(C.failRep / 2)));
    d.contract = null;
    this.dredge.save();
    this._updateJobMarker();
    this.hud.toast(late ? `Too late: ${c.name} found someone else.` : `Dropped the job for ${c.name}.`, '', 3000);
  }

  _updateJobMarker() {
    const c = this.dredge.data.contract;
    for (const [kind, m] of Object.entries(this.jobMarkers)) {
      m.userData.off = !c || c.kind !== kind;
      if (!m.userData.off) m.position.set(c.x, 0, c.z);
      else m.visible = false;
    }
  }

  // The job in hand: late, or delivered by stopping at the contact with the goods aboard.
  _checkContract() {
    const d = this.dredge.data, c = d.contract;
    if (!c) return;
    if (this.dredge.market.clock > c.due) { this.dropContract(true); return; }
    const p = this.player.position;
    if (Math.hypot(p.x - c.x, p.z - c.z) > CONFIG.dredge.contracts.radius) { this._jobLeft = true; return; }
    if (!this._jobLeft || Math.abs(this.player.speed) > CONFIG.dredge.market.stopSpeed * 2) return;
    this._jobLeft = false;
    if (!progress(c, this.trunk).ready) { this.hud.toast(`${c.name} is waiting on ${wantsText(c.wants)}.`, '', 3000); return; }
    handOver(c, this.trunk);
    d.cash += c.pay;
    d.stats.earned += c.pay;
    d.stats.contracts++;
    const bonus = this._sweetTalk(c.pay);
    d.cash += bonus;
    d.stats.earned += bonus;
    this._addRep(c.rep);
    d.ledger.unshift({ t: Date.now(), text: `Job for ${c.name}: ${wantsText(c.wants)}`, amount: c.pay + bonus });
    d.ledger.length = Math.min(d.ledger.length, 40);
    d.contract = null;
    this.dredge.saveTrunk(this.trunk);
    this._updateJobMarker();
    this._updateTrunkPill();
    this.hud.setCash(this.dredge.cash, true);
    this.hud.cashPop(`+${money(c.pay + bonus)}`);
    this.audio.cash?.();
    this.hud.toast(`Delivered to ${c.name}: ${money(c.pay + bonus)}${bonus ? ' (sweet-talked)' : ''}`, 'gold', 3000);
    this._handoff(c, c.pay + bonus);
    this.audio.chime?.();
  }

  // The handoff: the contact comes out, says their piece, and the money changes hands (a
  // card, so a delivery can't pass unnoticed). The drive waits under it.
  async _handoff(c, paid) {
    if (!CAST[c.who]) return;
    if (this.state === STATE.PLAYING) this.pause({ showMenu: false });
    await playDialog(this.ui, [
      [c.who, THANKS[c.who] || 'Much obliged.'],
      ['narrator', `Handed over ${wantsText(c.wants)} to ${c.name}${c.place ? ` at ${c.place}` : ''}: ${money(paid)}.`],
    ], { reducedMotion: !!this.settings.reducedMotion });
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

  // With shine aboard, stop at a speakeasy (a named city corner) to sell it.
  _checkDrop() {
    const p = this.player.position, R = CONFIG.dredge.speakeasy.radius;
    const i = this.world.drops.findIndex((d) => Math.hypot(d.x - p.x, d.z - p.z) < R);
    if (i < 0) { this._dropLeft = true; return; }
    if (!this._dropLeft || Math.abs(this.player.speed) > CONFIG.dredge.market.stopSpeed || !this._carryingShine()) return;
    this._dropLeft = false;
    const d = this.world.drops[i];
    this.openMarket({ id: `drop:${i}`, name: d.name, town: d.name }, { upgrades: false });
  }

  openMarket(town = this._nearestMarket().town, { upgrades = true } = {}) {
    if (this.state === STATE.PLAYING) this.pause({ showMenu: false });
    if (this.state !== STATE.PAUSED) return;
    // The shop's door bell, or a knock on a speakeasy's door.
    if (String(town.id).startsWith('drop:')) this.audio.knock?.(); else this.audio.bell?.();
    const close = () => { this.ui.close('market'); this._marketRender = null; if (!this.ui.anyOpen) this.resume(); };
    this._marketRender = showMarket(this.ui, {
      town, getTrunk: () => this.trunk, career: this.dredge, jobs: this._jobs(), deed: this._deed(town),
      onSell: (kind) => {
        const r = sell(town.id, this.trunk, this.dredge.market, kind);
        if (!r.count) return;
        r.total += this._sweetTalk(r.total);
        this.dredge.sold({ ...r, town: town.name, trunk: this.trunk });
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
      onTrunk: () => this.trunkScreen.open(this.trunk),
      onBack: close,
    });
    this._guideLine('market-guide', 'SELL EVERYTHING turns the trunk into cash. Each town pays differently, and a price drops as you sell more of one thing; upgrades come once you’ve saved up.');
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
    const c = this.dredge.data.contract;
    if (c) {
      const p = this.player.position, dx = c.x - p.x, dz = c.z - p.z, left = Math.max(0, Math.ceil(c.due - this.dredge.market.clock));
      const bearing = Math.atan2(dx, -dz) - this.chase.heading;
      const ready = progress(c, this.trunk).ready, near = Math.hypot(dx, dz) < 40;
      const at = c.place ? ` at ${c.place}` : '';
      this.hud.setObjective(ready && near ? `Pull up at ${c.name}’s door and stop` : ready ? `Deliver to ${c.name}${at} · ${left} h` : `Job: ${wantsText(c.wants)} for ${c.name} · ${left} h`,
        `${Math.max(0.1, Math.hypot(dx, dz) / 1609.34).toFixed(1)} mi`, 'market', Math.atan2(Math.sin(bearing), Math.cos(bearing)));
      return;
    }
    const { place: town, dist, name } = this._destination();
    if (!town || !this.trunk.count) {
      const ev = eventFor(dayOf(this.dredge.market));
      this.hud.setObjective(ev ? `Find salvage · ${eventText(ev).replace(' today', '')}` : 'Find salvage: SALVAGE signs mark the sites', null, 'roam');
      return;
    }
    const dx = town.x - this.player.position.x, dz = town.z - this.player.position.z;
    const bearing = Math.atan2(dx, -dz) - this.chase.heading;
    this.hud.setObjective(`Deliver to ${name}`, `${Math.max(0.1, dist / 1609.34).toFixed(1)} mi`, 'market', Math.atan2(Math.sin(bearing), Math.cos(bearing)));
  }

  // With loot aboard, the radar draws the way along the roads to the nearest market.
  _updateRoute(dt) {
    const c = this.dredge.data.contract;
    const place = c && progress(c, this.trunk).ready ? c : this._destination().place;
    if (place && (this.trunk.count || c)) this.minimap.updateRoute(dt, this.player.position, place);
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
    // Salvage sites within the spotter's range, or all of them on the Jockey's tip (picked-clean
    // ones dim).
    const tip = this.time < this.abil.tip.until;
    const day = dayOf(this.dredge.market), pp = this.player.position, range = tip ? Infinity : Math.max(250, this.perks.mapRange);
    for (const st of this.salvage.sites) {
      if (Math.hypot(st.x - pp.x, st.z - pp.z) > range) continue;
      drops.push({ kind: this.salvage.status(st, day, this.env.hour) === 'ok' ? 'site' : 'site-empty', x: st.x, z: st.z });
    }
    const c = this.dredge.data.contract;
    if (c) drops.push({ kind: 'job', x: c.x, z: c.z });
    const re = this.roadEvents.active;
    if (re?.edge) drops.push({ kind: 'roadblock', x: re.x, z: re.z });
    const rank = this.dredge.data.rank || 0;
    return [...CONFIG.dredge.towns.map((t) => ({ kind: townOpen(t, rank) ? 'market' : 'market-closed', x: t.x, z: t.z })), { kind: 'barn', x: h.stopX, z: h.stopZ }, ...drops,
      ...this.loot.near(this.player.position, tip ? Infinity : this.perks.mapRange)];
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
    if (beam) beam.material.opacity = CONFIG.look.beamOpacity * (this.perks?.light || 1) * (1 - 0.9 * this.env.daylight) * (1 + this.env.fog + 0.5 * this.env.wet) * this.feel.lightLevel;
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
