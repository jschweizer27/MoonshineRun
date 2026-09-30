import * as THREE from 'three';
import { EffectComposer } from '../vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from '../vendor/three/addons/postprocessing/ShaderPass.js';
import { CONFIG } from './config.js';

// The film look, after the scene is drawn: bloom on everything bright (lanterns, lit
// windows, neon, headlights), ACES tone mapping, then one grading pass that tints the
// shadows teal and the highlights orange, darkens the corners and adds a little film grain.
// High quality blooms at full resolution, Medium at half; Low skips post-processing.
const GRADE = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAspect: { value: 16 / 9 },
    uShadow: { value: new THREE.Vector3() },
    uHigh: { value: new THREE.Vector3() },
    uAmount: { value: 1 },
    uSaturation: { value: 1 },
    uContrast: { value: 1 },
    uVignette: { value: 0 },
    uGrain: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime, uAspect, uAmount, uSaturation, uContrast, uVignette, uGrain;
    uniform vec3 uShadow, uHigh;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // Split-tone: teal into the shadows, warm orange into the highlights.
      c += uAmount * (uShadow * (1.0 - smoothstep(0.0, 0.45, l)) * (0.35 + l) + uHigh * smoothstep(0.3, 0.95, l));
      c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, uSaturation);
      c = (c - 0.5) * uContrast + 0.5;
      // Vignette.
      vec2 d = vUv - 0.5;
      d.x *= uAspect;
      c *= mix(1.0 - uVignette, 1.0, smoothstep(0.95, 0.3, length(d)));
      // Film grain, strongest in the mid-tones.
      float n = fract(sin(dot(floor(gl_FragCoord.xy) + fract(uTime * 7.3) * 91.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      c += n * uGrain * (0.4 + 0.6 * (1.0 - abs(l - 0.45) * 1.6));
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = true;
    this.half = false;
    const P = CONFIG.look.post;
    this.composer = new EffectComposer(renderer);
    // The scene pass records the draw calls so far (debug renderInfo reads it).
    const scenePass = new RenderPass(scene, camera), draw = scenePass.render.bind(scenePass);
    scenePass.render = (...args) => { draw(...args); this.sceneCalls = renderer.info.render.calls; };
    this.composer.addPass(scenePass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), P.bloomStrength, P.bloomRadius, P.bloomThreshold);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GRADE);
    this.composer.addPass(this.grade);
    const u = this.grade.uniforms;
    u.uShadow.value.set(...P.shadowTint);
    u.uHigh.value.set(...P.highlightTint);
    u.uAmount.value = P.gradeAmount;
    u.uSaturation.value = P.saturation;
    u.uContrast.value = P.contrast;
    u.uVignette.value = P.vignette;
    u.uGrain.value = P.grain;
  }

  setQuality(level) {
    this.enabled = level !== 'low';
    this.half = level === 'medium';
    this.setSize(window.innerWidth, window.innerHeight);
  }

  setSize(w, h) {
    const pr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    if (this.half) this.bloom.setSize(Math.round((w * pr) / 2), Math.round((h * pr) / 2));
    this.grade.uniforms.uAspect.value = w / Math.max(1, h);
  }

  // By day everything is bright: only the brightest things may glow, and less.
  setDaylight(d) {
    const P = CONFIG.look.post;
    this.bloom.threshold = P.bloomThreshold + 1.6 * d;
    this.bloom.strength = P.bloomStrength * (1 - 0.6 * d);
  }

  render() {
    if (!this.enabled) { this.renderer.render(this.scene, this.camera); this.sceneCalls = this.renderer.info.render.calls; return; }
    this.grade.uniforms.uTime.value = performance.now() / 1000;
    this.composer.render();
  }
}
