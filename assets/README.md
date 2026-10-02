# 3D models

The game uses these models when they load, and its built-in procedural ones when they
don't (or with `?models=0`). They're listed in `CONFIG.look.models` (`src/config.js`).

| File | In the game | Source |
|---|---|---|
| `dredge-truck.glb` | Otto's truck (stock and reinforced bodies) | Made here, in code: `node scripts/make-truck.mjs` |
| `arc-lamp.glb` | Street lamps | "Arc Lamp - Victorian Street Lamp" by i-m-a-kitty-cat (Sketchfab, CC BY 4.0) — sketchfab.com/3d-models/arc-lamp-victorian-street-lamp-41e1be71fdaf430d9d91c871cf153f0d |

The truck is built from bevelled, flat-shaded primitives in the game's palette (no
textures; it shares the game's vehicle material). It carries two bodies, stock and
reinforced (the bigger-bed upgrade), and the game shows one at a time.

The lamp is licensed CC BY 4.0 (creativecommons.org/licenses/by/4.0/). It was reduced
(fewer triangles, baked textures), re-oriented and scaled for the game. The credit also
appears on the in-game How to play screen.

## Adding or replacing a model
1. Download a `.glb` (Poly Pizza, Sketchfab with the *Downloadable* filter, Quaternius,
   Kenney, OpenGameArt). Only use licences that allow redistribution (CC0 or CC BY), and
   credit CC BY authors here and on the How to play screen.
2. Shrink it into this folder:
   ```
   npm i --no-save @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
   node scripts/optimize-models.mjs lamp=~/Downloads/my-lamp.glb
   ```
   Each kind has its settings at the top of the script: which way it faces, its size, the
   triangle budget, and whether its textures are baked into vertex colours (models that
   share the game's paint material) or kept.
3. `npm start` and look. If a model fails to load, the built-in one is used.
