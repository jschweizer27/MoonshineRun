import * as THREE from 'three';

// The painted building atlas: one canvas, painted at boot with soft brush strokes rather
// than hard rectangles, shared by every building surface.
//
//   facade block (left, STYLES x ROWS tiles of TW x TH px): per wall style, two shopfront
//   bays (4.6 m tall) and two window bays (3.4 m), read by the facade shader (world.js).
//   regions (right): cornice stone, chimney brick, tank staves, tar-paper roof, awning
//   canvas, barn boards and fieldstone, read in world space by atlasMaterial() or through
//   UVs (the awnings).
//
// `mask` covers the facade block only: glass in red, the blind/curtain pattern in green.
export const ATLAS = { TW: 256, TH: 336, STYLES: 4, ROWS: 4, W: 2048, H: 1344 };
const { TW, TH, STYLES, W, H } = ATLAS;
const RX = TW * STYLES;              // the regions column starts here (1024 px)
// Regions in canvas pixels: [x, y, w, h] (y down).
const REGIONS = {
  stone: [RX, 0, 512, TH],
  brick: [RX + 512, 0, 512, TH],
  staves: [RX, TH, 512, TH],
  roof: [RX + 512, TH, 512, TH],
  awning: [RX, TH * 2, 1024, TH],
  boards: [RX, TH * 3, 512, TH],
  fieldstone: [RX + 512, TH * 3, 512, TH],
};

// A region as texture coordinates [u0, v0, du, dv] (the canvas is flipped on upload).
export function region(name) {
  const [x, y, w, h] = REGIONS[name];
  return [x / W, 1 - (y + h) / H, w / W, h / H];
}

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const rgba = (c, k = 1, a = 1) => `rgba(${clamp(c[0] * k)},${clamp(c[1] * k)},${clamp(c[2] * k)},${a})`;

// Wall styles (sRGB 0-255), close to the dredge palette's brick, cream and slate.
const STYLE_LIST = [
  { name: 'red brick', base: [138, 62, 48], mortar: [78, 66, 62], trim: [206, 194, 172], brick: true },
  { name: 'dark brick', base: [102, 60, 46], mortar: [62, 54, 50], trim: [188, 176, 156], brick: true },
  { name: 'limestone', base: [178, 168, 146], mortar: [128, 120, 104], trim: [224, 214, 192], brick: false },
  { name: 'slate ashlar', base: [96, 104, 112], mortar: [64, 70, 78], trim: [176, 174, 166], brick: false },
];

export function makePaintedAtlas(rng) {
  const cv = document.createElement('canvas'), mv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  mv.width = RX; mv.height = H;
  // Painted on the CPU: tens of thousands of small clipped strokes are slow to raster on
  // the GPU (very slow on software GPUs), and the canvas is uploaded once anyway.
  const g = cv.getContext('2d', { willReadFrequently: true }), mg = mv.getContext('2d', { willReadFrequently: true });
  mg.fillStyle = '#000'; mg.fillRect(0, 0, RX, H);
  const r = (a, b) => a + (b - a) * rng();

  // Brush strokes: short, slightly curved, semi-transparent dabs around a colour.
  const strokes = (x, y, w, h, c, n, o = {}) => {
    const { len = [6, 18], width = [2, 5], alpha = [0.1, 0.28], angle = 0, jitter = 0.4, vary = 0.16 } = o;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      g.strokeStyle = rgba(c, 1 + (rng() * 2 - 1) * vary, r(alpha[0], alpha[1]));
      g.lineWidth = r(width[0], width[1]);
      const a = angle + (rng() - 0.5) * jitter, l = r(len[0], len[1]);
      const cx = x + rng() * w, cy = y + rng() * h, dx = Math.cos(a) * l / 2, dy = Math.sin(a) * l / 2;
      g.beginPath(); g.moveTo(cx - dx, cy - dy);
      g.quadraticCurveTo(cx + r(-2, 2), cy + r(-2, 2), cx + dx, cy + dy);
      g.stroke();
    }
    g.restore();
  };
  // A softly painted block: a fill with ragged edges, then a few strokes over it.
  const block = (x, y, w, h, c, k = 1) => {
    g.fillStyle = rgba(c, k);
    g.beginPath();
    g.moveTo(x + r(0, 1.5), y + r(0, 1.5));
    g.lineTo(x + w - r(0, 1.5), y + r(0, 1.5));
    g.lineTo(x + w - r(0, 1.5), y + h - r(0, 1.5));
    g.lineTo(x + r(0, 1.5), y + h - r(0, 1.5));
    g.closePath(); g.fill();
    if (w > 6 && h > 4) strokes(x, y, w, h, c.map((v) => v * k), Math.max(2, (w * h) / 60), { len: [4, Math.max(5, w * 0.6)], width: [1.5, 3.5] });
  };
  // A wall of bricks or stone courses, with soot running down from the top.
  const wall = (x0, y0, w, h, st, pxPerM) => {
    g.fillStyle = rgba(st.mortar); g.fillRect(x0, y0, w, h);
    strokes(x0, y0, w, h, st.mortar, (w * h) / 90, { len: [5, 14] });
    const bw = (st.brick ? 0.24 : 0.62) * pxPerM, bh = (st.brick ? 0.075 : 0.36) * pxPerM, gap = st.brick ? 1.4 : 2;
    for (let y = y0, row = 0; y < y0 + h; y += bh, row++) {
      for (let x = x0 - (row & 1 ? bw / 2 : 0); x < x0 + w; x += bw) {
        const xx = Math.max(x0, x), ww = Math.min(x + bw, x0 + w) - xx, hh = Math.min(bh, y0 + h - y);
        const hue = st.brick ? 0.07 : 0.035;   // pale stone shows tints more than brick does
        if (ww > gap && hh > gap) block(xx, y, ww - gap, hh - gap, st.base.map((v) => v * r(1 - hue, 1 + hue)), r(0.84, 1.1));
      }
    }
    // A wash of long strokes over the whole wall ties the bricks together like paint.
    strokes(x0, y0, w, h, st.base, (w * h) / 40, { len: [10, 34], width: [3, 7], alpha: [0.06, 0.18], vary: 0.3 });
    // Soot: dark streaks from the top, fading down.
    for (let k = 0; k < 10; k++) {
      const sx = x0 + rng() * w, sw = r(6, 22), sh = r(h * 0.2, h * 0.8);
      const grad = g.createLinearGradient(0, y0, 0, y0 + sh);
      grad.addColorStop(0, `rgba(18,14,12,${r(0.12, 0.26)})`); grad.addColorStop(1, 'rgba(18,14,12,0)');
      g.fillStyle = grad; g.fillRect(sx, y0, sw, sh);
    }
  };
  // Glass: dark teal-slate, lighter at the top, a diagonal sheen; red in the mask, with a
  // blind (green 110) over the top part and the rest open (green 255).
  const glass = (x, y, w, h, blind = r(0, 0.5)) => {
    const grad = g.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, '#24303a'); grad.addColorStop(1, '#10161c');
    g.fillStyle = grad; g.fillRect(x, y, w, h);
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.strokeStyle = 'rgba(239,230,208,0.08)'; g.lineWidth = w * 0.18;
    g.beginPath(); g.moveTo(x + w * 0.2, y + h); g.lineTo(x + w * 0.9, y); g.stroke();
    g.restore();
    mg.fillStyle = 'rgb(255,110,0)'; mg.fillRect(x, y, w, h * blind);
    mg.fillStyle = 'rgb(255,255,0)'; mg.fillRect(x, y + h * blind, w, h * (1 - blind));
  };
  // Glazing bars: painted in the colour, cleared from the mask.
  const bars = (x, y, w, h, cols, rows, c, t = 4) => {
    mg.fillStyle = '#000';
    for (let i = 1; i < cols; i++) { block(x + (w * i) / cols - t / 2, y, t, h, c); mg.fillRect(x + (w * i) / cols - t / 2, y, t, h); }
    for (let j = 1; j < rows; j++) { block(x, y + (h * j) / rows - t / 2, w, t, c); mg.fillRect(x, y + (h * j) / rows - t / 2, w, t); }
  };
  const frame = [44, 36, 32], wood = [58, 44, 36], board = [30, 28, 30], amber = [232, 165, 72];

  STYLE_LIST.forEach((st, col) => {
    const x0 = col * TW;
    // Row 0: shopfront A: a sign band, a wide display window with transoms, and the wall
    // below it as a stall riser under a stone sill.
    {
      const y0 = 0, pxm = TH / 4.6;
      wall(x0, y0, TW, TH, st, TW / 2.6);
      block(x0, y0, TW, 0.95 * pxm, board);                                   // sign band
      g.strokeStyle = rgba(amber, 1, 0.55); g.lineWidth = 2; g.strokeRect(x0 + 10, y0 + 8, TW - 20, 0.95 * pxm - 16);
      block(x0, y0, 10, TH, st.trim, 0.9); block(x0 + TW - 10, y0, 10, TH, st.trim, 0.9);   // pilasters
      const wx = x0 + 22, wy = y0 + 1.25 * pxm, ww = TW - 44, wh = 2.3 * pxm;
      block(wx - 10, wy + wh + 4, ww + 20, 9, st.trim, 0.95);                // sill
      block(wx - 6, wy - 6, ww + 12, wh + 12, frame);
      glass(wx, wy, ww, wh, r(0, 0.3));
      bars(wx, wy, ww, wh, 3, 1, frame);
      block(wx - 6, wy - 0.32 * pxm, ww + 12, 4, frame);                      // transom bar
      glass(wx, wy - 0.3 * pxm, ww, 0.26 * pxm, 0); bars(wx, wy - 0.3 * pxm, ww, 0.26 * pxm, 6, 1, frame, 3);
    }
    // Row 1: shopfront B: a glazed door on the left, a display window on the right.
    {
      const y0 = TH, pxm = TH / 4.6;
      wall(x0, y0, TW, TH, st, TW / 2.6);
      block(x0, y0, TW, 0.95 * pxm, board);
      g.strokeStyle = rgba(amber, 1, 0.55); g.lineWidth = 2; g.strokeRect(x0 + 10, y0 + 8, TW - 20, 0.95 * pxm - 16);
      block(x0, y0, 12, TH, st.trim, 0.9); block(x0 + TW - 12, y0, 12, TH, st.trim, 0.9);
      const dx = x0 + 22, dw = 0.85 * (TW / 2.6), dy = y0 + 1.15 * pxm, dh = TH - 1.15 * pxm - 2;
      block(x0 + 12, y0 + TH - 0.8 * pxm, TW - 24, 0.8 * pxm, wood, 0.9);     // stall riser
      block(dx - 5, dy - 5, dw + 10, dh + 5, frame);
      block(dx, dy, dw, dh, wood);                                             // the door
      glass(dx + 8, dy + 8, dw - 16, dh * 0.5, r(0.2, 0.6));
      block(dx + dw - 16, dy + dh * 0.58, 6, 10, amber);                       // brass handle
      const wx = dx + dw + 18, ww = x0 + TW - 18 - wx, wy = y0 + 1.25 * pxm, wh = 2.2 * pxm;
      block(wx - 6, wy - 6, ww + 12, wh + 12, frame);
      glass(wx, wy, ww, wh, r(0, 0.4)); bars(wx, wy, ww, wh, 2, 2, frame);
    }
    // Row 2: window bay A: a two-over-two sash window, stone lintel and sill.
    {
      const y0 = TH * 2, pxm = TH / 3.4;
      wall(x0, y0, TW, TH, st, TW / 2.6);
      const wx = x0 + TW * 0.27, ww = TW * 0.46, wy = y0 + 0.62 * pxm, wh = 1.75 * pxm;
      block(wx - 8, wy - 14, ww + 16, 12, st.trim);                           // lintel
      block(wx - 10, wy + wh, ww + 20, 9, st.trim, 0.95);                     // sill
      block(wx - 4, wy - 4, ww + 8, wh + 8, frame);
      glass(wx, wy, ww, wh); bars(wx, wy, ww, wh, 2, 2, frame);
    }
    // Row 3: window bay B: a tall arched window with a keystone.
    {
      const y0 = TH * 3, pxm = TH / 3.4;
      wall(x0, y0, TW, TH, st, TW / 2.6);
      const wx = x0 + TW * 0.3, ww = TW * 0.4, wy = y0 + 0.55 * pxm, wh = 1.95 * pxm, rr = ww / 2;
      const arch = (c, grow = 0) => {
        c.beginPath();
        c.moveTo(wx - grow, wy + wh); c.lineTo(wx - grow, wy + rr);
        c.arc(wx + rr, wy + rr, rr + grow, Math.PI, 0);
        c.lineTo(wx + ww + grow, wy + wh); c.closePath();
      };
      g.fillStyle = rgba(st.trim, 0.95); arch(g, 12); g.fill();               // stone surround
      g.fillStyle = rgba(frame); arch(g, 4); g.fill();
      block(wx + rr - 9, wy - 16, 18, 22, st.trim, 1.05);                    // keystone
      block(wx - 10, wy + wh, ww + 20, 9, st.trim, 0.95);                    // sill
      // The glass and its mask are clipped to the arch.
      g.save(); mg.save(); arch(g); g.clip(); arch(mg); mg.clip();
      glass(wx, wy, ww, wh); bars(wx, wy + rr, ww, wh - rr, 2, 2, frame);
      block(wx + rr - 2, wy, 4, rr, frame); mg.fillStyle = '#000'; mg.fillRect(wx + rr - 2, wy, 4, rr);
      g.restore(); mg.restore();
    }
  });

  // Cornice stone: big pale ashlar blocks.
  {
    const [x, y, w, h] = REGIONS.stone;
    g.fillStyle = rgba([150, 142, 126]); g.fillRect(x, y, w, h);
    for (let yy = y, row = 0; yy < y + h; yy += 42, row++) {
      for (let xx = x - (row & 1 ? 60 : 0); xx < x + w; xx += 120) block(Math.max(x, xx), yy, Math.min(118, x + w - Math.max(x, xx)) - 2, 40, [196, 186, 166], r(0.88, 1.06));
    }
    strokes(x, y, w, h, [196, 186, 166], 500, { len: [10, 30], width: [3, 7], alpha: [0.05, 0.12] });
  }
  // Chimney brick: small dark bricks, heavy soot.
  {
    const [x, y, w, h] = REGIONS.brick;
    wall(x, y, w, h, { base: [118, 52, 40], mortar: [60, 50, 46], brick: true }, w / 1.4);
  }
  // Tank staves: vertical boards with two iron hoops.
  {
    const [x, y, w, h] = REGIONS.staves;
    g.fillStyle = rgba([40, 30, 24]); g.fillRect(x, y, w, h);
    for (let xx = x; xx < x + w; xx += 32) block(xx, y, 30, h, [96, 66, 44], r(0.82, 1.1));
    strokes(x, y, w, h, [96, 66, 44], 600, { len: [16, 40], width: [2, 4], angle: Math.PI / 2, alpha: [0.08, 0.2] });
    for (const t of [0.22, 0.74]) block(x, y + h * t, w, 12, [44, 46, 50]);
  }
  // Tar-paper roof: grey sheets with lighter seams and darker patches.
  {
    const [x, y, w, h] = REGIONS.roof;
    g.fillStyle = rgba([92, 92, 96]); g.fillRect(x, y, w, h);
    strokes(x, y, w, h, [104, 104, 108], 900, { len: [12, 40], width: [3, 8], alpha: [0.1, 0.25] });
    for (let yy = y + 40; yy < y + h; yy += 56) block(x, yy, w, 3, [128, 128, 130]);
    for (let k = 0; k < 8; k++) block(x + rng() * (w - 60), y + rng() * (h - 40), r(30, 70), r(18, 34), [76, 78, 82], r(0.9, 1.1));
  }
  // Awning canvas: pale and mid stripes (the instance colour dyes them), shaded folds.
  {
    const [x, y, w, h] = REGIONS.awning, n = 14, sw = w / n;
    for (let k = 0; k < n; k++) {
      const c = k % 2 ? [150, 146, 138] : [238, 232, 216];
      block(x + k * sw, y, sw + 1, h, c);
      strokes(x + k * sw, y, sw, h, c, 60, { len: [20, 60], width: [3, 7], angle: Math.PI / 2, alpha: [0.08, 0.2] });
    }
    for (const [t, a] of [[0, 0.3], [1, 0.25]]) {
      const y1 = y + (t ? h * 0.75 : 0), grad = g.createLinearGradient(0, y1, 0, y1 + h * 0.25);
      grad.addColorStop(0, `rgba(20,20,24,${t ? 0 : a})`); grad.addColorStop(1, `rgba(20,20,24,${t ? a : 0})`);
      g.fillStyle = grad; g.fillRect(x, y1, w, h * 0.25);
    }
  }
  // Barn boards: pale vertical boards with dark gaps (the instance colour dyes them),
  // knots, and weathering low down.
  {
    const [x, y, w, h] = REGIONS.boards;
    g.fillStyle = rgba([70, 64, 58]); g.fillRect(x, y, w, h);
    for (let xx = x; xx < x + w; xx += 32) block(xx + 1, y, 29, h, [214, 206, 192], r(0.84, 1.04));
    strokes(x, y, w, h, [196, 188, 174], 700, { len: [18, 50], width: [1.5, 3.5], angle: Math.PI / 2, jitter: 0.12, alpha: [0.1, 0.24] });
    for (let k = 0; k < 14; k++) { g.fillStyle = 'rgba(60,48,40,0.45)'; g.beginPath(); g.ellipse(x + rng() * w, y + rng() * h, r(2, 4), r(3, 6), 0, 0, Math.PI * 2); g.fill(); }
    const grad = g.createLinearGradient(0, y + h * 0.6, 0, y + h);
    grad.addColorStop(0, 'rgba(30,26,22,0)'); grad.addColorStop(1, 'rgba(30,26,22,0.35)');
    g.fillStyle = grad; g.fillRect(x, y + h * 0.6, w, h * 0.4);
  }
  // Fieldstone: irregular stones in rough courses, grey with a little warmth, lit from above.
  {
    const [x, y, w, h] = REGIONS.fieldstone;
    g.fillStyle = rgba([58, 54, 50]); g.fillRect(x, y, w, h);
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    for (let yy = y + 14; yy < y + h + 24; yy += r(30, 38)) {
      for (let xx = x - r(0, 30); xx < x + w + 30; xx += r(42, 60)) {
        const rx = r(20, 30), ry = r(13, 18), cy = yy + r(-3, 3), l = r(104, 148), warm = r(-8, 10);
        g.save();
        g.beginPath();
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2 + r(-0.2, 0.2), f = r(0.84, 1.08);
          const px = xx + Math.cos(a) * rx * f, py = cy + Math.sin(a) * ry * f;
          if (k) g.lineTo(px, py); else g.moveTo(px, py);
        }
        g.closePath();
        g.fillStyle = rgba([l + warm, l, l - warm * 0.6]); g.fill();
        g.clip();
        g.fillStyle = 'rgba(239,230,208,0.14)'; g.fillRect(xx - rx, cy - ry, rx * 2, ry * 0.7);     // lit top
        g.fillStyle = 'rgba(20,18,16,0.22)'; g.fillRect(xx - rx, cy + ry * 0.35, rx * 2, ry);         // shaded underside
        g.restore();
      }
    }
    g.restore();
    strokes(x, y, w, h, [130, 126, 118], 500, { len: [8, 24], width: [2, 5], alpha: [0.05, 0.14] });
  }

  const color = new THREE.CanvasTexture(cv);
  color.colorSpace = THREE.SRGBColorSpace;
  const mask = new THREE.CanvasTexture(mv);
  for (const t of [color, mask]) { t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; }
  return { color, mask, styles: STYLE_LIST.map((s) => s.name) };
}

// A material that paints atlas regions onto any surface in world space: `side` on walls,
// `top` on anything facing up, `tile` metres per repeat across the region's width. The
// cornices, chimneys, water tanks, roof bulkheads, barns and fieldstone walls all share one
// shader; only the uniforms differ.
export function atlasMaterial(atlas, { side, top = side, tile = 2, topTile = tile, ...params }) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, ...params });
  mat.userData.atlas = { side, top };
  const repeat =(name, t) => new THREE.Vector2(t, (t * REGIONS[name][3]) / REGIONS[name][2]);
  const u = {
    uAtlas: { value: atlas.color },
    uSide: { value: new THREE.Vector4(...region(side)) }, uSideTile: { value: repeat(side, tile) },
    uTop: { value: new THREE.Vector4(...region(top)) }, uTopTile: { value: repeat(top, topTile) },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAtlasPos;\nvarying vec3 vAtlasNormal;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 atlasWP = vec4(transformed, 1.0);
        vec3 atlasN = objectNormal;
        #ifdef USE_INSTANCING
          atlasWP = instanceMatrix * atlasWP;
          mat3 atlasIM = mat3(instanceMatrix);
          atlasN /= vec3(dot(atlasIM[0], atlasIM[0]), dot(atlasIM[1], atlasIM[1]), dot(atlasIM[2], atlasIM[2]));
          atlasN = atlasIM * atlasN;
        #endif
        atlasWP = modelMatrix * atlasWP;
        vAtlasPos = atlasWP.xyz;
        vAtlasNormal = normalize(mat3(modelMatrix) * atlasN);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vAtlasPos;
        varying vec3 vAtlasNormal;
        uniform sampler2D uAtlas;
        uniform vec4 uSide;
        uniform vec4 uTop;
        uniform vec2 uSideTile;
        uniform vec2 uTopTile;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 an = abs(vAtlasNormal);
          bool atop = an.y > 0.5;
          vec2 ac = atop ? vAtlasPos.xz / uTopTile : (an.x > an.z ? vAtlasPos.zy : vAtlasPos.xy) / uSideTile;
          vec4 ar = atop ? uTop : uSide;
          vec2 af = clamp(fract(ac), 0.01, 0.99);
          diffuseColor.rgb *= textureGrad(uAtlas, ar.xy + af * ar.zw, dFdx(ac) * ar.zw, dFdy(ac) * ar.zw).rgb;
        }`);
  };
  mat.customProgramCacheKey = () => 'shine-atlas';
  return mat;
}

// Remap a geometry's UVs into an atlas region (for meshes that take the atlas as `map`).
export function uvToRegion(geo, name) {
  const [u0, v0, du, dv] = region(name), uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * du, v0 + uv.getY(i) * dv);
  uv.needsUpdate = true;
  return geo;
}
