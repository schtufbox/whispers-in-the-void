# Whispers In The Void

<p align="center">
  <img src="logo.jpg" alt="Whispers In The Void" width="420" />
</p>

<p align="center">
  <strong>A procedurally generated 3D space trading, combat, and exploration game</strong><br/>
  Electron + Three.js · one seeded galaxy · arcade flight · permadeath
</p>

<p align="center">
  <a href="https://github.com/LaughingInPurgatory/whispers-in-the-void/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/LaughingInPurgatory/whispers-in-the-void?style=flat-square" /></a>
</p>

---

A desktop space sim with ~**1500** planets across ~**450** star systems, **100** ship classes, real-time mouse-aim flight and combat, station industry crafting, system security and law standing, and **permadeath**.

New Game starts you in a **Bravia Mk2** near the galactic core (always **Security 6**) with a normal starter loadout.

## Features

- **One seeded galaxy** — systems, planets, moons, stations, settlements, and asteroid fields from a single seed. Systems vary in scale; new games start near the core (never on a binary/trinary).
- **Whispers** — outer-rim landmark system with a unique trinary sun, a named station, and no ambient hostiles.
- **Textured worlds** — CC0 photo textures under procedural surface detail; stars with coronas, flares, and binary/trinary energy rings.
- **100 ship classes** — hand-crafted archetypes plus a generated roster; hull silhouette, hardpoints, roles, and stats per class. **Explorer** hulls get a **+5%** probe-loot bonus. Some hulls carry **drone bays**.
- **Real-time flight and combat** — mouse-aim flight; **LMB** lasers and **RMB** missiles can fire together; boresight weapons; shield/armour/hull; NPC AI. Core systems are busier; the rim is quieter and more alien, with tougher pirates. Pirates may truce with you against aliens.
- **Combat drones** — launch (**G**) / recall (**H**) wingmen from ships with drone bays; they engage only after shots are exchanged.
- **System security & law** — security rating **0–6** per system (core safer, rim often lawless). **Law standing 0–10** (start 10): attacking innocents only costs law in Sec 3–6. Low law draws police, station docking refusals, and eventually shoot-on-sight. Police patrol stations; black/white livery with red/blue flashers.
- **Combat FX** — hit sparks/smoke, missile models and contrails, rock explosions, ship death FX; projectiles pass through station/settlement mesh so geometry does not block fire.
- **Wall-clock campaign time** — `simTime` tracks real time while you play; offline catch-up on load (asteroid respawns, cooldowns). Industry jobs use wall-clock timestamps and continue while you fly elsewhere.
- **Crafting / Industry** — rare blueprints from wrecks and probes (1-shot, not sellable); assemble ships, weapons, and accessories at station/settlement bays from stored ore + bay fee. Drag ore/BPs on Industry; ore bay is a side panel.
- **Every station has a shipyard** — Ships / Armoury / Accessories tabs: buy into **station storage**, sell from storage; loadout and repair (settlements repair only). Role **Bonus** listed under ship stats.
- **Accessories** — optional slots (Autopilot multi-hop jumps, Extra Ore Storage ×5 hold, …).
- **Trading economy** — tag-driven prices; **market stock** (Available) per bay; demand and scarcity raise prices. Buy/sell goods and ore use **station storage** (transfer to ship yourself). Outer rim: low-grade ore stays cheap and thin; rare ore is deeper and ~**20%** cheaper.
- **Docking & storage** — dock into a bay interior; per-station cargo, ore, parts, ships, weapons, accessories, blueprints. Drag-and-drop ship ↔ bay (cargo/parts on Storage; ore/BPs on Industry).
- **Inventory (I)** — cargo, ore, ship parts, **blueprints on board**, remote stored assets, industry jobs.
- **Character (F1)** — pilot portrait, law standing, credits, ship summary; available anytime in-session.
- **Missions** — bounty, exploration, investigation, and probe contracts. **J** tracks active work; orange rings on the galaxy map mark objectives and turn-ins. Mission waypoints advance as you complete steps.
- **Mining** — fire weapons at individual asteroids for ore; finite yield per rock, rarer tiers toward the rim; depleted rocks explode and respawn on the campaign clock.
- **Probing** — scan planets, moons, asteroid fields, and stars for survey data, classification reports, and rare blueprints; probe auto-returns after scan.
- **Wrecks & salvage** — loot trade goods, occasional ship parts, rare blueprints; salvaged weapons equip or sell at the armoury. **F** prefers wreck loot over dock when both are in range.
- **Hyperspace & supercruise** — neighbor-only jumps; supercruise to a waypoint with standoff arrival. System overview under the radar for local bodies (clickable with free mouse).
- **Chase camera** — centered behind the ship; **hold Alt + mouse** free-look, release to snap back.
- **HUD** — status bars, radar, canopy braces, scanlines, tab-target panel; subtle starfield tint from the local sun. Galaxy map shows system security.
- **Music & SFX** — title/ambient/death music; sample thrusters, weapons, dock, and synthesized combat layers. Master sound on/off in **Settings** (saved).
- **Display & settings** — default **borderless fullscreen** on the current display; **windowed** (default 1280×800, size/position remembered). **Settings** on main menu and pause menu: display mode + sound. **Alt+Enter** toggles display. Preferences persist in app `settings.json`.
- **Permadeath** — no respawns; death screen shows killer and law consequence.

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

macOS arm64 only (local test):

```
npm run build && npx electron-builder --mac --arm64 -c.mac.identity=null
```

Artifacts land in `release/` (e.g. `release/mac-arm64/Whispers In The Void.app`). `.blockmap` files are for remote auto-update deltas and can be deleted for local testing.

Prebuilt installers (macOS arm64/x64, Linux AppImage arm64/x64, Windows arm64/x64) are on the [Releases](https://github.com/LaughingInPurgatory/whispers-in-the-void/releases) page.

### Testing

Tests use Node’s built-in runner, colocated as `*.test.js`:

```
node --test src/renderer/game/*.test.js src/renderer/procgen/*.test.js src/renderer/data/*.test.js
node --test src/renderer/game/combat.test.js
```

## Controls

Flight is mouse-aim, toggled with **Space**. While flight mode is on, the pointer is locked for aim; open a menu or press Space again for a normal cursor. After alt-tab, click the canvas or press Space to re-lock. The pause menu **Show Controls** list matches these bindings.

| Input | Action |
| --- | --- |
| **Space** | Enter / exit mouse-aim flight mode |
| **Mouse movement** | Aim (yaw/pitch) while flight mode is on |
| **Alt + mouse** | Free-look camera around the ship (release Alt to restore chase) |
| **Left click** | Fire lasers (can hold with RMB) |
| **Right click** | Fire missiles/rockets (can hold with LMB) |
| **W / S** | Throttle forward / reverse (coasts down when released; reverse capped at 25% of max) |
| **A / D** | Strafe left / right |
| **X / Z** | Strafe up / down |
| **Q / E** | Roll |
| **Tab** | Target under crosshair, or cycle nearby contacts |
| **Shift+Tab** | Clear target lock |
| **Ctrl/Cmd + Tab** | Set waypoint on body under crosshair |
| **C** | Toggle supercruise (requires a waypoint) |
| **M** | Galaxy map / hyperspace |
| **F** | Dock at station/settlement or loot wreck |
| **P** | Launch survey probe (orbit / near target) |
| **G** | Launch drones (requires drone bays) |
| **H** | Recall drones to bay |
| **I** | Inventory |
| **J** | Missions tracker |
| **F1** | Character sheet |
| **Esc** | Pause / resume |
| **F5** | Quick save |
| **Alt+Enter** | Toggle borderless fullscreen / windowed |
| **Free mouse** | Click system overview (left) to set waypoints |

Main menu and pause menu both open **Settings** (display mode + sound on/off). Preferences are saved for the next launch.

## Tech stack

- [Electron](https://www.electronjs.org/) (`electron-vite`, `electron-builder`)
- [Three.js](https://threejs.org/) for 3D
- Plain DOM for HUD, menus, and docking UI (in-game dialogs via `gameDialog.js` — no `window.alert`/`prompt`)
- Node’s built-in test runner (`node:test`)
- SFX samples: [Kenney Sci-Fi Sounds](https://kenney.nl/assets/sci-fi-sounds) (CC0)

## License / credit

© Laughing In Purgatory 2026
