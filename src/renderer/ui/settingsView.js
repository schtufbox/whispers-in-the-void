/**
 * Shared Settings panel for main menu and pause menu.
 * Separate SFX and music toggles; window size is remembered by the main process.
 */
import * as audio from '../audio.js'
import {
  loadSoundPreference,
  persistSfxEnabled,
  persistMusicEnabled
} from '../preferences.js'

/** Shared styles — scope with a parent id (#pause-menu / #main-menu). */
export const SETTINGS_VIEW_CSS = `
.settings-view .settings-section {
  display: flex; flex-direction: column; gap: 6px; margin: 4px 0 8px;
  padding: 10px 0 4px; border-top: 1px solid rgba(111,216,242,0.2);
}
.settings-view .settings-section:first-of-type { border-top: none; padding-top: 0; }
.settings-view .settings-label {
  font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #7fe6ff; opacity: 0.8;
  text-align: center;
}
.settings-view .settings-btns { display: flex; gap: 6px; }
.settings-view .settings-btns button {
  flex: 1; padding: 8px 6px; font-size: 11px; letter-spacing: 0.5px;
}
.settings-view .settings-btns button.active {
  background: rgba(111,216,242,0.28); border-color: #6fd8f2;
  box-shadow: 0 0 12px rgba(79,195,217,0.35); color: #eaffff;
}
.settings-view .settings-note {
  font-size: 10px; opacity: 0.55; text-align: center; line-height: 1.35; margin: 0;
}
`

export function settingsViewHTML() {
  return `
    <h2>Settings</h2>
    <div class="settings-section">
      <div class="settings-label">Sound Effects</div>
      <div class="settings-btns">
        <button type="button" class="sfx-on">On</button>
        <button type="button" class="sfx-off">Off</button>
      </div>
      <p class="settings-note">Weapons, thrusters, docks, and voice callouts.</p>
    </div>
    <div class="settings-section">
      <div class="settings-label">Music</div>
      <div class="settings-btns">
        <button type="button" class="music-on">On</button>
        <button type="button" class="music-off">Off</button>
      </div>
      <p class="settings-note">Title, ambient, and death tracks. Saved as defaults.</p>
    </div>
    <div class="settings-section">
      <div class="settings-label">Help</div>
      <button type="button" class="settings-controls">Controls</button>
      <p class="settings-note">Keyboard and mouse bindings.</p>
    </div>
    <button type="button" class="settings-back">Back</button>
  `
}

/**
 * Wire SFX + music controls inside a settings view root.
 * @param {HTMLElement} rootEl
 * @param {{ onBack: () => void, onShowControls?: () => void }} opts
 * @returns {{ refresh: () => Promise<void> }}
 */
export function bindSettingsView(rootEl, { onBack, onShowControls } = {}) {
  const btnSfxOn = rootEl.querySelector('.sfx-on')
  const btnSfxOff = rootEl.querySelector('.sfx-off')
  const btnMusicOn = rootEl.querySelector('.music-on')
  const btnMusicOff = rootEl.querySelector('.music-off')
  const btnControls = rootEl.querySelector('.settings-controls')

  function refreshButtons() {
    const sfx = audio.isSfxEnabled()
    const music = audio.isMusicEnabled()
    btnSfxOn.classList.toggle('active', sfx)
    btnSfxOff.classList.toggle('active', !sfx)
    btnMusicOn.classList.toggle('active', music)
    btnMusicOff.classList.toggle('active', !music)
  }

  async function refresh() {
    await loadSoundPreference()
    refreshButtons()
  }

  btnSfxOn.addEventListener('click', async () => {
    await persistSfxEnabled(true)
    refreshButtons()
  })
  btnSfxOff.addEventListener('click', async () => {
    await persistSfxEnabled(false)
    refreshButtons()
  })
  btnMusicOn.addEventListener('click', async () => {
    await persistMusicEnabled(true)
    refreshButtons()
  })
  btnMusicOff.addEventListener('click', async () => {
    await persistMusicEnabled(false)
    refreshButtons()
  })
  btnControls?.addEventListener('click', () => {
    if (onShowControls) onShowControls()
  })
  rootEl.querySelector('.settings-back').addEventListener('click', () => onBack())

  return { refresh }
}
