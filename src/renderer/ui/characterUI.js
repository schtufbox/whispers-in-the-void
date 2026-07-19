import { getShipClass } from '../data/shipClasses.js'
import { accessorySlotCount, effectiveMiningCapacity } from '../data/accessories.js'
import { droneBayCount } from '../data/drones.js'
import { ensureLawStanding, MAX_LAW_STANDING } from '../game/security.js'
import { SKILLS, MAX_SKILL_LEVEL, ensureSkills, skillLevel } from '../game/skills.js'
import { escapeHtml } from './escapeHtml.js'
import { isPortraitImageFile, resizeImageToDataUrl } from './portrait.js'

const SHIP_STAT_ROWS = [
  ['hull', 'Hull'],
  ['shields', 'Shields'],
  ['armor', 'Armour'],
  ['cargoCapacity', 'Cargo'],
  ['miningCapacity', 'Mining'],
  ['speed', 'Speed'],
  ['turnRate', 'Turn'],
  ['accel', 'Accel']
]

const STYLE = `
#character-ui {
  position: fixed; inset: 0; background: rgba(4,6,12,0.78); backdrop-filter: blur(3px);
  font-family: monospace; color: #cfe3ff; display: none;
  align-items: flex-start; justify-content: center; z-index: 55;
  padding-top: 90px; box-sizing: border-box;
}
#character-ui .panel {
  position: relative;
  width: min(640px, 94vw); max-height: calc(100vh - 110px); overflow-y: auto;
  padding: 20px 22px 18px;
  background: linear-gradient(135deg, rgba(12,20,36,0.96), rgba(7,12,22,0.92));
  border: 1px solid rgba(111,216,242,0.42); border-left: 3px solid #6fd8f2;
  box-shadow: 0 0 28px rgba(79,195,217,0.22), inset 0 0 28px rgba(79,195,217,0.05);
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%);
}
#character-ui .layout {
  display: grid;
  grid-template-columns: 168px 1fr;
  gap: 20px 24px;
  align-items: start;
}
@media (max-width: 560px) {
  #character-ui .layout { grid-template-columns: 1fr; }
  #character-ui .identity { align-items: center; }
  #character-ui .portrait-actions { width: 160px; }
}
#character-ui .identity {
  display: flex; flex-direction: column; align-items: flex-start; gap: 10px;
}
#character-ui .portrait-frame {
  width: 160px; height: 160px;
  border: 1px solid rgba(111,216,242,0.5);
  box-shadow: 0 0 16px rgba(79,195,217,0.3), inset 0 0 14px rgba(0,0,0,0.4);
  background: rgba(8,12,22,0.9);
  overflow: hidden; position: relative;
  clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
}
#character-ui .portrait-frame img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
#character-ui .portrait-frame .placeholder {
  width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
  font-size: 52px; color: #4a6a88; letter-spacing: 0;
}
#character-ui .portrait-actions {
  display: flex; flex-direction: column; gap: 5px; width: 160px;
}
#character-ui .portrait-actions button,
#character-ui button.upload-btn {
  background: rgba(79,195,217,0.1); border: 1px solid rgba(111,216,242,0.4);
  color: #b8e8f8; padding: 5px 8px; cursor: pointer; font-family: monospace;
  font-size: 10px; letter-spacing: 0.5px; width: 100%;
}
#character-ui .portrait-actions button:hover,
#character-ui button.upload-btn:hover {
  background: rgba(79,195,217,0.2); box-shadow: 0 0 10px rgba(79,195,217,0.3);
}
#character-ui .portrait-actions button.danger {
  border-color: rgba(224,90,90,0.45); color: #ffb3b3; background: rgba(224,90,90,0.08);
}
#character-ui .stats {
  display: flex; flex-direction: column; gap: 10px; min-width: 0;
}
#character-ui .stat-row {
  display: flex; flex-direction: column; gap: 5px;
  padding: 10px 12px;
  background: rgba(8,12,22,0.55); border: 1px solid rgba(111,216,242,0.2);
  border-left: 2px solid rgba(111,216,242,0.45);
}
#character-ui .stat-row.inline {
  flex-direction: row; justify-content: space-between; align-items: baseline;
}
#character-ui .stat-row .label {
  font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #7fa8c9;
}
#character-ui .stat-row .value {
  font-size: 14px; color: #eaffff; letter-spacing: 0.5px; text-align: right;
}
#character-ui .stat-row .value.credits { color: #ffe08a; text-shadow: 0 0 8px rgba(255,210,70,0.35); }
#character-ui .stat-row .value.law-good { color: #7fe0a0; }
#character-ui .stat-row .value.law-mid { color: #ffe08a; }
#character-ui .stat-row .value.law-bad { color: #ff8a7a; text-shadow: 0 0 8px rgba(224,90,90,0.4); }
#character-ui .stat-row .ship-class {
  font-size: 11px; color: #8fb3d9; opacity: 0.85; margin-top: 2px;
}
#character-ui .name-field {
  display: flex; gap: 8px; align-items: center; width: 100%;
}
#character-ui .name-field input {
  flex: 1; min-width: 0;
  background: rgba(6,10,18,0.9); border: 1px solid rgba(111,216,242,0.35);
  color: #eaffff; font-family: monospace; font-size: 13px; letter-spacing: 0.5px;
  padding: 6px 10px; outline: none;
}
#character-ui .name-field input:focus {
  border-color: rgba(127,230,255,0.7); box-shadow: 0 0 10px rgba(79,195,217,0.25);
}
#character-ui .name-field button.apply {
  flex-shrink: 0;
  background: rgba(127,224,160,0.12); border: 1px solid rgba(127,224,160,0.5); color: #bdf5cf;
  padding: 6px 12px; cursor: pointer; font-family: monospace; font-size: 11px; letter-spacing: 1px;
}
#character-ui .name-field button.apply:hover {
  background: rgba(127,224,160,0.22); box-shadow: 0 0 10px rgba(127,224,160,0.3);
}
#character-ui .name-field button.apply:disabled {
  opacity: 0.4; cursor: not-allowed; box-shadow: none;
}
#character-ui .rename-msg {
  font-size: 10px; letter-spacing: 0.5px; min-height: 14px; margin-top: 2px;
}
#character-ui .rename-msg.ok { color: #7fe0a0; }
#character-ui .rename-msg.err { color: #ff9a7a; }
#character-ui .footer {
  margin-top: 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px;
}
#character-ui .hint { font-size: 11px; opacity: 0.55; letter-spacing: 0.5px; }
#character-ui button.close {
  background: rgba(224,90,90,0.12); border: 1px solid rgba(224,90,90,0.5); color: #ffb3b3;
  padding: 7px 16px; cursor: pointer; font-family: monospace; letter-spacing: 1px;
}
#character-ui button.close:hover { background: rgba(224,90,90,0.22); box-shadow: 0 0 12px rgba(224,90,90,0.35); }
#character-ui input[type=file] { display: none; }
#character-ui .upload-err {
  font-size: 10px; color: #ff9a7a; max-width: 160px; text-align: center; margin-top: 2px;
}
/* Ship stats under portrait — compact read of current hull */
#character-ui .ship-stats-panel {
  width: 160px; box-sizing: border-box;
  margin-top: 4px; padding: 8px 8px 7px;
  background: rgba(8,12,22,0.55);
  border: 1px solid rgba(111,216,242,0.22);
  border-left: 2px solid rgba(111,216,242,0.5);
}
#character-ui .ship-stats-panel .ss-title {
  font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase;
  color: #7fe6ff; opacity: 0.9; margin: 0 0 6px;
  text-shadow: 0 0 6px rgba(79,195,217,0.4);
}
#character-ui .ship-stats-panel .ss-name {
  font-size: 11px; color: #eaffff; letter-spacing: 0.3px;
  margin: 0 0 2px; line-height: 1.25;
  word-break: break-word;
}
#character-ui .ship-stats-panel .ss-class {
  font-size: 10px; color: #8fb3d9; opacity: 0.85; margin: 0 0 7px;
}
#character-ui .ship-stats-panel .ss-row {
  display: flex; justify-content: space-between; align-items: baseline;
  gap: 6px; font-size: 10px; line-height: 1.45;
  border-bottom: 1px solid rgba(42,58,85,0.35);
  padding: 1px 0;
}
#character-ui .ship-stats-panel .ss-row:last-child { border-bottom: none; }
#character-ui .ship-stats-panel .ss-row .ss-label {
  color: #7fa8c9; letter-spacing: 0.4px; text-transform: uppercase; font-size: 9px;
}
#character-ui .ship-stats-panel .ss-row .ss-val {
  color: #cfe3ff; text-align: right; white-space: nowrap;
}
#character-ui .ship-stats-panel .ss-section {
  margin-top: 6px; padding-top: 5px;
  border-top: 1px solid rgba(111,216,242,0.2);
  font-size: 9px; letter-spacing: 1.2px; text-transform: uppercase;
  color: #7fe6ff; opacity: 0.85; margin-bottom: 3px;
}
`

const NAME_MAX_LEN = 32

function lawClass(standing) {
  if (standing <= 2) return 'law-bad'
  if (standing < 5) return 'law-mid'
  return 'law-good'
}

/** Sanitize a display name; returns null if empty after trim. */
function sanitizeName(raw) {
  const s = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, NAME_MAX_LEN)
  return s.length ? s : null
}

export function createCharacterUI(container, gameState) {
  const style = document.createElement('style')
  style.textContent = STYLE
  document.head.appendChild(style)

  const root = document.createElement('div')
  root.id = 'character-ui'
  root.innerHTML = `
    <div class="panel">
      <div class="layout">
        <div class="identity">
          <div class="portrait-frame">
            <div class="placeholder">?</div>
          </div>
          <div class="portrait-actions">
            <button type="button" class="upload-btn">Upload photo</button>
            <button type="button" class="clear-btn danger" style="display:none">Clear</button>
          </div>
          <input type="file" class="file-input" accept="image/png,image/jpeg,image/jpg,.png,.jpg,.jpeg" />
          <div class="ship-stats-panel" aria-label="Current ship stats"></div>
        </div>
        <div class="stats">
          <div class="stat-row">
            <span class="label">Pilot name</span>
            <div class="name-field">
              <input type="text" class="char-name-input" maxlength="${NAME_MAX_LEN}" spellcheck="false" autocomplete="off" />
              <button type="button" class="apply apply-char">Rename</button>
            </div>
            <div class="rename-msg char-rename-msg"></div>
          </div>
          <div class="stat-row">
            <span class="label">Ship name</span>
            <div class="name-field">
              <input type="text" class="ship-name-input" maxlength="${NAME_MAX_LEN}" spellcheck="false" autocomplete="off" />
              <button type="button" class="apply apply-ship">Rename</button>
            </div>
            <div class="ship-class ship-class-label"></div>
            <div class="rename-msg ship-rename-msg"></div>
          </div>
          <div class="stat-row inline">
            <span class="label">Credits</span>
            <span class="value credits">0 cr</span>
          </div>
          <div class="stat-row inline">
            <span class="label">Security standing</span>
            <span class="value law-value">10 / 10</span>
          </div>
          <div class="stat-row inline law-hint-row" style="display:none">
            <span class="label">Status</span>
            <span class="value law-status" style="font-size:12px"></span>
          </div>
          <div class="stat-row skills-block">
            <span class="label">Skills</span>
            <div class="skills-list" style="font-size:11px;line-height:1.45;margin-top:4px;color:#b8d4e8"></div>
            <div style="font-size:10px;opacity:0.55;margin-top:6px">Read skillbooks from Inventory → Skillbooks. Max ${MAX_SKILL_LEVEL} each.</div>
          </div>
        </div>
      </div>
      <div class="footer">
        <span class="hint">Kill pirates to rebuild standing · F1 / Esc to close</span>
        <button type="button" class="close">Close</button>
      </div>
    </div>
  `
  container.appendChild(root)

  const portraitFrame = root.querySelector('.portrait-frame')
  const fileInput = root.querySelector('.file-input')
  const uploadBtn = root.querySelector('.upload-btn')
  const clearBtn = root.querySelector('.clear-btn')
  const closeBtn = root.querySelector('.close')
  const identityCol = root.querySelector('.identity')
  const charNameInput = root.querySelector('.char-name-input')
  const shipNameInput = root.querySelector('.ship-name-input')
  const applyCharBtn = root.querySelector('.apply-char')
  const applyShipBtn = root.querySelector('.apply-ship')
  const charRenameMsg = root.querySelector('.char-rename-msg')
  const shipRenameMsg = root.querySelector('.ship-rename-msg')
  const shipClassLabel = root.querySelector('.ship-class-label')
  // Cache nodes once — refresh must not depend on class names that get restyled.
  const lawValueEl = root.querySelector('.law-value')
  const lawStatusEl = root.querySelector('.law-status')
  const creditsEl = root.querySelector('.credits')
  const lawHintRow = root.querySelector('.law-hint-row')
  const skillsListEl = root.querySelector('.skills-list')
  const shipStatsPanel = root.querySelector('.ship-stats-panel')

  let onClose = null

  function flashMsg(el, text, ok, timerRef) {
    el.textContent = text
    el.className = `rename-msg ${ok ? 'ok' : 'err'}`
    clearTimeout(timerRef.id)
    timerRef.id = setTimeout(() => {
      el.textContent = ''
      el.className = 'rename-msg'
    }, 2200)
  }
  const charTimer = { id: 0 }
  const shipTimer = { id: 0 }

  function renderPortrait() {
    const url = gameState.player.portraitDataUrl
    if (url) {
      portraitFrame.innerHTML = `<img alt="Pilot portrait" src="${url}" />`
      clearBtn.style.display = 'block'
    } else {
      const initial = (gameState.player.name || '?').trim().charAt(0).toUpperCase() || '?'
      portraitFrame.innerHTML = `<div class="placeholder">${escapeHtml(initial)}</div>`
      clearBtn.style.display = 'none'
    }
  }

  function refreshStats() {
    ensureLawStanding(gameState)
    ensureSkills(gameState)
    const shipClass = getShipClass(gameState.player.ship.classId)
    const law = gameState.player.lawStanding

    // Don't clobber name fields while the player is typing.
    if (document.activeElement !== charNameInput) {
      charNameInput.value = gameState.player.name || ''
    }
    if (document.activeElement !== shipNameInput) {
      shipNameInput.value = gameState.player.ship.instanceName || ''
    }
    shipClassLabel.textContent = shipClass?.name ? `Hull: ${shipClass.name}` : ''

    if (creditsEl) {
      creditsEl.textContent =
        `${Math.floor(gameState.player.credits || 0).toLocaleString()} cr`
    }
    if (lawValueEl) {
      lawValueEl.textContent = `${law} / ${MAX_LAW_STANDING}`
      lawValueEl.classList.remove('law-good', 'law-mid', 'law-bad')
      lawValueEl.classList.add(lawClass(law))
    }

    let status = ''
    if (law <= 0) status = 'Outlaw — shoot-on-sight (Sec 3–6) + all police'
    else if (law <= 2) status = 'Wanted — police engage on sight (Sec 1–6)'
    else if (law < 5) status = 'Stations in Sec 3–6 refuse docking'
    if (status && lawHintRow && lawStatusEl) {
      lawHintRow.style.display = 'flex'
      lawStatusEl.textContent = status
      lawStatusEl.classList.remove('law-good', 'law-mid', 'law-bad')
      lawStatusEl.classList.add(lawClass(law))
    } else if (lawHintRow) {
      lawHintRow.style.display = 'none'
    }

    if (skillsListEl) {
      const books = gameState.player.ship.skillbooks ?? {}
      skillsListEl.innerHTML = SKILLS.map((s) => {
        const lv = skillLevel(gameState.player.skills, s.id)
        const b = books[s.id] ?? 0
        const bookBit = b > 0 ? ` · <span style="color:#ffe08a">${b} book${b > 1 ? 's' : ''}</span>` : ''
        return `<div>${escapeHtml(s.name)}: <strong style="color:#eaffff">${lv}</strong>/${MAX_SKILL_LEVEL}${bookBit}</div>`
      }).join('')
    }

    if (shipStatsPanel && shipClass) {
      const ship = gameState.player.ship
      const hps = Array.isArray(shipClass.hardpoints) ? shipClass.hardpoints : []
      let turrets = 0
      let launchers = 0
      for (const hp of hps) {
        if (hp?.type === 'missile') launchers++
        else turrets++
      }
      const accSlots = accessorySlotCount(shipClass)
      const droneBays = droneBayCount(shipClass)
      const role = shipClass.role
        ? String(shipClass.role).charAt(0).toUpperCase() + String(shipClass.role).slice(1)
        : '—'
      const statLines = SHIP_STAT_ROWS.map(([key, label]) => {
        let val = shipClass.stats[key]
        if (key === 'miningCapacity') {
          const live = effectiveMiningCapacity(ship, shipClass)
          const base = shipClass.stats.miningCapacity
          val = live !== base ? `${live}` : String(base)
        } else if (key === 'turnRate') {
          val = Number(val).toFixed(2)
        } else {
          val = String(val ?? '—')
        }
        // Live hull/shields/armour from the ship when damaged.
        if (key === 'hull' || key === 'shields' || key === 'armor') {
          const cur = Math.round(Number(ship[key]) || 0)
          const max = Math.round(Number(shipClass.stats[key]) || 0)
          val = `${cur}/${max}`
        }
        return `<div class="ss-row"><span class="ss-label">${label}</span><span class="ss-val">${escapeHtml(val)}</span></div>`
      }).join('')

      const hpSummary =
        hps.length > 0
          ? `${hps.length} (${turrets}T${launchers ? ` ${launchers}L` : ''})`
          : '0'
      // Custom instance name → show that alone; otherwise model only (not both).
      const modelName = shipClass.name || '—'
      const instanceName = String(ship.instanceName ?? '').trim()
      const hasCustomName = instanceName.length > 0 && instanceName !== modelName
      const displayName = hasCustomName ? instanceName : modelName
      shipStatsPanel.innerHTML = `
        <div class="ss-title">Ship stats</div>
        <div class="ss-name">${escapeHtml(displayName)}</div>
        <div class="ss-class">${escapeHtml(role)}</div>
        ${statLines}
        <div class="ss-section">Fit</div>
        <div class="ss-row"><span class="ss-label">Hardpoints</span><span class="ss-val">${escapeHtml(hpSummary)}</span></div>
        <div class="ss-row"><span class="ss-label">Accessories</span><span class="ss-val">${accSlots}</span></div>
        ${droneBays > 0
          ? `<div class="ss-row"><span class="ss-label">Drone bays</span><span class="ss-val">${droneBays}</span></div>`
          : ''}
      `
    } else if (shipStatsPanel) {
      shipStatsPanel.innerHTML = '<div class="ss-title">Ship stats</div><div class="ss-class">Unknown hull</div>'
    }
  }

  function applyCharacterName() {
    const next = sanitizeName(charNameInput.value)
    if (!next) {
      flashMsg(charRenameMsg, 'Enter a name', false, charTimer)
      charNameInput.value = gameState.player.name || ''
      return
    }
    gameState.player.name = next
    charNameInput.value = next
    renderPortrait()
    flashMsg(charRenameMsg, 'Pilot renamed', true, charTimer)
  }

  function applyShipName() {
    const next = sanitizeName(shipNameInput.value)
    if (!next) {
      flashMsg(shipRenameMsg, 'Enter a name', false, shipTimer)
      shipNameInput.value = gameState.player.ship.instanceName || ''
      return
    }
    gameState.player.ship.instanceName = next
    shipNameInput.value = next
    flashMsg(shipRenameMsg, 'Ship renamed', true, shipTimer)
  }

  applyCharBtn.addEventListener('click', applyCharacterName)
  applyShipBtn.addEventListener('click', applyShipName)
  charNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      applyCharacterName()
    }
  })
  shipNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      applyShipName()
    }
  })

  uploadBtn.addEventListener('click', () => fileInput.click())
  clearBtn.addEventListener('click', () => {
    gameState.player.portraitDataUrl = null
    renderPortrait()
  })
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (!file) return
    if (!isPortraitImageFile(file)) {
      statusNotice('Use a PNG or JPG image')
      return
    }
    try {
      gameState.player.portraitDataUrl = await resizeImageToDataUrl(file)
      renderPortrait()
    } catch {
      statusNotice('Could not load that image')
    }
  })

  function statusNotice(msg) {
    identityCol.querySelector('.upload-err')?.remove()
    const el = document.createElement('div')
    el.className = 'upload-err'
    el.textContent = msg
    identityCol.appendChild(el)
    setTimeout(() => el.remove(), 2500)
  }

  /**
   * @param {{ silent?: boolean }} [opts] silent skips onClose (caller owns state).
   */
  function hide(opts = {}) {
    root.style.display = 'none'
    if (opts.silent) {
      onClose = null
      return
    }
    const cb = onClose
    onClose = null
    cb?.()
  }

  closeBtn.addEventListener('click', () => hide())
  root.addEventListener('click', (e) => {
    if (e.target === root) hide()
  })

  return {
    element: root,
    show(closeCb) {
      onClose = closeCb ?? null
      root.style.display = 'flex'
      try {
        refreshStats()
        renderPortrait()
      } catch (err) {
        console.error('Character screen content failed:', err)
      }
    },
    hide,
    isOpen() {
      return root.style.display === 'flex'
    },
    refresh() {
      if (root.style.display === 'flex') {
        refreshStats()
        renderPortrait()
      }
    }
  }
}
