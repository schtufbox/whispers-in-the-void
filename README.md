# Whispers In The Void

A procedurally generated 3D space trading, combat, and exploration game for the desktop, built with Electron and Three.js. One seeded galaxy of ~1500 planets across ~450 star systems, 100 ship classes, real-time arcade flight and combat, and permadeath.

## Features

- **One seeded galaxy** — systems, planets, moons, stations, settlements, and asteroid fields are all procedurally generated from a single seed, so the same seed always reproduces the same galaxy. Systems (and the stars, planets, moons, and stations in them) vary in overall scale from one to the next, and you start out in one of the systems nearest the galactic core.
- **100 ship classes** — 7 hand-crafted archetypes plus 93 more generated across trader/fighter/explorer roles, each with its own hull silhouette, hardpoints, and stats.
- **Real-time flight and combat** — mouse-aim flight, fixed-hardpoint lasers and missiles, shield/armor/hull damage layering, and a patrol/attack/flee NPC AI. Civilian and trader traffic is thickest near the galactic core and thins toward the rim; alien encounters are the opposite — none at the core, more common the further out you go, and pirates fly tougher ships the further from the core you travel. If aliens and pirates end up in the same fight, the pirates call a truce with you to take on the aliens together — and once the aliens are gone, the pirates thank you and hyperspace off.
- **Targeting** — lock onto ships, stations, settlements, or individual asteroids in a field with Tab, then cycle between nearby contacts.
- **Trading economy** — goods priced per-planet from tags (agricultural, industrial, tech, wealthy, etc.), with prices that nudge from your own trading activity.
- **Missions** — bounty, exploration, investigation, and probe missions seeded across the galaxy.
- **Mining** — target an asteroid and toggle mining mode for a continuous mining laser that auto-fires until your hold is full, or just shoot a field manually. Rarer, more valuable ore tiers are found further out toward the galaxy's rim.
- **Probing** — scan planets, moons, and asteroid fields for a chance at valuable survey data.
- **Docking** — a scripted docking/undocking animation flies you into a station/base interior before the trade & mission menus appear.
- **Hyperspace & supercruise** — jump between systems (arriving near the system's edge, facing the star), and autopilot at 3x speed to an in-system waypoint.
- **Dramatic stars** — roiling, fiery star cores with pulsing coronas; binary systems orbit a stationary primary with a fiery energy ring connecting the pair.
- **Permadeath** — no respawns, no checkpoints.

## Getting started

```
npm install
npm run dev
```

This launches the app with hot module reloading. Editing `src/renderer/main.js` while `npm run dev` is running resets the current game back to the main menu — that's expected.

### Building

```
npm run build     # electron-vite build
npm run package   # build + electron-builder --dir (unpacked)
npm run make      # build + electron-builder (installer for the current platform)
```

### Testing

There is no `npm test` script. Tests use Node's built-in test runner directly, colocated as `*.test.js` next to the module they cover:

```
node --test src/renderer/game/*.test.js src/renderer/procgen/*.test.js src/renderer/data/*.test.js   # everything
node --test src/renderer/game/combat.test.js                                                          # single file
```

## Controls

Flight is mouse-aim, toggled on/off with **Space** — while in flight mode the pointer is captured (hidden) and drives your aim; toggle it off (or open any menu) to get the normal pointer back.

| Input | Action |
| --- | --- |
| **Space** | Toggle flight mode |
| **Mouse movement** | Aim (yaw/pitch) — only while flight mode is on |
| **Left click** | Fire lasers |
| **Right click** | Fire missiles/rockets (if your ship has any) |
| **W / S** | Throttle up / down — releasing both holds your current speed; S can reverse-thrust, capped at 25% of your forward top speed |
| **A / D** | Strafe left / right |
| **Q / E** | Roll |
| **Shift** | Boost |
| **Tab** | Target what's under the crosshair, or cycle to the next nearby contact |
| **R** | Toggle mining mode (laser becomes a continuous mining beam on your target) |
| **F** | Dock (when in range of a station, settlement, or a planet/moon with a base) |
| **P** | Launch a probe (planets, moons, asteroid fields) |
| **M** | Navigation map (galaxy map / current system, set a waypoint) |
| **C** | Engage/disengage supercruise toward your waypoint |
| **F5** | Save |
| **Esc** | Pause menu |

## Tech stack

- [Electron](https://www.electronjs.org/) (`electron-vite` for dev/build, `electron-builder` for packaging)
- [Three.js](https://threejs.org/) for all 3D rendering — no game engine
- Plain DOM overlays for the HUD, menus, and trading UI — no UI framework
- Node's built-in test runner (`node:test`) for tests — no test framework

See [CLAUDE.md](CLAUDE.md) for architecture details.
