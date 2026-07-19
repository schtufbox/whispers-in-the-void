/**
 * World meshes for fully-scanned Spatial Anomaly sites.
 * Datacore: central relic + glowing nodules (hack with P).
 * Alien base: solid structure once waves clear.
 */
import * as THREE from 'three'

const RELIC_MAT = new THREE.MeshStandardMaterial({
  color: 0x6a3aaa,
  emissive: 0x4a2080,
  emissiveIntensity: 0.65,
  metalness: 0.4,
  roughness: 0.45
})
const RELIC_GLOW = new THREE.MeshBasicMaterial({
  color: 0xc080ff,
  transparent: true,
  opacity: 0.28,
  depthWrite: false
})
const NODULE_SEALED = new THREE.MeshStandardMaterial({
  color: 0x40e0ff,
  emissive: 0x2080c0,
  emissiveIntensity: 0.9,
  metalness: 0.35,
  roughness: 0.3
})
const NODULE_OPEN = new THREE.MeshStandardMaterial({
  color: 0x60ff90,
  emissive: 0x208040,
  emissiveIntensity: 0.55,
  metalness: 0.3,
  roughness: 0.4
})
const NODULE_DEAD = new THREE.MeshStandardMaterial({
  color: 0x444450,
  emissive: 0x110808,
  emissiveIntensity: 0.15,
  metalness: 0.5,
  roughness: 0.7
})
const BASE_MAT = new THREE.MeshStandardMaterial({
  color: 0x8a3020,
  emissive: 0x501008,
  emissiveIntensity: 0.55,
  metalness: 0.55,
  roughness: 0.4
})

/**
 * @param {object} anomaly fully-scanned datacore site
 * @returns {THREE.Group}
 */
export function buildDatacoreSiteMesh(anomaly) {
  const group = new THREE.Group()
  group.userData.kind = 'datacore'
  group.userData.anomalyId = anomaly.id
  group.userData.noduleMeshes = new Map()

  const origin = anomaly.position
  group.position.set(origin[0], origin[1], origin[2])

  // Central relic beacon — large enough to spot from several km
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(55, 1), RELIC_MAT)
  group.add(core)
  const coreShell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(78, 1),
    new THREE.MeshBasicMaterial({
      color: 0xb060ff,
      wireframe: true,
      transparent: true,
      opacity: 0.55
    })
  )
  group.add(coreShell)
  const halo = new THREE.Mesh(new THREE.SphereGeometry(110, 20, 14), RELIC_GLOW)
  group.add(halo)
  // Vertical beacon
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 14, 420, 8),
    new THREE.MeshBasicMaterial({
      color: 0xd0a0ff,
      transparent: true,
      opacity: 0.45,
      depthWrite: false
    })
  )
  beam.position.y = 180
  group.add(beam)
  // Ground ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(90, 120, 40),
    new THREE.MeshBasicMaterial({
      color: 0xc080ff,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = -40
  group.add(ring)

  group.userData.core = core
  group.userData.coreShell = coreShell
  group.userData.halo = halo

  for (const n of anomaly.nodules ?? []) {
    const nGroup = buildNoduleMesh(n)
    // Positions are world-space; convert to local relative to site origin.
    nGroup.position.set(
      n.position[0] - origin[0],
      n.position[1] - origin[1],
      n.position[2] - origin[2]
    )
    group.add(nGroup)
    group.userData.noduleMeshes.set(n.id, nGroup)
  }

  return group
}

function buildNoduleMesh(nodule) {
  const g = new THREE.Group()
  g.userData.noduleId = nodule.id
  const body = new THREE.Mesh(new THREE.DodecahedronGeometry(22, 0), NODULE_SEALED.clone())
  g.add(body)
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(32, 14, 10),
    new THREE.MeshBasicMaterial({
      color: 0x60f0ff,
      transparent: true,
      opacity: 0.35,
      depthWrite: false
    })
  )
  g.add(shell)
  const pin = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3, 90, 6),
    new THREE.MeshBasicMaterial({
      color: 0x80ffff,
      transparent: true,
      opacity: 0.55,
      depthWrite: false
    })
  )
  pin.position.y = 40
  g.add(pin)
  g.userData.body = body
  g.userData.shell = shell
  g.userData.pin = pin
  applyNoduleStatus(g, nodule.status ?? 'sealed')
  return g
}

function applyNoduleStatus(mesh, status) {
  const body = mesh.userData.body
  if (!body?.material) return
  if (status === 'open') {
    body.material.color.setHex(0x60ff90)
    body.material.emissive?.setHex?.(0x208040)
    if (mesh.userData.shell?.material) {
      mesh.userData.shell.material.color.setHex(0x80ffb0)
      mesh.userData.shell.material.opacity = 0.22
    }
    if (mesh.userData.pin?.material) mesh.userData.pin.material.color.setHex(0x80ffb0)
  } else if (status === 'destroyed') {
    body.material.color.setHex(0x444450)
    body.material.emissive?.setHex?.(0x110808)
    if (mesh.userData.shell?.material) {
      mesh.userData.shell.material.opacity = 0.08
      mesh.userData.shell.material.color.setHex(0x666666)
    }
    if (mesh.userData.pin?.material) {
      mesh.userData.pin.material.opacity = 0.15
      mesh.userData.pin.material.color.setHex(0x666666)
    }
  } else {
    body.material.color.setHex(0x40e0ff)
    body.material.emissive?.setHex?.(0x2080c0)
    if (mesh.userData.shell?.material) {
      mesh.userData.shell.material.color.setHex(0x60f0ff)
      mesh.userData.shell.material.opacity = 0.35
    }
    if (mesh.userData.pin?.material) {
      mesh.userData.pin.material.opacity = 0.55
      mesh.userData.pin.material.color.setHex(0x80ffff)
    }
  }
  mesh.userData.status = status
}

/**
 * @param {THREE.Group} group
 * @param {object} anomaly
 * @param {number} simTime
 * @param {number} dt
 */
export function updateDatacoreSiteMesh(group, anomaly, simTime, dt) {
  if (!group || group.userData.kind !== 'datacore') return
  const t = simTime ?? 0
  if (group.userData.core) {
    group.userData.core.rotation.y += dt * 0.35
    group.userData.core.rotation.x = Math.sin(t * 0.7) * 0.15
  }
  if (group.userData.coreShell) {
    group.userData.coreShell.rotation.y -= dt * 0.2
  }
  if (group.userData.halo) {
    const s = 1 + 0.08 * Math.sin(t * 2.2)
    group.userData.halo.scale.setScalar(s)
  }
  for (const n of anomaly.nodules ?? []) {
    const nm = group.userData.noduleMeshes?.get(n.id)
    if (!nm) continue
    if (nm.userData.status !== n.status) applyNoduleStatus(nm, n.status)
    if (n.status === 'sealed') {
      nm.rotation.y += dt * 0.9
      const pulse = 1 + 0.12 * Math.sin(t * 3 + (nm.userData.phase ?? 0))
      if (nm.userData.shell) nm.userData.shell.scale.setScalar(pulse)
    }
  }
}

/**
 * Alien base structure (shown when waves cleared / base exposed).
 * @param {number[]} position world pos
 */
export function buildAlienBaseMesh(position) {
  const group = new THREE.Group()
  group.userData.kind = 'alien_base'
  group.position.set(position[0], position[1], position[2])

  const hull = new THREE.Mesh(new THREE.IcosahedronGeometry(90, 1), BASE_MAT)
  group.add(hull)
  const spikes = new THREE.Mesh(
    new THREE.OctahedronGeometry(120, 0),
    new THREE.MeshBasicMaterial({
      color: 0xff6040,
      wireframe: true,
      transparent: true,
      opacity: 0.7
    })
  )
  group.add(spikes)
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(140, 16, 12),
    new THREE.MeshBasicMaterial({
      color: 0xff4020,
      transparent: true,
      opacity: 0.22,
      depthWrite: false
    })
  )
  group.add(glow)
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(8, 18, 500, 8),
    new THREE.MeshBasicMaterial({
      color: 0xff7040,
      transparent: true,
      opacity: 0.4,
      depthWrite: false
    })
  )
  beam.position.y = 200
  group.add(beam)

  group.userData.hull = hull
  group.userData.spikes = spikes
  return group
}

export function updateAlienBaseMesh(group, simTime, dt) {
  if (!group || group.userData.kind !== 'alien_base') return
  if (group.userData.hull) group.userData.hull.rotation.y += dt * 0.15
  if (group.userData.spikes) {
    group.userData.spikes.rotation.y -= dt * 0.35
    group.userData.spikes.rotation.z = Math.sin((simTime ?? 0) * 1.5) * 0.1
  }
}

export function disposeAnomalySiteMesh(group) {
  if (!group) return
  group.traverse((c) => {
    c.geometry?.dispose?.()
    if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose?.())
    else if (c.material && c.material !== RELIC_MAT && c.material !== RELIC_GLOW && c.material !== BASE_MAT && c.material !== NODULE_SEALED && c.material !== NODULE_OPEN && c.material !== NODULE_DEAD) {
      c.material.dispose?.()
    }
  })
}
