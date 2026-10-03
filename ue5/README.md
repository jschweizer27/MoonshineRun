# Shine: Unreal Engine 5 project

> **Frozen: the bootlegging design.** This project mirrors the game's first design, the
> bootlegging run (stills and drops, heat and evasion, the bust meter, patrols, wanted
> tiers, pay). The playable web demo in the repo root has since replaced that loop with a
> loot-and-sell run (pick up loot, pack the trunk, sell in the towns, buy upgrades), and
> this project has **not** followed it. It is kept as it was, still checked by CI, as a
> reference and a starting point; nothing in the web game has to be mirrored here.

A **ready-to-open UE5 C++ project** for the full 3D build of *Shine*, following the
*Moonshine Run Dev Guide*. It carries the game rules of the original web demo (heat,
evasion, bust meter, patrols, wanted tiers, pay), with the same numbers as that version
(the web files it names below were removed with the bootlegging loop; git history has
them).

**→ Start with [CHECKLIST.md](CHECKLIST.md)**: step-by-step from installing the engine to
driving the loop.

> **Status:** written without an Unreal Engine install, so it has **not been compiled yet**.
> CI runs static checks on it (`scripts/check-ue5.mjs`: Unreal Header Tool rules, includes,
> module dependencies, project file), because GitHub's machines have no engine to build it.
> If the first build reports an error, paste the first error line to Claude.

## What works out of the box

- **Double-click `MoonshineRun.uproject`**: the project file, build targets, module
  dependencies (Chaos Vehicles, Enhanced Input, AI, Navigation, UMG) and config are included.
- **Driving** with keyboard or controller. Default Enhanced Input bindings are created in code,
  so no input assets are needed (assign your own in the truck Blueprint if you like).
- **The loop:** stills, drops and hideout markers are placed automatically (tagged actors, or
  random points on the navmesh), with pay by distance, suspicion, stars, evading, pinned →
  busted → fine → restart at the hideout, and lying low.
- **Police AI:** patrols that notice a suspicious truck, chases that need line of sight,
  searches around the last sighting, giving up, heading home. Feds cut you off; zealots ram.
  They route around buildings on the navmesh, get faster at 3 stars and put up roadblocks
  at 2+ stars. Each cop has its **own** timers; the old scaffold shared one `static` timer
  between every cop.
- **A HUD drawn in code:** cash, stars, the suspicion / heat / evade meter, the bust bar,
  objective and distance, speed, and pop-ups.
- **Optional Behavior Trees:** a *Shine Pursuit* service plus *Shine Drive To* and *Shine
  Pick Road Point* tasks. Without a tree, the controller runs the same logic in C++.

What you add in the editor: meshes (the free Vehicle content pack is enough), a level with a
Nav Mesh Bounds Volume, and three small Blueprints. See CHECKLIST.md, steps 3–6.

## Files

| File | What it is | Web demo equivalent |
|---|---|---|
| `MoonshineRun.uproject`, `Config/`, `Source/*.Target.cs`, `MoonshineRun.Build.cs` | Project, plugins, build setup | `package.json` |
| `ShineTuning.h` | Default numbers | `src/config.js` |
| `ShineTypes.h` | Pursuer modes and kinds, orders, heat context | — |
| `MoonshineVehicleBase` | Chaos vehicle shared by the truck and the cops (4 wheels, RWD, one drive API) | `src/vehicle.js` |
| `MoonshineWheels` | Front (steer) and rear (drive, handbrake) wheels | — |
| `MoonshineVehicle` | Otto's truck: chase camera, look back, Enhanced Input, cargo, disguise | `src/input.js`, `src/camera.js` |
| `ProhibitionCop` | Pursuer pawn settings (Fed or zealot, speed, sight, give-up time) | `src/police.js` |
| `ProhibitionCopController` | Per-cop brain: perception, modes, navmesh driving, unsticking | `src/police.js` |
| `BTService_ShinePursuit`, `BTTask_ShineDriveTo`, `BTTask_ShinePickRoadPoint` | Behavior Tree nodes | — |
| `MoonshineDeliveryManager` | Loop, pay, heat, evasion, bust, tiers, patrols, roadblocks | `src/mission.js`, `src/main.js` |
| `MoonshineMarker` | STILL / DROP / HIDEOUT columns with labels | markers in `src/mission.js` |
| `MoonshineGameMode`, `MoonshineHUD` | Wiring and the in-code HUD | `src/hud.js` |

## Dev Guide phases

| Phase | Goal | Where |
|---|---|---|
| 1: Get a car moving | Drivable Chaos vehicle, WASD, chase cam | `MoonshineVehicleBase`, `MoonshineVehicle` (+ CHECKLIST step 4) |
| 2: Test city block | Night lighting, fog, art-deco blocks | Editor work; mirror `src/world.js` and `src/environment.js` |
| 3: Cop AI | Patrol / chase / lose them, Behavior Tree | `ProhibitionCopController` + BT nodes (CHECKLIST step 9) |
| 4: Bootlegger loop | Pickup → deliver → cash, HUD | `MoonshineDeliveryManager`, `MoonshineMarker`, `MoonshineHUD` |
| 5: Polish | Wanted tiers, audio, menus | Tiers, roadblocks and bust are in; audio and UMG menus are next |

## Treatment beats these support

- **Steeplechase smuggling loop** → `MoonshineDeliveryManager` (orders, pay by distance).
- **The horse-box disguise** → `bDisguiseUnlocked` on the truck: under 30 mph, suspicion
  builds 4× slower and patrols only notice up close.
- **Temperance Alliance zealots vs. corrupt Feds** → `EPursuerKind` on `ProhibitionCop`.
- **The County Sheriff racket** → `bInSafeZone` on the delivery manager (set it from a
  trigger volume once the sheriff is bribed).
