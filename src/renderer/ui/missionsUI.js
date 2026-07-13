import { findBody, getSystem } from '../procgen/galaxy.js'
import { missionNavTarget, setWaypointForMission } from '../game/missions.js'
import { escapeHtml } from './escapeHtml.js'

const STYLE = `
#missions-ui { position: fixed; inset: 0; background: rgba(4,6,12,0.75); backdrop-filter: blur(2px); font-family: monospace; color: #cfe3ff; display: none; align-items: center; justify-content: center; z-index: 50; }
#missions-ui .panel {
  width: 640px; max-height: 80vh; overflow-y: auto; padding: 18px 22px;
  background: linear-gradient(135deg, rgba(12,20,36,0.95), rgba(7,12,22,0.9));
  border: 1px solid rgba(111,216,242,0.4); border-left: 3px solid #ff8a3d;
  box-shadow: 0 0 26px rgba(255,138,61,0.18), inset 0 0 26px rgba(79,195,217,0.05);
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%);
}
#missions-ui h2 { font-weight: normal; letter-spacing: 2px; text-shadow: 0 0 8px rgba(255,138,61,0.45); }
#missions-ui h3 { font-weight: normal; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #ffb07a; text-shadow: 0 0 6px rgba(255,138,61,0.5); margin: 4px 0 12px; }
#missions-ui .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
#missions-ui .empty { opacity: 0.5; font-size: 13px; line-height: 1.5; }
#missions-ui .mission {
  margin-bottom: 12px; padding: 12px 14px;
  background: rgba(8,12,22,0.55); border: 1px solid rgba(255,138,61,0.25);
  border-left: 3px solid #ff8a3d;
}
#missions-ui .mission.ready { border-left-color: #7fe0a0; border-color: rgba(127,224,160,0.3); }
#missions-ui .mission .title { font-size: 14px; color: #ffe0c2; margin-bottom: 6px; }
#missions-ui .mission .meta { font-size: 12px; opacity: 0.85; margin-bottom: 4px; }
#missions-ui .mission .status { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; margin: 8px 0; }
#missions-ui .mission .status.progress { color: #ffb07a; }
#missions-ui .mission .status.ready { color: #7fe0a0; text-shadow: 0 0 6px rgba(127,224,160,0.5); }
#missions-ui button.close {
  background: rgba(224,90,90,0.12); border: 1px solid rgba(224,90,90,0.5); color: #ffb3b3;
  padding: 7px 16px; cursor: pointer; font-family: monospace; letter-spacing: 1px;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}
#missions-ui button.close:hover { background: rgba(224,90,90,0.22); box-shadow: 0 0 12px rgba(224,90,90,0.35); }
#missions-ui button.track {
  background: rgba(255,138,61,0.12); border: 1px solid rgba(255,138,61,0.5); color: #ffd0a8;
  padding: 5px 12px; cursor: pointer; font-family: monospace; margin-top: 4px;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}
#missions-ui button.track:hover { background: rgba(255,138,61,0.22); box-shadow: 0 0 12px rgba(255,138,61,0.35); }
#missions-ui .footer-note { margin-top: 14px; font-size: 11px; opacity: 0.55; line-height: 1.4; }
`

function describeTarget(mission, gameState) {
  const t = missionNavTarget(mission, gameState)
  const system = getSystem(gameState.galaxy, t.systemId)
  const systemName = system?.name ?? t.systemId
  if (t.phase === 'turnin') {
    const body = findBody(gameState.galaxy, t.bodyId)
    return `Turn in at ${body?.name ?? 'mission giver'} · ${systemName}`
  }
  if (t.bodyId) {
    const body = findBody(gameState.galaxy, t.bodyId)
    return `Objective: ${body?.name ?? t.bodyId} · ${systemName}`
  }
  return `Objective: hostile target · ${systemName}`
}

export function createMissionsUI(container, gameState) {
  const style = document.createElement('style')
  style.textContent = STYLE
  document.head.appendChild(style)

  const root = document.createElement('div')
  root.id = 'missions-ui'
  root.innerHTML = `
    <div class="panel">
      <div class="header">
        <h2>Missions</h2>
        <button class="close">Close</button>
      </div>
      <div class="content"></div>
    </div>
  `
  container.appendChild(root)

  const contentEl = root.querySelector('.content')

  function render() {
    const active = gameState.missions.active
    if (!active.length) {
      contentEl.innerHTML = `
        <div class="empty">No active missions.<br/>Accept contracts from station and settlement mission boards while docked.</div>
        <div class="footer-note">Orange rings on the galaxy map mark systems with an active objective or turn-in. Track a mission to set it as your waypoint.</div>
      `
      return
    }

    contentEl.innerHTML = `
      <h3>Active (${active.length})</h3>
      ${active.map((m) => {
        const ready = m.objectiveComplete
        return `
          <div class="mission ${ready ? 'ready' : ''}">
            <div class="title">${escapeHtml(m.title)}</div>
            <div class="meta">${escapeHtml(m.type)} · Reward ${m.reward}cr</div>
            <div class="meta">${escapeHtml(describeTarget(m, gameState))}</div>
            <div class="status ${ready ? 'ready' : 'progress'}">${ready ? 'Ready to turn in' : 'In progress'}</div>
            <button class="track" data-id="${m.id}">${ready ? 'Waypoint: Turn-In' : 'Set Waypoint'}</button>
          </div>
        `
      }).join('')}
      <div class="footer-note">Galaxy map: orange ring on the objective system (or turn-in system when complete). In-system bodies are marked on the Current System list and radar.</div>
    `

    contentEl.querySelectorAll('.track').forEach((btn) =>
      btn.addEventListener('click', () => {
        try {
          setWaypointForMission(gameState, btn.dataset.id)
          render()
        } catch (err) {
          alert(err.message)
        }
      })
    )
  }

  root.querySelector('.close').addEventListener('click', () => {
    root.style.display = 'none'
    onCloseCallback?.()
  })

  let onCloseCallback = null

  return {
    show(onClose) {
      onCloseCallback = onClose
      render()
      root.style.display = 'flex'
    },
    hide() {
      root.style.display = 'none'
    },
    element: root
  }
}
