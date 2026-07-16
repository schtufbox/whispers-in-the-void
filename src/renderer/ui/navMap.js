import { getSystem, canJumpTo, findHyperspaceRoute } from '../procgen/galaxy.js'
import { missionMarkedSystemIds, missionMarkedBodyIds } from '../game/missions.js'
import { playerAssetSystemIds } from '../game/economy.js'
import { escapeHtml } from './escapeHtml.js'

const STYLE = `
/* Above docking chrome (z 50) so Map/Missions work while docked. */
#nav-map { position: fixed; inset: 0; background: rgba(4,6,12,0.94); backdrop-filter: blur(2px); font-family: monospace; color: #cfe3ff; display: none; align-items: center; justify-content: center; z-index: 55; }
#nav-map .panel {
  width: 1020px; max-height: 90vh; overflow-y: auto; padding: 18px 22px;
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
#nav-map canvas { background: #05070d; border: 1px solid rgba(111,216,242,0.3); cursor: crosshair; border-radius: 4px; box-shadow: 0 0 20px rgba(79,195,217,0.15); flex-shrink: 0; }
#nav-map .map-tooltip {
  position: absolute; pointer-events: none; font-size: 12px; color: #eaffff;
  background: rgba(10,14,24,0.92); border: 1px solid rgba(94,230,255,0.5); padding: 4px 9px;
  box-shadow: 0 0 10px rgba(79,195,217,0.3);
  white-space: nowrap; display: none; transform: translate(-50%, -130%);
}
#nav-map .info-panel { flex: 1; min-width: 240px; max-width: 280px; }
#nav-map .info-panel .stat { margin-bottom: 4px; font-size: 13px; opacity: 0.9; }
#nav-map .info-panel .stat.route-hint { color: #ffe08a; opacity: 0.95; margin-top: 6px; font-size: 12px; }
#nav-map button.jump {
  background: rgba(127,224,160,0.12); border: 1px solid rgba(127,224,160,0.5); color: #bdf5cf;
  padding: 9px 16px; cursor: pointer; margin-top: 12px; width: 100%; font-family: monospace;
  letter-spacing: 1px; transition: background 0.15s ease, box-shadow 0.15s ease;
}
#nav-map button.jump:not(:disabled):hover { background: rgba(127,224,160,0.22); box-shadow: 0 0 14px rgba(127,224,160,0.35); }
#nav-map button.jump:disabled { opacity: 0.35; cursor: not-allowed; }
#nav-map button.plot-route {
  background: rgba(255,210,70,0.12); border: 1px solid rgba(255,210,70,0.55); color: #ffe08a;
  padding: 9px 16px; cursor: pointer; margin-top: 8px; width: 100%; font-family: monospace;
  letter-spacing: 1px; transition: background 0.15s ease, box-shadow 0.15s ease;
}
#nav-map button.plot-route:not(:disabled):hover { background: rgba(255,210,70,0.22); box-shadow: 0 0 14px rgba(255,210,70,0.35); }
#nav-map button.plot-route:disabled { opacity: 0.35; cursor: not-allowed; }
#nav-map button.clear-route {
  background: rgba(224,90,90,0.1); border: 1px solid rgba(224,90,90,0.4); color: #ffb3b3;
  padding: 6px 12px; cursor: pointer; margin-top: 8px; width: 100%; font-family: monospace;
  font-size: 11px; letter-spacing: 1px;
}
#nav-map button.clear-route:hover { background: rgba(224,90,90,0.2); box-shadow: 0 0 10px rgba(224,90,90,0.3); }
#nav-map .route-panel {
  margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,210,70,0.25);
}
#nav-map .route-panel h3 { color: #ffe08a; text-shadow: 0 0 6px rgba(255,210,70,0.45); }
#nav-map .route-panel .route-empty { font-size: 12px; opacity: 0.5; line-height: 1.4; }
#nav-map .route-list {
  list-style: none; margin: 0; padding: 0; max-height: 280px; overflow-y: auto;
}
#nav-map .route-list li {
  display: flex; align-items: baseline; gap: 8px; padding: 6px 8px; margin-bottom: 3px;
  font-size: 12px; background: rgba(255,210,70,0.06); border-left: 2px solid rgba(255,210,70,0.35);
}
#nav-map .route-list li.next {
  background: rgba(255,210,70,0.14); border-left-color: #ffd246;
  color: #ffe8a8; text-shadow: 0 0 6px rgba(255,210,70,0.4);
}
#nav-map .route-list li.dest { border-left-color: #ffb347; }
#nav-map .route-list .hop { opacity: 0.55; font-size: 10px; min-width: 1.5em; }
#nav-map .route-list .name { flex: 1; }
#nav-map .route-list .tag {
  font-size: 9px; letter-spacing: 1px; text-transform: uppercase; opacity: 0.7; color: #ffe08a;
}
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
  asteroidField: '<svg width="12" height="12" viewBox="0 0 12 12"><circle cx="3" cy="4" r="2" fill="#8a8172"/><circle cx="8" cy="3" r="1.4" fill="#8a8172"/><circle cx="7" cy="8" r="2.2" fill="#8a8172"/></svg>',
  star: '<svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="4" fill="#ffe066"/><circle cx="6" cy="6" r="5.5" fill="none" stroke="#ffb347" stroke-width="0.8" opacity="0.7"/></svg>'
}

// Synthetic waypoint id for the system sun (must match main.js).
const SYSTEM_STAR_WAYPOINT_ID = 'system-star'

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
        <button data-tab="system" class="tab active">Current System</button>
        <button data-tab="galaxy" class="tab">Galaxy Map</button>
      </div>
      <div class="tab-content"></div>
    </div>
  `
  container.appendChild(root)

  const contentEl = root.querySelector('.tab-content')
  const tabButtons = [...root.querySelectorAll('.tab')]
  let currentTab = 'system'
  let selectedSystemId = null
  let hoveredSystemId = null

  function renderGalaxyTab() {
    const systems = gameState.galaxy.systems
    const currentSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
    const maxRadius = Math.max(...systems.map((s) => Math.hypot(s.galaxyPosition[0], s.galaxyPosition[2]))) * 1.1
    const byId = new Map(systems.map((s) => [s.id, s]))

    contentEl.innerHTML = `
      <div class="galaxy-body">
        <canvas width="680" height="680"></canvas>
        <div class="map-tooltip"></div>
        <div class="info-panel">
          <h3 class="sel-name">—</h3>
          <div class="stat sel-bodies"></div>
          <div class="stat sel-distance"></div>
          <div class="stat route-hint"></div>
          <button class="jump" disabled>Hyperspace Jump</button>
          <button class="plot-route" disabled>Plot Route</button>
          <div class="route-panel">
            <h3>Plotted Route</h3>
            <div class="route-list-wrap"></div>
          </div>
          <div class="map-legend" style="margin-top:14px;padding-top:10px;border-top:1px solid rgba(111,216,242,0.2);font-size:11px;line-height:1.55;opacity:0.75;">
            <div><span style="color:#ff8a3d;">○</span> Orange — mission objective / turn-in</div>
            <div><span style="color:#50dc78;">○</span> Green — stored assets in another system</div>
          </div>
        </div>
      </div>
    `
    const canvas = contentEl.querySelector('canvas')
    const ctx = canvas.getContext('2d')
    const tooltipEl = contentEl.querySelector('.map-tooltip')
    const size = canvas.width
    // Shared by draw() (rings/dots) and the hover tooltip — must live outside
    // draw so mousemove can see it (was ReferenceError: missionSystems).
    const missionSystems = missionMarkedSystemIds(gameState)
    // Remote systems with stored ships/cargo/etc. (not the current system).
    const assetSystems = playerAssetSystemIds(gameState)

    function toCanvas(pos) {
      return [size / 2 + (pos[0] / maxRadius) * (size / 2 - 16), size / 2 + (pos[2] / maxRadius) * (size / 2 - 16)]
    }

    function remainingRoute() {
      const r = gameState.player.plottedRoute
      return Array.isArray(r) && r.length ? r : null
    }

    /** Next hop on the plotted route (must be a hyperspace neighbor). */
    function nextRouteHopId() {
      const rem = remainingRoute()
      if (!rem?.length) return null
      const hop = rem[0]
      return canJumpTo(currentSystem, hop) ? hop : null
    }

    /** Jump target: next route hop if available, else in-range selection. */
    function resolveJumpTargetId() {
      const hop = nextRouteHopId()
      if (hop) return hop
      if (
        selectedSystemId &&
        selectedSystemId !== currentSystem.id &&
        canJumpTo(currentSystem, selectedSystemId)
      ) {
        return selectedSystemId
      }
      return null
    }

    /** Full path ids for drawing: current + remaining hops. */
    function plottedPathIds() {
      const rem = remainingRoute()
      if (!rem) return null
      return [currentSystem.id, ...rem]
    }

    function pathToSelected() {
      if (!selectedSystemId || selectedSystemId === currentSystem.id) return null
      return findHyperspaceRoute(gameState.galaxy, currentSystem.id, selectedSystemId)
    }

    // With an active route, default selection to the next hop so Jump is armed.
    {
      const hop = nextRouteHopId()
      if (hop) selectedSystemId = hop
    }

    function drawPath(pathIds, { color, lineWidth = 2.5, dashed = false } = {}) {
      if (!pathIds || pathIds.length < 2) return
      ctx.save()
      ctx.strokeStyle = color
      ctx.lineWidth = lineWidth
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      if (dashed) ctx.setLineDash([6, 5])
      else ctx.setLineDash([])
      ctx.shadowColor = color
      ctx.shadowBlur = dashed ? 6 : 10
      ctx.beginPath()
      for (let i = 0; i < pathIds.length; i++) {
        const sys = byId.get(pathIds[i])
        if (!sys) continue
        const [x, y] = toCanvas(sys.galaxyPosition)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.shadowBlur = 0
      ctx.setLineDash([])
      ctx.restore()
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

      // Plotted multi-hop route (solid yellow).
      const plotted = plottedPathIds()
      if (plotted) {
        drawPath(plotted, { color: 'rgba(255, 210, 70, 0.95)', lineWidth: 2.75 })
      }

      // Selecting an out-of-range system previews its shortest path in yellow
      // (dashed when a different plotted route is already active).
      const preview = pathToSelected()
      if (preview && preview.length > 1) {
        const inRange = canJumpTo(currentSystem, selectedSystemId)
        if (!inRange) {
          const sameAsPlotted =
            plotted &&
            plotted.length === preview.length &&
            plotted.every((id, i) => id === preview[i])
          if (!sameAsPlotted) {
            drawPath(preview, {
              color: 'rgba(255, 220, 90, 0.9)',
              lineWidth: 2.25,
              dashed: !!plotted
            })
          } else if (!plotted) {
            drawPath(preview, { color: 'rgba(255, 210, 70, 0.95)', lineWidth: 2.75 })
          }
        }
      }

      // Asset rings first (outer), then mission rings (inner) so both read when
      // a system has stored gear and an active objective.
      for (const system of systems) {
        if (!assetSystems.has(system.id)) continue
        const [px, py] = toCanvas(system.galaxyPosition)
        ctx.beginPath()
        ctx.arc(px, py, 12, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(80,220,120,0.95)'
        ctx.lineWidth = 2.25
        ctx.shadowColor = '#50dc78'
        ctx.shadowBlur = 12
        ctx.stroke()
      }
      ctx.shadowBlur = 0

      // Mission objective / turn-in systems get an orange ring under the dot.
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

      const routeSet = new Set(plotted ?? [])
      for (const system of systems) {
        const [px, py] = toCanvas(system.galaxyPosition)
        const isCurrent = system.id === currentSystem.id
        const isSelected = system.id === selectedSystemId
        const isHovered = system.id === hoveredSystemId
        const inRange = isCurrent || canJumpTo(currentSystem, system.id)
        const hasMission = missionSystems.has(system.id)
        const hasAssets = assetSystems.has(system.id)
        const onRoute = routeSet.has(system.id) && !isCurrent
        ctx.beginPath()
        ctx.arc(px, py, isCurrent ? 5 : isSelected || isHovered || onRoute ? 4.5 : 2.5, 0, Math.PI * 2)
        ctx.fillStyle = isCurrent
          ? '#5ee6ff'
          : isSelected
            ? '#ffcc66'
            : onRoute
              ? '#ffd246'
              : isHovered
                ? '#eaffff'
                : hasMission
                  ? '#ff9a4a'
                  : hasAssets
                    ? '#6fe89a'
                    : inRange
                      ? '#7fe0a0'
                      : '#3a5a8a'
        if (isCurrent || isSelected || isHovered || inRange || hasMission || hasAssets || onRoute) {
          ctx.shadowColor = ctx.fillStyle
          ctx.shadowBlur = isCurrent || isSelected || isHovered || onRoute ? 10 : 5
        } else {
          ctx.shadowBlur = 0
        }
        ctx.fill()
      }
      ctx.shadowBlur = 0
    }

    function renderRouteList() {
      const wrap = contentEl.querySelector('.route-list-wrap')
      const rem = remainingRoute()
      if (!rem) {
        wrap.innerHTML = `<div class="route-empty">Select a distant system and Plot Route to plan multi-hop jumps. Yellow path shows systems to pass through.</div>`
        return
      }
      const hops = rem.length
      wrap.innerHTML = `
        <ol class="route-list">
          ${rem
            .map((id, i) => {
              const sys = byId.get(id)
              const name = sys?.name ?? id
              const isNext = i === 0
              const isDest = i === rem.length - 1
              const tags = [
                isNext ? '<span class="tag">next</span>' : '',
                isDest && !isNext ? '<span class="tag">dest</span>' : isDest ? '<span class="tag">dest</span>' : ''
              ].join('')
              return `<li class="${isNext ? 'next' : ''} ${isDest ? 'dest' : ''}">
                <span class="hop">${i + 1}.</span>
                <span class="name">${escapeHtml(name)}</span>
                ${tags}
              </li>`
            })
            .join('')}
        </ol>
        <div class="stat" style="margin-top:8px;opacity:0.7;font-size:11px">${hops} jump${hops === 1 ? '' : 's'} remaining</div>
        <button class="clear-route">Clear Route</button>
      `
      wrap.querySelector('.clear-route')?.addEventListener('click', () => {
        gameState.player.plottedRoute = null
        updateInfoPanel()
        draw()
      })
    }

    function updateInfoPanel() {
      const jumpBtn = contentEl.querySelector('.jump')
      const plotBtn = contentEl.querySelector('.plot-route')
      const hintEl = contentEl.querySelector('.route-hint')

      if (!selectedSystemId) {
        contentEl.querySelector('.sel-name').textContent = '—'
        contentEl.querySelector('.sel-bodies').textContent = ''
        contentEl.querySelector('.sel-distance').textContent = ''
        hintEl.textContent = ''
        jumpBtn.disabled = true
        jumpBtn.textContent = 'Hyperspace Jump'
        plotBtn.disabled = true
        plotBtn.textContent = 'Plot Route'
        renderRouteList()
        return
      }
      const system = systems.find((s) => s.id === selectedSystemId)
      const counts = system.bodies.reduce((acc, b) => ((acc[b.kind] = (acc[b.kind] ?? 0) + 1), acc), {})
      const distance = dist3(system.galaxyPosition, currentSystem.galaxyPosition)
      const isCurrent = system.id === currentSystem.id
      const inRange = isCurrent || canJumpTo(currentSystem, system.id)
      const path = pathToSelected()
      const jumps = path ? path.length - 1 : 0

      contentEl.querySelector('.sel-name').textContent = system.name
      contentEl.querySelector('.sel-bodies').textContent =
        `${counts.planet ?? 0} planets, ${counts.station ?? 0} stations, ${counts.settlement ?? 0} settlements`
      contentEl.querySelector('.sel-distance').textContent = isCurrent
        ? 'Current system'
        : `${Math.round(distance)} ly away${inRange ? '' : ' — out of hyperspace range'}`

      if (!isCurrent && path && jumps > 0) {
        hintEl.textContent =
          jumps === 1
            ? '1 jump — in range (or plot to track).'
            : `Route: ${jumps} jumps via ${jumps - 1} system${jumps - 1 === 1 ? '' : 's'} (yellow path).`
      } else if (!isCurrent && !path) {
        hintEl.textContent = 'No hyperspace route found.'
      } else {
        hintEl.textContent = ''
      }

      const canPlot = !isCurrent && path && jumps >= 1
      plotBtn.disabled = !canPlot
      plotBtn.textContent =
        canPlot && jumps > 1 ? `Plot Route (${jumps} jumps)` : canPlot ? 'Plot Route' : 'Plot Route'

      const jumpTarget = resolveJumpTargetId()
      const jumpSys = jumpTarget ? byId.get(jumpTarget) : null
      const routeHop = nextRouteHopId()

      if (inCombat) {
        jumpBtn.disabled = true
        jumpBtn.textContent = 'Cannot Jump in Combat'
      } else if (supercruiseActive) {
        jumpBtn.disabled = true
        jumpBtn.textContent = 'Drop Supercruise First'
      } else if (jumpTarget && jumpSys) {
        jumpBtn.disabled = false
        jumpBtn.textContent = routeHop
          ? `Jump: ${jumpSys.name}`
          : 'Hyperspace Jump'
      } else {
        jumpBtn.disabled = true
        jumpBtn.textContent =
          !isCurrent && !inRange && !routeHop
            ? 'Out of Range — Plot Route'
            : 'Hyperspace Jump'
      }
      renderRouteList()
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
        const tags = []
        if (missionSystems.has(nearest.id)) tags.push('mission')
        if (assetSystems.has(nearest.id)) tags.push('assets')
        const tag = tags.length ? ` · ${tags.join(', ')}` : ''
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
      if (!onJumpCallback || supercruiseActive || inCombat) return
      const target = resolveJumpTargetId()
      if (!target) return
      onJumpCallback(target)
    })

    contentEl.querySelector('.plot-route').addEventListener('click', () => {
      const path = pathToSelected()
      if (!path || path.length < 2) return
      // Store remaining hops only (exclude current system).
      gameState.player.plottedRoute = path.slice(1)
      // Arm Jump on the first hop immediately.
      selectedSystemId = path[1]
      updateInfoPanel()
      draw()
    })

    draw()
    updateInfoPanel()
  }

  function renderSystemTab() {
    const system = getSystem(gameState.galaxy, gameState.player.currentSystemId)
    const playerPos = gameState.player.ship.position
    const missionBodies = missionMarkedBodyIds(gameState, system.id)
    const starPos = [0, 0, 0]
    const starRow = {
      b: { id: SYSTEM_STAR_WAYPOINT_ID, name: `${system.name} Star`, kind: 'star' },
      d: dist3(playerPos, starPos)
    }
    const rows = [
      starRow,
      ...system.bodies.map((b) => ({ b, d: dist3(playerPos, b.position) })).sort((a, b) => a.d - b.d)
    ]

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
              const distLabel = d >= 10000 ? `${(d / 1000).toFixed(1)}km` : `${Math.round(d)}m`
              return `
          <tr class="${classes}">
            <td class="body-name">${BODY_ICONS[b.kind] ?? ''}${b.name}${isMission ? '<span class="mission-tag">mission</span>' : ''}</td>
            <td>${b.kind}</td><td>${distLabel}</td>
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
          gameState.player.waypointPosition = null
        } else {
          gameState.player.waypointBodyId = btn.dataset.id
          // Star is at system origin; body waypoints clear free-space markers.
          gameState.player.waypointPosition =
            btn.dataset.id === SYSTEM_STAR_WAYPOINT_ID ? [0, 0, 0] : null
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
  // Set each time the map opens — hyperspace blocked in combat / supercruise.
  let supercruiseActive = false
  let inCombat = false
  root.querySelector('.close').addEventListener('click', () => {
    root.style.display = 'none'
    onCloseCallback?.()
  })

  return {
    show({ onJump, onClose, supercruiseActive: sc = false, inCombat: combat = false }) {
      onJumpCallback = onJump
      onCloseCallback = onClose
      supercruiseActive = !!sc
      inCombat = !!combat
      selectedSystemId = null
      // With a plotted route, open Galaxy so the next hop + Jump are ready.
      const hasRoute =
        Array.isArray(gameState.player.plottedRoute) && gameState.player.plottedRoute.length > 0
      currentTab = hasRoute ? 'galaxy' : 'system'
      tabButtons.forEach((b) => b.classList.toggle('active', b.dataset.tab === currentTab))
      renderers[currentTab]()
      root.style.display = 'flex'
    },
    hide() {
      root.style.display = 'none'
    },
    element: root
  }
}
