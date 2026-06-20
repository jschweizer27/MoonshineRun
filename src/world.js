import * as THREE from 'three';

// Builds the static 1920s night environment: ground, a road grid, art-deco-ish
// block buildings, street lamps, fog and a dark sky. Exposes road intersection
// points so missions and pursuers can spawn on the streets.
export class World {
  constructor(scene) {
    this.scene = scene;
    this.roadPoints = [];   // Vector3 list of street-grid intersections
    this.blockSize = 44;    // distance between road centerlines
    this.gridRadius = 5;    // blocks out from center in each direction

    this._buildSky(scene);
    this._buildGround(scene);
    this._buildRoads(scene);
    this._buildBuildingsAndLamps(scene);
  }

  _buildSky(scene) {
    scene.background = new THREE.Color(0x0a0d18);
    scene.fog = new THREE.Fog(0x0a0d18, 60, 380);

    // Soft moonlight + cool ambient for a Prohibition night.
    const ambient = new THREE.AmbientLight(0x35406a, 0.55);
    scene.add(ambient);

    const moon = new THREE.DirectionalLight(0x9fb0e0, 0.5);
    moon.position.set(-120, 200, -80);
    scene.add(moon);
  }

  _buildGround(scene) {
    const size = this.blockSize * (this.gridRadius * 2 + 4);
    const geo = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.MeshStandardMaterial({ color: 0x14161d, roughness: 1 });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    scene.add(ground);
  }

  _buildRoads(scene) {
    const span = this.blockSize * this.gridRadius;
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x202329, roughness: 0.9 });
    const roadWidth = 12;
    const length = span * 2 + this.blockSize;

    for (let i = -this.gridRadius; i <= this.gridRadius; i++) {
      const offset = i * this.blockSize;

      // Roads running along Z.
      const vGeo = new THREE.PlaneGeometry(roadWidth, length);
      const vRoad = new THREE.Mesh(vGeo, roadMat);
      vRoad.rotation.x = -Math.PI / 2;
      vRoad.position.set(offset, 0, 0);
      scene.add(vRoad);

      // Roads running along X.
      const hGeo = new THREE.PlaneGeometry(length, roadWidth);
      const hRoad = new THREE.Mesh(hGeo, roadMat);
      hRoad.rotation.x = -Math.PI / 2;
      hRoad.position.set(0, 0, offset);
      scene.add(hRoad);
    }

    // Record intersections as spawn-able road points.
    for (let i = -this.gridRadius; i <= this.gridRadius; i++) {
      for (let j = -this.gridRadius; j <= this.gridRadius; j++) {
        this.roadPoints.push(
          new THREE.Vector3(i * this.blockSize, 0, j * this.blockSize)
        );
      }
    }
  }

  _buildBuildingsAndLamps(scene) {
    const lampColor = 0xffb24d;
    const buildingMats = [
      new THREE.MeshStandardMaterial({ color: 0x2b2620, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0x322a22, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0x251f1a, roughness: 0.9 }),
    ];
    // Faintly lit windows so the city reads as inhabited at night.
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0xffcf73,
      emissiveIntensity: 0.35,
    });

    const half = this.blockSize / 2;

    for (let i = -this.gridRadius; i < this.gridRadius; i++) {
      for (let j = -this.gridRadius; j < this.gridRadius; j++) {
        const cx = i * this.blockSize + half;
        const cz = j * this.blockSize + half;

        // Each block holds a cluster of buildings, set back from the roads.
        const count = 2 + Math.floor(Math.random() * 2);
        for (let b = 0; b < count; b++) {
          const w = 8 + Math.random() * 12;
          const d = 8 + Math.random() * 12;
          const h = 10 + Math.random() * 34;
          const mat = buildingMats[(i + j + b + 100) % buildingMats.length];
          const geo = new THREE.BoxGeometry(w, h, d);
          const building = new THREE.Mesh(geo, mat);
          const ox = (Math.random() - 0.5) * (this.blockSize - 20);
          const oz = (Math.random() - 0.5) * (this.blockSize - 20);
          building.position.set(cx + ox, h / 2, cz + oz);
          scene.add(building);

          // A glowing window strip on one face.
          const winGeo = new THREE.PlaneGeometry(w * 0.7, h * 0.7);
          const win = new THREE.Mesh(winGeo, windowMat);
          win.position.set(building.position.x, building.position.y, building.position.z + d / 2 + 0.05);
          scene.add(win);
        }

        // Street lamp at the block corner for pools of warm light.
        const lamp = new THREE.PointLight(lampColor, 12, 38, 2);
        lamp.position.set(i * this.blockSize + 7, 7, j * this.blockSize + 7);
        scene.add(lamp);
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.4, 8, 8),
          new THREE.MeshStandardMaterial({ emissive: lampColor, emissiveIntensity: 2, color: 0x000000 })
        );
        bulb.position.copy(lamp.position);
        scene.add(bulb);
      }
    }
  }

  // A random road intersection, optionally at least `minDist` from `avoid`.
  randomRoadPoint(avoid = null, minDist = 0) {
    for (let tries = 0; tries < 40; tries++) {
      const p = this.roadPoints[Math.floor(Math.random() * this.roadPoints.length)].clone();
      if (!avoid || p.distanceTo(avoid) >= minDist) return p;
    }
    return this.roadPoints[Math.floor(Math.random() * this.roadPoints.length)].clone();
  }
}
