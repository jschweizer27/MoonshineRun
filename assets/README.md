# 3D models

The game uses these models when they load, and its built-in procedural ones when they
don't (or with `?models=0`). They're listed in `CONFIG.look.models` (`src/config.js`).

| File | In the game | Source (Sketchfab, CC BY 4.0) |
|---|---|---|
| `runner.glb` | Otto's truck | "Moonshine Runner" by car-go — sketchfab.com/3d-models/moonshine-runner-fd63e809162647bcbb567248d1b6617c |
| `bureau-sedan.glb` | Prohibition Bureau sedans | "Volvo PV4 V2 Downloadable" by Libau Media — sketchfab.com/3d-models/volvo-pv4-v2-downloadable-4ee791d8d2de47c5ba1b132db990da77 |
| `rolls-royce.glb` | The garage's Rolls-Royce | "1925 Rolls Royce Phantom I Jonckheere Coupe" by Antonio Sagistiano — sketchfab.com/3d-models/1925-rolls-royce-phantom-i-jonckheere-coupe-1043f7cdbe1146df828a047dcbf42cc2 |
| `arc-lamp.glb` | Street lamps | "Arc Lamp - Victorian Street Lamp" by i-m-a-kitty-cat — sketchfab.com/3d-models/arc-lamp-victorian-street-lamp-41e1be71fdaf430d9d91c871cf153f0d |

`dredge-truck.glb` (the dredge run's truck) is made here, not downloaded: `node scripts/make-truck.mjs`
builds it from bevelled, flat-shaded primitives in the dredge palette (no textures; it
shares the game's vehicle material).

The downloaded ones are licensed CC BY 4.0 (creativecommons.org/licenses/by/4.0/). They were reduced
(fewer triangles, smaller or baked textures), re-oriented and split into body and wheel
for the game. The credits also appear on the in-game How to play screen.

## Adding or replacing a model
1. Download a `.glb` (Poly Pizza, Sketchfab with the *Downloadable* filter, Quaternius,
   Kenney, OpenGameArt). Only use licences that allow redistribution (CC0 or CC BY), and
   credit CC BY authors here and on the How to play screen.
2. Shrink it into this folder:
   ```
   npm i --no-save @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
   node scripts/optimize-models.mjs runner=~/Downloads/my-truck.glb
   ```
   Each kind (`runner`, `sedan`, `rolls`, `lamp`) has its settings at the top of the
   script: which way it faces, its length, the triangle budget, and whether its textures
   are baked into vertex colours (cars that share the game's paint material) or kept.
3. `npm start` and look. If a model fails to load, the built-in one is used.
