const STYLE = `
#hud { font-family: monospace; color: #cfe3ff; user-select: none; }

/* Cockpit chrome: four corner braces plus a faint full-screen scanline wash,
   so gameplay reads as looking through a ship canopy HUD rather than a bare
   viewport. pointer-events: none throughout — pure decoration. */
#hud .cockpit-frame { position: fixed; inset: 10px; pointer-events: none; z-index: 5; }
#hud .cockpit-frame .corner { position: absolute; width: 34px; height: 34px; border: 2px solid rgba(111,216,242,0.5); filter: drop-shadow(0 0 6px rgba(79,195,217,0.5)); }
#hud .cockpit-frame .corner.tl { top: 0; left: 0; border-right: none; border-bottom: none; }
#hud .cockpit-frame .corner.tr { top: 0; right: 0; border-left: none; border-bottom: none; }
#hud .cockpit-frame .corner.bl { bottom: 0; left: 0; border-right: none; border-top: none; }
#hud .cockpit-frame .corner.br { bottom: 0; right: 0; border-left: none; border-top: none; }
#hud .scanlines {
  position: fixed; inset: 0; pointer-events: none; z-index: 4; opacity: 0.35;
  background: repeating-linear-gradient(0deg, rgba(79,195,217,0.025) 0px, rgba(79,195,217,0.025) 1px, transparent 1px, transparent 4px);
}

#hud .status-panel {
  position: fixed; top: 16px; left: 16px;
  width: 240px;
  padding: 12px 18px 10px 20px;
  background: linear-gradient(135deg, rgba(12,20,36,0.92), rgba(7,12,22,0.8));
  border: 1px solid rgba(111,216,242,0.45);
  border-left: 3px solid #6fd8f2;
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%);
  box-shadow: 0 0 16px rgba(79,195,217,0.3), inset 0 0 22px rgba(79,195,217,0.06);
}
#hud .panel-title {
  font-size: 10px; letter-spacing: 3px; opacity: 0.65; color: #7fe6ff;
  text-shadow: 0 0 6px rgba(79,195,217,0.7); margin-bottom: 8px;
}
#hud .row { margin-bottom: 7px; }
#hud .row-label {
  display: flex; justify-content: space-between; font-size: 10px;
  letter-spacing: 1.5px; opacity: 0.75; margin-bottom: 2px;
}
#hud .row-label .value { opacity: 0.95; }

#hud .bar {
  position: relative; width: 100%; height: 9px;
  background: #0c1424; border: 1px solid #2a3a55; overflow: hidden;
  clip-path: polygon(0 0, 100% 0, 100% 100%, 6px 100%, 0 calc(100% - 6px));
}
#hud .bar .fill { position: relative; height: 100%; transition: width 0.15s linear; }
/* Segment tick lines over every bar — the classic sci-fi cell-battery read
   instead of one smooth fill. Sits above the fill, so cells appear/disappear
   as the fill crosses each tick. */
#hud .bar::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(90deg, transparent 0px, transparent 9px, rgba(7,12,22,0.85) 9px, rgba(7,12,22,0.85) 11px);
}
#hud .bar .fill::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(100deg, transparent 20%, rgba(255,255,255,0.35) 45%, transparent 70%);
  background-size: 220% 100%;
  animation: hud-shine 3.2s linear infinite;
}
#hud .shield .fill { background: linear-gradient(90deg, #2e8fa8, #7fe6ff); box-shadow: 0 0 6px rgba(127,230,255,0.6); }
#hud .armor .fill { background: linear-gradient(90deg, #8a6a2a, #d9b56a); box-shadow: 0 0 6px rgba(217,181,106,0.5); }
#hud .hull .fill { background: linear-gradient(90deg, #7a2626, #c24a4a); box-shadow: 0 0 6px rgba(194,74,74,0.5); }
#hud .hull .fill.critical { animation: hud-critical-pulse 0.6s ease-in-out infinite; }

#hud .bar.velocity { position: relative; clip-path: none; }
#hud .bar.velocity .zero-marker { position: absolute; left: 50%; top: -2px; bottom: -2px; width: 1px; background: rgba(207,227,255,0.4); }
#hud .bar.velocity .fill { position: absolute; top: 0; background: linear-gradient(90deg, #3a8f5c, #7fe0a0); box-shadow: 0 0 6px rgba(127,224,160,0.5); }
#hud .bar.velocity .fill.reversing { background: linear-gradient(90deg, #8a6a2a, #d9b56a); box-shadow: 0 0 6px rgba(217,181,106,0.5); }

/* Kept at its original bottom-left spot per user request, independent of
   the status panel's move to top-left. */
#hud .hint {
  position: fixed; left: 16px; bottom: 16px;
  display: flex; flex-wrap: wrap; gap: 5px 10px; max-width: 320px;
}
#hud .hint .pair { display: flex; align-items: center; gap: 4px; opacity: 0.65; }
#hud .hint .key {
  font-size: 10px; padding: 1px 5px; border: 1px solid rgba(111,216,242,0.4);
  border-radius: 3px; color: #a8d8ea; background: rgba(111,216,242,0.08);
}
#hud .hint .label { font-size: 11px; }

/* Velocity gets its own bottom-center readout, separate from the shield/
   armor/hull status panel now up in the top-left corner. */
#hud .velocity-panel {
  position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
  width: 260px;
  padding: 8px 16px;
  background: linear-gradient(135deg, rgba(12,20,36,0.92), rgba(7,12,22,0.8));
  border: 1px solid rgba(111,216,242,0.45);
  box-shadow: 0 0 16px rgba(79,195,217,0.3), inset 0 0 22px rgba(79,195,217,0.06);
}

@keyframes hud-shine { 0% { background-position: 220% 0; } 100% { background-position: -20% 0; } }
@keyframes hud-critical-pulse {
  0%, 100% { box-shadow: 0 0 6px rgba(194,74,74,0.5); }
  50% { box-shadow: 0 0 16px 2px rgba(255,90,90,0.95); }
}

#radar { position: fixed; right: 16px; top: 16px; font-family: monospace; color: #cfe3ff; user-select: none; text-align: center; }
#radar canvas {
  background: radial-gradient(circle, rgba(10,22,34,0.85) 0%, rgba(6,12,22,0.9) 100%);
  border: 1px solid #6fd8f2;
  border-radius: 50%;
  box-shadow: 0 0 14px rgba(79,195,217,0.55), inset 0 0 18px rgba(79,195,217,0.2);
}
#radar .radar-label { margin-top: 5px; font-size: 11px; letter-spacing: 2px; opacity: 0.85; color: #7fe6ff; text-shadow: 0 0 6px rgba(79,195,217,0.8); }
`

// [key, label] pairs rather than one static string, so each key reads as a
// small bordered "keycap" chip instead of plain middot-separated text.
const HINTS = [
  ['Space', 'Flight Mode'],
  ['Tab', 'Target'],
  ['R', 'Mining Mode'],
  ['I', 'Inventory'],
  ['F', 'Dock'],
  ['P', 'Probe'],
  ['M', 'Navigation'],
  ['C', 'Supercruise'],
  ['Esc', 'Pause']
]

export function createHud(container) {
  const style = document.createElement('style')
  style.textContent = STYLE
  document.head.appendChild(style)

  const hud = document.createElement('div')
  hud.id = 'hud'
  hud.innerHTML = `
    <div class="scanlines"></div>
    <div class="cockpit-frame">
      <div class="corner tl"></div><div class="corner tr"></div>
      <div class="corner bl"></div><div class="corner br"></div>
    </div>
    <div class="status-panel">
      <div class="panel-title">SHIP STATUS</div>
      <div class="row shield">
        <div class="row-label"><span>Shield</span><span class="value"></span></div>
        <div class="bar"><div class="fill"></div></div>
      </div>
      <div class="row armor">
        <div class="row-label"><span>Armor</span><span class="value"></span></div>
        <div class="bar"><div class="fill"></div></div>
      </div>
      <div class="row hull">
        <div class="row-label"><span>Hull</span><span class="value"></span></div>
        <div class="bar"><div class="fill"></div></div>
      </div>
    </div>
    <div class="velocity-panel">
      <div class="row-label"><span>Velocity</span><span class="speed"></span></div>
      <div class="bar velocity"><div class="zero-marker"></div><div class="fill"></div></div>
    </div>
    <div class="hint">${HINTS.map(([key, label]) => `<span class="pair"><span class="key">${key}</span><span class="label">${label}</span></span>`).join('')}</div>
  `
  container.appendChild(hud)

  const radar = document.createElement('div')
  radar.id = 'radar'
  radar.innerHTML = `
    <canvas width="160" height="160"></canvas>
    <div class="radar-label">RADAR</div>
  `
  // Nested inside hud (position:fixed makes placement independent of parent)
  // so removing hud.element also cleans up the radar — no separate tracking.
  hud.appendChild(radar)
  const radarCanvas = radar.querySelector('canvas')
  const radarCtx = radarCanvas.getContext('2d')
  const radarSize = radarCanvas.width
  const radarCenter = radarSize / 2

  const CONTACT_COLORS = { hostile: '#e05a5a', neutral: '#5ee6ff', body: '#5a7a9a', waypoint: '#7fe0a0', wreck: '#ff8a3d' }
  // Below this fraction the hull bar pulses red as an urgent low-hull cue.
  const CRITICAL_HULL_FRACTION = 0.25

  const shieldFill = hud.querySelector('.shield .fill')
  const armorFill = hud.querySelector('.armor .fill')
  const hullFill = hud.querySelector('.hull .fill')
  const shieldValue = hud.querySelector('.shield .value')
  const armorValue = hud.querySelector('.armor .value')
  const hullValue = hud.querySelector('.hull .value')
  const velocityFill = hud.querySelector('.velocity .fill')
  const speedEl = hud.querySelector('.speed')

  function pct(value, max) {
    return Math.max(0, Math.min(100, (value / max) * 100))
  }

  return {
    // forwardSpeed is signed (negative while reversing), unlike speed which
    // is the overall (unsigned) velocity magnitude shown in the text readout.
    update(shipState, shipClass, speed, forwardSpeed) {
      const shieldPct = pct(shipState.shields, shipClass.stats.shields)
      const armorPct = pct(shipState.armor, shipClass.stats.armor)
      const hullPct = pct(shipState.hull, shipClass.stats.hull)
      shieldFill.style.width = `${shieldPct}%`
      armorFill.style.width = `${armorPct}%`
      hullFill.style.width = `${hullPct}%`
      hullFill.classList.toggle('critical', hullPct / 100 < CRITICAL_HULL_FRACTION)
      shieldValue.textContent = `${shieldPct.toFixed(0)}%`
      armorValue.textContent = `${armorPct.toFixed(0)}%`
      hullValue.textContent = `${hullPct.toFixed(0)}%`

      const frac = Math.max(-1, Math.min(1, forwardSpeed / shipClass.stats.speed))
      velocityFill.classList.toggle('reversing', frac < 0)
      velocityFill.style.left = `${50 + Math.min(0, frac) * 50}%`
      velocityFill.style.width = `${Math.abs(frac) * 50}%`

      speedEl.textContent = `${speed.toFixed(0)} m/s`
    },
    // contacts: [{ x, z, kind }], already transformed into ship-local space
    // (x = right, z = forward) and pre-filtered to radar range by the caller.
    // elapsed drives the rotating sweep — gameState.simTime, never wall-clock.
    updateRadar(contacts, range, elapsed = 0) {
      radarCtx.clearRect(0, 0, radarSize, radarSize)

      // Range rings + crosshair, brighter than before so the grid itself reads.
      radarCtx.strokeStyle = 'rgba(127,230,255,0.3)'
      radarCtx.lineWidth = 1
      for (const frac of [0.5, 0.95]) {
        radarCtx.beginPath()
        radarCtx.arc(radarCenter, radarCenter, radarCenter * frac, 0, Math.PI * 2)
        radarCtx.stroke()
      }

      // Bearing tick marks around the rim, every 15deg (longer every 45) —
      // reads as a proper sensor dial rather than a bare circle.
      radarCtx.strokeStyle = 'rgba(127,230,255,0.45)'
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2
        const len = i % 3 === 0 ? 6 : 3
        radarCtx.beginPath()
        radarCtx.moveTo(radarCenter + Math.cos(a) * (radarCenter - 1), radarCenter + Math.sin(a) * (radarCenter - 1))
        radarCtx.lineTo(radarCenter + Math.cos(a) * (radarCenter - 1 - len), radarCenter + Math.sin(a) * (radarCenter - 1 - len))
        radarCtx.stroke()
      }
      radarCtx.beginPath()
      radarCtx.moveTo(radarCenter, 4)
      radarCtx.lineTo(radarCenter, radarSize - 4)
      radarCtx.moveTo(4, radarCenter)
      radarCtx.lineTo(radarSize - 4, radarCenter)
      radarCtx.stroke()

      // Rotating sweep wedge — the classic radar "scan" cue.
      const sweepAngle = elapsed * 1.6
      const sweepGradient = radarCtx.createConicGradient?.(sweepAngle - Math.PI / 2, radarCenter, radarCenter)
      radarCtx.save()
      radarCtx.beginPath()
      radarCtx.moveTo(radarCenter, radarCenter)
      radarCtx.arc(radarCenter, radarCenter, radarCenter, sweepAngle - 0.6, sweepAngle)
      radarCtx.closePath()
      if (sweepGradient) {
        sweepGradient.addColorStop(0, 'rgba(127,230,255,0)')
        sweepGradient.addColorStop(1, 'rgba(127,230,255,0.35)')
        radarCtx.fillStyle = sweepGradient
      } else {
        radarCtx.fillStyle = 'rgba(127,230,255,0.2)'
      }
      radarCtx.fill()
      radarCtx.restore()

      radarCtx.fillStyle = '#eaffff'
      radarCtx.shadowColor = '#7fe6ff'
      radarCtx.shadowBlur = 6
      radarCtx.beginPath()
      radarCtx.arc(radarCenter, radarCenter, 2.5, 0, Math.PI * 2)
      radarCtx.fill()

      const scale = (radarCenter - 8) / range
      for (const contact of contacts) {
        const px = radarCenter + contact.x * scale
        const py = radarCenter - contact.z * scale
        const color = CONTACT_COLORS[contact.kind] ?? CONTACT_COLORS.body
        const pulse = contact.kind === 'hostile' ? 1 + 0.35 * Math.sin(elapsed * 8) : 1
        radarCtx.fillStyle = color
        radarCtx.shadowColor = color
        radarCtx.shadowBlur = 8
        radarCtx.beginPath()
        radarCtx.arc(px, py, (contact.kind === 'hostile' ? 3.5 : 2.5) * pulse, 0, Math.PI * 2)
        radarCtx.fill()
      }
      radarCtx.shadowBlur = 0
    },
    element: hud
  }
}
