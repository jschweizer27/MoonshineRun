import * as THREE from 'three';

// The bootlegger loop + economy: place a still (pickup) and a drop (delivery),
// detect proximity, move cargo, pay out cash, and run the wanted/heat system that
// drives how many pursuers spawn. Mirrors Dev Guide Phases 4-5.
export class Mission {
  constructor(scene, world, hud) {
    this.scene = scene;
    this.world = world;
    this.hud = hud;

    this.cash = 0;
    this.runs = 0;
    this.carrying = false;
    this.wanted = 0;          // 0..3, continuous internally
    this.maxWanted = 3;

    this.reward = 850;
    this.pickupRadius = 7;
    this.deliverRadius = 7;

    // Heat dynamics.
    this.heatBuildRate = 0.18;   // per second while carrying
    this.heatDecayRate = 0.45;   // per second while clean
    this._lastWantedInt = 0;

    this.pickup = this._makeMarker(0xe0a83a);   // amber still
    this.drop = this._makeMarker(0x5aa7d8);     // blue drop
    this.drop.visible = false;

    this._placePickup();
  }

  _makeMarker(color) {
    const group = new THREE.Group();

    // Glowing beacon pillar so it's visible from across the city.
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 30, 12, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, side: THREE.DoubleSide })
    );
    pillar.position.y = 15;
    group.add(pillar);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(6, 0.4, 8, 32),
      new THREE.MeshBasicMaterial({ color })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.3;
    group.add(ring);

    const glow = new THREE.PointLight(color, 8, 40, 2);
    glow.position.y = 5;
    group.add(glow);

    group.userData.ring = ring;
    this.scene.add(group);
    return group;
  }

  _placePickup() {
    const p = this.world.randomRoadPoint();
    this.pickup.position.copy(p);
    this.pickup.visible = true;
    this.hud.setObjective('Drive to the still to load shine');
  }

  _placeDrop(awayFrom) {
    const p = this.world.randomRoadPoint(awayFrom, 90);
    this.drop.position.copy(p);
    this.drop.visible = true;
    this.hud.setObjective('Deliver the shine — beat the heat');
  }

  update(dt, playerPos) {
    // Spin the marker rings for a little life.
    if (this.pickup.visible) this.pickup.userData.ring.rotation.z += dt * 1.2;
    if (this.drop.visible) this.drop.userData.ring.rotation.z += dt * 1.2;

    // Pickup detection.
    if (!this.carrying && this.pickup.visible &&
        playerPos.distanceTo(this.pickup.position) < this.pickupRadius) {
      this.carrying = true;
      this.pickup.visible = false;
      this.hud.setCargo(true);
      this._placeDrop(playerPos);
    }

    // Delivery detection.
    if (this.carrying && this.drop.visible &&
        playerPos.distanceTo(this.drop.position) < this.deliverRadius) {
      this.carrying = false;
      this.drop.visible = false;
      this.cash += this.reward;
      this.runs += 1;
      this.hud.setCargo(false);
      this.hud.setCash(this.cash);
      this.hud.flashObjective(`+$${this.reward} — shine delivered`);
      this._placePickup();
    }

    // Heat builds while carrying, cools while clean.
    if (this.carrying) {
      this.wanted = Math.min(this.maxWanted, this.wanted + this.heatBuildRate * dt);
    } else {
      this.wanted = Math.max(0, this.wanted - this.heatDecayRate * dt);
    }

    const wantedInt = Math.round(this.wanted);
    if (wantedInt !== this._lastWantedInt) {
      this.hud.setWanted(wantedInt);
      this._lastWantedInt = wantedInt;
    }
  }

  get wantedLevel() {
    return Math.round(this.wanted);
  }
}
