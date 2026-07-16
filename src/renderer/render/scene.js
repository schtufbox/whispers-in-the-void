import * as THREE from 'three'

export function createScene(container) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x05070d)

  // Far plane must clear a full system diameter (local scatter up to ~300k+
  // after the large sun/planet system scale-up) so the star stays visible
  // from the rim / arrival point.
  const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 2_000_000)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  container.appendChild(renderer.domElement)
  // Fill the container; size from client rect so aspect matches the pixels the
  // player actually sees (window.inner* can disagree with the canvas box).
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'

  function resize() {
    const w = Math.max(1, container.clientWidth || window.innerWidth)
    const h = Math.max(1, container.clientHeight || window.innerHeight)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false)
  }
  resize()
  window.addEventListener('resize', resize)

  const sun = new THREE.DirectionalLight(0xffffff, 1.5)
  sun.position.set(300, 400, 500)
  scene.add(sun)
  scene.add(new THREE.AmbientLight(0x505060))

  return { scene, camera, renderer }
}
