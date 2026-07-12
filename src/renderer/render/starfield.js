import * as THREE from 'three'

function scatterPositions(count, radius) {
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const r = radius * (0.3 + Math.random() * 0.7)
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)
  }
  return positions
}

// A rough stellar-temperature palette (cool blue/white through warm
// yellow/orange) instead of uniform white, so the field reads as varied
// pinpricks of real stars rather than a flat wall of identical dots.
const STAR_TINTS = [0xffffff, 0xd8e6ff, 0xbcd8ff, 0xfff4e0, 0xffe0b0]

function buildLayer(count, radius, size) {
  const colors = new Float32Array(count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < count; i++) {
    c.set(STAR_TINTS[(Math.random() * STAR_TINTS.length) | 0])
    const brightness = 0.5 + Math.random() * 0.5
    colors[i * 3] = c.r * brightness
    colors[i * 3 + 1] = c.g * brightness
    colors[i * 3 + 2] = c.b * brightness
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(scatterPositions(count, radius), 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const material = new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true })
  return new THREE.Points(geometry, material)
}

// Two size tiers — many small dim pinpricks plus a sparser layer of bigger,
// brighter stars — reads as a naturally varied field instead of one uniform
// point cloud.
export function createStarfield(count = 4000, radius = 4000) {
  const group = new THREE.Group()
  group.add(buildLayer(Math.round(count * 0.85), radius, 1.6))
  group.add(buildLayer(Math.round(count * 0.15), radius, 3))
  return group
}
