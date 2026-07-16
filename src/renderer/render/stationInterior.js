import * as THREE from 'three'
import { stationMaterialMaps } from './textures.js'

// Docking-bay backdrop. Settlements use the standard bay; stations pass
// { fancy: true } for richer neon/point-light treatment (same structure).

const BAY_WIDTH = 72
const BAY_HEIGHT = 48
const BAY_LENGTH = 150

const wallMat = () => new THREE.MeshStandardMaterial({
  color: 0x3a4a62,
  metalness: 0.85,
  roughness: 0.72,
  ...stationMaterialMaps('wall', 0.42)
})
const floorMat = () => new THREE.MeshStandardMaterial({
  color: 0x2a3038,
  metalness: 0.88,
  roughness: 0.7,
  ...stationMaterialMaps('floor', 0.45)
})
const beamMat = () => new THREE.MeshStandardMaterial({
  color: 0x4a5a70,
  metalness: 0.9,
  roughness: 0.65,
  ...stationMaterialMaps('beam', 0.4)
})
const accentMat = () => new THREE.MeshStandardMaterial({
  color: 0x4fc3d9,
  metalness: 0.55,
  roughness: 0.5,
  emissive: 0x1a4050,
  emissiveIntensity: 0.35,
  ...stationMaterialMaps('accent', 0.3)
})
const hazardMat = () => new THREE.MeshStandardMaterial({
  color: 0xc45a18,
  metalness: 0.45,
  roughness: 0.55,
  ...stationMaterialMaps('panel', 0.35)
})
const panelMat = () => new THREE.MeshStandardMaterial({
  color: 0x2a3548,
  metalness: 0.82,
  roughness: 0.68,
  ...stationMaterialMaps('panel', 0.4)
})
const glassMat = () => new THREE.MeshStandardMaterial({
  color: 0x1a3048,
  transparent: true,
  opacity: 0.45,
  metalness: 0.2,
  roughness: 0.15,
  emissive: 0x0a2035,
  emissiveIntensity: 0.3
})
const shipHullMat = (hex) => new THREE.MeshStandardMaterial({
  color: hex,
  metalness: 0.75,
  roughness: 0.55,
  ...stationMaterialMaps('hull', 0.32)
})

function makeBox(w, h, d, mat, x, y, z, group) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  group.add(m)
  return m
}

function makeCylinder(rTop, rBot, h, segs, mat, x, y, z, group, rotX = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, segs), mat)
  m.position.set(x, y, z)
  m.rotation.x = rotX
  group.add(m)
  return m
}

// Tiny parked ship silhouette for bay background traffic.
function makeParkedShip(color, scale = 1) {
  const g = new THREE.Group()
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2 * scale, 0.9 * scale, 5.5 * scale), shipHullMat(color))
  g.add(hull)
  const wing = new THREE.Mesh(new THREE.BoxGeometry(5 * scale, 0.15 * scale, 1.8 * scale), shipHullMat(color))
  wing.position.z = -0.5 * scale
  g.add(wing)
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.45 * scale, 8, 6), glassMat())
  canopy.scale.set(1, 0.6, 1.4)
  canopy.position.set(0, 0.55 * scale, 1.2 * scale)
  g.add(canopy)
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(0.35 * scale, 10),
    new THREE.MeshBasicMaterial({ color: 0x7fe6ff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  )
  glow.position.set(0, 0, -2.9 * scale)
  glow.rotation.y = Math.PI
  g.add(glow)
  g.userData.engineGlow = glow
  return g
}

// Service drone / cargo bot.
function makeDrone() {
  const g = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.55, 1.1),
    new THREE.MeshStandardMaterial({
      color: 0x5a6a7a,
      metalness: 0.85,
      roughness: 0.4,
      ...stationMaterialMaps('panel', 0.35)
    })
  )
  g.add(body)
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 1.4), panelMat())
  arm.position.set(0.5, -0.2, 0.3)
  g.add(arm)
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 6, 4),
    new THREE.MeshBasicMaterial({ color: 0xffcf4f })
  )
  light.position.set(0, 0.35, 0.4)
  g.add(light)
  g.userData.navLight = light
  return g
}

// Humanoid silhouette walking on catwalks (cheap capsule + head).
function makeWorker() {
  const g = new THREE.Group()
  const suit = new THREE.MeshStandardMaterial({
    color: 0x3a4a5a,
    metalness: 0.55,
    roughness: 0.55,
    ...stationMaterialMaps('panel', 0.25)
  })
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.7, 4, 8), suit)
  torso.position.y = 0.9
  g.add(torso)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), suit)
  head.position.y = 1.55
  g.add(head)
  // Helmet visor glow.
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.12, 0.08),
    new THREE.MeshBasicMaterial({ color: 0x4fc3d9 })
  )
  visor.position.set(0, 1.55, 0.18)
  g.add(visor)
  return g
}

function makeCargoCrate(mat) {
  return new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 2.2), mat)
}

/**
 * @param {{ fancy?: boolean }} [options]
 * fancy: stations get extra neon, colored washes, and light fixtures.
 * Settlements omit fancy (current baseline bay).
 */
export function buildStationInteriorMesh(options = {}) {
  const fancy = !!options.fancy
  const group = new THREE.Group()
  group.userData.fancy = fancy
  const wall = wallMat()
  const floor = floorMat()
  const beam = beamMat()
  const accent = accentMat()
  const hazard = hazardMat()
  const panel = panelMat()

  const anim = {
    lights: [],
    loaders: [],
    drones: [],
    workers: [],
    parkedShips: [],
    doorField: null,
    chevrons: [],
    holograms: [],
    sparks: [],
    fans: [],
    crane: null,
    pointLights: [],
    neonStrips: [],
    glowPlanes: [],
    fancy,
    elapsed: 0
  }

  // --- Structure -----------------------------------------------------------
  const floorMesh = makeBox(BAY_WIDTH, 2, BAY_LENGTH, floor, 0, -BAY_HEIGHT / 2, 0, group)
  // Floor grid lines.
  for (let x = -BAY_WIDTH / 2 + 6; x < BAY_WIDTH / 2; x += 8) {
    makeBox(0.15, 0.08, BAY_LENGTH - 8, accent, x, -BAY_HEIGHT / 2 + 1.05, 4, group)
  }
  for (let z = -BAY_LENGTH / 2 + 10; z < BAY_LENGTH / 2; z += 12) {
    makeBox(BAY_WIDTH - 8, 0.08, 0.15, panel, 0, -BAY_HEIGHT / 2 + 1.04, z, group)
  }

  const ceiling = makeBox(BAY_WIDTH, 2, BAY_LENGTH, floor, 0, BAY_HEIGHT / 2, 0, group)

  makeBox(2.5, BAY_HEIGHT, BAY_LENGTH, wall, -BAY_WIDTH / 2, 0, 0, group)
  makeBox(2.5, BAY_HEIGHT, BAY_LENGTH, wall, BAY_WIDTH / 2, 0, 0, group)

  // Back wall with observation glass strip.
  makeBox(BAY_WIDTH, BAY_HEIGHT, 2.5, wall, 0, 0, BAY_LENGTH / 2, group)
  const glass = makeBox(BAY_WIDTH * 0.55, 10, 0.4, glassMat(), 0, 8, BAY_LENGTH / 2 - 1.6, group)

  // Side catwalks / mezzanines.
  for (const side of [-1, 1]) {
    makeBox(8, 0.6, BAY_LENGTH - 20, panel, side * (BAY_WIDTH / 2 - 5), 6, 5, group)
    // Railing.
    makeBox(0.2, 1.2, BAY_LENGTH - 20, beam, side * (BAY_WIDTH / 2 - 9), 6.9, 5, group)
    // Support pillars.
    for (let z = -50; z <= 50; z += 25) {
      makeBox(1.2, 14, 1.2, beam, side * (BAY_WIDTH / 2 - 5), -1, z, group)
    }
  }

  // Overhead gantry beams.
  for (let z = -BAY_LENGTH / 2 + 18; z < BAY_LENGTH / 2 - 10; z += 28) {
    makeBox(BAY_WIDTH - 6, 2.2, 2.2, beam, 0, BAY_HEIGHT / 2 - 3, z, group)
    // Hanging light fixtures.
    for (const x of [-18, 0, 18]) {
      const fixture = makeBox(3.5, 0.5, 1.2, panel, x, BAY_HEIGHT / 2 - 5, z, group)
      const bulb = new THREE.Mesh(
        new THREE.BoxGeometry(3, 0.25, 0.8),
        new THREE.MeshBasicMaterial({ color: 0xa8c8ff, transparent: true, opacity: 0.85 })
      )
      bulb.position.set(x, BAY_HEIGHT / 2 - 5.4, z)
      group.add(bulb)
      anim.lights.push({ mesh: bulb, phase: z * 0.05 + x * 0.1, base: 0.55 })
    }
  }

  // Hangar mouth (entry) — open toward -Z where the ship flies in.
  const doorZ = -BAY_LENGTH / 2 + 3
  // Door frame.
  makeBox(BAY_WIDTH, 4, 3, beam, 0, BAY_HEIGHT / 2 - 2, doorZ, group)
  makeBox(4, BAY_HEIGHT, 3, beam, -BAY_WIDTH / 2 + 2, 0, doorZ, group)
  makeBox(4, BAY_HEIGHT, 3, beam, BAY_WIDTH / 2 - 2, 0, doorZ, group)
  // Outer ring.
  const entryRing = new THREE.Mesh(new THREE.TorusGeometry(22, 1.2, 8, 32), accent)
  entryRing.position.set(0, 0, doorZ)
  group.add(entryRing)

  // Energy atmosphere field (shimmering plane in the doorway).
  const doorField = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 36),
    new THREE.MeshBasicMaterial({
      color: 0x4fc3d9,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  )
  doorField.position.set(0, 0, doorZ + 1)
  group.add(doorField)
  anim.doorField = doorField

  // Stars / space visible beyond the door (dark plane with points).
  const spacePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 60),
    new THREE.MeshBasicMaterial({ color: 0x02040a })
  )
  spacePlane.position.set(0, 0, doorZ - 8)
  group.add(spacePlane)

  // Landing pad at park position (player ends near z=+20 local).
  const padY = -BAY_HEIGHT / 2 + 1.15
  makeBox(28, 0.4, 36, panel, 0, padY - 0.1, 18, group)
  // Hazard chevron ring.
  const padMarking = new THREE.Mesh(new THREE.RingGeometry(9, 10.2, 32), accent)
  padMarking.rotation.x = -Math.PI / 2
  padMarking.position.set(0, padY + 0.15, 18)
  group.add(padMarking)
  // Inner pad circle.
  const padInner = new THREE.Mesh(new THREE.RingGeometry(3.5, 4.2, 24), hazard)
  padInner.rotation.x = -Math.PI / 2
  padInner.position.set(0, padY + 0.16, 18)
  group.add(padInner)

  // Animated approach chevrons along the floor toward the pad.
  for (let i = 0; i < 8; i++) {
    const chev = new THREE.Mesh(
      new THREE.BoxGeometry(3.5, 0.12, 1.2),
      new THREE.MeshBasicMaterial({ color: 0x4fc3d9, transparent: true, opacity: 0.35 })
    )
    chev.position.set(0, padY + 0.2, -40 + i * 7)
    // Arrow-ish taper via scale.
    chev.scale.x = 1 - i * 0.04
    group.add(chev)
    anim.chevrons.push({ mesh: chev, index: i })
  }

  // Docking clamps around the pad (mechanical arms).
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    const cx = Math.cos(a) * 14
    const cz = 18 + Math.sin(a) * 14
    const base = makeBox(2, 1.5, 2, beam, cx, padY + 0.8, cz, group)
    const arm = makeBox(1.2, 0.6, 6, hazard, cx * 0.55, padY + 2.2, 18 + (cz - 18) * 0.55, group)
    anim.loaders.push({ kind: 'clamp', mesh: arm, baseY: padY + 2.2, phase: i * 1.2 })
  }

  // --- Cargo area (left) ---------------------------------------------------
  const crateMat = new THREE.MeshStandardMaterial({
    color: 0x3a4a3a, metalness: 0.65, roughness: 0.55, ...stationMaterialMaps('panel', 0.3)
  })
  const crateMat2 = new THREE.MeshStandardMaterial({
    color: 0x4a3a2a, metalness: 0.6, roughness: 0.55, ...stationMaterialMaps('radiator', 0.3)
  })
  for (let i = 0; i < 12; i++) {
    const crate = makeCargoCrate(i % 2 === 0 ? crateMat : crateMat2)
    crate.position.set(
      -BAY_WIDTH / 2 + 8 + (i % 3) * 2.8,
      -BAY_HEIGHT / 2 + 2 + Math.floor(i / 6) * 1.7,
      35 + Math.floor((i % 6) / 3) * 4 + (i % 2) * 2.5
    )
    group.add(crate)
  }

  // Cargo loader cart that runs along the left wall.
  const loader = new THREE.Group()
  makeBox(4, 1.2, 6, beam, 0, 0, 0, loader)
  makeBox(5, 0.4, 0.4, hazard, 0, 1.2, 0, loader)
  // Lift mast.
  makeBox(0.5, 5, 0.5, panel, -1.2, 3, 0, loader)
  const fork = makeBox(2.5, 0.25, 1.5, hazard, 0.5, 1.8, 0, loader)
  loader.position.set(-BAY_WIDTH / 2 + 12, -BAY_HEIGHT / 2 + 2, 10)
  group.add(loader)
  anim.loaders.push({ kind: 'cart', mesh: loader, fork, z0: -20, z1: 45, speed: 0.12, phase: 0 })

  // Overhead crane on a ceiling rail.
  const crane = new THREE.Group()
  makeBox(BAY_WIDTH - 20, 1.2, 2, beam, 0, 0, 0, crane)
  const hoist = makeBox(2.5, 2, 2.5, panel, 0, -1.5, 0, crane)
  const cable = makeBox(0.15, 8, 0.15, panel, 0, -6, 0, crane)
  const hook = makeBox(1.5, 0.8, 1.5, hazard, 0, -10, 0, crane)
  crane.position.set(0, BAY_HEIGHT / 2 - 4, 0)
  group.add(crane)
  anim.crane = { mesh: crane, hoist, cable, hook, z0: -30, z1: 40, x0: -12, x1: 12 }

  // --- Right wall: fuel tanks + conduits -----------------------------------
  for (let i = 0; i < 3; i++) {
    makeCylinder(2.2, 2.2, 10, 12, panel, BAY_WIDTH / 2 - 8, -BAY_HEIGHT / 2 + 6, 30 + i * 12, group)
    makeCylinder(2.4, 2.4, 0.5, 12, hazard, BAY_WIDTH / 2 - 8, -BAY_HEIGHT / 2 + 11, 30 + i * 12, group)
  }
  // Pipe run.
  makeCylinder(0.4, 0.4, 50, 8, beam, BAY_WIDTH / 2 - 6, 4, 20, group, Math.PI / 2)

  // Vent fans on the walls.
  for (const side of [-1, 1]) {
    for (const z of [-20, 20, 50]) {
      const fan = new THREE.Mesh(
        new THREE.CylinderGeometry(2.5, 2.5, 0.4, 12),
        panel
      )
      fan.rotation.z = Math.PI / 2
      fan.position.set(side * (BAY_WIDTH / 2 - 1.5), 10, z)
      group.add(fan)
      // Blades.
      const blades = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 4.2, 0.15),
        beam
      )
      blades.position.copy(fan.position)
      blades.rotation.z = Math.PI / 2
      group.add(blades)
      anim.fans.push(blades)
    }
  }

  // --- Control booth (glass) -----------------------------------------------
  const booth = new THREE.Group()
  makeBox(10, 6, 8, panel, 0, 0, 0, booth)
  const boothGlass = makeBox(9, 3.5, 0.3, glassMat(), 0, 1, -4.1, booth)
  booth.position.set(BAY_WIDTH / 2 - 14, -BAY_HEIGHT / 2 + 8, -25)
  group.add(booth)
  // Holo displays inside booth (glowing panels).
  for (let i = 0; i < 3; i++) {
    const holo = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 1.4),
      new THREE.MeshBasicMaterial({ color: 0x4fc3d9, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    )
    holo.position.set(BAY_WIDTH / 2 - 14 + (i - 1) * 2.5, -BAY_HEIGHT / 2 + 9.5, -28.5)
    group.add(holo)
    anim.holograms.push({ mesh: holo, phase: i * 1.7 })
  }
  // Big wall status board.
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 6),
    new THREE.MeshBasicMaterial({ color: 0x2a8aaa, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  )
  board.position.set(0, 10, BAY_LENGTH / 2 - 2)
  group.add(board)
  anim.holograms.push({ mesh: board, phase: 0.5, isBoard: true })

  // Warning beacons along the bay.
  for (const pos of [
    [-BAY_WIDTH / 2 + 3, 12, doorZ + 5],
    [BAY_WIDTH / 2 - 3, 12, doorZ + 5],
    [-BAY_WIDTH / 2 + 3, 12, 55],
    [BAY_WIDTH / 2 - 3, 12, 55]
  ]) {
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.9 })
    )
    beacon.position.set(...pos)
    group.add(beacon)
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })
    )
    halo.position.set(...pos)
    group.add(halo)
    anim.lights.push({ mesh: beacon, halo, phase: pos[2] * 0.08, base: 0.7, warn: true })
  }

  // --- Background parked ships ---------------------------------------------
  const shipSlots = [
    { x: -22, z: 48, y: -BAY_HEIGHT / 2 + 4, rot: 0.4, color: 0x7a8a9a, scale: 1.3 },
    { x: 24, z: 42, y: -BAY_HEIGHT / 2 + 3.5, rot: -0.5, color: 0x6a7a70, scale: 1.0 },
    { x: -20, z: -15, y: -BAY_HEIGHT / 2 + 3.8, rot: 0.2, color: 0x8a7a60, scale: 1.5 }
  ]
  for (const slot of shipSlots) {
    const ship = makeParkedShip(slot.color, slot.scale)
    ship.position.set(slot.x, slot.y, slot.z)
    ship.rotation.y = slot.rot
    group.add(ship)
    anim.parkedShips.push(ship)
  }

  // --- Flying service drones -----------------------------------------------
  for (let i = 0; i < 4; i++) {
    const drone = makeDrone()
    group.add(drone)
    anim.drones.push({
      mesh: drone,
      radius: 12 + i * 4,
      height: -4 + i * 3,
      speed: 0.35 + i * 0.08,
      phase: i * 1.6,
      zCenter: 10 + i * 8
    })
  }

  // --- Catwalk workers -----------------------------------------------------
  for (let i = 0; i < 5; i++) {
    const worker = makeWorker()
    const side = i % 2 === 0 ? -1 : 1
    group.add(worker)
    anim.workers.push({
      mesh: worker,
      side,
      z0: -40 + i * 8,
      z1: 50 - i * 5,
      speed: 0.08 + (i % 3) * 0.03,
      phase: i * 2.1,
      y: 6.8
    })
  }

  // Welding spark emitters (near a ship and a wall).
  for (const [x, y, z] of [[-20, -BAY_HEIGHT / 2 + 5, -12], [22, -BAY_HEIGHT / 2 + 6, 40]]) {
    const sparkGroup = new THREE.Group()
    sparkGroup.position.set(x, y, z)
    for (let s = 0; s < 8; s++) {
      const spark = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.9 })
      )
      sparkGroup.add(spark)
    }
    group.add(sparkGroup)
    anim.sparks.push({ group: sparkGroup, phase: x * 0.1 })
  }

  // Ambient lights (baseline — settlements keep this look).
  const bayLight = new THREE.PointLight(0x8fb3ff, fancy ? 2.8 : 2.4, 280)
  bayLight.position.set(0, BAY_HEIGHT / 2 - 8, 10)
  group.add(bayLight)
  anim.bayLight = bayLight

  const padLight = new THREE.PointLight(0x4fc3d9, fancy ? 2.0 : 1.6, 80)
  padLight.position.set(0, 8, 18)
  group.add(padLight)
  anim.padLight = padLight

  const doorLight = new THREE.PointLight(0x6a9aaa, fancy ? 1.6 : 1.2, 100)
  doorLight.position.set(0, 5, doorZ + 10)
  group.add(doorLight)

  // Fill so the ship isn't a silhouette.
  const fill = new THREE.AmbientLight(0x406080, fancy ? 0.28 : 0.35)
  group.add(fill)

  if (fancy) {
    // Colored accent washes along the bay flanks.
    const cyanWash = new THREE.PointLight(0x40e0ff, 1.4, 90)
    cyanWash.position.set(-BAY_WIDTH / 2 + 8, 4, 0)
    group.add(cyanWash)
    anim.pointLights.push({ light: cyanWash, base: 1.4, phase: 0.2, speed: 0.9, hueShift: true, hue0: 0.5 })

    const magentaWash = new THREE.PointLight(0xff60c8, 1.1, 85)
    magentaWash.position.set(BAY_WIDTH / 2 - 8, 6, 20)
    group.add(magentaWash)
    anim.pointLights.push({ light: magentaWash, base: 1.1, phase: 1.4, speed: 1.1, hueShift: false })

    const amberSpot = new THREE.PointLight(0xffb347, 1.3, 70)
    amberSpot.position.set(0, BAY_HEIGHT / 2 - 10, -30)
    group.add(amberSpot)
    anim.pointLights.push({ light: amberSpot, base: 1.3, phase: 2.2, speed: 0.7, hueShift: false })

    const rimDoor = new THREE.PointLight(0x7fe6ff, 2.2, 120)
    rimDoor.position.set(0, 2, doorZ + 4)
    group.add(rimDoor)
    anim.pointLights.push({ light: rimDoor, base: 2.2, phase: 0.5, speed: 1.6, hueShift: false })

    // Neon edge strips along floor and catwalks (additive glow quads).
    const neonMat = (hex, opacity = 0.55) =>
      new THREE.MeshBasicMaterial({
        color: hex,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(0.35, BAY_LENGTH - 24),
        neonMat(side < 0 ? 0x4fc3d9 : 0xff6ad1, 0.45)
      )
      strip.rotation.x = -Math.PI / 2
      strip.rotation.z = Math.PI / 2
      strip.position.set(side * (BAY_WIDTH / 2 - 3.2), -BAY_HEIGHT / 2 + 1.15, 5)
      group.add(strip)
      anim.neonStrips.push({ mesh: strip, phase: side * 0.8, base: 0.4, amp: 0.25 })
    }
    // Ceiling light veins.
    for (let x of [-20, 0, 20]) {
      const vein = new THREE.Mesh(
        new THREE.PlaneGeometry(BAY_LENGTH * 0.7, 0.45),
        neonMat(0xa8d8ff, 0.35)
      )
      vein.rotation.x = Math.PI / 2
      vein.position.set(x, BAY_HEIGHT / 2 - 1.3, 0)
      group.add(vein)
      anim.neonStrips.push({ mesh: vein, phase: x * 0.05, base: 0.3, amp: 0.2 })
    }
    // Soft volumetric haze planes near the pad and door.
    for (const [y, z, op] of [
      [2, 18, 0.06],
      [4, doorZ + 16, 0.08]
    ]) {
      const haze = new THREE.Mesh(
        new THREE.PlaneGeometry(48, 28),
        neonMat(0x6fd8f2, op)
      )
      haze.position.set(0, y, z)
      group.add(haze)
      anim.glowPlanes.push({ mesh: haze, phase: z * 0.02, base: op, amp: op * 0.7 })
    }
    // Extra hanging fixtures with stronger bulbs (station only).
    for (let z = -40; z <= 50; z += 22) {
      for (const x of [-12, 12]) {
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.55, 10, 8),
          new THREE.MeshBasicMaterial({
            color: 0xc8e8ff,
            transparent: true,
            opacity: 0.75,
            blending: THREE.AdditiveBlending,
            depthWrite: false
          })
        )
        bulb.position.set(x, BAY_HEIGHT / 2 - 6.5, z)
        group.add(bulb)
        anim.lights.push({ mesh: bulb, phase: z * 0.04 + x, base: 0.65 })
        const pl = new THREE.PointLight(0xb0d0ff, 0.55, 40)
        pl.position.copy(bulb.position)
        group.add(pl)
        anim.pointLights.push({ light: pl, base: 0.55, phase: z * 0.03, speed: 1.3, hueShift: false })
      }
    }
    // Vertical light columns at hangar mouth.
    for (const side of [-1, 1]) {
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.35, BAY_HEIGHT * 0.7, 8),
        neonMat(0x5ee6ff, 0.4)
      )
      col.position.set(side * 18, 0, doorZ + 2)
      group.add(col)
      anim.neonStrips.push({ mesh: col, phase: side, base: 0.35, amp: 0.3 })
    }
  }

  group.userData.anim = anim
  return group
}

/**
 * Advance docking-bay ambient activity. Call every frame while the interior
 * is visible (docked or mid dock/undock animation).
 */
export function updateStationInterior(mesh, dt) {
  const anim = mesh?.userData?.anim
  if (!anim) return
  anim.elapsed = (anim.elapsed ?? 0) + dt
  const t = anim.elapsed

  // Overhead lights breathe; warning beacons blink.
  for (const light of anim.lights) {
    if (light.warn) {
      const on = Math.sin(t * 4 + light.phase) > 0.2
      light.mesh.material.opacity = on ? 0.95 : 0.15
      if (light.halo) light.halo.material.opacity = on ? 0.35 : 0.05
    } else {
      const pulse = light.base + 0.35 * Math.sin(t * 1.5 + light.phase)
      light.mesh.material.opacity = Math.max(0.25, Math.min(1, pulse))
    }
  }

  // Hangar door energy field shimmer.
  if (anim.doorField) {
    anim.doorField.material.opacity = 0.08 + 0.07 * (0.5 + 0.5 * Math.sin(t * 3.2))
    anim.doorField.material.color.setHSL(0.52 + 0.03 * Math.sin(t * 2), 0.7, 0.55)
  }

  // Approach chevrons chase toward the pad.
  for (const chev of anim.chevrons) {
    const wave = (t * 2.2 - chev.index * 0.45) % (Math.PI * 2)
    chev.mesh.material.opacity = 0.15 + 0.55 * Math.max(0, Math.sin(wave))
  }

  // Cargo cart shuttles along the bay; clamps idle-bob.
  for (const loader of anim.loaders) {
    if (loader.kind === 'cart') {
      const u = (Math.sin(t * loader.speed + loader.phase) + 1) / 2
      loader.mesh.position.z = loader.z0 + (loader.z1 - loader.z0) * u
      if (loader.fork) loader.fork.position.y = 1.4 + Math.sin(t * 1.8 + loader.phase) * 0.6
    } else if (loader.kind === 'clamp') {
      loader.mesh.position.y = loader.baseY + Math.sin(t * 0.9 + loader.phase) * 0.25
    }
  }

  // Overhead crane traverses and lowers its hook in a cycle.
  if (anim.crane) {
    const c = anim.crane
    const u = (Math.sin(t * 0.25) + 1) / 2
    const v = (Math.sin(t * 0.18 + 1) + 1) / 2
    c.mesh.position.z = c.z0 + (c.z1 - c.z0) * u
    c.mesh.position.x = c.x0 + (c.x1 - c.x0) * v
    const lower = 6 + 5 * (0.5 + 0.5 * Math.sin(t * 0.7))
    c.cable.scale.y = lower / 8
    c.cable.position.y = -lower / 2 - 1.5
    c.hook.position.y = -lower - 2
  }

  // Service drones orbit / figure-eight through the bay volume.
  for (const d of anim.drones) {
    const a = t * d.speed + d.phase
    d.mesh.position.set(
      Math.cos(a) * d.radius,
      d.height + Math.sin(a * 1.7) * 2.5,
      d.zCenter + Math.sin(a * 0.6) * 18
    )
    d.mesh.rotation.y = a + Math.PI / 2
    if (d.mesh.userData.navLight) {
      d.mesh.userData.navLight.material.opacity = 0.5 + 0.5 * Math.sin(t * 8 + d.phase)
    }
  }

  // Workers pace the catwalks.
  for (const w of anim.workers) {
    const u = (Math.sin(t * w.speed + w.phase) + 1) / 2
    const z = w.z0 + (w.z1 - w.z0) * u
    const prevZ = w.mesh.position.z
    w.mesh.position.set(w.side * (BAY_WIDTH / 2 - 6.5), w.y, z)
    // Face direction of travel.
    if (Math.abs(z - prevZ) > 0.001) {
      w.mesh.rotation.y = z > prevZ ? 0 : Math.PI
    }
    // Walk bob.
    w.mesh.position.y = w.y + Math.abs(Math.sin(t * 6 + w.phase)) * 0.08
  }

  // Parked ship engine glow idles.
  for (const ship of anim.parkedShips) {
    if (ship.userData.engineGlow) {
      ship.userData.engineGlow.material.opacity = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * 2.5 + ship.position.x))
    }
  }

  // Welding sparks spray.
  for (const sp of anim.sparks) {
    const burst = (Math.sin(t * 5 + sp.phase) + 1) / 2
    sp.group.children.forEach((spark, i) => {
      const a = t * 4 + i * 0.9 + sp.phase
      const life = (burst + i * 0.08) % 1
      spark.position.set(
        Math.cos(a) * life * 1.8,
        life * 2.2,
        Math.sin(a * 1.3) * life * 1.8
      )
      spark.material.opacity = Math.max(0, 1 - life) * burst
      spark.scale.setScalar(0.5 + life)
    })
  }

  // Vent fans spin.
  for (const fan of anim.fans) {
    fan.rotation.x += dt * 4
  }

  // Holo panels flicker / scroll brightness.
  for (const h of anim.holograms) {
    const flicker = 0.4 + 0.35 * Math.sin(t * 2.5 + h.phase) + 0.1 * Math.sin(t * 17 + h.phase)
    h.mesh.material.opacity = Math.max(0.15, Math.min(0.75, flicker))
    if (h.isBoard) {
      h.mesh.scale.y = 1 + 0.02 * Math.sin(t * 1.2)
    }
  }

  // Soft bay light pulse.
  if (anim.bayLight) {
    const boost = anim.fancy ? 0.55 : 0.35
    anim.bayLight.intensity = (anim.fancy ? 2.4 : 2.1) + boost * Math.sin(t * 0.8)
  }
  if (anim.padLight) {
    anim.padLight.intensity = (anim.fancy ? 1.7 : 1.3) + (anim.fancy ? 0.7 : 0.5) * Math.sin(t * 1.4)
  }

  // Station-only fancy lighting animation.
  if (anim.fancy) {
    for (const pl of anim.pointLights ?? []) {
      const pulse = pl.base * (0.75 + 0.35 * Math.sin(t * pl.speed + pl.phase))
      pl.light.intensity = Math.max(0.15, pulse)
      if (pl.hueShift) {
        pl.light.color.setHSL(0.48 + 0.06 * Math.sin(t * 0.4 + pl.phase), 0.85, 0.6)
      }
    }
    for (const strip of anim.neonStrips ?? []) {
      const op = strip.base + strip.amp * (0.5 + 0.5 * Math.sin(t * 1.8 + strip.phase))
      strip.mesh.material.opacity = Math.max(0.12, Math.min(0.85, op))
    }
    for (const gp of anim.glowPlanes ?? []) {
      gp.mesh.material.opacity =
        gp.base + gp.amp * (0.5 + 0.5 * Math.sin(t * 1.1 + gp.phase))
      // Slow color drift for atmosphere haze.
      gp.mesh.material.color.setHSL(0.52 + 0.04 * Math.sin(t * 0.35 + gp.phase), 0.65, 0.55)
    }
  }
}
