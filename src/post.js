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
//
// The painterly look (a setting, on by default) happens at the start of the grading pass,
// so it costs no extra pass and switching it compiles nothing: a light Kuwahara filter
// (each pixel takes the average of its calmest neighbourhood, which flattens texture into
// brush-like patches), depth fog from the scene's depth buffer (thicker low down, rose
// toward the horizon at night), and a palette LUT that pulls colours toward the palette
// (CONFIG.dredge.palette). The bloom is softer and wider while it's on.
const LUT = 32;   // the palette LUT: LUT slices of LUT x LUT, side by side (blue picks the slice)
const GRADE = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    tLut: { value: null },
    uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    uPaint: { value: 0 },
    uKuwahara: { value: 0 },
    uLut: { value: 0 },
    uFog: { value: 0 },
    uFogNear: { value: 40 },
    uFogFar: { value: 400 },
    uFogFalloff: { value: 0.03 },
    uFogColor: { value: new THREE.Color() },
    uHorizonColor: { value: new THREE.Color() },
    uHorizon: { value: 0 },
    uInvProjection: { value: new THREE.Matrix4() },
    uCameraWorld: { value: new THREE.Matrix4() },
    uTime: { value: 0 },
    uAspect: { value: 16 / 9 },
    uShadow: { value: new THREE.Vector3() },
    uHigh: { value: new THREE.Vector3() },
    uAmount: { value: 1 },
    uSaturation: { value: 1 },
    uContrast: { value: 1 },
    uVignette: { value: 0 },
    uGrain: { value: 0 },
    uRush: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse, tDepth, tLut;
    uniform float uTime, uAspect, uAmount, uSaturation, uContrast, uVignette, uGrain, uRush;
    uniform float uPaint, uKuwahara, uLut, uFog, uFogNear, uFogFar, uFogFalloff, uHorizon;
    uniform vec2 uTexel;
    uniform vec3 uShadow, uHigh, uFogColor, uHorizonColor;
    uniform mat4 uInvProjection, uCameraWorld;
    varying vec2 vUv;
    vec3 paletteLut(vec3 c) {
      c = clamp(c, 0.0, 1.0);
      float b = c.b * ${LUT - 1}.0, s0 = floor(b), s1 = min(s0 + 1.0, ${LUT - 1}.0);
      vec2 uv = vec2((c.r * ${LUT - 1}.0 + 0.5) / ${LUT * LUT}.0, (c.g * ${LUT - 1}.0 + 0.5) / ${LUT}.0);
      return mix(texture2D(tLut, uv + vec2(s0 / ${LUT}.0, 0.0)).rgb, texture2D(tLut, uv + vec2(s1 / ${LUT}.0, 0.0)).rgb, b - s0);
    }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (uPaint > 0.5) {
        // Kuwahara: of the four overlapping 3x3 corners of the 5x5 around this pixel, take
        // the mean of the calmest (least varied) one.
        vec3 s[25];
        for (int j = 0; j < 5; j++) for (int i = 0; i < 5; i++) s[j * 5 + i] = texture2D(tDiffuse, vUv + vec2(float(i - 2), float(j - 2)) * uTexel).rgb;
        vec3 calm = c;
        float least = 1e9;
        for (int q = 0; q < 4; q++) {
          int ox = (q == 1 || q == 3) ? 2 : 0, oy = q >= 2 ? 2 : 0;
          vec3 m = vec3(0.0), m2 = vec3(0.0);
          for (int j = 0; j < 3; j++) for (int i = 0; i < 3; i++) { vec3 v = s[(oy + j) * 5 + ox + i]; m += v; m2 += v * v; }
          m /= 9.0;
          vec3 sd = m2 / 9.0 - m * m;
          float spread = sd.r + sd.g + sd.b;
          if (spread < least) { least = spread; calm = m; }
        }
        c = mix(c, calm, uKuwahara);
        // Depth fog: rebuild where this pixel is from the depth buffer (the sky is skipped).
        float z = texture2D(tDepth, vUv).x;
        if (z < 0.99999) {
          vec4 view = uInvProjection * vec4(vUv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
          view /= view.w;
          vec3 world = (uCameraWorld * vec4(view.xyz, 1.0)).xyz, eye = uCameraWorld[3].xyz;
          float f = uFog * smoothstep(uFogNear, uFogFar, length(view.xyz)) * exp(-max(world.y, 0.0) * uFogFalloff);
          float low = smoothstep(0.3, 0.0, normalize(world - eye).y);
          c = mix(c, mix(uFogColor, uHorizonColor, low * uHorizon), clamp(f, 0.0, 1.0));
        }
        c = mix(c, paletteLut(c), uLut);
      }
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // Split-tone: teal into the shadows, warm orange into the highlights.
      c += uAmount * (uShadow * (1.0 - smoothstep(0.0, 0.45, l)) * (0.35 + l) + uHigh * smoothstep(0.3, 0.95, l));
      c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, uSaturation);
      c = (c - 0.5) * uContrast + 0.5;
      // Vignette.
      vec2 d = vUv - 0.5;
      d.x *= uAspect;
      c *= mix(1.0 - uVignette, 1.0, smoothstep(0.95, 0.3, length(d)));
      // Flat out: the corners pulse darker and thin speed lines streak out from the middle.
      if (uRush > 0.0) {
        float r = length(d), ang = atan(d.y, d.x) / 6.2832 + 0.5;   // 0..1 round the screen
        float sliver = ang * 160.0, seed = fract(sin(floor(sliver) * 12.9898) * 43758.5453);
        float on = step(0.86, fract(seed * 13.0 + uTime * (1.5 + seed)));   // a few at a time, flickering
        float thin = 1.0 - abs(fract(sliver) - 0.5) * 2.0;
        c += vec3(on * thin * smoothstep(0.3, 0.8, r) * 0.14 * uRush);
        c *= 1.0 - uRush * (0.16 + 0.1 * sin(uTime * 11.0)) * smoothstep(0.25, 0.9, r);
      }
      // Film grain, strongest in the mid-tones.
      float n = fract(sin(dot(floor(gl_FragCoord.xy) + fract(uTime * 7.3) * 91.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      c += n * uGrain * (0.4 + 0.6 * (1.0 - abs(l - 0.45) * 1.6));
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};

// The palette LUT: for every colour, a blend of the palette colours nearest to it (soft,
// in display space), brought to the colour's own brightness so values keep their shape.
export function makePaletteLut(palette) {
  const cols = Object.values(palette).map((hex) => new THREE.Color(hex)).map((c) => [c.r, c.g, c.b]);
  // THREE.Color reads hex as sRGB and stores linear: back to display values.
  const disp = cols.map((c) => c.map((v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)));
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const data = new Uint8Array(LUT * LUT * LUT * 4), sigma2 = 0.18 * 0.18;
  for (let b = 0; b < LUT; b++) for (let g = 0; g < LUT; g++) for (let r = 0; r < LUT; r++) {
    const c = [r / (LUT - 1), g / (LUT - 1), b / (LUT - 1)];
    let wsum = 0;
    const p = [0, 0, 0];
    for (const q of disp) {
      const d = (c[0] - q[0]) ** 2 + (c[1] - q[1]) ** 2 + (c[2] - q[2]) ** 2, w = Math.exp(-d / sigma2) + 1e-6;
      wsum += w; p[0] += q[0] * w; p[1] += q[1] * w; p[2] += q[2] * w;
    }
    const k = (lum(c) + 0.02) / (lum(p) / wsum + 0.02);
    const i = (g * LUT * LUT + b * LUT + r) * 4;
    for (let n = 0; n < 3; n++) data[i + n] = Math.round(Math.min(1, (p[n] / wsum) * k) * 255);
    data[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, LUT * LUT, LUT);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = true;
    this.half = false;
    const P = CONFIG.look.post;
    this.composer = new EffectComposer(renderer);
    // Both buffers keep their depth as a texture, for the painterly depth fog.
    for (const t of [this.composer.renderTarget1, this.composer.renderTarget2]) t.depthTexture = new THREE.DepthTexture(1, 1);
    // The scene pass records the draw calls so far (debug renderInfo reads it) and which
    // buffer holds this frame's depth.
    const scenePass = new RenderPass(scene, camera), draw = scenePass.render.bind(scenePass);
    scenePass.render = (r, write, read, ...rest) => {
      draw(r, write, read, ...rest);
      this.sceneCalls = renderer.info.render.calls;
      this.grade.uniforms.tDepth.value = read.depthTexture;
    };
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
    const A = P.paint;
    u.uKuwahara.value = A.kuwahara;
    u.uFog.value = A.fog;
    u.uFogNear.value = A.fogNear;
    u.uFogFar.value = A.fogFar;
    u.uFogFalloff.value = A.fogFalloff;
    u.uTexel.value.set(1 / 1280, 1 / 720);
    this.lut = makePaletteLut(CONFIG.dredge.palette);
    u.tLut.value = this.lut;
    this.painterly = false;
    this._day = 0;
  }

  // The painterly look on or off (a uniform: nothing recompiles).
  setPainterly(on) {
    const P = CONFIG.look.post;
    this.painterly = !!on;
    this.grade.uniforms.uPaint.value = on ? 1 : 0;
    this.bloom.radius = on ? P.paint.bloomRadius : P.bloomRadius;
    this.setDaylight(this._day);
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
    this.grade.uniforms.uTexel.value.set(1 / Math.max(1, w * pr), 1 / Math.max(1, h * pr));
  }

  // By day everything is bright: only the brightest things may glow, and less.
  setDaylight(d) {
    const P = CONFIG.look.post;
    this._day = d;
    this.bloom.threshold = P.bloomThreshold + 1.6 * d;
    this.bloom.strength = P.bloomStrength * (1 - 0.6 * d) * (this.painterly ? P.paint.bloomBoost : 1);
    this.grade.uniforms.uHorizon.value = P.paint.horizon * (1 - d);
    // The palette is a night palette: by day it only tints a little.
    this.grade.uniforms.uLut.value = P.paint.lut * (1 - 0.6 * d);
  }

  // 0..1 near top speed (JUICE.cinematic.speedPulse).
  setRush(v) { this.grade.uniforms.uRush.value = v; }

  render() {
    if (!this.enabled) { this.renderer.render(this.scene, this.camera); this.sceneCalls = this.renderer.info.render.calls; return; }
    const u = this.grade.uniforms;
    u.uTime.value = performance.now() / 1000;
    if (this.painterly) {
      // The fog matches the scene's own (linear) fog colour, in display values.
      if (this.scene.fog) u.uFogColor.value.copy(this.scene.fog.color).convertLinearToSRGB();
      u.uHorizonColor.value.set(CONFIG.dredge.palette.duskRose).convertLinearToSRGB();
      this.camera.updateMatrixWorld();
      u.uInvProjection.value.copy(this.camera.projectionMatrixInverse);
      u.uCameraWorld.value.copy(this.camera.matrixWorld);
    }
    this.composer.render();
  }
}
