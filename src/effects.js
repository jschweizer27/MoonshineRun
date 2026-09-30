import * as THREE from 'three';
import { radialTexture } from './world.js';

// The burning warehouse from Act I: flickering flame sprites plus the shared effects light
// (which always exists, so lighting the fire doesn't recompile any shaders).
export class Fire {
  constructor(scene, fxLight) {
    this.light = fxLight;
    this.group = new THREE.Group();
    const tex = radialTexture([[0, 'rgba(255,245,200,1)'], [0.25, 'rgba(255,170,60,0.9)'], [0.6, 'rgba(220,70,20,0.45)'], [1, 'rgba(120,20,0,0)']]);
    this.flames = [];
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.userData.phase = Math.random() * 10;
      this.group.add(s);
      this.flames.push(s);
    }
    this.group.visible = false;
    scene.add(this.group);
    this.active = false;
  }

  // Set the building ablaze: flames along its roofline and in its windows.
  ignite(b) {
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const w = b.maxX - b.minX, d = b.maxZ - b.minZ;
    this.flames.forEach((f, i) => {
      const onRoof = i < 9;
      const t = (i % 9) / 8;
      const x = onRoof ? b.minX + t * w : cx + (Math.random() - 0.5) * w * 0.8;
      const z = onRoof ? (i % 2 ? b.minZ : b.maxZ) : b.maxZ + 0.3;
      const y = onRoof ? b.h + 1.5 : 2 + Math.random() * (b.h - 3);
      f.position.set(x, y, onRoof ? cz + (z - cz) * 0.6 : z);
      f.userData.base = onRoof ? 7 + Math.random() * 4 : 4 + Math.random() * 2;
    });
    this.light.position.set(cx, b.h + 4, cz + d * 0.3);
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
    for (const f of this.flames) {
      const k = 0.75 + 0.35 * Math.abs(Math.sin(time * 9 + f.userData.phase)) + 0.1 * Math.sin(time * 23 + f.userData.phase);
      f.scale.set(f.userData.base * 0.7 * k, f.userData.base * k, 1);
      f.material.opacity = 0.75 + 0.25 * Math.sin(time * 13 + f.userData.phase);
    }
    this.light.intensity = 900 + 350 * Math.sin(time * 17) + 200 * Math.sin(time * 7.3);
  }
}
