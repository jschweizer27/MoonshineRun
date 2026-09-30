import * as THREE from 'three';
import { radialTexture } from './world.js';

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
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 t = texture2D(map, gl_PointCoord);
    if (t.a * vAlpha < 0.01) discard;
    gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
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
      uniforms: { map: { value: radialTexture([[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']], 64) }, uScale: { value: 400 } },
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
    this.smoke = new Pool(scene, 420, false);
    this.glow = new Pool(scene, 220, true);
    this.detail = 1;             // 0 off, 0.5 fewer, 1 full (graphics quality)
    this._acc = { exhaust: 0, dust: 0, fire: 0 };
  }

  setScale(px) { this.smoke.material.uniforms.uScale.value = px; this.glow.material.uniforms.uScale.value = px; }

  _rate(key, perSecond, dt) {
    this._acc[key] += perSecond * dt * this.detail;
    const n = Math.floor(this._acc[key]);
    this._acc[key] -= n;
    return n;
  }

  // Exhaust from the tailpipe (more under throttle) and dust off the wheels on dirt/grass.
  vehicle(dt, v, { throttle = 0, dusty = false }) {
    if (!this.detail) return;
    const fx = v.forwardX, fz = v.forwardZ, p = v.position;
    const speed = Math.abs(v.speed);
    for (let k = this._rate('exhaust', 4 + 18 * Math.max(0, throttle), dt); k > 0; k--) {
      this.smoke.emit(p.x - fx * 3.1 + fz * 0.7, 0.7, p.z - fz * 3.1 - fx * 0.7, -fx * 1.5 + (Math.random() - 0.5), 0.8 + Math.random() * 0.6, -fz * 1.5 + (Math.random() - 0.5),
        { life: 1.4, size: 0.8, grow: 2.2, color: [0.55, 0.55, 0.55], alpha: 0.35 });
    }
    if (dusty && speed > 5) {
      for (let k = this._rate('dust', speed * 1.6 + v.slip * 3, dt); k > 0; k--) {
        const side = Math.random() < 0.5 ? -1 : 1;
        this.smoke.emit(p.x - fx * 2 + fz * side * 1.1, 0.4, p.z - fz * 2 - fx * side * 1.1, (Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2,
          { life: 1.8, size: 1.5, grow: 3.5, color: [0.55, 0.45, 0.33], alpha: 0.4 });
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
