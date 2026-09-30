# Shine in Unreal Engine 5: step-by-step checklist

From nothing to driving the bootlegger loop in UE5. No C++ knowledge needed. Tick each step
off as you go. Budget about an hour the first time (most of it downloads and compiling).

> **Heads-up:** this C++ was written and statically checked without an Unreal Engine install
> (CI runs `scripts/check-ue5.mjs`), but it has **not been compiled yet**. If step 2 shows a
> build error, copy the **first** error line from Visual Studio's Output window and paste it
> to Claude; fixes are usually one line.

---

## 1. Install the tools (once)

- [ ] **Epic Games Launcher** → Unreal Engine tab → Library → install **UE 5.4 or newer**.
- [ ] **Visual Studio 2022** (free Community edition). In the installer, tick the workload
      **Game development with C++**, and under *Optional* tick **Unreal Engine installer** and
      the newest **Windows SDK**. Epic's page *"Setting Up Visual Studio for Unreal Engine"*
      lists the exact boxes for your engine version.

## 2. Open the project

- [ ] Get the project: download `Shine-UE5-*.zip` from the repository's **Releases** page, or
      the whole repository (**Code → Download ZIP**). Unzip it. The `ue5` folder (`Shine-UE5`
      in the release zip) is a complete Unreal project.
- [ ] Double-click **`ue5/MoonshineRun.uproject`**.
- [ ] When it asks *"The following modules are missing or built with a different engine
      version… Would you like to rebuild them now?"* click **Yes**. The first build takes 1–5
      minutes, then the editor opens.
  - Asked to pick an engine version? Choose the one you installed. You can also right-click
    the `.uproject` → **Switch Unreal Engine version**.
  - Build failed? Right-click the `.uproject` → **Generate Visual Studio project files**, open
    `MoonshineRun.sln`, press **Ctrl+Shift+B**, and read the first error.

## 3. A place to drive

- [ ] **File → New Level → Basic**, then **File → Save Current Level As** → `Content/Maps/Valley`.
- [ ] Select the **Floor** and set its **Scale** to `50, 50, 1` (half a kilometre square).
- [ ] Add a few buildings: **Quick Add (+) → Shapes → Cube**, scaled to `10, 10, 8`.
      Buildings break the law's line of sight, so they're where you lose them.
- [ ] **Quick Add → Volumes → Nav Mesh Bounds Volume**. Scale it to cover the whole floor.
      Press **P** to preview: green means drivable. Cops route around buildings on this, and
      the stills and drops are placed on it.
- [ ] **Edit → Project Settings → Maps & Modes**: set **Editor Startup Map** and **Game
      Default Map** to `Valley`.

## 4. Otto's truck

- [ ] **Content Drawer → + Add → Add Feature or Content Pack → Blueprint → Vehicle → Add to
      Project**. This adds ready-made drivable car meshes.
- [ ] **Content Drawer → right-click → Blueprint Class → All Classes →** `MoonshineVehicle`.
      Name it `BP_MoonshineTruck` and open it.
- [ ] Select the **VehicleMesh** component, then:
  - **Skeletal Mesh Asset:** the off-road car's body (type `Offroad` in the dropdown search).
  - **Anim Class:** the off-road car's animation Blueprint (it also has `Offroad` in its name).
- [ ] **Compile** and **Save**.
  - Wheels sink into the ground or float? Make Blueprint children of `MoonshineWheelFront`
    and `MoonshineWheelRear`, set **Wheel Radius** to match the mesh, and pick them under
    **Vehicle Movement → Wheel Setups**.
  - Using your own mesh? It needs a physics asset and wheel bones named `Phys_Wheel_FL`,
    `Phys_Wheel_FR`, `Phys_Wheel_BL` and `Phys_Wheel_BR` (or change the bone names in
    **Wheel Setups**).

## 5. The law

- [ ] Make two Blueprint children of `ProhibitionCop`, the same way as the truck:
  - `BP_FedSedan`: **Kind** = *Prohibition Fed*, mesh = the sports car.
  - `BP_ZealotPickup`: **Kind** = *Temperance zealot*, mesh = the off-road car.
- [ ] **Quick Add → search "Moonshine Delivery Manager"** and drag it into the level. In its
      **Details**, set **Fed Class** = `BP_FedSedan` and **Zealot Class** = `BP_ZealotPickup`.
- [ ] *(Optional)* **Roadblock Class:** a Blueprint Actor with a couple of cubes for sawhorses.
      At 2+ stars they appear across the road ahead of you.

## 6. The game mode

- [ ] **Blueprint Class → All Classes →** `MoonshineGameMode`, named `BP_ShineGameMode`.
      Set **Default Pawn Class** = `BP_MoonshineTruck`.
- [ ] **Project Settings → Maps & Modes → Default GameMode** = `BP_ShineGameMode`.
- [ ] Make sure the level has a **Player Start** (Quick Add → Basic → Player Start).

## 7. Play

- [ ] Press **Play** (Alt+P) and click into the viewport.
  - **Drive:** `W`/`S` or arrows, `A`/`D` to steer, `Space` handbrake, `C` look back, `H` horn,
    `Backspace` flips you upright. On a controller: RT/LT, left stick, A, Y, B, View.
  - Follow the amber **STILL** column (the HUD shows the distance). Drive into it to load up.
  - Deliver to the blue **DROP** across town to get paid.
  - Hauling draws **suspicion**. At 100% you get a **star** and the law comes. Stay out of
    their sight until **LOSING THEM…** fills and you shed the star.
  - Get pinned while slow and the red bar fills: **BUSTED**. You lose the load, pay a fine and
    start again at home.

That's the whole Dev Guide loop (Phases 1, 3, 4 and 5) running. Everything below is optional.

---

## 8. Put the stills and drops where you want them

- [ ] Place any actors (Target Points, barns, warehouses) and add the **Tag** `Still`, `Drop`
      or `Hideout` (Details → Actor → Tags). The delivery manager picks them up
      automatically. The hideout is where you restart after a bust and where you lie low
      (roll in slowly, empty and unseen, to clear the heat).

## 9. A Behavior Tree for the cops (Dev Guide Phase 3)

The cops already work without one: their controller runs the same logic in C++. To drive
them from a Behavior Tree instead:

- [ ] **Content Drawer → right-click → Artificial Intelligence → Blackboard** → `BB_Cop`. Add keys:
  | Key | Type |
  |---|---|
  | `TargetActor` | Object (Base Class: Actor) |
  | `CanSeeTarget` | Bool |
  | `LastKnownLocation` | Vector |
  | `Mode` | Enum (Enum Name: `EPursuerMode`) |
  | `DriveGoal` | Vector |
  | `PatrolPoint` | Vector |
- [ ] **Artificial Intelligence → Behavior Tree** → `BT_Cop`, using `BB_Cop`. Build:
  ```
  ROOT
  └─ Selector                       (right-click → Add Service → Shine Pursuit)
     ├─ Sequence                    (Add Decorator → Blackboard: Mode Is Equal To Patrol,
     │  │                            Observer aborts: Both)
     │  ├─ Shine Pick Road Point    (Key: PatrolPoint, Around: Player)
     │  ├─ Shine Drive To           (Key: PatrolPoint)
     │  └─ Wait 0.5
     └─ Shine Drive To              (Key: DriveGoal, Follow Continuously: on)
  ```
- [ ] Set **Behavior Tree** = `BT_Cop` on `BP_FedSedan` and `BP_ZealotPickup`.
- [ ] Play, then press **'** (apostrophe) with a cop in view to watch the tree live.

*Shine Pursuit* keeps the blackboard up to date: line of sight, what a patrol finds
suspicious, and each cop's own give-up timer. *Shine Drive To* steers a car along the navmesh.
Add branches (a roadblock-manning task, a ram manoeuvre for zealots) from here.

## 10. Tuning

Every number matches the web demo's `src/config.js` (see `Source/MoonshineRun/ShineTuning.h`).
Try changes in the browser first, since it's faster, then copy them to the **Delivery
Manager** (heat, bust, pay, patrols) and the cop Blueprints (speed, sight range, give-up time).

## Troubleshooting

| Problem | Fix |
|---|---|
| "Modules are missing" and the rebuild fails | Step 2: build in Visual Studio and read the first error |
| The truck falls through the floor or won't move | The mesh has no physics asset, or its wheel bones have other names (step 4) |
| No STILL column | Add a Nav Mesh Bounds Volume (step 3) or tagged actors (step 8). **Window → Output Log**, filter `LogShine` |
| Nobody chases you | Set Fed Class / Zealot Class on the delivery manager (step 5) |
| Cops drive through buildings | The navmesh is missing or doesn't cover the area (press **P**) |
| Keys do nothing | Click inside the viewport; `Config/DefaultInput.ini` must still select Enhanced Input |
