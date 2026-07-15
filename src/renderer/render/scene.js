import * as THREE from 'three'

export function createScene(container) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x05070d)

  // Far plane must clear a full system diameter (local scatter up to ~300k+
  // after the large sun/planet system scale-up) so the star stays visible
  // from the rim / arrival point.
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 2_000_000)

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  container.appendChild(renderer.domElement)

  const sun = new THREE.DirectionalLight(0xffffff, 1.5)
  sun.position.set(300, 400, 500)
  scene.add(sun)
  scene.add(new THREE.AmbientLight(0x505060))

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  return { scene, camera, renderer }
}
