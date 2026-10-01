import * as THREE from 'three';
import { CONFIG } from './config.js';

// The sky: one big dome around the camera, one draw call. Its horizon is always the fog
// colour, so the far city fades into it without a seam. Above that: a gradient to the
// zenith, the amber haze the city's lamps throw up, twinkling stars, the moon, and slow
// clouds lit by the moon from above and the city from below. By day it turns blue with
// white clouds and no stars. Environment sets the colours (Sky.set); renderFrame keeps the
// dome on the camera (Sky.follow).
const VERT = `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const FRAG = `
  uniform vec3 uHorizon, uZenith, uGlow, uMoonDir, uMoonColor, uCloudDark, uCloudLit;
  uniform float uNight, uCover, uTime, uStars, uStarGain, uMoonSize, uRain;
  uniform vec2 uDrift;
  varying vec3 vDir;

  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }
  float noise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
    return s;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, pow(h, 0.5));
    col += uGlow * exp(-h * 9.0) * uNight;                 // the city's lamps on the haze

    // Stars: one random point in some cells of a grid around the sky; a few bright, many faint.
    vec3 sp = d * 200.0, cell = floor(sp);
    float r = hash13(cell), star = 0.0;
    if (r < uStars) {
      // The point stays well inside its cell so the glow is never clipped square.
      vec3 at = cell + 0.3 + 0.4 * vec3(hash13(cell + 7.1), hash13(cell + 3.3), hash13(cell + 5.9));
      float mag = pow(hash13(cell + 1.7), 6.0);
      float twinkle = 0.65 + 0.35 * sin(uTime * (1.3 + r * 30.0) + r * 60.0);
      star = smoothstep(0.28, 0.0, length(sp - at)) * (0.12 + 2.2 * mag) * twinkle;
    }

    // The moon: a disc with faint maria, and a halo in the haze.
    float md = dot(d, uMoonDir);
    float disc = smoothstep(cos(uMoonSize), cos(uMoonSize * 0.85), md) * (0.8 + 0.2 * noise(d * 70.0));
    float halo = pow(max(md, 0.0), 900.0) * 0.4 + pow(max(md, 0.0), 120.0) * 0.07;

    // Clouds: a layer overhead, drifting on the wind, thinning into the horizon haze.
    vec2 uv = d.xz / (d.y + 0.15);
    float n = fbm(vec3(uv * 0.8 + uDrift, uTime * 0.004));
    // fbm sits mostly in 0.3-0.7: cover 0 leaves the sky clear, 1 closes it over.
    float edge = 0.72 - 0.4 * uCover;
    float cloud = smoothstep(edge, edge + 0.16, n) * smoothstep(0.0, 0.2, d.y);
    // Thin edges catch the moonlight; thick middles stay dark.
    float lit = 0.25 + 0.75 * pow(max(md, 0.0), 2.0) * (1.0 - 0.7 * smoothstep(edge + 0.05, edge + 0.3, n));
    vec3 cloudCol = mix(uCloudDark, uCloudLit, lit) + uGlow * 1.8 * exp(-h * 4.0) * uNight;

    // The city's glow washes out the stars near the horizon.
    float clear = (1.0 - cloud) * smoothstep(0.1, 0.5, d.y) * uNight * (1.0 - uRain);
    col += vec3(0.82, 0.88, 1.0) * star * uStarGain * clear;
    col += uMoonColor * (disc * 2.4 + halo) * (1.0 - 0.85 * cloud) * (1.0 - 0.85 * uRain);   // rain hides it
    col = mix(col, cloudCol, cloud * 0.92);
    col = mix(col, uHorizon, smoothstep(0.0, -0.06, d.y));  // below the horizon: haze
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const NIGHT_CLOUD = new THREE.Color(0x0d131d), NIGHT_CLOUD_LIT = new THREE.Color(0x6a7a94);
const DAY_CLOUD = new THREE.Color(0x9ba7b6), DAY_CLOUD_LIT = new THREE.Color(0xf4f5f8);
const MOON = new THREE.Color(0xc9d6ff), SUN = new THREE.Color(0xfff2dc), DUSK_ZENITH = new THREE.Color(0x2a2048);

export class Sky {
  constructor(scene) {
    const S = CONFIG.look.skyDome;
    const color = (hex) => ({ value: new THREE.Color(hex) });
    this.uniforms = {
      uHorizon: color(CONFIG.look.sky), uZenith: color(S.zenith), uGlow: color(S.cityGlow),
      uMoonDir: { value: new THREE.Vector3(0, 0.3, -1).normalize() }, uMoonColor: color(0xc9d6ff),
      uCloudDark: color(0x0a0f17), uCloudLit: color(0x46556c),
      uNight: { value: 1 }, uCover: { value: S.clouds }, uTime: { value: 0 }, uRain: { value: 0 },
      uStars: { value: S.stars }, uStarGain: { value: S.starBrightness }, uMoonSize: { value: S.moonSize },
      uDrift: { value: new THREE.Vector2() },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1200, 48, 24), this.material);
    this.mesh.renderOrder = -1000;          // drawn first, behind everything
    this.mesh.frustumCulled = false;
    this.mesh.name = 'sky';
    this._day = new THREE.Color();
    this._last = 0;
    scene.add(this.mesh);
  }

  // From Environment: the fog colour (the horizon), how much daylight, dusk, fog and rain,
  // and where the moonlight (or sunlight) comes from.
  set({ horizon, daylight, dusk = 0, fog = 0, wet = 0, lightDir }) {
    const S = CONFIG.look.skyDome, u = this.uniforms, night = 1 - daylight;
    u.uHorizon.value.copy(horizon);
    u.uZenith.value.setHex(S.zenith).lerp(this._day.setHex(S.dayZenith), daylight).lerp(DUSK_ZENITH, dusk * 0.6);
    if (fog > 0.01) u.uZenith.value.lerp(horizon, fog * 0.8);
    u.uNight.value = night;
    u.uRain.value = Math.min(1, wet + fog);
    u.uCover.value = Math.min(0.92, S.clouds + 0.5 * wet + 0.45 * fog);
    u.uCloudDark.value.copy(NIGHT_CLOUD).lerp(DAY_CLOUD, daylight);
    u.uCloudLit.value.copy(NIGHT_CLOUD_LIT).lerp(DAY_CLOUD_LIT, daylight);
    if (wet > 0) { u.uCloudDark.value.multiplyScalar(1 - 0.3 * wet); u.uCloudLit.value.multiplyScalar(1 - 0.45 * wet); }
    u.uMoonColor.value.copy(MOON).lerp(SUN, daylight).multiplyScalar(1 - 0.5 * fog);
    // The disc sits low enough to be seen from the street, in the light's compass direction.
    const az = Math.atan2(lightDir.x, lightDir.z), e = S.moonElevation;
    u.uMoonDir.value.set(Math.sin(az) * Math.cos(e), Math.sin(e), Math.cos(az) * Math.cos(e));
  }

  // Each frame: centre the dome on the camera and let the stars twinkle and clouds drift.
  follow(camera) {
    const now = performance.now() / 1000, dt = Math.min(0.1, Math.max(0, now - (this._last || now)));
    this._last = now;
    const u = this.uniforms, [wx, wz] = CONFIG.look.atmosphere.wind, k = CONFIG.look.skyDome.cloudSpeed;
    u.uTime.value += dt;
    u.uDrift.value.x -= wx * k * dt;
    u.uDrift.value.y -= wz * k * dt;
    this.mesh.position.copy(camera.position);
  }
}
