import { STARTER_SHIP_CLASS_ID, getShipClass } from '../data/shipClasses.js'

const STYLE = `
#main-menu { position: fixed; inset: 0; background: radial-gradient(ellipse at center, rgba(6,9,18,0.35) 0%, rgba(4,6,12,0.8) 100%); font-family: monospace; color: #cfe3ff; display: flex; align-items: center; justify-content: center; overflow: hidden; }
#main-menu::before {
  content: ''; position: absolute; inset: -20%; pointer-events: none;
  background: repeating-linear-gradient(0deg, rgba(79,195,217,0.03) 0px, rgba(79,195,217,0.03) 1px, transparent 1px, transparent 3px);
  animation: scan 10s linear infinite;
}
@keyframes scan { from { transform: translateY(0); } to { transform: translateY(60px); } }

#main-menu .panel {
  display: flex; flex-direction: column; gap: 10px; width: 560px; position: relative; z-index: 1;
  padding: 28px 32px;
}
#main-menu .main-view { align-items: center; text-align: center; }

/* Cinematic vignette so the 3D backdrop darkens toward the edges and the
   title pops. Corner braces match the in-game HUD's cockpit frame, so menu
   and gameplay read as one visual system. */
#main-menu::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse at center, transparent 40%, rgba(2,4,8,0.75) 100%);
}
#main-menu .frame { position: absolute; inset: 14px; pointer-events: none; z-index: 2; }
#main-menu .frame .corner { position: absolute; width: 44px; height: 44px; border: 2px solid rgba(111,216,242,0.45); filter: drop-shadow(0 0 8px rgba(79,195,217,0.5)); }
#main-menu .frame .corner.tl { top: 0; left: 0; border-right: none; border-bottom: none; }
#main-menu .frame .corner.tr { top: 0; right: 0; border-left: none; border-bottom: none; }
#main-menu .frame .corner.bl { bottom: 0; left: 0; border-right: none; border-top: none; }
#main-menu .frame .corner.br { bottom: 0; right: 0; border-left: none; border-top: none; }

#main-menu .footer {
  position: absolute; bottom: 26px; left: 0; right: 0; text-align: center; z-index: 2;
  font-size: 10px; letter-spacing: 3px; color: #3a5a7a; pointer-events: none;
}

#main-menu h1 { margin: 0 0 4px 0; }
/* One-shot cinematic entrance — the title resolves out of a blur — replayed
   whenever the menu (re)shows via the same .reveal class the buttons use. */
#main-menu.reveal h1 { animation: titleEntrance 1.1s ease-out; }
@keyframes titleEntrance {
  from { opacity: 0; transform: scale(1.12); filter: blur(14px); }
  to { opacity: 1; transform: scale(1); filter: blur(0); }
}
/* Each line of the (now two-line) title is its own box with the gradient/
   glitch applied per-line, rather than once across the whole h1 — the
   glitch clip-path bands below are percentages of a single line's height,
   so splitting them over a taller multi-line block would slice across the
   gap between lines instead of through each line's own glyphs. */
#main-menu h1 .line {
  display: block; position: relative; font-size: 46px; letter-spacing: 6px;
  background: linear-gradient(90deg, #4fc3d9, #8fb3ff, #7fe0a0, #4fc3d9);
  background-size: 300% auto;
  -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: titleShift 6s linear infinite, titleGlow 5s ease-in-out infinite;
}
@keyframes titleShift { to { background-position: 300% center; } }
/* A slow, shifting multi-color halo (nebula-gas feel) instead of a single
   static color pulse — drop-shadow (not box-shadow) so it hugs the glyphs. */
@keyframes titleGlow {
  0%   { filter: drop-shadow(0 0 10px rgba(79,195,217,0.6)) drop-shadow(0 0 26px rgba(143,90,255,0.35)); }
  33%  { filter: drop-shadow(0 0 14px rgba(143,179,255,0.7)) drop-shadow(0 0 30px rgba(255,120,200,0.3)); }
  66%  { filter: drop-shadow(0 0 12px rgba(127,224,160,0.65)) drop-shadow(0 0 28px rgba(79,195,217,0.35)); }
  100% { filter: drop-shadow(0 0 10px rgba(79,195,217,0.6)) drop-shadow(0 0 26px rgba(143,90,255,0.35)); }
}

/* Brief chromatic-aberration glitch slices, sparse (~93-97% of the loop is
   quiet) so it reads as an occasional signal hiccup rather than constant
   noise. content: attr(data-text) mirrors whatever's in each .line's
   data-text attribute, so the glitch layer can never drift out of sync with
   the line's real text. */
#main-menu h1 .line::before, #main-menu h1 .line::after {
  content: attr(data-text); position: absolute; inset: 0;
  background: inherit; -webkit-background-clip: text; background-clip: text; color: transparent;
  opacity: 0; mix-blend-mode: screen;
}
#main-menu h1 .line::before { clip-path: polygon(0 0, 100% 0, 100% 45%, 0 45%); filter: hue-rotate(-50deg); animation: glitchTop 6.5s steps(1) infinite; }
#main-menu h1 .line::after { clip-path: polygon(0 55%, 100% 55%, 100% 100%, 0 100%); filter: hue-rotate(170deg); animation: glitchBottom 6.5s steps(1) infinite; }
@keyframes glitchTop {
  0%, 91%, 100% { opacity: 0; transform: translate(0, 0); }
  92% { opacity: 0.85; transform: translate(-5px, -1px); }
  93% { opacity: 0.85; transform: translate(4px, 1px); }
  94% { opacity: 0; transform: translate(0, 0); }
  96% { opacity: 0.7; transform: translate(3px, 0); }
  97% { opacity: 0; transform: translate(0, 0); }
}
@keyframes glitchBottom {
  0%, 91%, 100% { opacity: 0; transform: translate(0, 0); }
  92% { opacity: 0.85; transform: translate(5px, 1px); }
  93% { opacity: 0.85; transform: translate(-4px, -1px); }
  94% { opacity: 0; transform: translate(0, 0); }
  96% { opacity: 0.7; transform: translate(-3px, 0); }
  97% { opacity: 0; transform: translate(0, 0); }
}

/* Thin glowing rule lines flanking the subtitle — cheap cinematic framing. */
#main-menu .subtitle {
  margin: 0 0 34px 0; font-size: 11px; letter-spacing: 5px; color: #5a7fa5;
  display: flex; align-items: center; gap: 14px;
  animation: flicker 5s ease-in-out infinite;
}
#main-menu .subtitle::before, #main-menu .subtitle::after {
  content: ''; height: 1px; width: 70px;
  background: linear-gradient(90deg, transparent, rgba(111,216,242,0.6));
  box-shadow: 0 0 6px rgba(79,195,217,0.5);
}
#main-menu .subtitle::after { background: linear-gradient(90deg, rgba(111,216,242,0.6), transparent); }
@keyframes flicker {
  0%, 92%, 100% { opacity: 0.7; }
  93%, 95% { opacity: 0.2; }
}

#main-menu h2 { margin: 0 0 10px 0; }
#main-menu label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; text-align: left; }
#main-menu input {
  background: #10182a; border: 1px solid #2a3a55; color: #cfe3ff; padding: 8px; font-family: monospace;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
#main-menu input:focus { outline: none; border-color: #4fc3d9; box-shadow: 0 0 8px rgba(79,195,217,0.4); }

#main-menu button {
  background: #16223a; border: 1px solid #2a3a55; color: #cfe3ff; padding: 12px; cursor: pointer; font-family: monospace;
  letter-spacing: 1px; opacity: 0; transform: translateY(8px);
  transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease, border-color 0.15s ease;
}
#main-menu button:disabled { opacity: 0.35 !important; cursor: not-allowed; }
#main-menu button.quit { border-color: #a13a3a; }
#main-menu button:hover:not(:disabled) { background: #223252; border-color: #8fb3ff; box-shadow: 0 0 14px rgba(143,179,255,0.35); transform: translateY(8px) scale(1.02); }
#main-menu button.quit:hover:not(:disabled) { border-color: #d94f4f; box-shadow: 0 0 14px rgba(217,79,79,0.4); }
#main-menu button:active:not(:disabled) { transform: translateY(9px) scale(0.99); }

/* The top-level New Game/Load Game/Quit entries are plain clickable text,
   not boxed buttons — no background/border/padding chrome — with the same
   glitch-layer technique as the h1 title (data-text-mirrored ::before/
   ::after clip-path bands) and a bright multi-layer glow on hover instead of
   a hover box-shadow. transform/opacity are kept so the existing .reveal
   entrance stagger (below) still animates these in unchanged. */
#main-menu button.menu-link {
  background: none; border: none; padding: 6px 0; margin: 0;
  color: #cfe3ff; font-size: 19px; letter-spacing: 3px; text-transform: uppercase;
  cursor: pointer; font-family: monospace;
  opacity: 0; transform: translateY(8px);
  transition: color 0.2s ease;
}
#main-menu button.menu-link:disabled { opacity: 0.35 !important; cursor: not-allowed; }
#main-menu button.menu-link:hover:not(:disabled),
#main-menu button.menu-link:focus-visible:not(:disabled) { color: #eaffff; }
#main-menu button.menu-link .glitch-text { position: relative; display: inline-block; padding-bottom: 3px; }
/* Underline sweep: a glowing line grows out from the center on hover. Uses
   the span's own ::marker-free box — the glitch layers live on ::before/
   ::after of .glitch-text, so the underline borrows the button's ::after. */
#main-menu button.menu-link::after {
  content: ''; display: block; margin: 2px auto 0; height: 1px; width: 0%;
  background: currentColor; box-shadow: 0 0 8px currentColor;
  transition: width 0.25s ease;
}
#main-menu button.menu-link:hover:not(:disabled)::after,
#main-menu button.menu-link:focus-visible:not(:disabled)::after { width: 60%; }
#main-menu button.menu-link:hover:not(:disabled) .glitch-text,
#main-menu button.menu-link:focus-visible:not(:disabled) .glitch-text {
  filter: drop-shadow(0 0 6px rgba(143,179,255,0.9)) drop-shadow(0 0 16px rgba(79,195,217,0.85)) drop-shadow(0 0 32px rgba(127,224,160,0.55));
}
#main-menu button.menu-link.quit:hover:not(:disabled) .glitch-text,
#main-menu button.menu-link.quit:focus-visible:not(:disabled) .glitch-text {
  filter: drop-shadow(0 0 6px rgba(217,79,79,0.95)) drop-shadow(0 0 16px rgba(217,79,79,0.85)) drop-shadow(0 0 32px rgba(255,140,140,0.5));
}
#main-menu button.menu-link .glitch-text::before, #main-menu button.menu-link .glitch-text::after {
  content: attr(data-text); position: absolute; inset: 0; color: inherit;
  opacity: 0; mix-blend-mode: screen;
}
#main-menu button.menu-link .glitch-text::before { clip-path: polygon(0 0, 100% 0, 100% 45%, 0 45%); filter: hue-rotate(-50deg); animation: menuGlitchTop 7s steps(1) infinite; }
#main-menu button.menu-link .glitch-text::after { clip-path: polygon(0 55%, 100% 55%, 100% 100%, 0 100%); filter: hue-rotate(170deg); animation: menuGlitchBottom 7s steps(1) infinite; }
/* Staggered per item (nth-of-type) so all three don't glitch in sync. */
#main-menu button.menu-link:nth-of-type(2) .glitch-text::before, #main-menu button.menu-link:nth-of-type(2) .glitch-text::after { animation-delay: 1.4s; }
#main-menu button.menu-link:nth-of-type(3) .glitch-text::before, #main-menu button.menu-link:nth-of-type(3) .glitch-text::after { animation-delay: 2.8s; }
@keyframes menuGlitchTop {
  0%, 91%, 100% { opacity: 0; transform: translate(0, 0); }
  92% { opacity: 0.85; transform: translate(-4px, -1px); }
  93% { opacity: 0.85; transform: translate(3px, 1px); }
  94% { opacity: 0; transform: translate(0, 0); }
  96% { opacity: 0.7; transform: translate(2px, 0); }
  97% { opacity: 0; transform: translate(0, 0); }
}
@keyframes menuGlitchBottom {
  0%, 91%, 100% { opacity: 0; transform: translate(0, 0); }
  92% { opacity: 0.85; transform: translate(4px, 1px); }
  93% { opacity: 0.85; transform: translate(-3px, -1px); }
  94% { opacity: 0; transform: translate(0, 0); }
  96% { opacity: 0.7; transform: translate(-2px, 0); }
  97% { opacity: 0; transform: translate(0, 0); }
}

#main-menu.reveal .panel > button, #main-menu.reveal .panel > label, #main-menu.reveal .panel > h2 {
  animation: riseIn 0.4s ease-out forwards; opacity: 0;
}
#main-menu.reveal .panel > button:nth-of-type(1), #main-menu.reveal .panel > label:nth-of-type(1) { animation-delay: 0s; }
#main-menu.reveal .panel > button:nth-of-type(2), #main-menu.reveal .panel > label:nth-of-type(2) { animation-delay: 0.08s; }
#main-menu.reveal .panel > button:nth-of-type(3), #main-menu.reveal .panel > label:nth-of-type(3) { animation-delay: 0.16s; }
#main-menu.reveal .panel > button:nth-of-type(4) { animation-delay: 0.24s; }
@keyframes riseIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
`

export function createMenu(container, { onNewGame, onLoadGame }) {
  const style = document.createElement('style')
  style.textContent = STYLE
  document.head.appendChild(style)

  const starterShip = getShipClass(STARTER_SHIP_CLASS_ID)

  const root = document.createElement('div')
  root.id = 'main-menu'
  root.innerHTML = `
    <div class="frame">
      <div class="corner tl"></div><div class="corner tr"></div>
      <div class="corner bl"></div><div class="corner br"></div>
    </div>
    <div class="footer">DEEP-SPACE NAVIGATION INTERFACE // SIGNAL ACQUIRED</div>
    <div class="panel main-view">
      <h1><span class="line" data-text="Whispers In The">Whispers In The</span><span class="line" data-text="Void">Void</span></h1>
      <div class="subtitle">A PROCEDURALLY GENERATED GALAXY</div>
      <button class="new-game menu-link"><span class="glitch-text" data-text="New Game">New Game</span></button>
      <button class="load-game menu-link"><span class="glitch-text" data-text="Load Game">Load Game</span></button>
      <button class="quit menu-link"><span class="glitch-text" data-text="Quit">Quit</span></button>
    </div>
    <div class="panel new-game-view" style="display:none">
      <h2>Create Pilot</h2>
      <label>Character Name <input class="char-name" value="Pilot" /></label>
      <label>Ship Name <input class="ship-name" value="${starterShip.name}" /></label>
      <button class="confirm-new-game">Launch</button>
      <button class="back">Back</button>
    </div>
  `
  container.appendChild(root)

  const mainView = root.querySelector('.main-view')
  const newGameView = root.querySelector('.new-game-view')
  const loadBtn = root.querySelector('.load-game')

  function replayEntrance() {
    root.classList.remove('reveal')
    void root.offsetWidth
    root.classList.add('reveal')
  }

  root.querySelector('.new-game').addEventListener('click', () => {
    mainView.style.display = 'none'
    newGameView.style.display = 'flex'
    replayEntrance()
  })
  root.querySelector('.back').addEventListener('click', () => {
    newGameView.style.display = 'none'
    mainView.style.display = 'flex'
    replayEntrance()
  })
  root.querySelector('.confirm-new-game').addEventListener('click', () => {
    const characterName = root.querySelector('.char-name').value.trim() || 'Pilot'
    const shipInstanceName = root.querySelector('.ship-name').value.trim() || starterShip.name
    hide()
    onNewGame({ characterName, shipInstanceName })
  })
  loadBtn.addEventListener('click', () => {
    hide()
    onLoadGame()
  })
  root.querySelector('.quit').addEventListener('click', () => window.electronAPI.quitApp())

  function hide() {
    root.style.display = 'none'
  }

  return {
    show(hasSaveGame) {
      loadBtn.disabled = !hasSaveGame
      mainView.style.display = 'flex'
      newGameView.style.display = 'none'
      root.style.display = 'flex'
      replayEntrance()
    },
    hide,
    element: root
  }
}
