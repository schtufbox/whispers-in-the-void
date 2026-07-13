# Whispers In The Void

A procedurally generated 3D space trading, combat, and exploration game for the desktop, built with Electron and Three.js. One seeded galaxy of ~1500 planets across ~450 star systems, 100 ship classes, real-time arcade flight and combat, and permadeath.

## Features

- **One seeded galaxy** — systems, planets, moons, stations, settlements, and asteroid fields are all procedurally generated from a single seed, so the same seed always reproduces the same galaxy. Systems (and the stars, planets, moons, and stations in them) vary in overall scale from one to the next, and you start out in one of the systems nearest the galactic core.
- **Textured worlds** — real CC0 photo textures (rock, ice, moss, and lava surfaces) layered under each planet, moon, asteroid, and sun's procedural per-body color/craters, so every archetype has real surface detail instead of flat shading.
- **A living title screen** — a glowing, glitching title over a flyby of a binary star pair, with a plain-text glowing menu (New Game / Load Game / Quit) instead of boxed buttons.
- **100 ship classes** — 7 hand-crafted archetypes plus 93 more generated across trader/fighter/explorer roles, each with its own hull silhouette, hardpoints, and stats.
- **Real-time flight and combat** — mouse-aim flight, fixed-hardpoint lasers and missiles, shield/armor/hull damage layering, and a patrol/attack/flee NPC AI. Civilian and trader traffic is thickest near the galactic core and thins toward the rim; alien encounters are the opposite — none at the core, more common the further out you go, and pirates fly tougher ships the further from the core you travel. If aliens and pirates end up in the same fight, the pirates call a truce with you to take on the aliens together — and once the aliens are gone, the pirates thank you and hyperspace off.
- **A weapons armory** — buy and sell a range of lasers and missile launchers at a station's Shipyard, priced by power, each with its own look and sound; equip one to a hardpoint and whatever was mounted there goes back into that station's storage for later use or resale.
- **Targeting** — lock onto ships, stations, settlements, or individual asteroids in a field with Tab, then cycle between nearby contacts.
- **Trading economy** — goods priced per-planet from tags (agricultural, industrial, tech, wealthy, etc.), with prices that nudge from your own trading activity.
- **Missions** — bounty, exploration, investigation, and probe missions seeded across the galaxy.
- **Mining** — target an asteroid (named after the ore it holds, e.g. "Raw Ore Deposit") and toggle mining mode for a continuous mining laser that auto-fires until your hold is full, or just shoot one manually. Each rock holds a finite 10-200 units of ore; empty it and it explodes and disappears, respawning roughly 12-24 hours later. Rarer, more valuable ore tiers are found further out toward the galaxy's rim.
- **Probing** — scan planets, moons, and asteroid fields for a chance at valuable survey data.
- **Docking & repair** — a scripted docking/undocking animation flies you into a station/base interior before the trade & mission menus appear; stations and settlements both offer ship repair (a settlement's costs a little more) sized to how damaged and how large your ship is, from the Shipyard tab. Docking also tops your shields back up for free.
- **Per-station storage** — buy a new ship and it's placed into storage at that station rather than replacing your current one; activate it later to swap, or sell it from storage, and rename any ship you own once you've bought it. The Shipyard shows full stats for whichever ship you're browsing (your own by default). Cargo, mined ore, and ship parts can be left behind and picked up again too — but only at the same station, never elsewhere. The Inventory screen (**I**) shows what you're carrying plus a summary of everything stashed anywhere in the galaxy.
- **Wrecks & salvage** — destroying a ship leaves a lootable wreck behind (small amounts of trade goods, occasionally a rare ship part), targetable and salvageable with **F**; left alone, it eventually despawns. Ship parts can also be bought at a small fraction of stations/settlements, and repair 10% of your hull/armor damage on the spot, no docking required.
- **Hyperspace & supercruise** — jump between neighboring systems only (arriving near the system's edge, facing the star) — crossing the galaxy means hopping system to system, not jumping anywhere on the map — and autopilot at a brisk multiple of normal cruising speed to an in-system waypoint. Voice callouts announce hyperdrive/supercruise engaging and disengaging, where supported.
- **Dramatic stars** — roiling, fiery star cores with pulsing coronas and a camera lens flare that catches the light when a sun is in view; binary systems orbit a stationary primary with a fiery energy ring connecting the pair.
- **Music & sound** — a title theme, a rotating ambient soundtrack during gameplay, and dedicated music for the game-over screen; distinct thruster sounds for accelerating vs. braking, a bassy punch on entering/exiting supercruise, a continuous mining-laser hum, a mechanical clunk-and-hiss for docking/undocking, and beefed-up synthesized weapon and explosion sound effects.
- **Thruster & damage particles** — a warm exhaust trail from the rear while accelerating, a smaller cool retro-thruster glow at the nose while braking, and a dramatic cyan streak trail during supercruise; smoke and flame increasingly pour from the hull the more damaged your armor and hull get, clearing the moment you're repaired.
- **A peaceful home system** — your starting system stays free of hostile encounters unless you pick a fight with a non-hostile ship there yourself.
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
| **F** | Dock (when in range of a station, settlement, or a planet/moon with a base), or salvage a nearby wreck |
| **P** | Launch a probe (planets, moons, asteroid fields) |
| **I** | Inventory — cargo, mining hold, ship parts, and remote assets stored elsewhere |
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
