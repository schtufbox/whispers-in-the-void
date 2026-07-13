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

// The anamorphic streak — the wide horizontal blue-white line a bright light
// smears across real (especially cinema) lenses. A thin vertical gradient
// crossed with a horizontal falloff, drawn once.
function createStreakTexture() {
  const w = 256
  const h = 64
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const horizontal = ctx.createLinearGradient(0, 0, w, 0)
  horizontal.addColorStop(0, 'rgba(255,255,255,0)')
  horizontal.addColorStop(0.5, 'rgba(255,255,255,1)')
  horizontal.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = horizontal
  ctx.fillRect(0, 0, w, h)
  // Multiply in a vertical falloff so the streak is a thin bright line, not a bar.
  const vertical = ctx.createLinearGradient(0, 0, 0, h)
  vertical.addColorStop(0, 'rgba(0,0,0,1)')
  vertical.addColorStop(0.5, 'rgba(0,0,0,0)')
  vertical.addColorStop(1, 'rgba(0,0,0,1)')
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = vertical
  ctx.fillRect(0, 0, w, h)
  return new THREE.CanvasTexture(canvas)
}

// A soft-edged hexagon — the shape of a real lens's aperture blades, which
// is what internal-reflection ghosts actually look like (round ghosts only
// come from lenses wide open).
function createHexTexture() {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const r = size * 0.42
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6
    const x = size / 2 + Math.cos(a) * r
    const y = size / 2 + Math.sin(a) * r
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.closePath()
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, r)
  g.addColorStop(0, 'rgba(255,255,255,0.35)')
  g.addColorStop(0.75, 'rgba(255,255,255,0.5)')
  g.addColorStop(0.98, 'rgba(255,255,255,0.9)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fill()
  return new THREE.CanvasTexture(canvas)
}

// Built once and shared across every flare instance (menu star, every
// in-system sun, both members of a binary) rather than re-baked per star.
let textures = null
function getTextures() {
  textures ??= {
    glow: createGlowTexture(),
    ring: createRingTexture(),
    dot: createDotTexture(),
    streak: createStreakTexture(),
    hex: createHexTexture()
  }
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
//
// Element layout mimics a real lens: source glow + anamorphic streak at the
// light itself, then a chain of aperture-blade-shaped hexagonal ghosts
// marching along the light-to-screen-center axis with the chromatic tints
// (teal/green/purple/orange fringing) internal reflections pick up from
// coatings, growing bigger and fainter with distance, plus one big faint
// halo ring past center.
export function buildLensFlare(color) {
  const { glow, ring, dot, streak, hex } = getTextures()
  // Tint scaled down — LensflareElement multiplies texture by color, so this
  // is the main brightness knob (sizes alone still wash out with additive blend).
  const tint = new THREE.Color(color).multiplyScalar(0.55)
  const flare = new Lensflare()
  // At the light source itself.
  flare.addElement(new LensflareElement(glow, 420, 0, tint))
  flare.addElement(new LensflareElement(streak, 520, 0, new THREE.Color(0.35, 0.45, 0.65)))
  // Ghost chain along the lens axis — smaller and dimmer than the source.
  flare.addElement(new LensflareElement(hex, 48, 0.3, new THREE.Color(0.25, 0.55, 0.5)))
  flare.addElement(new LensflareElement(dot, 24, 0.45, new THREE.Color(0.3, 0.55, 0.35)))
  flare.addElement(new LensflareElement(hex, 85, 0.6, new THREE.Color(0.35, 0.3, 0.55)))
  flare.addElement(new LensflareElement(hex, 34, 0.75, tint))
  flare.addElement(new LensflareElement(ring, 160, 0.95, new THREE.Color(0.5, 0.32, 0.2)))
  flare.addElement(new LensflareElement(hex, 110, 1.15, new THREE.Color(0.28, 0.38, 0.6)))
  return flare
}
