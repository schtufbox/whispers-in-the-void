import * as THREE from 'three'
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js'

// Cheap canvas-generated radial-gradient sprites — same technique as
// render/nebula.js's glow clusters and render/thrusterParticles.js's puffs —
// so the flare's glow/ghost elements need no external image assets.
function createRadialTexture(stops) {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [offset, color] of stops) gradient.addColorStop(offset, color)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

function createGlowTexture() {
  return createRadialTexture([
    [0, 'rgba(255,255,255,1)'],
    [0.2, 'rgba(255,255,255,0.9)'],
    [0.5, 'rgba(255,255,255,0.25)'],
    [1, 'rgba(255,255,255,0)']
  ])
}

// A hollow ring — the classic "ghost" shape lens flares scatter along the
// light-to-screen-center axis.
function createRingTexture() {
  return createRadialTexture([
    [0, 'rgba(255,255,255,0)'],
    [0.55, 'rgba(255,255,255,0)'],
    [0.62, 'rgba(255,255,255,0.9)'],
    [0.72, 'rgba(255,255,255,0)'],
    [1, 'rgba(255,255,255,0)']
  ])
}

function createDotTexture() {
  return createRadialTexture([
    [0, 'rgba(255,255,255,1)'],
    [0.6, 'rgba(255,255,255,0.5)'],
    [1, 'rgba(255,255,255,0)']
  ])
}

// Built once and shared across every flare instance (menu star, every
// in-system sun, both members of a binary) rather than re-baked per star.
let textures = null
function getTextures() {
  textures ??= { glow: createGlowTexture(), ring: createRingTexture(), dot: createDotTexture() }
  return textures
}

// Builds a three.js Lensflare — its stock addon object, not custom code:
// it projects its anchor point to screen space every frame and samples the
// framebuffer around it to fade itself out automatically when off-screen or
// blocked by nearer geometry (a planet, the ship, etc.), which is exactly
// "looking directly at the sun" without any bespoke visibility logic here.
// Attach as a child of the star's own THREE.Group (see starMesh.js) rather
// than the scene root, so it tracks that star's position for free —
// including a binary's orbiting component, which moves every frame.
export function buildLensFlare(color) {
  const { glow, ring, dot } = getTextures()
  const tint = new THREE.Color(color)
  const white = new THREE.Color(0xffffff)
  const flare = new Lensflare()
  flare.addElement(new LensflareElement(glow, 700, 0, tint))
  flare.addElement(new LensflareElement(dot, 60, 0.25, tint))
  flare.addElement(new LensflareElement(ring, 140, 0.45, white))
  flare.addElement(new LensflareElement(dot, 40, 0.65, tint))
  flare.addElement(new LensflareElement(ring, 90, 0.85, tint))
  flare.addElement(new LensflareElement(dot, 30, 1, white))
  return flare
}
