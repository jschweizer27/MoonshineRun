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
import { loadRecords, recordRun } from './save.js';

const STATE = { INTRO: 'intro', PLAYING: 'playing', GAMEOVER: 'gameover' };

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, window.innerWidth / window.innerHeight, 0.1, 1200);

    // The city is built once; restarting only resets state (no rebuild, no leaks).
    this.world = new World(this.scene);
    this.player = new Vehicle(this.scene, this.world.collision, { style: 'player' });
    this._addHeadlight();
    this.police = new Police(this.scene, this.world);
    this.rng = createRng((Date.now() ^ 0x5eed) >>> 0);
    this.mission = new Mission(this.scene, this.world, this.rng);
    this.waypoint = new Waypoint(this.scene);
    this.chase = new ChaseCamera(this.camera, this.world.collision);

    this.hud = new HUD();
    this.input = new Input();
    this.audio = new Audio();
    this.state = STATE.INTRO;
    this.time = 0;
    this.clock = new THREE.Clock();

    this.resetRun();
    // Compile every shader now so nothing hitches when cops or markers first appear.
    this.renderer.compile(this.scene, this.camera);
    this.world.setAnisotropy(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));

    this._bindUI();
    window.addEventListener('resize', () => this._onResize());
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

  resetRun() {
    this.player.place(0, 0, 0);
    this.police.reset();
    this.mission.reset(this.player.position);
    this.chase.snap(this.player);
    this.hud.setCash(0);
    this.hud.setCargo(false);
    this.hud.setHeat(0, '', 0);
    this.prevTier = 0;
  }

  _bindUI() {
    document.getElementById('start-btn').addEventListener('click', () => this.startRun());
    document.getElementById('restart-btn').addEventListener('click', () => this.restart());
  }

  startRun() {
    this.hud.hideIntro();
    this.hud.show();
    this.audio.start();
    this.state = STATE.PLAYING;
    this.clock.getDelta();
  }

  restart() {
    this.hud.hideGameOver();
    this.resetRun();
    this.hud.show();
    this.audio.setActive(true);
    this.state = STATE.PLAYING;
    this.clock.getDelta();
  }

  bust() {
    this.state = STATE.GAMEOVER;
    this.audio.setActive(false);
    this.hud.hide();
    const { cash, runs, carrying } = this.mission;
    const { records, isBest } = recordRun(cash, runs);
    this.hud.showGameOver({
      cash, runs, best: records.bestHaul, isBest: isBest && cash > 0,
      msg: carrying ? 'They ran you down with the shine still aboard.' : 'They ran you off the road.',
    });
  }

  // One simulation step (also used by tests to fast-forward deterministically).
  step(dt, input) {
    this.time += dt;
    this.player.update(dt, input);
    const status = this.police.update(dt, this.player, this.camera, this.time);
    const events = this.mission.update(dt, this.player.position, status, this.time);
    this._onEvents(events);

    const tier = this.mission.tier;
    if (tier !== this.prevTier) {
      this.police.setTarget(tier, this.player, this.camera);
      this.prevTier = tier;
    }

    this.chase.update(dt, this.player);
    this.waypoint.update(this.player, this.mission.target, this.time);
    this._updateHud(status);
    this.audio.update(Math.min(1, Math.abs(this.player.speed) / this.player.t.maxSpeed),
      this.police.pursuing ? Math.max(0.25, 1 - status.nearest / 160) : 0);

    if (status.touching) this.bust();
  }

  _onEvents(events) {
    for (const e of events) {
      if (e.type === 'pickup') { this.hud.setCargo(true); this.hud.toast('Shine loaded — get it to the drop', 'amber'); }
      if (e.type === 'deliver') { this.hud.setCargo(false); this.hud.setCash(this.mission.cash); this.hud.toast(`+$${e.amount} — shine delivered`, 'gold'); }
      if (e.type === 'spotted') this.hud.toast('Tipped off! The law is on its way', 'red');
      if (e.type === 'lostTier') this.hud.toast('Shook one off — keep out of sight', 'blue');
      if (e.type === 'clear') this.hud.toast('You lost them', 'blue');
    }
  }

  _updateHud(status) {
    const m = this.mission;
    const tier = m.tier;
    let heatStatus = '';
    if (tier > 0) heatStatus = !status.contact && m.carrying ? 'incoming' : status.seen ? 'seen' : 'evading';
    this.hud.setHeat(tier, heatStatus, m.evade);
    const dx = m.target.x - this.player.position.x, dz = m.target.z - this.player.position.z;
    const bearing = Math.atan2(dx, -dz) - this.chase.heading;
    this.hud.setObjective(m.objective, Math.round(Math.hypot(dx, dz) / 10) * 10, m.targetKind, Math.atan2(Math.sin(bearing), Math.cos(bearing)));
    this.hud.setSpeed(this.player.speedMph);
  }

  _loop() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.state === STATE.PLAYING) this.step(dt, this.input.read());
    this.renderer.render(this.scene, this.camera);
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
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
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('intro').classList.remove('hidden');
  const best = loadRecords().bestHaul;
  if (best > 0) document.getElementById('intro-best').textContent = `Best haul so far: $${best.toLocaleString()}`;
  if (new URLSearchParams(location.search).has('debug')) window.shine = game;
}

boot().catch((e) => window.__shineFail('The game failed to start.', e && e.message ? e.message : String(e)));
