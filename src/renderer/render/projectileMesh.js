import * as THREE from 'three'
import { getWeapon, BASE_WEAPON_ID } from '../data/weapons.js'

// Size scales with the weapon's own damage, and color/shape come straight
// from its catalog entry (data/weapons.js). Lasers stay additive bolts;
// missiles are a proper body + nose + fins + exhaust group.

/**
 * Procedural missile: tube body, nose cone, cruciform fins, nozzle + glow.
 * Length along local +Z (same convention as ship forward / laser bolts).
 */
function buildMissileModel(weapon) {
  const dmg = weapon.damage ?? 30
  // Scale by tier: rocket_pod ~30, seeker ~42, torpedo ~65
  const tier = Math.min(1.35, 0.75 + dmg / 80)
  const bodyLen = (2.4 + dmg * 0.028) * tier
  const bodyR = (0.18 + dmg * 0.004) * tier
  const noseLen = bodyLen * 0.32
  const finSpan = bodyR * 2.8
  const color = new THREE.Color(weapon.color ?? 0xff8a3d)
  const hull = color.clone().lerp(new THREE.Color(0x2a2e34), 0.55)
  const trim = color.clone().lerp(new THREE.Color(0xffffff), 0.15)

  const group = new THREE.Group()
  group.frustumCulled = false

  // --- Main body (cylinder along +Z) ---
  const bodyGeo = new THREE.CylinderGeometry(bodyR * 0.92, bodyR, bodyLen, 10)
  bodyGeo.rotateX(Math.PI / 2)
  bodyGeo.translate(0, 0, bodyLen * 0.5)
  const bodyMat = new THREE.MeshStandardMaterial({
    color: hull,
    metalness: 0.65,
    roughness: 0.35,
    flatShading: false
  })
  group.add(new THREE.Mesh(bodyGeo, bodyMat))

  // Accent band near mid-body (warhead ring)
  const bandGeo = new THREE.CylinderGeometry(bodyR * 1.06, bodyR * 1.06, bodyLen * 0.12, 10)
  bandGeo.rotateX(Math.PI / 2)
  bandGeo.translate(0, 0, bodyLen * 0.55)
  const bandMat = new THREE.MeshStandardMaterial({
    color: trim,
    metalness: 0.5,
    roughness: 0.4,
    emissive: color,
    emissiveIntensity: 0.15
  })
  group.add(new THREE.Mesh(bandGeo, bandMat))

  // --- Nose cone (point toward +Z) ---
  const noseGeo = new THREE.ConeGeometry(bodyR * 0.95, noseLen, 10)
  noseGeo.rotateX(Math.PI / 2)
  noseGeo.translate(0, 0, bodyLen + noseLen * 0.5)
  const noseMat = new THREE.MeshStandardMaterial({
    color: color.clone().lerp(new THREE.Color(0x111111), 0.25),
    metalness: 0.4,
    roughness: 0.45
  })
  group.add(new THREE.Mesh(noseGeo, noseMat))

  // Tip highlight
  const tipGeo = new THREE.SphereGeometry(bodyR * 0.28, 8, 6)
  tipGeo.translate(0, 0, bodyLen + noseLen * 0.92)
  group.add(
    new THREE.Mesh(
      tipGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffcc88,
        transparent: true,
        opacity: 0.85
      })
    )
  )

  // --- Tail nozzle ---
  const nozzleLen = bodyLen * 0.14
  const nozzleGeo = new THREE.CylinderGeometry(bodyR * 0.7, bodyR * 1.05, nozzleLen, 10)
  nozzleGeo.rotateX(Math.PI / 2)
  nozzleGeo.translate(0, 0, -nozzleLen * 0.35)
  group.add(
    new THREE.Mesh(
      nozzleGeo,
      new THREE.MeshStandardMaterial({
        color: 0x1a1a1e,
        metalness: 0.8,
        roughness: 0.3
      })
    )
  )

  // Exhaust glow (rear, -Z)
  const exhaust = new THREE.Mesh(
    new THREE.ConeGeometry(bodyR * 0.85, bodyLen * 0.55, 8),
    new THREE.MeshBasicMaterial({
      color: 0xffaa44,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  )
  exhaust.rotation.x = -Math.PI / 2 // cone tip toward -Z after rot
  exhaust.position.z = -bodyLen * 0.35
  group.add(exhaust)

  const exhaustCore = new THREE.Mesh(
    new THREE.ConeGeometry(bodyR * 0.4, bodyLen * 0.35, 6),
    new THREE.MeshBasicMaterial({
      color: 0xfff0c0,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  )
  exhaustCore.rotation.x = -Math.PI / 2
  exhaustCore.position.z = -bodyLen * 0.22
  group.add(exhaustCore)

  // --- Cruciform fins near the tail ---
  const finMat = new THREE.MeshStandardMaterial({
    color: hull.clone().offsetHSL(0, 0, -0.08),
    metalness: 0.55,
    roughness: 0.4,
    side: THREE.DoubleSide
  })
  const finLen = bodyLen * 0.28
  const finThick = bodyR * 0.18
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(finThick, finSpan, finLen),
      finMat
    )
    // Root of fin at body surface, extending outward.
    fin.position.set(
      Math.cos(ang) * (bodyR + finSpan * 0.35),
      Math.sin(ang) * (bodyR + finSpan * 0.35),
      finLen * 0.35
    )
    fin.rotation.z = ang
    // Slight rearward sweep
    fin.rotation.y = Math.cos(ang) * 0.15
    fin.rotation.x = Math.sin(ang) * 0.15
    group.add(fin)
  }

  // Torpedo: extra thruster ring for bulk.
  if (dmg >= 55) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(bodyR * 1.15, bodyR * 0.12, 6, 14),
      new THREE.MeshStandardMaterial({ color: 0x444850, metalness: 0.7, roughness: 0.35 })
    )
    ring.rotation.y = Math.PI / 2
    ring.position.z = bodyLen * 0.2
    group.add(ring)
  }

  group.userData.isMissile = true
  group.userData.exhaust = exhaust
  group.userData.exhaustCore = exhaustCore
  return group
}

function buildLaserBolt(weapon) {
  const length = 3.8 + weapon.damage * 0.12
  const radius = 0.32 + weapon.damage * 0.014
  const geometry = new THREE.CylinderGeometry(radius * 0.5, radius, length, 6)
  geometry.rotateX(Math.PI / 2)
  const material = new THREE.MeshBasicMaterial({
    color: weapon.color,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
  return new THREE.Mesh(geometry, material)
}

export function buildProjectileMesh(weaponId, mountType = 'laser') {
  const weapon = getWeapon(weaponId ?? BASE_WEAPON_ID[mountType])
  if (weapon.category === 'missile') return buildMissileModel(weapon)
  return buildLaserBolt(weapon)
}

export function buildImpactFlash(color = 0xffcc66) {
  const geometry = new THREE.SphereGeometry(1, 8, 8)
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.scale.setScalar(0.5)
  return mesh
}
