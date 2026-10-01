import * as THREE from 'three';
import { radialTexture } from './world.js';

// The burning warehouse from Act I: flickering flames plus the shared effects light (which
// always exists, so lighting the fire doesn't recompile any shaders). The flames are one
// Points object (one draw call): each point is a soft additive glow that swells and fades.
const N = 26, ROOF = 18;   // flames: along both long rooflines, then in the windows
const VERT = `
  attribute float size;
  attribute float alpha;
  uniform float uScale;
  varying float vAlpha;
  void main() {
    vAlpha = alpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * uScale / max(0.5, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = `
  uniform sampler2D map;
  varying float vAlpha;
  void main() {
    // Taller than wide: squeeze the glow sideways so it reads as a flame.
    vec2 uv = vec2(0.5 + (gl_PointCoord.x - 0.5) * 1.4, gl_PointCoord.y);
    gl_FragColor = texture2D(map, uv) * vAlpha;
  }`;

export class Fire {
  constructor(scene, fxLight) {
    this.light = fxLight;
    const tex = radialTexture([[0, 'rgba(255,245,200,1)'], [0.25, 'rgba(255,170,60,0.9)'], [0.6, 'rgba(220,70,20,0.45)'], [1, 'rgba(120,20,0,0)']]);
    this.pos = new Float32Array(N * 3);
    this.size = new Float32Array(N);
    this.alpha = new Float32Array(N);
    this.base = new Float32Array(N);
    this.phase = Float32Array.from({ length: N }, () => Math.random() * 10);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { map: { value: tex }, uScale: { value: 360 } },
    });
    this.group = new THREE.Points(g, this.material);
    this.group.frustumCulled = false;
    this.group.visible = false;
    scene.add(this.group);
    this.active = false;
  }

  // Set the building ablaze: flames along its roofline and in its windows.
  ignite(b) {
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const w = b.maxX - b.minX, d = b.maxZ - b.minZ;
    for (let i = 0; i < N; i++) {
      const onRoof = i < ROOF;
      const t = (Math.floor(i / 2) + 0.5) / (ROOF / 2) + (Math.random() - 0.5) * 0.04;
      const x = onRoof ? b.minX + t * w : cx + (Math.random() - 0.5) * w * 0.85;
      const z = onRoof ? (i % 2 ? b.minZ : b.maxZ) : b.maxZ + 0.3;
      const y = onRoof ? b.h + 1.2 + Math.random() * 0.8 : 2 + Math.random() * (b.h - 3);
      this.pos.set([x, y, onRoof ? cz + (z - cz) * 0.7 : z], i * 3);
      this.base[i] = onRoof ? 3.5 + Math.random() * 2 : 2.5 + Math.random() * 1.5;
    }
    this.group.geometry.attributes.position.needsUpdate = true;
    this.light.position.set(cx, b.h + 4, cz + d * 0.3);
    this.light.color.setHex(0xff8a3a);          // the light is shared with the siren sweep
    this.group.visible = true;
    this.active = true;
  }

  out() {
    this.group.visible = false;
    this.light.intensity = 0;
    this.active = false;
  }

  update(time) {
    if (!this.active) return;
    for (let i = 0; i < N; i++) {
      const p = this.phase[i];
      const k = 0.75 + 0.35 * Math.abs(Math.sin(time * 9 + p)) + 0.1 * Math.sin(time * 23 + p);
      this.size[i] = this.base[i] * k;
      this.alpha[i] = 0.6 + 0.25 * Math.sin(time * 13 + p);
    }
    const a = this.group.geometry.attributes;
    a.size.needsUpdate = a.alpha.needsUpdate = true;
    this.light.intensity = 900 + 350 * Math.sin(time * 17) + 200 * Math.sin(time * 7.3);
  }
}
