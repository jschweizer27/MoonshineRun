import * as THREE from 'three';
import { CONFIG } from './config.js';
import { daylightAt, dawnHour, duskHour } from './hours.js';

// Day/night cycle and weather. One in-game day passes in ~16 real minutes, starting at
// 9:30 PM. Rain makes the cobbles slick; fog closes in. The night palette lives in
// CONFIG.look.
const L = CONFIG.look;
const NIGHT = new THREE.Color(L.sky), DUSK = new THREE.Color(0x4a3448), DAY = new THREE.Color(0x8fb0d6);
const WINTER = new THREE.Color(0xa9b6c4);      // winter's colder, paler air
const HEMI_DAY = new THREE.Color(0xc4d8ff), SUN = new THREE.Color(0xfff0d8), FOG_GREY = new THREE.Color(0x3a4450);
const WEATHERS = [['clear', 0.5], ['rain', 0.3], ['fog', 0.2]];
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Environment {
  constructor(world, { frozen = false } = {}) {
    this.world = world;
    this.hour = 21.5;
    this.hoursPerSecond = frozen ? 0 : 24 / (16 * 60);
    this.frozen = frozen;
    this.weather = 'clear';
    this._weatherTimer = 150;
    this.wet = 0;
    this.fog = 0;
    this.rainDetail = 1;
    this.winter = false;          // Act II's winter (main._applyWinter): snow for rain, ice at night
    this._col = new THREE.Color();
    this._buildRain(world.scene);
    this.update(0, new THREE.Vector3());
  }

  _buildRain(scene) {
    const n = 900;
    this.drops = new Float32Array(n * 6);
    this._dropSpeed = new Float32Array(n);
    for (let i = 0; i < n; i++) this._resetDrop(i, 0, 0, true);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.drops, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xa8bccf, transparent: true, opacity: 0.35, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);
  }

  // (snow falls close round the camera, in a smaller, lower box: flakes are small)
  _resetDrop(i, cx, cz, anyHeight) {
    const span = this.winter ? 34 : 70, top = this.winter ? 14 : 30;
    const x = cx + (Math.random() - 0.5) * span, z = cz + (Math.random() - 0.5) * span;
    const y = anyHeight ? Math.random() * top : top * 0.85 + Math.random() * top * 0.25;
    const d = this.drops;
    // (a streak of rain; a fleck of snow)
    if (this.winter) { d[i * 6] = x; d[i * 6 + 1] = y; d[i * 6 + 2] = z; d[i * 6 + 3] = x + 0.14; d[i * 6 + 4] = y + 0.17; d[i * 6 + 5] = z + 0.06; }
    else { d[i * 6] = x; d[i * 6 + 1] = y; d[i * 6 + 2] = z; d[i * 6 + 3] = x + 0.15; d[i * 6 + 4] = y + 0.9; d[i * 6 + 5] = z; }
    this._dropSpeed[i] = 28 + Math.random() * 10;
  }

  // 0 at night, 1 at full day, by the season's hours (hours.js: winter's days are short).
  get daylight() { return daylightAt(this.hour, this.winter); }

  get clock() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60 / 15) * 15;
    const h12 = ((h + 11) % 12) + 1;
    return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  }

  // Multipliers the physics uses.
  // Grip: the rain takes some (snow less), and a winter's night ices the roads.
  // (one object, refreshed: it's read every step)
  get effects() {
    const e = (this._effects ??= { grip: 1 });
    e.grip = 1 - 0.2 * this.wet * (this.winter ? 0.5 : 1) - (this.winter ? CONFIG.dredge.winter.ice * (1 - this.daylight) : 0);
    return e;
  }

  // Winter (Act II): the rain comes down as snow.
  // Snow is flakes, not streaks: every drop is re-made in its new shape.
  setWinter(on) {
    this.winter = on;
    this.rain.material.color.set(on ? 0xeef3f8 : 0xa8bccf);
    const c = this._cam || { x: 0, z: 0 };
    for (let i = 0; i < this._dropSpeed.length; i++) this._resetDrop(i, c.x, c.z, true);
    this.rain.geometry.attributes.position.needsUpdate = true;
  }

  setWeather(w) { this.weather = w; this._weatherTimer = 180 + Math.random() * 120; }

  update(dt, cameraPos) {
    if (!this.frozen) {
      this.hour = (this.hour + dt * this.hoursPerSecond) % 24;
      this._weatherTimer -= dt;
      if (this._weatherTimer <= 0) {
        let r = Math.random(), next = 'clear';
        for (const [w, p] of WEATHERS) { if (r < p) { next = w; break; } r -= p; }
        this.setWeather(next);
      }
    }
    const k = Math.min(1, dt * 0.25);
    this.wet += ((this.weather === 'rain' ? 1 : 0) - this.wet) * (dt ? k : 1);
    this.fog += ((this.weather === 'fog' ? 1 : 0) - this.fog) * (dt ? k : 1);
    // Out in the county (no street lamps) the night is lifted a little so the roads read.
    const county = smooth(-230, -310, cameraPos.z);
    this.county = (this.county ?? county) + (county - (this.county ?? county)) * (dt ? Math.min(1, dt * 1.5) : 1);
    this._apply();
    this._updateRain(dt, cameraPos);
  }

  _apply() {
    const w = this.world, s = w.scene, d = this.daylight;
    const dusk = Math.max(0, 1 - Math.abs(d - 0.35) / 0.35) * 0.6;
    this._col.copy(NIGHT).lerp(DAY, d).lerp(DUSK, dusk);
    if (this.fog > 0.01) this._col.lerp(FOG_GREY, this.fog * 0.7 * (0.3 + d));
    if (this.winter) this._col.lerp(WINTER, 0.12 + 0.18 * d);
    s.background.copy(this._col);
    s.fog.color.copy(this._col);
    s.fog.density = THREE.MathUtils.lerp(THREE.MathUtils.lerp(L.fogDensity, L.dayFogDensity, d), L.fogWeatherDensity, this.fog);

    const lift = (this.county || 0) * (1 - d);
    w.hemi.intensity = (L.ambient + 2.6 * d) * (1 + L.countyNight.ambient * lift);
    w.hemi.color.setHex(L.ambientSky).lerp(HEMI_DAY, d);
    w.moon.intensity = (L.moonIntensity + 2.4 * d) * (1 + L.countyNight.moon * lift);
    w.moon.color.setHex(L.moon).lerp(SUN, d);
    // Sun by day, moon by night: across the summer's twelve hours from six, or winter's
    // shorter day from its dawn to its dusk.
    const sunAngle = this.winter ? ((this.hour - dawnHour(true)) / (duskHour(true) - dawnHour(true))) * Math.PI : ((this.hour - 6) / 12) * Math.PI;
    w.lightDir.set(Math.cos(sunAngle) * 220, 120 + Math.abs(Math.sin(sunAngle)) * 160, -90).normalize();
    w.sky?.set({ horizon: this._col, daylight: d, dusk, fog: this.fog, wet: this.wet, lightDir: w.lightDir });

    const night = 1 - d;
    w.poolMaterial.opacity = L.poolOpacity * night;
    w.coneMaterial.opacity = L.coneOpacity * night;
    w.lampCones.visible = night > 0.05;
    w.lampLevel = night;
    w.bulbMaterial.color.copy(w.lampColor).multiplyScalar(0.25 + 0.75 * night);
    w.halos.visible = w.detailHalos !== false && d < 0.5;
    w.uniforms.uWindowGlow.value = L.windowGlow * night + 0.03;
    if (w.signMaterial) w.signMaterial.color.setScalar(0.5 + 0.5 * night);
    w.uniforms.uDaylight.value = d;
    w.uniforms.uWindowLitRatio.value = 0.1 + (L.windowsLit - 0.1) * night;

    // Wet cobbles and puddled dirt catch the light. The streets look damp every night
    // (visual only: grip still follows the rain alone).
    // Snow isn't water: in winter only the night's icy sheen, no puddles or filled joints.
    const water = this.winter ? 0 : this.wet;
    this.sheen = Math.max(water, L.baseWet * night);
    w.roadMaterial.roughness = 1 - 0.55 * this.sheen;
    w.roadMaterial.envMapIntensity = 0.25 + 1.1 * this.sheen;
    w.roadMaterial.normalScale.setScalar(1 - 0.45 * water);   // water fills the joints
    if (w.streakMaterial) w.streakMaterial.opacity = L.streakOpacity * this.sheen;
    if (w.dirtMaterial) w.dirtMaterial.roughness = 0.95 - 0.4 * water;
  }

  _updateRain(dt, cam) {
    // (snow shows on Low too, thinned: it's the season, not a detail)
    const detail = this.winter ? Math.max(0.35, this.rainDetail) : this.rainDetail;
    const on = this.wet > 0.05 && detail > 0;
    this._cam = cam;
    this.rain.visible = on;
    if (!on || !dt) return;
    this.rain.material.opacity = (this.winter ? 0.85 : 0.35) * this.wet;
    const d = this.drops, n = Math.floor(this._dropSpeed.length * detail), slow = this.winter ? 0.08 : 1;   // (snow drifts down)
    this._t = (this._t || 0) + dt;
    for (let i = 0; i < n; i++) {
      const o = i * 6, v = this._dropSpeed[i] * dt * slow;
      d[o + 1] -= v; d[o + 4] -= v;
      if (this.winter) { const s = Math.sin(this._t * 0.9 + i) * dt * 0.8; d[o] += s; d[o + 3] += s; }
      const far = this.winter ? 18 : 40;
      if (d[o + 1] < 0 || Math.abs(d[o] - cam.x) > far || Math.abs(d[o + 2] - cam.z) > far) this._resetDrop(i, cam.x, cam.z, false);
    }
    this.rain.geometry.setDrawRange(0, n * 2);
    this.rain.geometry.attributes.position.needsUpdate = true;
  }
}
