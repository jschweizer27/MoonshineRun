import * as THREE from 'three';
import { radialTexture } from './world.js';
import { CONFIG } from './config.js';

// Two pooled particle systems: soft smoke/dust (normal blending) and glowing sparks/embers
// (additive). Fixed-size buffers, updated on the CPU, one draw call each.
const VERT = `
  attribute float size;
  attribute float alpha;
  attribute vec3 color;
  uniform float uScale;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vAlpha = alpha;
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * uScale / max(0.5, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = `
  uniform sampler2D map;
  uniform float uLight;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 t = texture2D(map, gl_PointCoord);
    if (t.a * vAlpha < 0.01) discard;
    gl_FragColor = vec4(vColor * t.rgb * uLight, t.a * vAlpha);
  }`;

class Pool {
  constructor(scene, n, additive) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n);
    this.grow = new Float32Array(n);
    this.gravity = new Float32Array(n);
    this.base = new Float32Array(n);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { map: { value: radialTexture([[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']], 64) }, uScale: { value: 400 }, uLight: { value: 1 } },
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, { life = 1, size = 1, grow = 1, color = [1, 1, 1], alpha = 0.6, gravity = 0 }) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.n;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.col.set(color, i * 3);
    this.size[i] = size;
    this.grow[i] = grow;
    this.base[i] = alpha;
    this.alpha[i] = alpha;
    this.life[i] = life;
    this.max[i] = life;
    this.gravity[i] = gravity;
  }

  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = i * 3;
      this.vel[k + 1] -= this.gravity[i] * dt;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      this.alpha[i] = this.base[i] * Math.max(0, this.life[i] / this.max[i]);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.size.needsUpdate = a.alpha.needsUpdate = a.color.needsUpdate = true;
  }

  clear() { this.life.fill(0); this.alpha.fill(0); }
}

export class Particles {
  constructor(scene) {
    this.smoke = new Pool(scene, 720, false);
    this.glow = new Pool(scene, 220, true);
    this.detail = 1;             // 0 off, 0.5 fewer, 1 full (graphics quality)
    this._acc = { exhaust: 0, dust: 0, fire: 0, steam: 0, chimney: 0 };
    this.steamOn = this.smokeOn = true;          // switches for the shots script's cost report
    // Scratch lists for the nearest grates/chimneys (no allocation per frame).
    this._near = { grates: new Int32Array(16), chimneys: new Int32Array(16), d: new Float32Array(16) };
    this._turn = 0;
  }

  // Steam curling up from the street grates and smoke drifting off rooftop chimneys: only
  // the few nearest the camera emit (CONFIG.look.atmosphere). Steam is thicker at night and
  // in the rain. Both go in the smoke pool.
  atmosphere(dt, world, cam, { night = 1, wet = 0 } = {}) {
    if (!this.detail || !dt) return;
    const A = CONFIG.look.atmosphere, [wx, wz] = A.wind;
    if (this.steamOn && world.grates) {
      const n = this._nearest(world.grates, cam, A.grates, A.grateRange, this._near.grates);
      for (let k = this._rate('steam', A.steamRate * n * (0.5 + 0.5 * night) * (1 + wet), dt); k > 0; k--) {
        const [x, z] = world.grates[this._near.grates[this._turn++ % n]];
        // Wisps, not a column: small puffs that wander as they rise and thin out.
        this.smoke.emit(x + (Math.random() - 0.5) * 0.9, 0.1, z + (Math.random() - 0.5) * 0.9,
          wx * 0.5 + (Math.random() - 0.5) * 1.1, 0.7 + Math.random() * 1.0, wz * 0.5 + (Math.random() - 0.5) * 1.1,
          { life: 1.8 + Math.random() * 1.6, size: 0.45 + Math.random() * 0.4, grow: 1.2 + Math.random() * 0.8, color: [0.82, 0.8, 0.77], alpha: 0.09 + 0.05 * wet });
      }
    }
    if (this.smokeOn && world.chimneys) {
      const n = this._nearest(world.chimneys, cam, A.chimneys, A.chimneyRange, this._near.chimneys, true);
      for (let k = this._rate('chimney', A.smokeRate * n, dt); k > 0; k--) {
        const [x, y, z] = world.chimneys[this._near.chimneys[this._turn++ % n]];
        this.smoke.emit(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4,
          wx + (Math.random() - 0.5) * 0.3, 0.7 + Math.random() * 0.4, wz + (Math.random() - 0.5) * 0.3,
          { life: 5 + Math.random() * 2, size: 1.3, grow: 2.2, color: [0.32, 0.3, 0.29], alpha: 0.24 });
      }
    }
  }

  // Indices of up to `max` points nearest `cam` within `range` (written into `out`).
  _nearest(list, cam, max, range, out, xyz = false) {
    const d = this._near.d;
    let n = 0;
    max = Math.min(max, out.length);
    for (let i = 0; i < list.length; i++) {
      const p = list[i], dx = p[0] - cam.x, dz = (xyz ? p[2] : p[1]) - cam.z, dd = dx * dx + dz * dz;
      if (dd > range * range || (n === max && dd >= d[n - 1])) continue;
      let k = n < max ? n++ : n - 1;
      while (k > 0 && d[k - 1] > dd) { d[k] = d[k - 1]; out[k] = out[k - 1]; k--; }
      d[k] = dd; out[k] = i;
    }
    return n;
  }

  setScale(px) { this.smoke.material.uniforms.uScale.value = px; this.glow.material.uniforms.uScale.value = px; }

  // Smoke and dust aren't lit by the scene, so they're dimmed to match it (sparks glow).
  setLight(level) { this.smoke.material.uniforms.uLight.value = level; }

  // Whole particles to emit this frame for a steady `perSecond` rate (per emitter `key`).
  _rate(key, perSecond, dt) {
    this._acc[key] = (this._acc[key] || 0) + perSecond * dt * this.detail;
    const n = Math.floor(this._acc[key]);
    this._acc[key] -= n;
    return n;
  }

  // Exhaust from the tailpipe (bigger, darker puffs under throttle) and dust off the wheels
  // on dirt/grass (more when sliding). `exhaust` and `dust` scale them (JUICE.wheels).
  vehicle(dt, v, { throttle = 0, dusty = false, exhaust = 1, dust = 1 }) {
    if (!this.detail) return;
    const fx = v.forwardX, fz = v.forwardZ, p = v.position;
    const speed = Math.abs(v.speed), thr = Math.max(0, throttle);
    if (exhaust > 0) {
      const shade = 0.55 - 0.25 * thr;
      for (let k = this._rate('exhaust', (4 + 22 * thr) * exhaust, dt); k > 0; k--) {
        this.smoke.emit(p.x - fx * 3.1 + fz * 0.7, 0.7, p.z - fz * 3.1 - fx * 0.7, -fx * 1.5 + (Math.random() - 0.5), 0.8 + Math.random() * 0.6, -fz * 1.5 + (Math.random() - 0.5),
          { life: 1.4 + thr * 0.6, size: 0.8 + 0.7 * thr, grow: 2.2 + 1.5 * thr, color: [shade, shade, shade], alpha: 0.3 + 0.2 * thr });
      }
    }
    if (dusty && speed > 5 && dust > 0) {
      for (let k = this._rate('dust', (speed * 1.6 + v.slip * 6) * dust, dt); k > 0; k--) {
        const side = Math.random() < 0.5 ? -1 : 1;
        this.smoke.emit(p.x - fx * 2 + fz * side * 1.1, 0.4, p.z - fz * 2 - fx * side * 1.1, (Math.random() - 0.5) * 2 + v.vx * 0.2, 1 + Math.random(), (Math.random() - 0.5) * 2 + v.vz * 0.2,
          { life: 1.8 + v.slip * 0.1, size: 1.5 + v.slip * 0.1, grow: 3.5, color: [0.55, 0.45, 0.33], alpha: 0.4 });
      }
    }
  }

  // A burst of sparks where metal meets brick.
  sparks(x, z, strength) {
    if (!this.detail) return;
    const n = Math.round(6 + 18 * Math.min(1, strength) * this.detail);
    for (let k = 0; k < n; k++) {
      this.glow.emit(x, 0.9 + Math.random(), z, (Math.random() - 0.5) * 12, 2 + Math.random() * 6, (Math.random() - 0.5) * 12,
        { life: 0.35 + Math.random() * 0.35, size: 0.35, grow: -0.3, color: [1, 0.7, 0.3], alpha: 1, gravity: 18 });
    }
  }

  // Smoke and embers rising from the burning warehouse.
  fire(dt, x, y, z, w) {
    if (!this.detail) return;
    for (let k = this._rate('fire', 30, dt); k > 0; k--) {
      const ox = (Math.random() - 0.5) * w;
      this.smoke.emit(x + ox, y, z + (Math.random() - 0.5) * w * 0.5, 0.8, 3 + Math.random() * 2, 0.3,
        { life: 4, size: 4, grow: 5, color: [0.18, 0.16, 0.15], alpha: 0.55 });
      if (Math.random() < 0.5) {
        this.glow.emit(x + ox, y, z, (Math.random() - 0.5) * 3, 4 + Math.random() * 5, (Math.random() - 0.5) * 3,
          { life: 1.5, size: 0.4, grow: -0.1, color: [1, 0.55, 0.2], alpha: 1, gravity: -1 });
      }
    }
  }

  update(dt) {
    this.smoke.update(dt);
    this.glow.update(dt);
  }

  clear() { this.smoke.clear(); this.glow.clear(); }
}
