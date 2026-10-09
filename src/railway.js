import * as THREE from 'three';
import { CONFIG } from './config.js';

// The Western Maryland's line down the county's west edge, and the midnight freight that
// stands at the Glyndon siding every night in its hours (CONFIG.dredge.story.freight.window):
// chapter 3, "The Western Line" (chapters.js). The track is one instanced mesh (sleepers
// and rails), the train another (loco, tender, boxcars and the guard's van, boxes with a
// colour each); both hide when the camera is far off. The train rolls in from the north at
// the start of its hours and on south at the end, and while it stands a collider keeps the
// truck off it. It's built away (not standing) at boot, so nothing placed then depends on
// the hour.
export const RAILWAY = {
  x: -430, z0: -262, z1: -1035,          // the main line, along the wall
  siding: { x: -424, z0: -760, z1: -650 },  // north and south ends (it joins the line at both)
  clear: -415,                           // county trees west of this are left out (county.js)
  load: { x: -414, z: -702 },            // beside the boxcars: where chapter 3's crates go aboard
  van: { x: -414, z: -668 },             // beside the guard's van, at the train's south end
};
const GAUGE = 1.44, SLEEPER = 2.4, SLIDE = 0.2, FAR = 480;

// Whether `hour` is inside a [from, to) window that may wrap past midnight.
export const inWindow = (hour, [a, b]) => (a <= b ? hour >= a && hour < b : hour >= a || hour < b);

export class Railway {
  constructor(scene, world) {
    this.world = world;
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const material = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.25 });
    // The track: sleepers every SLEEPER metres and two rails, on the main line and the siding
    // (which joins it at both ends).
    const pieces = [];
    const wood = new THREE.Color(0x3a2a1e), steel = new THREE.Color(0x6c6f72);
    const line = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(x1 - x0, z1 - z0);
      for (let t = SLEEPER / 2; t < len; t += SLEEPER) pieces.push({ x: x0 + ((x1 - x0) * t) / len, z: z0 + ((z1 - z0) * t) / len, a, w: 2.6, h: 0.12, d: 0.36, c: wood });
      for (const s of [-1, 1]) {
        const ox = Math.cos(a) * s * (GAUGE / 2), oz = -Math.sin(a) * s * (GAUGE / 2);
        pieces.push({ x: (x0 + x1) / 2 + ox, z: (z0 + z1) / 2 + oz, a, w: 0.1, h: 0.24, d: len, c: steel });
      }
    };
    const { x, z0, z1, siding: S } = RAILWAY;
    line(x, z0, x, z1);
    line(S.x, S.z0 + 14, S.x, S.z1 - 14);
    line(x, S.z0 - 10, S.x, S.z0 + 14);
    line(S.x, S.z1 - 14, x, S.z1 + 10);
    this.track = new THREE.InstancedMesh(box, material, pieces.length);
    this.track.name = 'railway';
    this.track.userData.noShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    pieces.forEach((k, i) => {
      q.setFromAxisAngle(up, k.a);
      this.track.setMatrixAt(i, m.compose(p.set(k.x, 0.02, k.z), q, s.set(k.w, k.h, k.d)));
      this.track.setColorAt(i, k.c);
    });
    this.track.instanceMatrix.needsUpdate = true;
    this.track.instanceColor.needsUpdate = true;
    scene.add(this.track);
    // The midnight freight, built along +z from its north end at z = 0 (placed on the
    // siding as it stands): [length, width, height, colour, extra boxes on top].
    const black = 0x1c1d20, rust = 0x6e2c20, brown = 0x4e3626, van = 0x8a2a1c;
    const cars = [
      ['loco', 9.5, 1.9, 2.4, black], ['tender', 5.2, 2.5, 2.3, black],
      ['box', 10, 2.7, 3.1, rust], ['box', 10, 2.7, 3.1, brown], ['box', 10, 2.7, 3.1, rust], ['box', 10, 2.7, 3.1, rust],
      ['van', 7, 2.6, 2.8, van],
    ];
    const boxes = [];
    let at = 0;
    for (const [kind, len, w, h, c] of cars) {
      const mid = at + len / 2;
      boxes.push([0, 0.55, mid, w - 0.3, 0.55, len - 1.2, 0x121212]);                       // the trucks and wheels
      if (kind === 'loco') {
        boxes.push([0, 1.1, mid + 1.4, 1.7, 1.7, len - 3.2, c]);                             // the boiler
        boxes.push([0, 1.1, at + len - 1.6, 2.5, 2.4, 3, c]);                                // the cab
        boxes.push([0, 2.8, at + 1.6, 0.6, 1.1, 0.6, c]);                                    // the stack
        boxes.push([0, 1.6, at + 0.05, 0.5, 0.5, 0.2, 0xfff2c0]);                            // the headlamp
      } else {
        boxes.push([0, 1.1, mid, w, h - 1.1, len, c]);
        if (kind === 'van') boxes.push([0, h, mid, 1.5, 0.8, 2.6, c]);                        // the cupola
      }
      at += len + 1;
    }
    this.length = at - 1;
    this.train = new THREE.InstancedMesh(box, material, boxes.length);
    this.train.name = 'freight';
    boxes.forEach(([bx, by, bz, w, h, d, c], i) => {
      this.train.setMatrixAt(i, m.compose(p.set(bx, by, bz), q.identity(), s.set(w, h, d)));
      this.train.setColorAt(i, new THREE.Color(c));
    });
    this.train.instanceMatrix.needsUpdate = true;
    this.train.instanceColor.needsUpdate = true;
    scene.add(this.train);
    this.home = S.z1 - 14 - this.length - 1;   // its north end when standing (the van at the south end)
    this.collider = null;
    this.standing = false;
    this.offset = null;
    this._place(-1e4);                   // away at boot
  }

  // Where the train is now: `offset` metres along the line from its standing place
  // (negative: north, still coming; positive: south, gone on). -1e4 puts it out of the world.
  _place(offset) {
    if (offset === this.offset) return;
    this.offset = offset;
    this.train.position.set(RAILWAY.siding.x, 0, this.home + offset);
    this.train.updateMatrixWorld();
  }

  // Each step: the train's place by the clock (`hour`), shown only near the camera. Returns
  // 'arrived' when it pulls in (for the whistle), else null.
  update(hour, cam) {
    const W = CONFIG.dredge.story.freight.window, len = (W[1] - W[0] + 24) % 24;
    const into = (hour - W[0] + 24) % 24;
    let offset = -1e4, event = null;
    if (into < len) {
      offset = into < SLIDE ? -(1 - into / SLIDE) * 180 : into > len - SLIDE ? ((into - (len - SLIDE)) / SLIDE) * 180 : 0;
    }
    const standing = offset === 0;
    if (standing && !this.standing) {
      const S = RAILWAY.siding;
      this.collider = this.world.collision.addCapsule(S.x, this.home + 1, S.x, this.home + this.length - 1, 1.9, { tag: 'train', blocksSight: true });
      event = 'arrived';
    } else if (!standing && this.standing && this.collider) {
      this.world.collision.remove(this.collider);
      this.collider = null;
    }
    this.standing = standing;
    this._place(offset);
    const dz = Math.max(0, cam.z - RAILWAY.z0, RAILWAY.z1 - cam.z), near = Math.hypot(cam.x - RAILWAY.x, dz) < FAR;
    this.track.visible = near;
    this.train.visible = near && offset > -1e3;
    return event;
  }

  // In its hours and standing at the siding (the story's loading and the van open then).
  get here() { return this.standing; }
}
