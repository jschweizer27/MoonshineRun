import * as THREE from 'three';

// Otto's retrofitted steeplechase trailer. Arcade driving on the XZ plane with a
// chase camera that trails behind. Shared base used by the player and pursuers.
export class Vehicle {
  constructor(scene, { color = 0x6b3f2a, cab = 0x2a1d14 } = {}) {
    this.scene = scene;
    this.position = new THREE.Vector3(0, 0, 0);
    this.heading = 0;          // radians, 0 = facing +Z
    this.speed = 0;            // units/sec along heading

    // Tuning (arcade feel).
    this.maxSpeed = 95;
    this.accel = 70;
    this.reverseSpeed = 30;
    this.brakePower = 120;
    this.drag = 28;
    this.turnRate = 2.2;       // rad/sec at speed

    this.mesh = this._buildMesh(color, cab);
    scene.add(this.mesh);
  }

  _buildMesh(color, cab) {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.1 });
    const cabMat = new THREE.MeshStandardMaterial({ color: cab, roughness: 0.6 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

    // Trailer body (long box) + cab up front.
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 6), bodyMat);
    body.position.y = 1.1;
    group.add(body);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, 2), cabMat);
    cabin.position.set(0, 1.5, 2.1);
    group.add(cabin);

    // Wheels.
    const wheelGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.5, 12);
    const wheelPos = [
      [-1.4, 0.6, 2], [1.4, 0.6, 2],
      [-1.4, 0.6, -2], [1.4, 0.6, -2],
    ];
    for (const [x, y, z] of wheelPos) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, y, z);
      group.add(wheel);
    }

    // Headlamps to read direction of travel at night.
    const lamp = new THREE.SpotLight(0xfff0c0, 30, 60, Math.PI / 6, 0.4, 1.5);
    lamp.position.set(0, 1.4, 3);
    const target = new THREE.Object3D();
    target.position.set(0, 0, 20);
    group.add(target);
    lamp.target = target;
    group.add(lamp);

    return group;
  }

  // Integrate one step. `input` = {throttle:-1..1, steer:-1..1}.
  update(dt, input) {
    const { throttle = 0, steer = 0 } = input;

    if (throttle > 0) {
      this.speed += this.accel * throttle * dt;
    } else if (throttle < 0) {
      // Brake when moving forward, otherwise reverse.
      if (this.speed > 0.5) this.speed -= this.brakePower * dt;
      else this.speed -= this.accel * dt;
    } else {
      // Coast: drag toward zero.
      const sign = Math.sign(this.speed);
      this.speed -= sign * this.drag * dt;
      if (Math.sign(this.speed) !== sign) this.speed = 0;
    }

    this.speed = THREE.MathUtils.clamp(this.speed, -this.reverseSpeed, this.maxSpeed);

    // Steering scales with how fast we're going (and flips in reverse).
    const speedFactor = THREE.MathUtils.clamp(Math.abs(this.speed) / 18, 0, 1);
    this.heading += steer * this.turnRate * dt * speedFactor * Math.sign(this.speed || 1);

    this.position.x += Math.sin(this.heading) * this.speed * dt;
    this.position.z += Math.cos(this.heading) * this.speed * dt;

    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.heading;
  }

  // Trail the chase camera behind and slightly above the car.
  updateCamera(camera) {
    const back = 13;
    const up = 7;
    const camX = this.position.x - Math.sin(this.heading) * back;
    const camZ = this.position.z - Math.cos(this.heading) * back;
    camera.position.lerp(new THREE.Vector3(camX, up, camZ), 0.12);
    camera.lookAt(this.position.x, 1.5, this.position.z);
  }

  get speedMph() {
    return Math.round(Math.abs(this.speed) * 1.4);
  }

  dispose() {
    this.scene.remove(this.mesh);
  }
}
