import * as THREE from 'three';
import { World } from './world.js';
import { Vehicle } from './vehicle.js';
import { Pursuers } from './cops.js';
import { Mission } from './mission.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { Audio } from './audio.js';

// Game states.
const STATE = { INTRO: 'intro', PLAYING: 'playing', GAMEOVER: 'gameover' };

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      62, window.innerWidth / window.innerHeight, 0.1, 1000
    );

    this.hud = new HUD();
    this.input = new Input();
    this.audio = new Audio();

    this.state = STATE.INTRO;
    this.clock = new THREE.Clock();

    this._buildScene();
    this._bindUI();

    window.addEventListener('resize', () => this._onResize());
    this.renderer.setAnimationLoop(() => this._loop());
  }

  _buildScene() {
    // Clear any previous run.
    if (this.world) this._teardown();

    this.world = new World(this.scene);
    this.player = new Vehicle(this.scene, { color: 0x6b3f2a, cab: 0x2a1d14 });
    this.player.position.set(0, 0, 0);
    this.pursuers = new Pursuers(this.scene, this.world);
    this.mission = new Mission(this.scene, this.world, this.hud);

    this.hud.setCash(0);
    this.hud.setWanted(0);
    this.hud.setCargo(false);

    // Snap the camera behind the player to start.
    this.player.updateCamera(this.camera);
    this.camera.position.set(0, 7, -13);
    this.camera.lookAt(0, 1.5, 0);
  }

  _teardown() {
    this.pursuers.clear();
    // Drop everything from the scene and rebuild fresh.
    while (this.scene.children.length) this.scene.remove(this.scene.children[0]);
  }

  _bindUI() {
    document.getElementById('start-btn').addEventListener('click', () => this._startRun());
    document.getElementById('restart-btn').addEventListener('click', () => this._restart());
  }

  _startRun() {
    this.hud.hideIntro();
    this.hud.show();
    this.audio.start();
    this.state = STATE.PLAYING;
    this.clock.getDelta(); // discard the long pause on the menu
  }

  _restart() {
    this.hud.hideGameOver();
    this._buildScene();
    this.hud.show();
    this.state = STATE.PLAYING;
    this.clock.getDelta();
  }

  _bust() {
    this.state = STATE.GAMEOVER;
    this.audio.stop();
    this.hud.hide();
    const msg = this.mission.carrying
      ? 'They ran you down with the shine still aboard.'
      : 'They ran you off the road.';
    this.hud.showGameOver(this.mission.cash, this.mission.runs, msg);
  }

  _loop() {
    const dt = Math.min(this.clock.getDelta(), 0.05); // clamp to avoid huge steps

    if (this.state === STATE.PLAYING) {
      this.player.update(dt, { throttle: this.input.throttle, steer: this.input.steer });
      this.player.updateCamera(this.camera);

      this.mission.update(dt, this.player.position);

      // Match active pursuer count to the heat, then chase.
      this.pursuers.setCount(this.mission.wantedLevel, this.player.position);
      const caught = this.pursuers.update(dt, this.player.position);

      this.hud.setSpeed(this.player.speedMph);
      this.audio.update(Math.abs(this.player.speed) / this.player.maxSpeed, this.mission.wantedLevel);

      if (caught) this._bust();
    }

    this.renderer.render(this.scene, this.camera);
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

new Game();
