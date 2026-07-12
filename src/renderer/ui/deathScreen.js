const STYLE = `
#death-screen {
  position: fixed; inset: 0; background: #060102; font-family: monospace; color: #f0d0d0;
  display: none; align-items: center; justify-content: center; overflow: hidden;
}
#death-screen::before {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse at center, transparent 35%, rgba(120,10,10,0.55) 100%);
  animation: vignettePulse 2.2s ease-in-out infinite;
}
@keyframes vignettePulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }

#death-screen .panel { position: relative; z-index: 1; text-align: center; }

#death-screen h1 {
  position: relative; color: #ff5050; font-size: 40px; letter-spacing: 6px; margin: 0 0 24px 0;
  animation: glitchShadow 2.4s infinite steps(1);
}
#death-screen.shake .panel { animation: shake 0.5s ease-in-out; }
@keyframes shake {
  0%, 100% { transform: translate(0, 0); }
  20% { transform: translate(-6px, 2px); }
  40% { transform: translate(5px, -3px); }
  60% { transform: translate(-4px, 3px); }
  80% { transform: translate(3px, -2px); }
}
@keyframes glitchShadow {
  0%, 18% { text-shadow: 2px 0 #5ee6ff, -2px 0 #ff4d4d; }
  20% { text-shadow: -4px 1px #5ee6ff, 4px -1px #ff4d4d; }
  22%, 48% { text-shadow: 2px 0 #5ee6ff, -2px 0 #ff4d4d; }
  50% { text-shadow: 4px -2px #5ee6ff, -4px 2px #ff4d4d; }
  52%, 100% { text-shadow: 2px 0 #5ee6ff, -2px 0 #ff4d4d; }
}

#death-screen .summary { margin-bottom: 28px; line-height: 1.7; opacity: 0; }
#death-screen.reveal .summary { animation: fadeUp 0.6s ease-out 0.3s forwards; }

#death-screen button {
  background: #2a1414; border: 1px solid #6a2a2a; color: #f0d0d0; padding: 10px 20px; cursor: pointer;
  font-family: monospace; letter-spacing: 1px; opacity: 0;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
#death-screen.reveal button { animation: fadeUp 0.6s ease-out 0.6s forwards; }
#death-screen button:hover { background: #3a1a1a; border-color: #d94f4f; box-shadow: 0 0 14px rgba(217,79,79,0.4); }
@keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
`

export function createDeathScreen(container, onReturnToMenu) {
  const style = document.createElement('style')
  style.textContent = STYLE
  document.head.appendChild(style)

  const root = document.createElement('div')
  root.id = 'death-screen'
  root.innerHTML = `
    <div class="panel">
      <h1>YOU HAVE DIED</h1>
      <div class="summary"></div>
      <button class="return">Return to Main Menu</button>
    </div>
  `
  container.appendChild(root)

  root.querySelector('.return').addEventListener('click', () => {
    root.style.display = 'none'
    root.classList.remove('reveal', 'shake')
    onReturnToMenu()
  })

  return {
    show({ characterName, credits, reputation, cause }) {
      root.querySelector('.summary').innerHTML = `
        Pilot ${characterName} was lost.<br/>
        Cause: ${cause}<br/>
        Final credits: ${credits}cr<br/>
        Reputation earned: ${reputation}<br/>
        There is no respawn for ${characterName}. Your last save is still available to continue from.
      `
      root.style.display = 'flex'
      root.classList.remove('reveal', 'shake')
      void root.offsetWidth
      root.classList.add('reveal', 'shake')
    }
  }
}
