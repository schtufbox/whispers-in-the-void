import { getSystem, canJumpTo } from '../procgen/galaxy.js'
import { missionMarkedSystemIds, missionMarkedBodyIds } from '../game/missions.js'

const STYLE = `
#nav-map { position: fixed; inset: 0; background: rgba(4,6,12,0.94); backdrop-filter: blur(2px); font-family: monospace; color: #cfe3ff; display: none; align-items: center; justify-content: center; z-index: 50; }
#nav-map .panel {
  width: 960px; max-height: 90vh; overflow-y: auto; padding: 18px 22px;
  background: linear-gradient(135deg, rgba(12,20,36,0.95), rgba(7,12,22,0.9));
  border: 1px solid rgba(111,216,242,0.4); border-left: 3px solid #6fd8f2;
  box-shadow: 0 0 26px rgba(79,195,217,0.22), inset 0 0 26px rgba(79,195,217,0.05);
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%);
}
#nav-map h2 { font-weight: normal; letter-spacing: 2px; text-shadow: 0 0 8px rgba(79,195,217,0.5); }
#nav-map h3 { font-weight: normal; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #7fe6ff; text-shadow: 0 0 6px rgba(79,195,217,0.6); margin: 0 0 8px 0; }
#nav-map .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
#nav-map .tabs { display: flex; gap: 2px; margin-bottom: 16px; border-bottom: 1px solid rgba(111,216,242,0.25); }
#nav-map .tab {
  background: transparent; border: none; border-bottom: 2px solid transparent; color: #8fb3d9;
  padding: 8px 16px; cursor: pointer; font-family: monospace; font-size: 11px;
  letter-spacing: 1.5px; text-transform: uppercase; transition: color 0.15s ease, border-color 0.15s ease;
}
#nav-map .tab:hover { color: #cfe3ff; }
#nav-map .tab.active { color: #7fe6ff; border-bottom-color: #6fd8f2; text-shadow: 0 0 6px rgba(79,195,217,0.6); }
#nav-map button.close {
  background: rgba(224,90,90,0.12); border: 1px solid rgba(224,90,90,0.5); color: #ffb3b3;
  padding: 7px 16px; cursor: pointer; font-family: monospace; letter-spacing: 1px;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}
#nav-map button.close:hover { background: rgba(224,90,90,0.22); box-shadow: 0 0 12px rgba(224,90,90,0.35); }
#nav-map .galaxy-body { display: flex; gap: 16px; position: relative; }
#nav-map canvas { background: #05070d; border: 1px solid rgba(111,216,242,0.3); cursor: crosshair; border-radius: 4px; box-shadow: 0 0 20px rgba(79,195,217,0.15); }
#nav-map .map-tooltip {
  position: absolute; pointer-events: none; font-size: 12px; color: #eaffff;
  background: rgba(10,14,24,0.92); border: 1px solid rgba(94,230,255,0.5); padding: 4px 9px;
  box-shadow: 0 0 10px rgba(79,195,217,0.3);
  white-space: nowrap; display: none; transform: translate(-50%, -130%);
}
#nav-map .info-panel { flex: 1; min-width: 220px; }
#nav-map .info-panel .stat { margin-bottom: 4px; font-size: 13px; opacity: 0.9; }
#nav-map button.jump {
  background: rgba(127,224,160,0.12); border: 1px solid rgba(127,224,160,0.5); color: #bdf5cf;
  padding: 9px 16px; cursor: pointer; margin-top: 12px; width: 100%; font-family: monospace;
  letter-spacing: 1px; transition: background 0.15s ease, box-shadow 0.15s ease;
}
#nav-map button.jump:not(:disabled):hover { background: rgba(127,224,160,0.22); box-shadow: 0 0 14px rgba(127,224,160,0.35); }
#nav-map button.jump:disabled { opacity: 0.35; cursor: not-allowed; }
#nav-map table { width: 100%; border-collapse: collapse; }
#nav-map th { text-align: left; padding: 6px 8px; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #7fa8c9; font-weight: normal; border-bottom: 1px solid rgba(111,216,242,0.3); }
#nav-map td { text-align: left; padding: 5px 8px; border-bottom: 1px solid rgba(42,58,85,0.5); font-size: 13px; }
#nav-map tbody tr:hover td { background: rgba(111,216,242,0.05); }
#nav-map td.body-name { display: flex; align-items: center; gap: 6px; }
#nav-map button.waypoint {
  background: rgba(111,216,242,0.1); border: 1px solid rgba(111,216,242,0.4); color: #cfe3ff;
  padding: 3px 9px; cursor: pointer; font-family: monospace; transition: background 0.15s ease, box-shadow 0.15s ease;
}
#nav-map button.waypoint:hover { background: rgba(111,216,242,0.22); box-shadow: 0 0 10px rgba(79,195,217,0.35); }
#nav-map tr.active-waypoint td { color: #7fe0a0; text-shadow: 0 0 6px rgba(127,224,160,0.5); }
#nav-map tr.mission-marker td { color: #ffb07a; }
#nav-map tr.mission-marker td.body-name { text-shadow: 0 0 6px rgba(255,138,61,0.45); }
#nav-map .mission-tag {
  font-size: 10px; letter-spacing: 1px; text-transform: uppercase;
  color: #ff8a3d; margin-left: 4px; opacity: 0.9;
}
`

// Small per-kind glyphs (not emoji) so the system-body list reads at a
// glance without needing to read the "Kind" column — a filled circle for
// planets, a smaller dim one for moons, a square for stations/settlements
// (settlement dimmer, matching its render/collision size being smaller),
// and a little cluster of dots for asteroid fields (echoing how they
// actually render as scattered rocks).
const BODY_ICONS = {
  planet: '<svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="#8fb3ff"/></svg>',
  moon: '<svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="3.5" fill="#9aa8bd"/></svg>',
  station: '<svg width="12" height="12" viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="9" height="9" fill="#5ee6ff"/></svg>',
  settlement: '<svg width="12" height="12" viewBox="0 0 12 12"><rect x="2.5" y="2.5" width="7" height="7" fill="#c2a35c"/></svg>',
  asteroidField: '<svg width="12" height="12" viewBox="0 0 12 12"><circle cx="3" cy="4" r="2" fill="#8a8172"/><circle cx="8" cy="3" r="1.4" fill="#8a8172"/><circle cx="7" cy="8" r="2.2" fill="#8a8172"/></svg>'
}

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
  let hoveredSystemId = null

  function renderGalaxyTab() {
    const systems = gameState.galaxy.systems
    const currentSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
    const maxRadius = Math.max(...systems.map((s) => Math.hypot(s.galaxyPosition[0], s.galaxyPosition[2]))) * 1.1

    contentEl.innerHTML = `
      <div class="galaxy-body">
        <canvas width="680" height="680"></canvas>
        <div class="map-tooltip"></div>
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
    const tooltipEl = contentEl.querySelector('.map-tooltip')
    const size = canvas.width

    function toCanvas(pos) {
      return [size / 2 + (pos[0] / maxRadius) * (size / 2 - 16), size / 2 + (pos[2] / maxRadius) * (size / 2 - 16)]
    }

    function draw() {
      ctx.clearRect(0, 0, size, size)

      // A soft, bright glow at the galactic core fading toward the rim —
      // gives the map an actual "galaxy" read at a glance, on top of the
      // already spiral-arm-shaped system distribution (see procgen/galaxy.js's
      // spiralPosition) rather than just a flat scatter of dots.
      const glow = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
      glow.addColorStop(0, 'rgba(143,179,255,0.16)')
      glow.addColorStop(0.35, 'rgba(94,150,230,0.07)')
      glow.addColorStop(1, 'rgba(94,150,230,0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, size, size)

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

      // Mission objective / turn-in systems get an orange ring under the dot.
      const missionSystems = missionMarkedSystemIds(gameState)
      for (const system of systems) {
        if (!missionSystems.has(system.id)) continue
        const [px, py] = toCanvas(system.galaxyPosition)
        ctx.beginPath()
        ctx.arc(px, py, 9, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255,138,61,0.95)'
        ctx.lineWidth = 2
        ctx.shadowColor = '#ff8a3d'
        ctx.shadowBlur = 12
        ctx.stroke()
      }
      ctx.shadowBlur = 0

      for (const system of systems) {
        const [px, py] = toCanvas(system.galaxyPosition)
        const isCurrent = system.id === currentSystem.id
        const isSelected = system.id === selectedSystemId
        const isHovered = system.id === hoveredSystemId
        const inRange = isCurrent || canJumpTo(currentSystem, system.id)
        const hasMission = missionSystems.has(system.id)
        ctx.beginPath()
        ctx.arc(px, py, isCurrent ? 5 : isSelected || isHovered ? 4.5 : 2.5, 0, Math.PI * 2)
        ctx.fillStyle = isCurrent ? '#5ee6ff' : isSelected ? '#ffcc66' : isHovered ? '#eaffff' : hasMission ? '#ff9a4a' : inRange ? '#7fe0a0' : '#3a5a8a'
        if (isCurrent || isSelected || isHovered || inRange || hasMission) {
          ctx.shadowColor = ctx.fillStyle
          ctx.shadowBlur = isCurrent || isSelected || isHovered ? 10 : 5
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

    function nearestSystemAt(mx, my) {
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
      return nearestDist < 10 ? nearest : null
    }

    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect()
      const nearest = nearestSystemAt(e.clientX - rect.left, e.clientY - rect.top)
      if (nearest) {
        selectedSystemId = nearest.id
        updateInfoPanel()
        draw()
      }
    })

    // Hover shows the system's name as a floating tooltip near the cursor —
    // the map otherwise has no labels at all until a system is clicked.
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const nearest = nearestSystemAt(mx, my)
      if (nearest?.id !== hoveredSystemId) {
        hoveredSystemId = nearest?.id ?? null
        draw()
      }
      if (nearest) {
        const tag = missionSystems.has(nearest.id) ? ' · mission' : ''
        tooltipEl.textContent = `${nearest.name}${tag}`
        tooltipEl.style.left = `${mx}px`
        tooltipEl.style.top = `${my}px`
        tooltipEl.style.display = 'block'
      } else {
        tooltipEl.style.display = 'none'
      }
    })
    canvas.addEventListener('mouseleave', () => {
      tooltipEl.style.display = 'none'
      if (hoveredSystemId) {
        hoveredSystemId = null
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
    const missionBodies = missionMarkedBodyIds(gameState, system.id)
    const rows = system.bodies
      .map((b) => ({ b, d: dist3(playerPos, b.position) }))
      .sort((a, b) => a.d - b.d)

    contentEl.innerHTML = `
      <p>Bodies in ${system.name}:</p>
      <table>
        <thead><tr><th>Name</th><th>Kind</th><th>Distance</th><th></th></tr></thead>
        <tbody>${rows
          .map(
            ({ b, d }) => {
              const isWp = gameState.player.waypointBodyId === b.id
              const isMission = missionBodies.has(b.id)
              const classes = [isWp ? 'active-waypoint' : '', isMission ? 'mission-marker' : ''].filter(Boolean).join(' ')
              return `
          <tr class="${classes}">
            <td class="body-name">${BODY_ICONS[b.kind] ?? ''}${b.name}${isMission ? '<span class="mission-tag">mission</span>' : ''}</td>
            <td>${b.kind}</td><td>${Math.round(d)}m</td>
            <td><button class="waypoint" data-id="${b.id}">${isWp ? 'Clear' : 'Set Waypoint'}</button></td>
          </tr>`
            }
          )
          .join('')}</tbody>
      </table>
    `
    contentEl.querySelectorAll('.waypoint').forEach((btn) =>
      btn.addEventListener('click', () => {
        if (gameState.player.waypointBodyId === btn.dataset.id) {
          gameState.player.waypointBodyId = null
        } else {
          gameState.player.waypointBodyId = btn.dataset.id
          gameState.player.waypointPosition = null
        }
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
