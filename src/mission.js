import * as THREE from 'three';
import { CONFIG } from './config.js';
import { radialTexture } from './world.js';

// The bootlegger loop and the heat system.
//  - Load shine at a still, deliver it to a drop, get paid.
//  - While you haul, informants (the Temperance Alliance) build suspicion until the
//    police are tipped off (1 star). Staying in a pursuer's sight while loaded builds
//    heat toward 3 stars; staying out of every pursuer's sight sheds a star at a time.
// update() returns events (pickup, deliver, spotted, lostTier, clear) for the HUD and
// audio to react to, so this class never touches the DOM.
export class Mission {
  constructor(scene, world, rng) {
    this.world = world;
    this.rng = rng;
    this.pickup = makeMarker(scene, 0xe0a83a, 'still');
    this.drop = makeMarker(scene, 0x5aa7d8, 'drop');
    this.reset(new THREE.Vector3());
  }

  reset(playerPos) {
    this.cash = 0;
    this.runs = 0;
    this.carrying = false;
    this.heat = 0;
    this.suspicion = 0;
    this.evade = 0;
    this.drop.visible = false;
    this._placePickup(playerPos);
  }

  // Whole stars (0..3); `heat - tier` is progress toward the next star.
  get tier() { return Math.min(CONFIG.heat.max, Math.floor(this.heat + 1e-6)); }
  get target() { return this.carrying ? this.drop.position : this.pickup.position; }
  get objective() { return this.carrying ? 'Deliver the shine' : 'Drive to the still'; }
  get targetKind() { return this.carrying ? 'drop' : 'still'; }

  _placePickup(avoid) {
    this.pickup.position.copy(this.world.randomRoadPoint(this.rng, avoid, CONFIG.mission.minPickupDistance));
    this.pickup.visible = true;
  }

  _placeDrop(avoid) {
    this.drop.position.copy(this.world.randomRoadPoint(this.rng, avoid, CONFIG.mission.minDropDistance));
    this.drop.visible = true;
  }

  update(dt, playerPos, police, time) {
    const events = [];
    const H = CONFIG.heat;
    const R = CONFIG.mission.markerRadius;
    animateMarker(this.pickup, time);
    animateMarker(this.drop, time);

    if (!this.carrying && this.pickup.visible && flatDist(playerPos, this.pickup.position) < R) {
      this.carrying = true;
      this.pickup.visible = false;
      this._placeDrop(playerPos);
      events.push({ type: 'pickup' });
    } else if (this.carrying && this.drop.visible && flatDist(playerPos, this.drop.position) < R) {
      this.carrying = false;
      this.drop.visible = false;
      this.cash += CONFIG.mission.reward;
      this.runs += 1;
      events.push({ type: 'deliver', amount: CONFIG.mission.reward });
      this._placePickup(playerPos);
    }

    if (this.carrying && this.heat === 0) {
      this.suspicion += H.tipOffRate * dt;
      if (this.suspicion >= 1) {
        this.heat = 1;
        this.suspicion = 0;
        this.evade = 0;
        events.push({ type: 'spotted' });
      }
    }

    if (this.heat > 0) {
      if (police.seen) {
        this.evade = 0;
        if (this.carrying) this.heat = Math.min(H.max, this.heat + H.buildRateSeen * dt);
      } else if (police.contact || !this.carrying) {
        const tier = Math.max(1, this.tier);
        this.evade += dt / H.evadeTime[tier];
        if (this.evade >= 1) {
          this.heat = tier - 1;
          this.evade = 0;
          events.push(this.heat > 0 ? { type: 'lostTier', tier: this.tier } : { type: 'clear' });
        }
      }
    }
    return events;
  }
}

function flatDist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

let glowTex = null;
// Stills and drops differ in shape as well as colour (colour-blind friendly): the still
// has a round ring, a solid beam and a jug icon; the drop has a diamond ring, a striped
// beam and a down-arrow icon. Both carry a text label.
function makeMarker(scene, color, kind) {
  const group = new THREE.Group();
  const isDrop = kind === 'drop';
  const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  if (isDrop) {
    beamMat.alphaMap = stripeTexture();
    beamMat.alphaMap.repeat.set(1, 12);
  }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 60, 16, 1, true).translate(0, 30, 0), beamMat);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(6.5, 0.4, 8, isDrop ? 4 : 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color }));
  ring.position.y = 0.35;
  glowTex = glowTex || radialTexture([[0, 'rgba(255,255,255,0.9)'], [0.6, 'rgba(255,255,255,0.25)'], [1, 'rgba(255,255,255,0)']]);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 18).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: glowTex, color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  glow.position.y = 0.06;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(kind, color), transparent: true, depthWrite: false }));
  label.scale.set(9, 4.5, 1);
  label.position.y = 8;
  group.add(beam, ring, glow, label);
  group.userData = { ring, beam };
  scene.add(group);
  return group;
}

function stripeTexture() {
  const cv = document.createElement('canvas');
  cv.width = 4; cv.height = 32;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 4, 18);
  g.fillStyle = '#333'; g.fillRect(0, 18, 4, 14);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Icon + word on a dark plate, drawn once per marker.
function labelTexture(kind, color) {
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
  g.translate(56, 64);
  if (kind === 'drop') {
    g.fillRect(-10, -30, 20, 30);                                                  // down arrow
    g.beginPath(); g.moveTo(-26, 0); g.lineTo(26, 0); g.lineTo(0, 30); g.closePath(); g.fill();
  } else {
    g.beginPath(); g.ellipse(0, 8, 24, 22, 0, 0, Math.PI * 2); g.fill();            // jug
    g.fillRect(-9, -26, 18, 14);
    g.lineWidth = 6; g.beginPath(); g.arc(22, -2, 12, -Math.PI / 2, Math.PI / 2); g.stroke();
  }
  g.restore();
  g.font = 'bold 50px Georgia, serif';
  g.textBaseline = 'middle';
  g.fillText(kind === 'drop' ? 'DROP' : 'STILL', 100, 66);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function animateMarker(m, time) {
  if (!m.visible) return;
  m.userData.ring.rotation.y = time * 1.2;
  if (m.userData.beam.material.alphaMap) m.userData.beam.material.alphaMap.offset.y = -time * 0.6;
  m.userData.ring.scale.setScalar(1 + Math.sin(time * 3) * 0.05);
  m.userData.beam.material.opacity = 0.28 + Math.sin(time * 2.2) * 0.08;
}
