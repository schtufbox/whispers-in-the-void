/**
 * Shared Settings panel markup + wiring for main menu and pause menu.
 * Display mode + sound on/off; preferences persist as launch defaults.
 */
import * as audio from '../audio.js'
import { loadSoundPreference, persistSoundEnabled } from '../preferences.js'

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
      <div class="settings-label">Display</div>
      <div class="settings-btns">
        <button type="button" class="mode-borderless" data-mode="borderless">Fullscreen<br/>(borderless)</button>
        <button type="button" class="mode-windowed" data-mode="windowed">Windowed</button>
      </div>
      <p class="settings-note">Alt+Enter also toggles. Saved as your default.</p>
    </div>
    <div class="settings-section">
      <div class="settings-label">Sound</div>
      <div class="settings-btns">
        <button type="button" class="sound-on" data-sound="on">On</button>
        <button type="button" class="sound-off" data-sound="off">Off</button>
      </div>
      <p class="settings-note">Music, effects, and voice. Saved as your default.</p>
    </div>
    <button type="button" class="settings-back">Back</button>
  `
}

/**
 * Wire display + sound controls inside a settings view root.
 * @param {HTMLElement} rootEl element containing the settings HTML
 * @param {{ onBack: () => void }} opts
 * @returns {{ refresh: () => Promise<void> }}
 */
export function bindSettingsView(rootEl, { onBack }) {
  const btnBorderless = rootEl.querySelector('.mode-borderless')
  const btnWindowed = rootEl.querySelector('.mode-windowed')
  const btnSoundOn = rootEl.querySelector('.sound-on')
  const btnSoundOff = rootEl.querySelector('.sound-off')

  function refreshSoundButtons() {
    const on = audio.isSoundEnabled()
    btnSoundOn.classList.toggle('active', on)
    btnSoundOff.classList.toggle('active', !on)
  }

  async function refreshDisplayButtons() {
    let mode = 'borderless'
    try {
      mode = (await window.electronAPI?.getDisplayMode?.()) || 'borderless'
    } catch {
      /* */
    }
    btnBorderless.classList.toggle('active', mode === 'borderless')
    btnWindowed.classList.toggle('active', mode === 'windowed')
  }

  async function refresh() {
    // Re-load from disk so the UI matches saved defaults (not just session state).
    await loadSoundPreference()
    await refreshDisplayButtons()
    refreshSoundButtons()
  }

  async function setMode(mode) {
    try {
      // Main process writes displayMode to userData/settings.json.
      await window.electronAPI?.setDisplayMode?.(mode)
    } catch (err) {
      console.error('setDisplayMode failed', err)
    }
    refreshDisplayButtons()
  }

  async function setSound(enabled) {
    await persistSoundEnabled(enabled)
    refreshSoundButtons()
  }

  btnBorderless.addEventListener('click', () => setMode('borderless'))
  btnWindowed.addEventListener('click', () => setMode('windowed'))
  btnSoundOn.addEventListener('click', () => setSound(true))
  btnSoundOff.addEventListener('click', () => setSound(false))
  rootEl.querySelector('.settings-back').addEventListener('click', () => onBack())

  if (typeof window.electronAPI?.onDisplayModeChanged === 'function') {
    window.electronAPI.onDisplayModeChanged(() => refreshDisplayButtons())
  }

  return { refresh }
}
