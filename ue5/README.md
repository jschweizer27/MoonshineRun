# Shine — Unreal Engine 5 Scaffold

This folder is a **starting point for the full 3D build of _Shine_ in Unreal Engine 5**,
following the *Moonshine Run Dev Guide*. The C++ classes here are skeletons with the right
shape and comments pointing at what to fill in — **they have not been compiled** (the web
demo in the repo root was built in a cloud Linux container with no UE5). Build and iterate on
these on your own PC.

> The playable web demo in the repo root is a design prototype of the same loop. Use it to
> feel out tuning (speeds, heat build/decay, reward) before reproducing it here.

## How to use this scaffold

1. Follow **Part 1 & 2** of the Dev Guide: install UE5, VS Code, Node, and Claude Code, then
   create a **C++** project named `MoonshineRun` with the **Chaos Vehicles** plugin enabled.
2. Copy the files under `Source/MoonshineRun/` into your project's `Source/MoonshineRun/`
   folder.
3. Right-click the `.uproject` → **Generate Visual Studio project files**, then build.
4. Work through the phases below, using these classes as the anchor points.

## Dev Guide phase → file map

| Phase | Goal | Anchor file |
|-------|------|-------------|
| 1 — Get a car moving | Driveable Chaos vehicle, WASD, chase cam | `MoonshineVehicle.{h,cpp}` |
| 2 — Test city block | Night lighting, fog, art-deco blocks | *(editor work — see Dev Guide; mirror `src/world.js`)* |
| 3 — Cop AI | Patrol / chase / lose via Behavior Tree | `ProhibitionCop.{h,cpp}` |
| 4 — Bootlegger loop | Pickup → deliver → cash, HUD | `MoonshineDeliveryManager.{h,cpp}` |
| 5 — Polish | Wanted tiers, audio, menus | `MoonshineDeliveryManager` (wanted) + UMG |

## Treatment beats these support

- **Steeplechase smuggling loop** → `MoonshineDeliveryManager` pickup/deliver runs.
- **Temperance Alliance / Corrupt Feds** → `ProhibitionCop` (reskin/var for zealot vs fed).
- **Wanted/heat escalation** → wanted tiers in `MoonshineDeliveryManager`.
