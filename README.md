# SHINE — Playable Demo

A browser-playable vertical slice of **Shine**, a 1920s Prohibition-era, GTA-style
bootlegging game. You are **Otto Braun**, a Baltimore brewer turned moonshine runner: load
shine at a still, deliver it for cash, and beat the heat as cops and Temperance Alliance
zealots run you down.

This repo has two parts:

- **`/` (repo root)** — a fully playable **3D demo built in Three.js** (no install/build step).
- **`/ue5`** — a **C++ scaffold for the full Unreal Engine 5 build**, following the
  *Moonshine Run Dev Guide*. See [`ue5/README.md`](ue5/README.md).

## Play the web demo

Because it uses ES modules + an importmap, open it through a local web server (not `file://`):

```bash
# from the repo root
python3 -m http.server 8000
# then open http://localhost:8000 in a browser
```

Any static server works (`npx serve`, VS Code Live Server, etc.). It can also be hosted on
GitHub Pages as-is.

### Controls

| Key | Action |
|-----|--------|
| `W` / `↑` | Throttle |
| `S` / `↓` | Brake & reverse |
| `A` `D` / `← →` | Steer |

### The loop

1. Click **START THE RUN** (the intro sets up Otto and the objective).
2. Drive to the glowing **amber still** to load shine.
3. Carrying shine raises the **heat** — pursuers spawn and chase you.
4. Reach the **blue drop** to get paid; a new run spawns automatically.
5. Get rammed by a pursuer = **BUSTED**. Lose them and the heat cools off.

## Playtest checklist

- [ ] Intro screen shows, **START** hides it and reveals the HUD.
- [ ] Car drives, steers, brakes/reverses; chase camera follows.
- [ ] Reaching the amber still flips the HUD to **CARGO: LOADED** and spawns a blue drop.
- [ ] HEAT (★) rises while carrying; pursuer cars appear and chase.
- [ ] Reaching the blue drop adds **+$850** and spawns the next still.
- [ ] HEAT decays after delivery and pursuers leave once it hits 0.
- [ ] Getting rammed shows **BUSTED**; **RUN AGAIN** restarts cleanly.

## Project layout

```
index.html        # canvas, HUD, intro/game-over screens, Three.js importmap
styles.css        # period-styled HUD + menus
src/
  main.js         # bootstrap + game loop + state machine
  world.js        # night city: roads, buildings, lamps, fog
  vehicle.js      # arcade driving + chase camera
  cops.js         # pursuer AI (cops / zealots)
  mission.js      # bootlegger loop, economy, wanted/heat
  hud.js          # DOM HUD + overlays
  input.js        # keyboard -> throttle/steer
  audio.js        # procedural engine + siren (WebAudio)
ue5/              # Unreal Engine 5 C++ scaffold (build on your PC)
```

## Notes

The demo favors a fun, working loop over fidelity — primitive geometry and lighting set the
mood rather than detailed art. Natural next steps: real car/building models, period jazz
music, more mission variety, and porting the loop into the UE5 scaffold.
