import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Cross-section loft between two elliptical stations, with optional lateral
// offsets so the centerline can snake (asymmetry / "bolted-on module" look).
function ringBetween(w0, h0, z0, ox0, oy0, w1, h1, z1, ox1, oy1, sides) {
  const positions = []
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2
    const a1 = ((i + 1) / sides) * Math.PI * 2
    const p00 = [Math.cos(a0) * w0 + ox0, Math.sin(a0) * h0 + oy0, z0]
    const p01 = [Math.cos(a1) * w0 + ox0, Math.sin(a1) * h0 + oy0, z0]
    const p10 = [Math.cos(a0) * w1 + ox1, Math.sin(a0) * h1 + oy1, z1]
    const p11 = [Math.cos(a1) * w1 + ox1, Math.sin(a1) * h1 + oy1, z1]
    positions.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01)
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return geom
}

function cap(w, h, z, ox, oy, sides, flip) {
  const positions = []
  const center = [ox, oy, z]
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2
    const a1 = ((i + 1) / sides) * Math.PI * 2
    const p0 = [Math.cos(a0) * w + ox, Math.sin(a0) * h + oy, z]
    const p1 = [Math.cos(a1) * w + ox, Math.sin(a1) * h + oy, z]
    positions.push(...center, ...(flip ? p1 : p0), ...(flip ? p0 : p1))
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return geom
}

// Thick slab wings (not paper-thin triangles). side: 'both' | 'left' | 'right'.
// Optional tipOffsetY for anhedral/dihedral and asymmetric tip height.
function wingGeometries(spec, stations, i) {
  const { span, sweep, thickness, side = 'both', tipOffsetY = 0, chordScale = 1 } = spec
  const rootW = stations.widths[i]
  const rootOx = stations.offsetsX[i] ?? 0
  const zc = stations.z[i]
  const chordRoot = stations.heights[i] * 1.6 * chordScale
  const chordTip = chordRoot * 0.38
  const halfT = Math.max(0.06, thickness * 0.5)
  const yRoot = stations.offsetsY[i] ?? 0

  const sides = []
  if (side === 'both' || side === 'right') sides.push(1)
  if (side === 'both' || side === 'left') sides.push(-1)

  const geoms = []
  for (const sign of sides) {
    const rootX = sign * rootW + rootOx
    const tipX = sign * (rootW + span) + rootOx
    // Four corners top, four bottom → two quads as triangles each face.
    const corners = {
      r1: [rootX, yRoot + halfT, zc - chordRoot / 2],
      r2: [rootX, yRoot + halfT, zc + chordRoot / 2],
      t1: [tipX, yRoot + halfT + tipOffsetY, zc + sweep - chordTip / 2],
      t2: [tipX, yRoot + halfT + tipOffsetY, zc + sweep + chordTip / 2],
      r1b: [rootX, yRoot - halfT, zc - chordRoot / 2],
      r2b: [rootX, yRoot - halfT, zc + chordRoot / 2],
      t1b: [tipX, yRoot - halfT + tipOffsetY, zc + sweep - chordTip / 2],
      t2b: [tipX, yRoot - halfT + tipOffsetY, zc + sweep + chordTip / 2]
    }
    const tri = (...keys) => {
      const positions = []
      for (const k of keys) positions.push(...corners[k])
      const geom = new THREE.BufferGeometry()
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      return geom
    }
    // Top, bottom, leading, trailing, tip, root
    geoms.push(
      tri('r1', 't1', 't2', 'r1', 't2', 'r2'),
      tri('r1b', 'r2b', 't2b', 'r1b', 't2b', 't1b'),
      tri('r1', 'r1b', 't1b', 'r1', 't1b', 't1'),
      tri('r2', 't2', 't2b', 'r2', 't2b', 'r2b'),
      tri('t1', 't1b', 't2b', 't1', 't2b', 't2'),
      tri('r1', 'r2', 'r2b', 'r1', 'r2b', 'r1b')
    )
  }
  return geoms
}

export function buildHullGeometry(hull) {
  const {
    length,
    stationWidths,
    stationHeights,
    crossSectionSides: sides,
    wings = [],
    stationOffsetsX = null,
    stationOffsetsY = null
  } = hull
  const n = stationWidths.length
  const z = stationWidths.map((_, i) => -length / 2 + (length * i) / (n - 1))
  const ox = stationOffsetsX ?? stationWidths.map(() => 0)
  const oy = stationOffsetsY ?? stationWidths.map(() => 0)
  const parts = []
  for (let i = 0; i < n - 1; i++) {
    parts.push(ringBetween(
      stationWidths[i], stationHeights[i], z[i], ox[i], oy[i],
      stationWidths[i + 1], stationHeights[i + 1], z[i + 1], ox[i + 1], oy[i + 1],
      sides
    ))
  }
  parts.push(cap(stationWidths[0], stationHeights[0], z[0], ox[0], oy[0], sides, true))
  parts.push(cap(stationWidths[n - 1], stationHeights[n - 1], z[n - 1], ox[n - 1], oy[n - 1], sides, false))
  for (const w of wings) {
    parts.push(...wingGeometries(w, {
      widths: stationWidths,
      heights: stationHeights,
      z,
      offsetsX: ox,
      offsetsY: oy
    }, w.atStation))
  }
  const merged = mergeGeometries(parts, false)
  merged.computeVertexNormals()
  // Cylindrical UVs for tiling hull metal maps (ships use +Z as length axis).
  addCylindricalUVs(merged, length)
  return merged
}

/** u = angle around the hull, v = length along local +Z (nose→tail). */
function addCylindricalUVs(geometry, length) {
  const pos = geometry.getAttribute('position')
  if (!pos) return
  const uvs = new Float32Array(pos.count * 2)
  const invLen = length > 1e-6 ? 1 / length : 1
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    // Angle around longitudinal axis; wings get usable UVs from the same map.
    const u = (Math.atan2(y, x) / (Math.PI * 2) + 1) % 1
    const v = (z * invLen + 0.5)
    uvs[i * 2] = u * 2.2 // slight tile around circumference
    uvs[i * 2 + 1] = v * 1.6
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
}
