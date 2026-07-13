const STYLE = `
#pause-menu { position: fixed; inset: 0; background: rgba(4, 6, 12, 0.75); backdrop-filter: blur(2px); font-family: monospace; color: #cfe3ff; display: none; align-items: center; justify-content: center; z-index: 50; }
#pause-menu .panel {
  display: flex; flex-direction: column; gap: 10px; width: 280px; padding: 26px 28px;
  background: linear-gradient(135deg, rgba(12,20,36,0.95), rgba(7,12,22,0.9));
  border: 1px solid rgba(111,216,242,0.4); border-left: 3px solid #6fd8f2;
  box-shadow: 0 0 30px rgba(79,195,217,0.25), inset 0 0 26px rgba(79,195,217,0.05);
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%);
}
#pause-menu h2 { margin: 0 0 14px 0; text-align: center; font-weight: normal; letter-spacing: 4px; text-transform: uppercase; color: #7fe6ff; text-shadow: 0 0 10px rgba(79,195,217,0.7); }
#pause-menu button {
  background: rgba(111,216,242,0.1); border: 1px solid rgba(111,216,242,0.4); color: #cfe3ff;
  padding: 11px; cursor: pointer; font-family: monospace; letter-spacing: 1px;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}
#pause-menu button:hover { background: rgba(111,216,242,0.22); box-shadow: 0 0 14px rgba(79,195,217,0.35); }
#pause-menu button.quit { background: rgba(224,90,90,0.12); border-color: rgba(224,90,90,0.5); color: #ffb3b3; }
#pause-menu button.quit:hover { background: rgba(224,90,90,0.22); box-shadow: 0 0 14px rgba(224,90,90,0.35); }
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
