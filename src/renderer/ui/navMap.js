import { getSystem, canJumpTo } from '../procgen/galaxy.js'

const STYLE = `
#nav-map { position: fixed; inset: 0; background: rgba(4,6,12,0.94); font-family: monospace; color: #cfe3ff; display: none; align-items: center; justify-content: center; }
#nav-map .panel { width: 760px; max-height: 85vh; overflow-y: auto; background: #0b1020; border: 1px solid #2a3a55; padding: 16px; }
#nav-map .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
#nav-map .tabs { display: flex; gap: 8px; margin-bottom: 12px; }
#nav-map .tab { background: #10182a; border: 1px solid #2a3a55; color: #cfe3ff; padding: 6px 12px; cursor: pointer; }
#nav-map .tab.active { background: #2a3a55; }
#nav-map button.close { background: #a13a3a; border: none; color: white; padding: 6px 12px; cursor: pointer; }
#nav-map .galaxy-body { display: flex; gap: 16px; }
#nav-map canvas { background: #05070d; border: 1px solid #1a2438; cursor: crosshair; }
#nav-map .info-panel { flex: 1; min-width: 200px; }
#nav-map .info-panel h3 { margin: 0 0 8px 0; }
#nav-map .info-panel .stat { margin-bottom: 4px; font-size: 13px; }
#nav-map button.jump { background: #2a5a3a; border: none; color: #cfe3ff; padding: 8px 16px; cursor: pointer; margin-top: 12px; width: 100%; }
#nav-map button.jump:disabled { opacity: 0.4; cursor: not-allowed; }
#nav-map table { width: 100%; border-collapse: collapse; }
#nav-map th, #nav-map td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #1a2438; font-size: 13px; }
#nav-map button.waypoint { background: #2a3a55; border: none; color: #cfe3ff; padding: 3px 8px; cursor: pointer; }
#nav-map tr.active-waypoint td { color: #7fe0a0; }
`

function dist3(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

export function createNavMap(container, gameState) {
  const style = document.createElement('style')
  style.textContent = STYLE
  document.head.appendChild(style)

  const root = document.createElement('div')
  root.id = 'nav-map'
  root.innerHTML = `
    <div class="panel">
      <div class="header">
        <h2>Navigation</h2>
        <button class="close">Close</button>
      </div>
      <div class="tabs">
        <button data-tab="galaxy" class="tab active">Galaxy Map</button>
        <button data-tab="system" class="tab">Current System</button>
      </div>
      <div class="tab-content"></div>
    </div>
  `
  container.appendChild(root)

  const contentEl = root.querySelector('.tab-content')
  const tabButtons = [...root.querySelectorAll('.tab')]
  let currentTab = 'galaxy'
  let selectedSystemId = null

  function renderGalaxyTab() {
    const systems = gameState.galaxy.systems
    const currentSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
    const maxRadius = Math.max(...systems.map((s) => Math.hypot(s.galaxyPosition[0], s.galaxyPosition[2]))) * 1.1

    contentEl.innerHTML = `
      <div class="galaxy-body">
        <canvas width="480" height="480"></canvas>
        <div class="info-panel">
          <h3 class="sel-name">—</h3>
          <div class="stat sel-bodies"></div>
          <div class="stat sel-distance"></div>
          <button class="jump" disabled>Hyperspace Jump</button>
        </div>
      </div>
    `
    const canvas = contentEl.querySelector('canvas')
    const ctx = canvas.getContext('2d')
    const size = canvas.width

    function toCanvas(pos) {
      return [size / 2 + (pos[0] / maxRadius) * (size / 2 - 12), size / 2 + (pos[2] / maxRadius) * (size / 2 - 12)]
    }

    function draw() {
      ctx.clearRect(0, 0, size, size)

      // Jump lanes: thin lines from the current system to each system it can
      // actually reach, drawn under the dots so the map reads as "here's
      // where you can go from here", not just "here's every system".
      ctx.strokeStyle = 'rgba(94,230,255,0.35)'
      ctx.lineWidth = 1
      const [cx, cy] = toCanvas(currentSystem.galaxyPosition)
      for (const neighborId of currentSystem.neighborIds) {
        const neighbor = systems.find((s) => s.id === neighborId)
        if (!neighbor) continue
        const [nx, ny] = toCanvas(neighbor.galaxyPosition)
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(nx, ny)
        ctx.stroke()
      }

      for (const system of systems) {
        const [px, py] = toCanvas(system.galaxyPosition)
        const isCurrent = system.id === currentSystem.id
        const isSelected = system.id === selectedSystemId
        const inRange = isCurrent || canJumpTo(currentSystem, system.id)
        ctx.beginPath()
        ctx.arc(px, py, isCurrent ? 4 : isSelected ? 3.5 : 2, 0, Math.PI * 2)
        ctx.fillStyle = isCurrent ? '#5ee6ff' : isSelected ? '#ffcc66' : inRange ? '#7fe0a0' : '#3a5a8a'
        if (isCurrent || isSelected || inRange) {
          ctx.shadowColor = ctx.fillStyle
          ctx.shadowBlur = isCurrent || isSelected ? 8 : 4
        } else {
          ctx.shadowBlur = 0
        }
        ctx.fill()
      }
      ctx.shadowBlur = 0
    }

    function updateInfoPanel() {
      const jumpBtn = contentEl.querySelector('.jump')
      if (!selectedSystemId) {
        contentEl.querySelector('.sel-name').textContent = '—'
        contentEl.querySelector('.sel-bodies').textContent = ''
        contentEl.querySelector('.sel-distance').textContent = ''
        jumpBtn.disabled = true
        jumpBtn.textContent = 'Hyperspace Jump'
        return
      }
      const system = systems.find((s) => s.id === selectedSystemId)
      const counts = system.bodies.reduce((acc, b) => ((acc[b.kind] = (acc[b.kind] ?? 0) + 1), acc), {})
      const distance = dist3(system.galaxyPosition, currentSystem.galaxyPosition)
      const isCurrent = system.id === currentSystem.id
      const inRange = isCurrent || canJumpTo(currentSystem, system.id)
      contentEl.querySelector('.sel-name').textContent = system.name
      contentEl.querySelector('.sel-bodies').textContent =
        `${counts.planet ?? 0} planets, ${counts.station ?? 0} stations, ${counts.settlement ?? 0} settlements`
      contentEl.querySelector('.sel-distance').textContent = isCurrent
        ? 'Current system'
        : `${Math.round(distance)} ly away${inRange ? '' : ' — out of hyperspace range'}`
      jumpBtn.disabled = !inRange || isCurrent
      jumpBtn.textContent = !isCurrent && !inRange ? 'Out of Range' : 'Hyperspace Jump'
    }

    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      let nearest = null
      let nearestDist = Infinity
      for (const system of systems) {
        const [px, py] = toCanvas(system.galaxyPosition)
        const d = Math.hypot(px - mx, py - my)
        if (d < nearestDist) {
          nearestDist = d
          nearest = system
        }
      }
      if (nearest && nearestDist < 10) {
        selectedSystemId = nearest.id
        updateInfoPanel()
        draw()
      }
    })

    contentEl.querySelector('.jump').addEventListener('click', () => {
      if (!selectedSystemId || !onJumpCallback) return
      onJumpCallback(selectedSystemId)
    })

    draw()
    updateInfoPanel()
  }

  function renderSystemTab() {
    const system = getSystem(gameState.galaxy, gameState.player.currentSystemId)
    const playerPos = gameState.player.ship.position
    const rows = system.bodies
      .map((b) => ({ b, d: dist3(playerPos, b.position) }))
      .sort((a, b) => a.d - b.d)

    contentEl.innerHTML = `
      <p>Bodies in ${system.name}:</p>
      <table>
        <thead><tr><th>Name</th><th>Kind</th><th>Distance</th><th></th></tr></thead>
        <tbody>${rows
          .map(
            ({ b, d }) => `
          <tr class="${gameState.player.waypointBodyId === b.id ? 'active-waypoint' : ''}">
            <td>${b.name}</td><td>${b.kind}</td><td>${Math.round(d)}m</td>
            <td><button class="waypoint" data-id="${b.id}">${gameState.player.waypointBodyId === b.id ? 'Clear' : 'Set Waypoint'}</button></td>
          </tr>`
          )
          .join('')}</tbody>
      </table>
    `
    contentEl.querySelectorAll('.waypoint').forEach((btn) =>
      btn.addEventListener('click', () => {
        gameState.player.waypointBodyId = gameState.player.waypointBodyId === btn.dataset.id ? null : btn.dataset.id
        renderSystemTab()
      })
    )
  }

  const renderers = { galaxy: renderGalaxyTab, system: renderSystemTab }

  tabButtons.forEach((btn) =>
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab
      tabButtons.forEach((b) => b.classList.toggle('active', b === btn))
      renderers[currentTab]()
    })
  )

  let onJumpCallback = null
  let onCloseCallback = null
  root.querySelector('.close').addEventListener('click', () => {
    root.style.display = 'none'
    onCloseCallback?.()
  })

  return {
    show({ onJump, onClose }) {
      onJumpCallback = onJump
      onCloseCallback = onClose
      selectedSystemId = null
      currentTab = 'galaxy'
      tabButtons.forEach((b) => b.classList.toggle('active', b.dataset.tab === 'galaxy'))
      renderGalaxyTab()
      root.style.display = 'flex'
    },
    hide() {
      root.style.display = 'none'
    },
    element: root
  }
}
