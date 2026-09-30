import * as THREE from 'three';

// A gold GPS-style arrow painted on the road just ahead of the truck, pointing at the
// current objective. (The HUD compass in the objective banner does the same on screen.)
export class Waypoint {
  constructor(scene) {
    const shape = new THREE.Shape();
    shape.moveTo(0, -2.4);
    shape.lineTo(1.9, 0.6);
    shape.lineTo(0.7, 0.6);
    shape.lineTo(0.7, 2.2);
    shape.lineTo(-0.7, 2.2);
    shape.lineTo(-0.7, 0.6);
    shape.lineTo(-1.9, 0.6);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);  // flat on the road, tip toward -Z
    this.material = new THREE.MeshBasicMaterial({
      color: 0xf2c55c, transparent: true, opacity: 0.75, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }

  update(player, target, time) {
    if (!target) { this.mesh.visible = false; return; }
    const p = player.position;
    const dx = target.x - p.x, dz = target.z - p.z;
    this.mesh.visible = Math.hypot(dx, dz) > 18;
    this.mesh.position.set(p.x + player.forwardX * 9, 0.12, p.z + player.forwardZ * 9);
    this.mesh.rotation.y = -Math.atan2(dx, -dz);
    this.material.opacity = 0.6 + Math.sin(time * 4) * 0.15;
  }
}
