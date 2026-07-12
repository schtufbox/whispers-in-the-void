const STYLE = `
#pause-menu { position: fixed; inset: 0; background: rgba(4, 6, 12, 0.85); font-family: monospace; color: #cfe3ff; display: none; align-items: center; justify-content: center; }
#pause-menu .panel { display: flex; flex-direction: column; gap: 10px; width: 280px; }
#pause-menu h2 { margin: 0 0 10px 0; text-align: center; }
#pause-menu button { background: #2a3a55; border: none; color: #cfe3ff; padding: 10px; cursor: pointer; font-family: monospace; }
#pause-menu button.quit { background: #a13a3a; }
`

export function createPauseMenu(container, { onResume, onSave, onRestart, onQuit }) {
  const style = document.createElement('style')
  style.textContent = STYLE
  document.head.appendChild(style)

  const root = document.createElement('div')
  root.id = 'pause-menu'
  root.innerHTML = `
    <div class="panel">
      <h2>Paused</h2>
      <button class="resume">Resume</button>
      <button class="save">Save Game</button>
      <button class="restart">Restart</button>
      <button class="quit">Quit to Desktop</button>
    </div>
  `
  container.appendChild(root)

  function hide() {
    root.style.display = 'none'
  }

  root.querySelector('.resume').addEventListener('click', () => {
    hide()
    onResume()
  })
  root.querySelector('.save').addEventListener('click', () => onSave())
  root.querySelector('.restart').addEventListener('click', () => onRestart())
  root.querySelector('.quit').addEventListener('click', () => onQuit())

  return {
    show() {
      root.style.display = 'flex'
    },
    hide,
    element: root
  }
}
