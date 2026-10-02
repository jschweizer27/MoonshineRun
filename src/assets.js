import { CONFIG } from './config.js';

// 3D models from assets/ (made by scripts/optimize-models.mjs; see assets/README.md).
// They load once at boot, before the city and the cars are built, so their shaders compile
// with everything else and nothing is created mid-game. A model that fails to load just
// leaves the built-in procedural one in its place.
//
// MODELS[name] = { body, wheel, glow, reinforced: BufferGeometry | null, material: Material | null,
//                  extras: { size, wheels, wheelRadius, headlights, roof, head } }
// material is null for models baked to vertex colours: they use the shared vehicle
// material (models.js MATERIALS.body).
export const MODELS = {};

export async function loadModels(list = CONFIG.look.models) {
  const entries = Object.entries(list || {}).filter(([, url]) => url);
  if (!entries.length) return MODELS;
  let loader;
  try {
    const { GLTFLoader } = await import('../vendor/three/addons/loaders/GLTFLoader.js');
    loader = new GLTFLoader();
  } catch (e) {
    console.warn('3D model loader unavailable; using the built-in models.', e?.message || e);
    return MODELS;
  }
  await Promise.all(entries.map(async ([name, url]) => {
    try {
      MODELS[name] = unpack((await loader.loadAsync(url)).scene);
    } catch (e) {
      console.warn(`Model "${name}" (${url}) not loaded; using the built-in one.`, e?.message || e);
    }
  }));
  return MODELS;
}

function unpack(scene) {
  const part = (name) => {
    const o = scene.getObjectByName(name);
    return o && o.isMesh ? o : null;
  };
  const body = part('body');
  if (!body) throw new Error('no "body" mesh (run scripts/optimize-models.mjs)');
  const baked = !!body.geometry.attributes.color;
  const geo = (m) => {
    if (!m) return null;
    const g = m.geometry;
    if (g.attributes._surf) { g.setAttribute('surf', g.attributes._surf); g.deleteAttribute('_surf'); }
    return g;
  };
  return {
    body: geo(body), wheel: geo(part('wheel')), glow: geo(part('glow')), reinforced: geo(part('reinforced')),
    material: baked ? null : body.material,
    extras: scene.userData || {},
  };
}
