const CONTROLS = [
  ['Space', 'Toggle flight mode (mouse aim)'],
  ['Mouse', 'Aim / pitch & yaw (in flight mode)'],
  ['LMB', 'Fire lasers'],
  ['RMB', 'Fire missiles'],
  ['W / S', 'Throttle forward / reverse'],
  ['A / D', 'Strafe left / right'],
  ['X / Z', 'Strafe up / down'],
  ['Q / E', 'Roll'],
  ['Tab', 'Acquire / cycle target'],
  ['Shift+Tab', 'Clear target'],
  ['Ctrl+Tab', 'Set waypoint on body under crosshair'],
  ['C', 'Supercruise (requires waypoint)'],
  ['M', 'Navigation map / hyperspace'],
  ['F', 'Dock / loot wreck'],
  ['P', 'Launch probe'],
  ['I', 'Inventory'],
  ['J', 'Missions'],
  ['Esc', 'Pause'],
  ['Alt+Enter', 'Toggle fullscreen']
]

const STYLE = `
/* Above docking chrome (z 50–55) so pause works while docked. */
#pause-menu { position: fixed; inset: 0; background: rgba(4, 6, 12, 0.75); backdrop-filter: blur(2px); font-family: monospace; color: #cfe3ff; display: none; align-items: center; justify-content: center; z-index: 60; }
#pause-menu .panel {
  display: flex; flex-direction: column; gap: 10px; width: 300px; padding: 26px 28px;
  background: linear-gradient(135deg, rgba(12,20,36,0.95), rgba(7,12,22,0.9));
  border: 1px solid rgba(111,216,242,0.4); border-left: 3px solid #6fd8f2;
  box-shadow: 0 0 30px rgba(79,195,217,0.25), inset 0 0 26px rgba(79,195,217,0.05);
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%);
}
#pause-menu .panel.controls-view { width: min(440px, 92vw); max-height: min(80vh, 640px); }
#pause-menu h2 { margin: 0 0 14px 0; text-align: center; font-weight: normal; letter-spacing: 4px; text-transform: uppercase; color: #7fe6ff; text-shadow: 0 0 10px rgba(79,195,217,0.7); }
#pause-menu button {
  background: rgba(111,216,242,0.1); border: 1px solid rgba(111,216,242,0.4); color: #cfe3ff;
  padding: 11px; cursor: pointer; font-family: monospace; letter-spacing: 1px;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}
#pause-menu button:hover { background: rgba(111,216,242,0.22); box-shadow: 0 0 14px rgba(79,195,217,0.35); }
#pause-menu button.quit { background: rgba(224,90,90,0.12); border-color: rgba(224,90,90,0.5); color: #ffb3b3; }
#pause-menu button.quit:hover { background: rgba(224,90,90,0.22); box-shadow: 0 0 14px rgba(224,90,90,0.35); }
#pause-menu .controls-list {
  display: flex; flex-direction: column; gap: 6px;
  overflow-y: auto; max-height: min(52vh, 420px);
  margin: 0 0 4px 0; padding-right: 4px;
}
#pause-menu .controls-list .row {
  display: grid; grid-template-columns: 110px 1fr; gap: 10px; align-items: baseline;
  font-size: 12px; line-height: 1.35;
}
#pause-menu .controls-list .key {
  display: inline-block; padding: 2px 7px; border: 1px solid rgba(111,216,242,0.45);
  border-radius: 3px; color: #a8d8ea; background: rgba(111,216,242,0.1);
  font-size: 11px; letter-spacing: 0.5px; text-align: center; white-space: nowrap;
}
#pause-menu .controls-list .label { opacity: 0.85; color: #cfe3ff; }
`

export function createPauseMenu(container, { onResume, onSave, onRestart, onQuit }) {
  const style = document.createElement('style')
  style.textContent = STYLE
  document.head.appendChild(style)

  const root = document.createElement('div')
  root.id = 'pause-menu'
  root.innerHTML = `
    <div class="panel main-view">
      <h2>Paused</h2>
      <button class="resume">Resume</button>
      <button class="save">Save Game</button>
      <button class="controls">Show Controls</button>
      <button class="restart">Restart</button>
      <button class="quit">Quit to Desktop</button>
    </div>
    <div class="panel controls-view" style="display:none;">
      <h2>Controls</h2>
      <div class="controls-list">
        ${CONTROLS.map(([key, label]) => `
          <div class="row"><span class="key">${key}</span><span class="label">${label}</span></div>
        `).join('')}
      </div>
      <button class="controls-back">Back</button>
    </div>
  `
  container.appendChild(root)

  const mainView = root.querySelector('.main-view')
  const controlsView = root.querySelector('.controls-view')

  function showMain() {
    mainView.style.display = 'flex'
    controlsView.style.display = 'none'
  }

  function showControls() {
    mainView.style.display = 'none'
    controlsView.style.display = 'flex'
  }

  function hide() {
    root.style.display = 'none'
    showMain()
  }

  root.querySelector('.resume').addEventListener('click', () => {
    hide()
    onResume()
  })
  root.querySelector('.save').addEventListener('click', () => onSave())
  root.querySelector('.controls').addEventListener('click', () => showControls())
  root.querySelector('.controls-back').addEventListener('click', () => showMain())
  root.querySelector('.restart').addEventListener('click', () => onRestart())
  root.querySelector('.quit').addEventListener('click', () => onQuit())

  return {
    show() {
      showMain()
      root.style.display = 'flex'
    },
    hide,
    element: root
  }
}
