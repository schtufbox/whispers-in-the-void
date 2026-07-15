# Whispers In The Void

<p align="center">
  <img src="logo.jpg" alt="Whispers In The Void" width="420" />
</p>

<p align="center">
  <strong>A procedurally generated 3D space trading, combat, and exploration game</strong><br/>
  Electron + Three.js · one seeded galaxy · arcade flight · permadeath
</p>

<p align="center">
  <a href="https://github.com/schtufbox/whispers-in-the-void/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/schtufbox/whispers-in-the-void?style=flat-square" /></a>
</p>

---

A desktop space sim with ~**1500** planets across ~**450** star systems, **100** ship classes, real-time mouse-aim flight and combat, station industry crafting, and **permadeath**.

## Features

- **One seeded galaxy** — systems, planets, moons, stations, settlements, and asteroid fields are generated from a single seed. Systems vary in scale; new games start near the galactic core (never on a binary/trinary).
- **Whispers** — an outer-rim landmark system with a unique trinary sun, a named station, and no ambient hostiles.
- **Textured worlds** — CC0 photo textures under procedural surface detail; stars with coronas, flares, and binary/trinary energy rings.
- **100 ship classes** — hand-crafted archetypes plus a generated roster; each class has its own hull silhouette, hardpoints, and stats.
- **Real-time flight and combat** — mouse-aim flight, boresight-converging weapons, shield/armour/hull layers, and NPC AI. Core systems are busier; the rim is quieter and more alien, with tougher pirates. Pirates may truce with you against aliens.
- **Crafting / Industry** — rare blueprints from wrecks and probes; assemble ships and weapons at stations from mined ore plus a bay fee. Jobs run on wall-clock time (continue offline).
- **Every station has a shipyard** — buy/sell ships, armoury, loadout, and repair (settlements still repair only).
- **Weapons armoury** — buy, store, equip, and resell hardpoint weapons per station.
- **Targeting & sensors** — Tab-lock ships, facilities, asteroids, wrecks, or the system star; radar and mission markers.
- **Trading economy** — tag-driven prices that nudge with your activity.
- **Missions** — bounty, exploration, investigation, and probe contracts. **J** tracks active work; orange rings on the galaxy map mark objectives and turn-ins.
- **Mining** — fire on individual asteroids for ore; finite yield per rock, rarer tiers toward the rim.
- **Probing** — scan planets, moons, asteroid fields, and stars for survey data and mission progress.
- **Docking & storage** — dock animation into a bay interior; per-station cargo/ore/parts/ships/weapons/blueprints; Inventory (**I**) lists remote assets.
- **Wrecks & salvage** — loot trade goods, occasional ship parts, and rare blueprints.
- **Hyperspace & supercruise** — neighbor-only jumps; supercruise to a waypoint with standoff arrival and target lock on drop-out. Voice callouts where supported.
- **Chase camera** — stays centered behind the ship; **hold Alt + mouse** to free-look, release to snap back.
- **HUD** — status bars, radar, canopy braces, scanlines; subtle starfield tint from the local sun.
- **Music & SFX** — title/ambient/death music; sample thrusters, weapons, dock, and synthesized combat layers.
- **Permadeath** — no respawns.

## Getting started

```
npm install
npm run dev
```

Launches the app with hot module reloading. Editing `src/renderer/main.js` while `npm run dev` is running resets the current game to the main menu — expected.

### Building

```
npm run build     # electron-vite build
npm run package   # build + electron-builder --dir (unpacked)
npm run make      # build + electron-builder (installer for the current platform)
```

Prebuilt installers (macOS arm64/x64, Linux AppImage arm64/x64, Windows arm64/x64) are on the [Releases](https://github.com/schtufbox/whispers-in-the-void/releases) page.

### Testing

Tests use Node’s built-in runner, colocated as `*.test.js`:

```
node --test src/renderer/game/*.test.js src/renderer/procgen/*.test.js src/renderer/data/*.test.js
node --test src/renderer/game/combat.test.js
```

## Controls

Flight is mouse-aim, toggled with **Space**. While flight mode is on, the pointer is locked for aim; open a menu or press Space again for a normal cursor. After alt-tab, click the window or press Space to re-lock.

| Input | Action |
| --- | --- |
| **Space** | Toggle flight mode / re-acquire pointer lock |
| **Mouse movement** | Aim (yaw/pitch) while flight mode is on |
| **Alt + mouse** | Free-look camera around the ship (release Alt to restore chase) |
| **Left click** | Fire lasers |
| **Right click** | Fire missiles/rockets |
| **W / S** | Throttle forward / reverse (hold speed when released; reverse capped at 25% of max) |
| **A / D** | Strafe |
| **Q / E** | Roll |
| **Mouse wheel** | Chase camera zoom |
| **Tab** | Target under crosshair, or cycle nearby contacts |
| **Ctrl/Cmd + Tab** | Set / clear waypoint on body under crosshair |
| **F** | Dock (in range) or salvage a wreck |
| **P** | Launch a probe (orbit + target, or close range) |
| **I** | Inventory |
| **J** | Missions tracker |
| **M** | Navigation map |
| **C** | Supercruise to waypoint |
| **F5** | Save |
| **Esc** | Pause menu |

## Tech stack

- [Electron](https://www.electronjs.org/) (`electron-vite`, `electron-builder`)
- [Three.js](https://threejs.org/) for 3D
- Plain DOM for HUD, menus, and docking UI
- Node’s built-in test runner (`node:test`)
- SFX samples: [Kenney Sci-Fi Sounds](https://kenney.nl/assets/sci-fi-sounds) (CC0)

## License / credit

© Laughing In Purgatory 2026
