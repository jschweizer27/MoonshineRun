import * as THREE from 'three';
import { radialTexture } from './world.js';

// A market's marker: a glowing beam you can see down the street, a slowly turning hexagon on
// the ground, a soft glow under it and a stall sign. Built once per town at boot; main.js
// shows it only near the town (each costs four draw calls).
let glowTex = null;
export function makeMarker(scene, color) {
  const group = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 60, 16, 1, true).translate(0, 30, 0), beamMat);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(6.5, 0.4, 8, 6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color }));
  ring.position.y = 0.35;
  glowTex = glowTex || radialTexture([[0, 'rgba(255,255,255,0.9)'], [0.6, 'rgba(255,255,255,0.25)'], [1, 'rgba(255,255,255,0)']]);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 18).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: glowTex, color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  glow.position.y = 0.06;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(color), transparent: true, depthWrite: false }));
  label.scale.set(9, 4.5, 1);
  label.position.y = 8;
  group.add(beam, ring, glow, label);
  group.userData = { ring, beam };
  scene.add(group);
  return group;
}

// A stall icon (a scalloped awning over a counter) and MARKET on a dark plate.
function labelTexture(color) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  const hex = `#${new THREE.Color(color).getHexString()}`;
  g.fillStyle = 'rgba(13,11,8,0.8)';
  g.strokeStyle = hex;
  g.lineWidth = 6;
  g.beginPath();
  g.roundRect(6, 20, 244, 88, 14);
  g.fill();
  g.stroke();
  g.fillStyle = hex;
  g.save();
  g.translate(52, 64);
  g.beginPath(); g.moveTo(-30, -14); g.lineTo(-22, -30); g.lineTo(22, -30); g.lineTo(30, -14); g.closePath(); g.fill();
  for (let k = -3; k <= 3; k += 2) { g.beginPath(); g.arc(k * 7.5, -14, 7.5, 0, Math.PI); g.fill(); }
  g.fillRect(-26, 6, 52, 8);
  g.fillRect(-24, -6, 5, 34); g.fillRect(19, -6, 5, 34);
  g.restore();
  g.font = 'bold 50px Georgia, serif';
  g.textBaseline = 'middle';
  g.fillText('MARKET', 94, 66);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function animateMarker(m, time, camera) {
  if (!m.visible) return;
  // Don't let the glowing beam fill the screen when the camera passes through it.
  if (camera) m.userData.beam.visible = Math.hypot(camera.x - m.position.x, camera.z - m.position.z) > 3;
  m.userData.ring.rotation.y = time * 1.2;
  m.userData.ring.scale.setScalar(1 + Math.sin(time * 3) * 0.05);
  m.userData.beam.material.opacity = 0.28 + Math.sin(time * 2.2) * 0.08;
}
