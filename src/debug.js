import { JUICE } from './juice.js';

// Developer + test hooks, enabled with ?debug (overlay) or ?test (no overlay).
// window.shine exposes a small API the automated playtests use to drive the game
// deterministically (fixed 60 Hz steps instead of waiting on real frames).
export function installDebug(game, { overlay }) {
  const idle = { throttle: 0, steer: 0, handbrake: false };
  const api = {
    game,
    // Simulate `seconds` of play at 60 Hz with a fixed input. Stops early if the run ends.
    step(seconds, input = {}) {
      const n = Math.round(seconds * 60);
      for (let i = 0; i < n && game.state === 'playing'; i++) game.step(1 / 60, { ...idle, ...input });
      return api.snapshot();
    },
    teleport(x, z, heading = 0) {
      game.player.place(x, z, heading);
      game.chase.snap(game.player);
    },
    // Drive onto the still and pick an order (0 = small). Leaves the game playing.
    loadShine(order = 0) {
      const m = game.mission;
      api.teleport(m.pickup.position.x, m.pickup.position.z);
      game.step(1 / 60, idle);
      document.querySelectorAll('#orders-body .order')[order]?.click();
      return api.snapshot();
    },
    snapshot() {
      const m = game.mission, p = game.player;
      return {
        state: game.state, game: game.mode, loot: game.hold.length, cash: game.career.cash, streak: m.streakEarned, runs: m.streakRuns, carrying: m.carrying, mode: m.mode,
        heat: +m.heat.toFixed(3), tier: m.tier, evade: +m.evade.toFixed(3),
        pursuers: game.police.pursuing, contact: game.police.contact,
        x: +p.position.x.toFixed(2), z: +p.position.z.toFixed(2), heading: +p.heading.toFixed(3), speed: +p.speed.toFixed(2),
      };
    },
    // Draw calls of the scene itself (incl. shadow passes) and of the post-processing.
    renderInfo() {
      const i = game.renderer.info, sm = game.renderer.shadowMap;
      i.autoReset = false;
      i.reset();
      game.renderFrame();
      const withShadows = game.post.sceneCalls, postCalls = i.render.calls - withShadows;
      sm.autoUpdate = false;                 // same frame without redrawing the shadow maps
      i.reset();
      game.renderFrame();
      const sceneCalls = game.post.sceneCalls, shadowCalls = withShadows - sceneCalls;
      sm.autoUpdate = true;
      i.autoReset = true;
      let lights = 0;
      game.scene.traverse((o) => { if (o.isLight) lights++; });
      return { calls: sceneCalls, shadowCalls, postCalls, triangles: i.render.triangles, programs: i.programs.length,
        geometries: i.memory.geometries, textures: i.memory.textures, lights };
    },
  };
  window.shine = api;

  if (overlay) {
    juicePanel();
    const el = document.createElement('pre');
    el.id = 'debug-overlay';
    el.style.cssText = 'position:fixed;left:8px;bottom:70px;z-index:30;margin:0;padding:6px 8px;font:11px/1.35 ui-monospace,Menlo,monospace;color:#cfe;background:rgba(0,0,0,.6);pointer-events:none;white-space:pre';
    document.body.appendChild(el);
    let frames = 0, last = performance.now();
    const tick = () => {
      frames++;
      const now = performance.now();
      if (now - last >= 500) {
        const fps = (frames * 1000) / (now - last);
        frames = 0;
        last = now;
        const s = api.snapshot();
        const i = game.renderer.info;
        el.textContent = [
          `${fps.toFixed(0)} fps  ${(1000 / fps).toFixed(1)} ms  build ${game.buildId}`,
          `calls ${i.render.calls}  tris ${(i.render.triangles / 1000).toFixed(0)}k  programs ${i.programs.length}  geo ${i.memory.geometries}`,
          `state ${s.state}  heat ${s.heat} (tier ${s.tier})  evade ${s.evade}  cops ${s.pursuers}${s.contact ? ' seen' : ''}`,
          `pos ${s.x}, ${s.z}  heading ${s.heading}  speed ${s.speed}`,
        ].join('\n');
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  return api;
}

// ?debug: a slider for every value in JUICE (src/juice.js), live. "Copy values" puts the
// tuned numbers on the clipboard to paste back into juice.js.
function juicePanel() {
  const box = document.createElement('details');
  box.id = 'juice-panel';
  box.style.cssText = 'position:fixed;right:8px;top:120px;z-index:30;max-height:70vh;overflow:auto;padding:6px 8px;font:11px ui-monospace,Menlo,monospace;color:#cfe;background:rgba(0,0,0,.75);border-radius:4px';
  box.innerHTML = '<summary style="cursor:pointer">JUICE sliders (J = all on/off)</summary>';
  for (const [group, values] of Object.entries(JUICE)) {
    if (typeof values !== 'object') continue;
    const head = document.createElement('div');
    head.textContent = group;
    head.style.cssText = 'margin-top:6px;color:#fc6';
    box.append(head);
    for (const [key, value] of Object.entries(values)) {
      const row = document.createElement('label');
      row.style.cssText = 'display:grid;grid-template-columns:118px 110px 44px;gap:4px;align-items:center';
      const input = document.createElement('input');
      Object.assign(input, { type: 'range', min: '0', max: String(Math.max(1, value * 3)), step: String(value >= 5 ? 0.5 : 0.005), value: String(value) });
      const shown = document.createElement('span');
      shown.textContent = String(value);
      input.addEventListener('input', () => { values[key] = Number(input.value); shown.textContent = input.value; });
      input.addEventListener('keydown', (e) => e.stopPropagation());   // arrows move the slider, not the truck
      row.append(key, input, shown);
      box.append(row);
    }
  }
  const copy = document.createElement('button');
  copy.textContent = 'Copy values';
  copy.style.cssText = 'margin-top:8px;font:inherit';
  copy.addEventListener('click', () => navigator.clipboard?.writeText(JSON.stringify(JUICE, null, 2)).then(() => { copy.textContent = 'Copied'; }, () => {}));
  box.append(copy);
  document.body.append(box);
}
