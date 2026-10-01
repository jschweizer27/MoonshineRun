# Your own models

SHINE builds every vehicle from code, so this folder can stay empty. To drive your own
truck, drop a glTF model here and point the game at it.

## Where to find a free model
| Site | Licence | Search for |
|---|---|---|
| [Poly Pizza](https://poly.pizza) | Mostly CC0, some CC-BY | "vintage car", "old truck", "model t" |
| [Sketchfab](https://sketchfab.com) (filter *Downloadable*) | Check each: CC0 / CC-BY | "1920s truck", "Ford Model T", "Model TT" |
| [Quaternius](https://quaternius.com) | CC0 | "Cars" packs (modern styling) |
| [Kenney](https://kenney.nl) Car Kit | CC0 | clean, toy-like |
| [OpenGameArt](https://opengameart.org) | Varies | "car", "truck" |

Best results: one `.glb` file, under ~50k triangles and ~10 MB, textures embedded.
Only use licences that allow redistribution (CC0 or CC-BY). Credit CC-BY authors in
`CREDITS.md` below.

## Hooking it up
1. Put the file here, e.g. `assets/truck.glb`.
2. In `src/config.js`, set
   `truckModel: { url: 'assets/truck.glb', yaw: 0, length: 4.9, hideWheels: false }`
   - `yaw`: turn it (radians, e.g. `Math.PI`) until it faces forward.
   - `length`: nose-to-tail size in metres (the built-in truck is 4.9).
   - `hideWheels: true` if the model has its own wheels.
3. `npm start` and have a look. If the file can't be loaded, the built-in truck is used.

The lamp lenses, headlight beams and the horse box stay where the built-in truck has them.
The single-file `dist/Shine.html` build doesn't include this folder; the website build does.

## CREDITS
(None yet: every model in the game is built in code.)
