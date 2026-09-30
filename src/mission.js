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
    this.pickup = makeMarker(scene, 0xe0a83a);
    this.drop = makeMarker(scene, 0x5aa7d8);
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
function makeMarker(scene, color) {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 60, 16, 1, true).translate(0, 30, 0),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  const ring = new THREE.Mesh(new THREE.TorusGeometry(6.5, 0.35, 8, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color }));
  ring.position.y = 0.35;
  glowTex = glowTex || radialTexture([[0, 'rgba(255,255,255,0.9)'], [0.6, 'rgba(255,255,255,0.25)'], [1, 'rgba(255,255,255,0)']]);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 18).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: glowTex, color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  glow.position.y = 0.06;
  group.add(beam, ring, glow);
  group.userData = { ring, beam };
  scene.add(group);
  return group;
}

function animateMarker(m, time) {
  if (!m.visible) return;
  m.userData.ring.rotation.y = time * 1.2;
  m.userData.ring.scale.setScalar(1 + Math.sin(time * 3) * 0.05);
  m.userData.beam.material.opacity = 0.28 + Math.sin(time * 2.2) * 0.08;
}
