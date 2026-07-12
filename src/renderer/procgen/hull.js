import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

function ringBetween(w0, h0, z0, w1, h1, z1, sides) {
  const positions = []
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2
    const a1 = ((i + 1) / sides) * Math.PI * 2
    const p00 = [Math.cos(a0) * w0, Math.sin(a0) * h0, z0]
    const p01 = [Math.cos(a1) * w0, Math.sin(a1) * h0, z0]
    const p10 = [Math.cos(a0) * w1, Math.sin(a0) * h1, z1]
    const p11 = [Math.cos(a1) * w1, Math.sin(a1) * h1, z1]
    positions.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01)
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return geom
}

function cap(w, h, z, sides, flip) {
  const positions = []
  const center = [0, 0, z]
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2
    const a1 = ((i + 1) / sides) * Math.PI * 2
    const p0 = [Math.cos(a0) * w, Math.sin(a0) * h, z]
    const p1 = [Math.cos(a1) * w, Math.sin(a1) * h, z]
    positions.push(...center, ...(flip ? p1 : p0), ...(flip ? p0 : p1))
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return geom
}

function wingGeometries(spec, stations, i) {
  const { span, sweep, thickness } = spec
  const rootW = stations.widths[i]
  const zc = stations.z[i]
  const chordRoot = stations.heights[i] * 1.6
  const chordTip = chordRoot * 0.35
  const y = -thickness
  const side = (sign) => {
    const root1 = [sign * rootW, y, zc - chordRoot / 2]
    const root2 = [sign * rootW, y, zc + chordRoot / 2]
    const tip1 = [sign * (rootW + span), y, zc + sweep - chordTip / 2]
    const tip2 = [sign * (rootW + span), y, zc + sweep + chordTip / 2]
    const positions = [...root1, ...tip1, ...tip2, ...root1, ...tip2, ...root2]
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return geom
  }
  return [side(1), side(-1)]
}

export function buildHullGeometry(hull) {
  const { length, stationWidths, stationHeights, crossSectionSides: sides, wings = [] } = hull
  const n = stationWidths.length
  const z = stationWidths.map((_, i) => -length / 2 + (length * i) / (n - 1))
  const parts = []
  for (let i = 0; i < n - 1; i++) {
    parts.push(ringBetween(stationWidths[i], stationHeights[i], z[i], stationWidths[i + 1], stationHeights[i + 1], z[i + 1], sides))
  }
  parts.push(cap(stationWidths[0], stationHeights[0], z[0], sides, true))
  parts.push(cap(stationWidths[n - 1], stationHeights[n - 1], z[n - 1], sides, false))
  for (const w of wings) {
    parts.push(...wingGeometries(w, { widths: stationWidths, heights: stationHeights, z }, w.atStation))
  }
  const merged = mergeGeometries(parts, false)
  merged.computeVertexNormals()
  return merged
}
