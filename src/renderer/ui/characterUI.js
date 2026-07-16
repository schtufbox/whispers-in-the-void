import { getShipClass } from '../data/shipClasses.js'
import { ensureLawStanding, MAX_LAW_STANDING } from '../game/security.js'
import { escapeHtml } from './escapeHtml.js'

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
`

const PORTRAIT_MAX_PX = 384
const NAME_MAX_LEN = 32

function resizeImageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const size = PORTRAIT_MAX_PX
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        const sw = img.naturalWidth || img.width
        const sh = img.naturalHeight || img.height
        const scale = Math.max(size / sw, size / sh)
        const dw = sw * scale
        const dh = sh * scale
        ctx.fillStyle = '#0a1018'
        ctx.fillRect(0, 0, size, size)
        ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
        URL.revokeObjectURL(url)
        resolve(dataUrl)
      } catch (err) {
        URL.revokeObjectURL(url)
        reject(err)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not load image'))
    }
    img.src = url
  })
}

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
    const okType =
      /image\/(png|jpeg|jpg)/i.test(file.type) ||
      /\.(png|jpe?g)$/i.test(file.name || '')
    if (!okType) {
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
