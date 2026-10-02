import * as THREE from 'three';
import { CONFIG } from './config.js';
import { radialTexture } from './world.js';

// The bootlegger loop and the heat system.
//  - Drive to a still (a county barn) and pick an order from the book: bigger loads pay
//    more but draw more heat. Deliver it to the named buyer in the city.
//  - While you haul, informants build suspicion; patrols can spot you. Staying in a
//    pursuer's sight while loaded builds heat toward 3 stars; staying out of every
//    pursuer's sight sheds a star at a time. Drive slowly with the horse box (once the
//    Jockey has shown you the trick) and you blend in.
//  - Mode 'escape' is Act I: get out of the burning city up York Road.
// update() returns events for main.js to act on; this class never touches the DOM.
export class Mission {
  constructor(scene, world, rng, career) {
    this.world = world;
    this.rng = rng;
    this.career = career;
    this.pickup = makeMarker(scene, 0xe0a83a, 'still');
    this.drop = makeMarker(scene, 0x5aa7d8, 'drop');
    this.hideoutMarker = makeMarker(scene, 0x8fd18a, 'hideout');
    this.goal = makeMarker(scene, 0xf2c55c, 'goal');
    this.hideoutMarker.position.set(world.hideout.laneX, 0, world.hideout.laneZ);
    this.goal.position.set(0, 0, -292);
    this.reset(new THREE.Vector3(), 'loop');
  }

  reset(playerPos, mode = 'loop') {
    this.mode = mode;
    this.carrying = false;
    this.order = null;
    this.pendingOrders = null;
    this.heat = 0;
    this.suspicion = 0;
    this.evade = 0;
    this.maxHeat = 0;
    this.streakEarned = 0;
    this.streakRuns = 0;
    this.runStart = 0;
    this._inHideout = true;
    this._declined = false;
    this.drop.visible = false;
    this.goal.visible = mode === 'escape';
    this.hideoutMarker.visible = mode === 'loop';
    if (mode === 'loop') this._placePickup(playerPos);
    else this.pickup.visible = false;
  }

  // Whole stars (0..3); `heat - tier` is progress toward the next star.
  get tier() { return Math.min(CONFIG.heat.max, Math.floor(this.heat + 1e-6)); }
  // Kept for the HUD/tests: money earned since the last bust.
  get cash() { return this.streakEarned; }
  get runs() { return this.streakRuns; }

  get target() {
    if (this.mode === 'escape') return this.goal.position;
    return this.carrying ? this.drop.position : this.pickup.position;
  }
  get targetKind() { return this.mode === 'escape' ? 'goal' : this.carrying ? 'drop' : 'still'; }
  get objective() {
    if (this.mode === 'escape') return 'Escape the fire — get out up York Road';
    return this.carrying ? `Deliver to ${this.order?.drop.name ?? 'the drop'}` : `Load shine at ${this.still.name}`;
  }

  _placePickup(avoid) {
    const far = this.world.barns.filter((b) => Math.hypot(b.laneX - avoid.x, b.laneZ - avoid.z) >= CONFIG.mission.minPickupDistance);
    this.still = this.rng.pick(far.length ? far : this.world.barns);
    this.pickup.position.set(this.still.laneX, 0, this.still.laneZ);
    this.pickup.visible = true;
  }

  // Three offers from different buyers. Pay rises with size and distance.
  generateOrders() {
    const perks = this.career.perks;
    const drops = [...this.world.drops].sort(() => this.rng() - 0.5);
    return CONFIG.mission.orders.map((o, i) => {
      const drop = drops[i];
      const dist = Math.hypot(drop.x - this.still.laneX, drop.z - this.still.laneZ);
      const jugs = Math.min(Math.round(o.jugs * perks.jugs), perks.maxJugs ?? Infinity);
      const locked = !!o.needsBigOrders && !perks.bigOrders;
      return {
        ...o, drop, jugs, dist,
        pay: Math.round((jugs * o.price * (1 + dist / 900)) / 10) * 10,
        locked, lockReason: locked ? (perks.trailer === false ? 'Won’t fit in the trunk' : 'Needs Still-master') : '',
      };
    });
  }

  // The player picked an order at the still.
  acceptOrder(i, time) {
    const events = [];
    const o = this.pendingOrders?.[i];
    if (!o || o.locked) return events;
    this.order = o;
    this.pendingOrders = null;
    this.carrying = true;
    this.pickup.visible = false;
    this.drop.position.set(o.drop.x, 0, o.drop.z);
    this.drop.visible = true;
    this.runStart = time;
    this.maxHeat = this.tier;
    events.push({ type: 'pickup', order: o });
    if (o.tipOff && this.heat < 1) {
      // Word of a big order gets around: the law knows before you've left the barn.
      this.heat = 1;
      this.suspicion = 0;
      events.push({ type: 'spotted', reason: 'tipoff' });
    }
    return events;
  }

  // ctx: { speed, disguised, safeZone, suspicion (the car's multiplier), env: { suspicion } }
  update(dt, playerPos, police, time, ctx = {}) {
    const events = [];
    const H = CONFIG.heat;
    const R = CONFIG.mission.markerRadius;
    for (const m of [this.pickup, this.drop, this.hideoutMarker, this.goal]) animateMarker(m, time, ctx.camera);

    if (this.mode === 'escape') {
      if (flatDist(playerPos, this.goal.position) < R + 3) events.push({ type: 'escaped' });
    } else if (!this.carrying && this.pickup.visible && !this.pendingOrders && !this._declined && flatDist(playerPos, this.pickup.position) < R) {
      this.pendingOrders = this.generateOrders();
      events.push({ type: 'orders', options: this.pendingOrders, still: this.still });
    } else if (this.carrying && this.drop.visible && flatDist(playerPos, this.drop.position) < R) {
      const o = this.order;
      this.carrying = false;
      this.drop.visible = false;
      this.streakEarned += o.pay;
      this.streakRuns += 1;
      events.push({
        type: 'deliver', amount: o.pay, jugs: o.jugs, route: `${this.still.name} → ${o.drop.name}`,
        seconds: time - this.runStart, maxHeat: this.maxHeat,
      });
      this.order = null;
      this._placePickup(playerPos);
    }

    // Walked away from the order book: offer again once you've left the ring.
    if (this._declined && flatDist(playerPos, this.pickup.position) > R + 4) this._declined = false;

    // Laying low at the hideout (drive in slowly, empty).
    if (this.mode === 'loop') {
      const inside = flatDist(playerPos, this.hideoutMarker.position) < R;
      if (inside && !this._inHideout && !this.carrying && Math.abs(ctx.speed ?? 0) < 9) {
        this._inHideout = true;
        events.push({ type: 'hideout' });
      }
      if (!inside) this._inHideout = false;
    }

    const mult = this.order?.heat ?? 1;
    if (this.carrying && this.heat === 0 && !ctx.safeZone) {
      this.suspicion += H.tipOffRate * mult * (ctx.env?.suspicion ?? 1) * (ctx.disguised ? H.disguiseSuspicion : 1) * (ctx.suspicion ?? 1) * dt;
      if (this.suspicion >= 1) {
        this.heat = 1;
        this.suspicion = 0;
        this.evade = 0;
        events.push({ type: 'spotted', reason: 'tip' });
      }
    }
    if (police.spotted && this.heat === 0) {
      this.heat = 1;
      this.suspicion = 0;
      this.evade = 0;
      events.push({ type: 'spotted', reason: 'patrol' });
    }

    if (this.heat > 0) {
      if (police.seen && !ctx.safeZone) {
        this.evade = 0;
        if (this.carrying) this.heat = Math.min(H.max, this.heat + H.buildRateSeen * mult * (ctx.disguised ? 0.5 : 1) * dt);
      } else if (police.contact || !this.carrying || ctx.safeZone) {
        const tier = Math.max(1, this.tier);
        this.evade += (dt / H.evadeTime[tier]) * (ctx.safeZone ? 2.5 : 1);
        if (this.evade >= 1) {
          this.heat = tier - 1;
          this.evade = 0;
          events.push(this.heat > 0 ? { type: 'lostTier', tier: this.tier } : { type: 'clear' });
        }
      }
    }
    this.maxHeat = Math.max(this.maxHeat, this.tier);
    return events;
  }

  declineOrders() {
    this.pendingOrders = null;
    this._declined = true;
  }

  // Busted or laid low: wipe the heat.
  clearHeat() {
    this.heat = 0;
    this.suspicion = 0;
    this.evade = 0;
  }
}

function flatDist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

let glowTex = null;
// Markers differ in shape as well as colour (colour-blind friendly): the still has a
// round ring and a jug icon; the drop a diamond ring, striped beam and down-arrow; the
// hideout a square ring and house; the York Road goal a gold flag; the dredge run's market
// a hexagon ring and a market-stall awning. All carry a label.
const SHAPES = { still: 40, drop: 4, hideout: 4, goal: 40, market: 6 };
export function makeMarker(scene, color, kind) {
  const group = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  if (kind === 'drop') {
    beamMat.alphaMap = stripeTexture();
    beamMat.alphaMap.repeat.set(1, 12);
  }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 60, 16, 1, true).translate(0, 30, 0), beamMat);
  const ringGeo = new THREE.TorusGeometry(6.5, 0.4, 8, SHAPES[kind]).rotateX(-Math.PI / 2);
  if (kind === 'hideout') ringGeo.rotateY(Math.PI / 4);      // square, not diamond
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color }));
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
  group.userData = { ring, beam, spin: kind !== 'hideout' };
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
  g.strokeStyle = hex;
  g.save();
  g.translate(52, 64);
  if (kind === 'drop') {
    g.fillRect(-10, -30, 20, 30);
    g.beginPath(); g.moveTo(-26, 0); g.lineTo(26, 0); g.lineTo(0, 30); g.closePath(); g.fill();
  } else if (kind === 'hideout') {
    g.beginPath(); g.moveTo(0, -30); g.lineTo(30, -4); g.lineTo(22, -4); g.lineTo(22, 28); g.lineTo(-22, 28); g.lineTo(-22, -4); g.lineTo(-30, -4); g.closePath(); g.fill();
  } else if (kind === 'market') {
    // A stall: a scalloped awning over a counter.
    g.beginPath(); g.moveTo(-30, -14); g.lineTo(-22, -30); g.lineTo(22, -30); g.lineTo(30, -14); g.closePath(); g.fill();
    for (let k = -3; k <= 3; k += 2) { g.beginPath(); g.arc(k * 7.5, -14, 7.5, 0, Math.PI); g.fill(); }
    g.fillRect(-26, 6, 52, 8);
    g.fillRect(-24, -6, 5, 34); g.fillRect(19, -6, 5, 34);
  } else if (kind === 'goal') {
    g.fillRect(-16, -30, 6, 60);
    g.beginPath(); g.moveTo(-10, -30); g.lineTo(26, -18); g.lineTo(-10, -4); g.closePath(); g.fill();
  } else {
    g.beginPath(); g.ellipse(0, 8, 24, 22, 0, 0, Math.PI * 2); g.fill();
    g.fillRect(-9, -26, 18, 14);
    g.lineWidth = 6; g.beginPath(); g.arc(22, -2, 12, -Math.PI / 2, Math.PI / 2); g.stroke();
  }
  g.restore();
  const word = { drop: 'DROP', still: 'STILL', hideout: 'HIDEOUT', goal: 'YORK RD', market: 'MARKET' }[kind];
  g.font = `bold ${word.length > 5 ? 38 : 50}px Georgia, serif`;
  g.textBaseline = 'middle';
  g.fillText(word, 94, 66);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function animateMarker(m, time, camera) {
  if (!m.visible) return;
  // Don't let the glowing beam fill the screen when the camera passes through it.
  if (camera) m.userData.beam.visible = Math.hypot(camera.x - m.position.x, camera.z - m.position.z) > 3;
  if (m.userData.spin) m.userData.ring.rotation.y = time * 1.2;
  m.userData.ring.scale.setScalar(1 + Math.sin(time * 3) * 0.05);
  m.userData.beam.material.opacity = 0.28 + Math.sin(time * 2.2) * 0.08;
  if (m.userData.beam.material.alphaMap) m.userData.beam.material.alphaMap.offset.y = -time * 0.6;
}
