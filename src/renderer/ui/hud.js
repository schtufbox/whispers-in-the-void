const STYLE = `
#hud { font-family: monospace; color: #cfe3ff; user-select: none; }

/*
 * Unified HUD chrome surface.
 * Default cut: top-right. Right-side panels (radar) flip to top-left + right accent.
 * Velocity: both top corners cut.
 */
#hud .status-panel,
#hud .velocity-panel,
#hud .system-label,
#hud .target-panel,
#hud #radar .radar-frame {
  background: linear-gradient(135deg, rgba(12,20,36,0.92), rgba(7,12,22,0.82));
  border: 1px solid rgba(111,216,242,0.45);
  border-left: 3px solid #6fd8f2;
  box-shadow: 0 0 16px rgba(79,195,217,0.3), inset 0 0 22px rgba(79,195,217,0.06);
  clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%);
  filter:
    drop-shadow(0 2px 3px rgba(0,0,0,0.7))
    drop-shadow(0 4px 10px rgba(0,0,0,0.4));
}

/* Velocity: cut both top corners; thick cyan accent on both sides */
#hud .velocity-panel {
  border-left: 3px solid #6fd8f2;
  border-right: 3px solid #6fd8f2;
  clip-path: polygon(
    14px 0,
    calc(100% - 14px) 0,
    100% 14px,
    100% 100%,
    0 100%,
    0 14px
  );
}

/* Radar (right column): top-left cut + accent stripe on the right */
#hud #radar .radar-frame {
  border-left: 1px solid rgba(111,216,242,0.45);
  border-right: 3px solid #6fd8f2;
  clip-path: polygon(0 14px, 14px 0, 100% 0, 100% 100%, 0 100%);
}

/* Cockpit chrome: four corner braces plus a faint full-screen scanline wash,
   so gameplay reads as looking through a ship canopy HUD rather than a bare
   viewport. pointer-events: none throughout — pure decoration. */
#hud .cockpit-frame { position: fixed; inset: 10px; pointer-events: none; z-index: 5; }
#hud .cockpit-frame .corner {
  position: absolute; width: 34px; height: 34px; border: 2px solid rgba(111,216,242,0.5);
  filter:
    drop-shadow(0 2px 3px rgba(0,0,0,0.75))
    drop-shadow(0 0 6px rgba(79,195,217,0.55));
}
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
}
#hud .panel-title {
  font-size: 10px; letter-spacing: 3px; opacity: 0.65; color: #7fe6ff;
  text-shadow:
    0 1px 2px rgba(0,0,0,0.85),
    0 0 6px rgba(79,195,217,0.7);
  margin-bottom: 8px;
}
#hud .row { margin-bottom: 7px; }
#hud .row-label {
  display: flex; justify-content: space-between; font-size: 10px;
  letter-spacing: 1.5px; opacity: 0.75; margin-bottom: 2px;
  text-shadow: 0 1px 2px rgba(0,0,0,0.75);
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

/* Current system — top center, clear of status (left) and radar (right).
   Same dual-top-corner cut + dual side accents as the velocity panel. */
#hud .system-label {
  position: fixed; top: 18px; left: 50%; transform: translateX(-50%);
  pointer-events: none; z-index: 6;
  text-align: center; padding: 6px 18px 7px;
  border-left: 3px solid #6fd8f2;
  border-right: 3px solid #6fd8f2;
  clip-path: polygon(
    14px 0,
    calc(100% - 14px) 0,
    100% 14px,
    100% 100%,
    0 100%,
    0 14px
  );
}
/* Docked: strip flight chrome; location chip top-left. */
#hud.docked .status-panel,
#hud.docked .velocity-panel,
#hud.docked .target-panel,
#hud.docked #radar {
  display: none !important;
}
#hud.docked .system-label {
  left: 16px;
  top: 16px;
  transform: none;
  text-align: left;
  max-width: min(420px, 48vw);
}
#hud.docked .system-label .sys-tag { letter-spacing: 2px; }
#hud.docked .system-label .nearest-body.visible { display: block; }
#hud.docked .system-label .nearest-body .nb-tag { content: none; }
#hud .system-label .sys-tag {
  display: block; font-size: 9px; letter-spacing: 3px; text-transform: uppercase;
  color: #7fe6ff; opacity: 0.7;
  text-shadow: 0 1px 2px rgba(0,0,0,0.85), 0 0 6px rgba(79,195,217,0.6);
  margin-bottom: 2px;
}
#hud .system-label .sys-name {
  display: block; font-size: 14px; letter-spacing: 1.5px; color: #eaffff;
  text-shadow: 0 1px 2px rgba(0,0,0,0.85), 0 0 8px rgba(127,230,255,0.55);
  white-space: nowrap; max-width: 42vw; overflow: hidden; text-overflow: ellipsis;
}
#hud .system-label .sys-name .sec-badge {
  display: inline-block; margin-left: 10px; padding: 1px 8px 2px;
  font-size: 11px; letter-spacing: 1px; vertical-align: middle;
  border: 1px solid rgba(111,216,242,0.45); border-radius: 2px;
  color: #7fe6ff; background: rgba(79,195,217,0.1);
  text-shadow: 0 0 6px rgba(79,195,217,0.5);
}
#hud .system-label .sys-name .sec-badge.sec-high {
  color: #7fe0a0; border-color: rgba(127,224,160,0.5); background: rgba(127,224,160,0.1);
}
#hud .system-label .sys-name .sec-badge.sec-mid {
  color: #ffe08a; border-color: rgba(255,210,70,0.45); background: rgba(255,210,70,0.08);
}
#hud .system-label .sys-name .sec-badge.sec-low {
  color: #ff9a7a; border-color: rgba(224,90,90,0.4); background: rgba(224,90,90,0.1);
}
#hud .system-label .nearest-body {
  display: none; margin-top: 4px; font-size: 11px; letter-spacing: 1px;
  color: #b8d4f0; opacity: 0.9;
  text-shadow: 0 1px 2px rgba(0,0,0,0.85), 0 0 6px rgba(79,195,217,0.4);
  white-space: nowrap; max-width: 42vw; overflow: hidden; text-overflow: ellipsis;
}
#hud .system-label .nearest-body.visible { display: block; }
#hud .system-label .nearest-body .nb-tag {
  color: #7fe6ff; opacity: 0.75; letter-spacing: 1.5px; text-transform: uppercase; font-size: 9px;
  margin-right: 6px;
}
#hud .system-label .nearest-body .nb-name { color: #eaffff; }

/* Tab-target readout — sits between system name (center) and radar (right). */
#hud .target-panel {
  position: fixed; top: 16px; right: 210px; z-index: 6;
  width: 200px; padding: 10px 12px 10px 14px;
  pointer-events: none; display: none;
}
#hud .target-panel.visible { display: block; }
#hud .target-panel.hostile {
  border-color: rgba(224,90,90,0.55); border-left-color: #e05a5a;
  box-shadow: 0 0 14px rgba(224,90,90,0.25), inset 0 0 16px rgba(224,90,90,0.05);
}
#hud .target-panel .tp-tag {
  font-size: 9px; letter-spacing: 2px; text-transform: uppercase;
  color: #7fe6ff; opacity: 0.75; margin-bottom: 2px;
  text-shadow: 0 1px 2px rgba(0,0,0,0.85);
}
#hud .target-panel.hostile .tp-tag { color: #ff9a7a; }
#hud .target-panel .tp-name {
  font-size: 13px; letter-spacing: 0.8px; color: #eaffff;
  text-shadow: 0 1px 2px rgba(0,0,0,0.85), 0 0 6px rgba(127,230,255,0.4);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px;
}
#hud .target-panel .tp-meta {
  font-size: 10px; letter-spacing: 0.5px; color: #8fb3d9; opacity: 0.9;
  margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
#hud .target-panel .tp-row { margin-bottom: 5px; }
#hud .target-panel .tp-row:last-child { margin-bottom: 0; }
#hud .target-panel .tp-row-label {
  display: flex; justify-content: space-between; font-size: 9px;
  letter-spacing: 1px; opacity: 0.75; margin-bottom: 1px;
  text-shadow: 0 1px 2px rgba(0,0,0,0.75);
}
#hud .target-panel .tp-row-label .value { opacity: 0.95; }
#hud .target-panel .bar { height: 7px; }
#hud .target-panel .bar.ore .fill {
  background: linear-gradient(90deg, #6a5a2a, #d9b56a); box-shadow: 0 0 5px rgba(217,181,106,0.45);
}

/* Velocity gets its own bottom-center readout, separate from the shield/
   armor/hull status panel now up in the top-left corner. */
#hud .velocity-panel {
  position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
  width: 260px;
  padding: 8px 16px;
}

@keyframes hud-shine { 0% { background-position: 220% 0; } 100% { background-position: -20% 0; } }
@keyframes hud-critical-pulse {
  0%, 100% { box-shadow: 0 0 6px rgba(194,74,74,0.5); }
  50% { box-shadow: 0 0 16px 2px rgba(255,90,90,0.95); }
}

/* Right column stack: radar (top) → System Scan → overview (systemOverview.js).
   Radar frame: top 16, h 176 → bottom 192.
   Scan btn: top 198 (6px gap), ~32px tall → bottom ~230.
   Overview: top 236 (see systemOverview.js). */
#radar {
  position: fixed; right: 16px; top: 16px;
  width: 176px; height: 176px;
  font-family: monospace; color: #cfe3ff; user-select: none; text-align: center;
  pointer-events: none;
  z-index: 8;
}
#radar .radar-frame {
  width: 176px; height: 176px;
  padding: 6px;
  box-sizing: border-box;
}
/* Between radar and system overview on the right column.
   Top-right corner cut to match other HUD chrome. */
#hud .system-scan-btn {
  position: fixed; right: 16px; top: 198px; z-index: 9;
  width: 176px; box-sizing: border-box;
  pointer-events: auto; cursor: pointer;
  font-family: monospace; font-size: 10px; letter-spacing: 1.2px; text-transform: uppercase;
  padding: 7px 8px;
  color: #c9e8ff;
  background: linear-gradient(135deg, rgba(12,20,36,0.92), rgba(7,12,22,0.82));
  border: 1px solid rgba(111,216,242,0.45);
  border-left: 1px solid rgba(111,216,242,0.45);
  border-right: 3px solid #6fd8f2;
  box-shadow: 0 0 12px rgba(79,195,217,0.25),
    0 2px 3px rgba(0,0,0,0.7),
    0 4px 10px rgba(0,0,0,0.35);
  clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%);
  filter:
    drop-shadow(0 2px 3px rgba(0,0,0,0.7))
    drop-shadow(0 4px 10px rgba(0,0,0,0.35));
}
#hud .system-scan-btn:hover {
  background: rgba(111,216,242,0.14);
  color: #eaffff;
}
#hud.docked .system-scan-btn { display: none; }
#radar canvas {
  display: block;
  width: 100%; height: 100%;
  background: radial-gradient(circle at 50% 48%, rgba(10,22,34,0.92) 0%, rgba(6,12,22,0.96) 72%, rgba(5,10,18,0.98) 100%);
  border: 1px solid rgba(111,216,242,0.28);
  border-radius: 2px;
  box-shadow: inset 0 0 18px rgba(79,195,217,0.18);
}
#hud .velocity-panel .row-label,
#hud .velocity-panel .speed {
  text-shadow: 0 1px 2px rgba(0,0,0,0.75);
}

/* Shared soft ground shadow — kept in glitch rest frames so animation doesn't wipe it. */
/* Supercruise: stronger chromatic HUD glitch (still sparser than title ~6.5s). */
#hud.cruise-glitch .status-panel,
#hud.cruise-glitch .target-panel,
#hud.cruise-glitch #radar .radar-frame {
  animation: hudCruisePanelGlitch 12s steps(1) infinite;
}
#hud.cruise-glitch .cockpit-frame .corner {
  animation: hudCruiseCornerGlitch 12s steps(1) infinite;
}
#hud.cruise-glitch .system-label,
#hud.cruise-glitch .velocity-panel {
  animation: hudCruisePanelGlitchCenter 12s steps(1) infinite;
}
#hud.cruise-glitch .scanlines {
  animation: hudCruiseScanGlitch 12s steps(1) infinite;
}
#hud.cruise-glitch .status-panel { animation-delay: 0s; }
#hud.cruise-glitch .system-label { animation-delay: 0.05s; }
#hud.cruise-glitch .target-panel { animation-delay: 0.04s; }
#hud.cruise-glitch #radar .radar-frame { animation-delay: 0.1s; }
#hud.cruise-glitch .velocity-panel { animation-delay: 0.07s; }
#hud.cruise-glitch .cockpit-frame .corner.tl { animation-delay: 0s; }
#hud.cruise-glitch .cockpit-frame .corner.tr { animation-delay: 0.03s; }
#hud.cruise-glitch .cockpit-frame .corner.bl { animation-delay: 0.06s; }
#hud.cruise-glitch .cockpit-frame .corner.br { animation-delay: 0.09s; }

@keyframes hudCruisePanelGlitch {
  0%, 78%, 100% {
    filter:
      drop-shadow(0 2px 3px rgba(0,0,0,0.7))
      drop-shadow(0 4px 10px rgba(0,0,0,0.4));
    transform: none;
  }
  79% {
    filter:
      drop-shadow(0 2px 3px rgba(0,0,0,0.7))
      drop-shadow(-5px 0 0 rgba(255, 40, 90, 0.85))
      drop-shadow(5px 0 0 rgba(40, 220, 255, 0.85))
      hue-rotate(-35deg);
    transform: translate(-5px, 0) skewX(-1.4deg);
  }
  80% {
    filter:
      drop-shadow(0 2px 3px rgba(0,0,0,0.7))
      drop-shadow(6px 0 0 rgba(255, 40, 90, 0.75))
      drop-shadow(-4px 0 0 rgba(40, 220, 255, 0.75))
      hue-rotate(40deg);
    transform: translate(6px, 2px) skewX(1.6deg);
  }
  81% {
    filter:
      drop-shadow(0 2px 3px rgba(0,0,0,0.7))
      drop-shadow(-3px 1px 0 rgba(255, 80, 120, 0.7))
      drop-shadow(4px -1px 0 rgba(80, 200, 255, 0.7))
      hue-rotate(-20deg);
    transform: translate(-3px, -1px) skewX(0.8deg);
  }
  82% {
    filter:
      drop-shadow(0 2px 3px rgba(0,0,0,0.7))
      drop-shadow(0 4px 10px rgba(0,0,0,0.4));
    transform: none;
  }
  90% {
    filter:
      drop-shadow(0 2px 3px rgba(0,0,0,0.7))
      drop-shadow(-4px 0 0 rgba(255, 50, 100, 0.7))
      drop-shadow(4px 0 0 rgba(50, 210, 255, 0.7))
      hue-rotate(25deg);
    transform: translate(4px, 0) skewX(-1deg);
  }
  91% {
    filter:
      drop-shadow(0 2px 3px rgba(0,0,0,0.7))
      drop-shadow(3px 0 0 rgba(255, 50, 100, 0.55))
      drop-shadow(-5px 0 0 rgba(50, 210, 255, 0.55));
    transform: translate(-4px, 1px);
  }
  92% {
    filter:
      drop-shadow(0 2px 3px rgba(0,0,0,0.7))
      drop-shadow(0 4px 10px rgba(0,0,0,0.4));
    transform: none;
  }
}
@keyframes hudCruisePanelGlitchCenter {
  0%, 78%, 100% {
    filter:
      drop-shadow(0 2px 3px rgba(0,0,0,0.7))
      drop-shadow(0 4px 10px rgba(0,0,0,0.4));
    transform: translateX(-50%);
  }
  79% {
    filter:
      drop-shadow(0 2px 3px rgba(0,0,0,0.7))
      drop-shadow(-5px 0 0 rgba(255, 40, 90, 0.85))
      drop-shadow(5px 0 0 rgba(40, 220, 255, 0.85))
      hue-rotate(-35deg);
    transform: translateX(calc(-50% - 5px)) skewX(-1.4deg);
  }
  80% {
    filter:
      drop-shadow(0 2px 3px rgba(0,0,0,0.7))
      drop-shadow(6px 0 0 rgba(255, 40, 90, 0.75))
      drop-shadow(-4px 0 0 rgba(40, 220, 255, 0.75))
      hue-rotate(40deg);
    transform: translateX(calc(-50% + 6px)) translateY(2px) skewX(1.6deg);
  }
  81% {
    filter:
      drop-shadow(0 2px 3px rgba(0,0,0,0.7))
      drop-shadow(-3px 1px 0 rgba(255, 80, 120, 0.7))
      drop-shadow(4px -1px 0 rgba(80, 200, 255, 0.7))
      hue-rotate(-20deg);
    transform: translateX(calc(-50% - 3px)) translateY(-1px) skewX(0.8deg);
  }
  82% {
    filter:
      drop-shadow(0 2px 3px rgba(0,0,0,0.7))
      drop-shadow(0 4px 10px rgba(0,0,0,0.4));
    transform: translateX(-50%);
  }
  90% {
    filter:
      drop-shadow(0 2px 3px rgba(0,0,0,0.7))
      drop-shadow(-4px 0 0 rgba(255, 50, 100, 0.7))
      drop-shadow(4px 0 0 rgba(50, 210, 255, 0.7))
      hue-rotate(25deg);
    transform: translateX(calc(-50% + 4px)) skewX(-1deg);
  }
  91% {
    filter:
      drop-shadow(0 2px 3px rgba(0,0,0,0.7))
      drop-shadow(3px 0 0 rgba(255, 50, 100, 0.55))
      drop-shadow(-5px 0 0 rgba(50, 210, 255, 0.55));
    transform: translateX(calc(-50% - 4px)) translateY(1px);
  }
  92% {
    filter:
      drop-shadow(0 2px 3px rgba(0,0,0,0.7))
      drop-shadow(0 4px 10px rgba(0,0,0,0.4));
    transform: translateX(-50%);
  }
}
@keyframes hudCruiseCornerGlitch {
  0%, 78%, 100% {
    filter:
      drop-shadow(0 2px 3px rgba(0,0,0,0.75))
      drop-shadow(0 0 6px rgba(79,195,217,0.55));
  }
  79% {
    filter:
      drop-shadow(0 2px 3px rgba(0,0,0,0.75))
      drop-shadow(-4px 0 0 rgba(255, 40, 90, 0.9))
      drop-shadow(4px 0 0 rgba(40, 220, 255, 0.9))
      drop-shadow(0 0 10px rgba(79,195,217,0.8));
  }
  80% {
    filter:
      drop-shadow(0 2px 3px rgba(0,0,0,0.75))
      drop-shadow(5px 0 0 rgba(255, 40, 90, 0.75))
      drop-shadow(-5px 0 0 rgba(40, 220, 255, 0.75));
  }
  81%, 82% {
    filter:
      drop-shadow(0 2px 3px rgba(0,0,0,0.75))
      drop-shadow(0 0 6px rgba(79,195,217,0.55));
  }
  90% {
    filter:
      drop-shadow(0 2px 3px rgba(0,0,0,0.75))
      drop-shadow(-3px 0 0 rgba(255, 50, 100, 0.7))
      drop-shadow(3px 0 0 rgba(50, 210, 255, 0.7));
  }
  91%, 92% {
    filter:
      drop-shadow(0 2px 3px rgba(0,0,0,0.75))
      drop-shadow(0 0 6px rgba(79,195,217,0.55));
  }
}
@keyframes hudCruiseScanGlitch {
  0%, 78%, 100% { opacity: 0.35; }
  79%, 81% { opacity: 0.95; }
  82% { opacity: 0.35; }
  90%, 91% { opacity: 0.8; }
  92% { opacity: 0.35; }
}

/* White-noise / static burst timed with the chromatic glitch windows. */
#hud .static-noise {
  position: fixed; inset: 0; pointer-events: none; z-index: 7;
  opacity: 0;
  mix-blend-mode: screen;
  /* SVG fractal noise — no texture files; re-tiled via background-size animation. */
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 180px 180px;
}
#hud.cruise-glitch .static-noise {
  animation: hudCruiseStatic 12s steps(1) infinite;
}
@keyframes hudCruiseStatic {
  0%, 78%, 100% {
    opacity: 0;
    background-position: 0 0;
  }
  79% {
    opacity: 0.42;
    background-position: -40px 12px;
  }
  80% {
    opacity: 0.55;
    background-position: 28px -22px;
  }
  81% {
    opacity: 0.28;
    background-position: -18px 36px;
  }
  82% {
    opacity: 0;
    background-position: 0 0;
  }
  90% {
    opacity: 0.32;
    background-position: 50px -30px;
  }
  91% {
    opacity: 0.2;
    background-position: -60px 20px;
  }
  92% {
    opacity: 0;
    background-position: 0 0;
  }
}
`

export function createHud(container) {
  const style = document.createElement('style')
  style.textContent = STYLE
  document.head.appendChild(style)

  const hud = document.createElement('div')
  hud.id = 'hud'
  hud.innerHTML = `
    <div class="scanlines"></div>
    <div class="static-noise" aria-hidden="true"></div>
    <div class="cockpit-frame">
      <div class="corner tl"></div><div class="corner tr"></div>
      <div class="corner bl"></div><div class="corner br"></div>
    </div>
    <div class="system-label">
      <span class="sys-tag">System</span>
      <span class="sys-name">—</span>
      <span class="nearest-body"><span class="nb-tag">Nearest Body</span><span class="nb-name"></span></span>
    </div>
    <div class="target-panel" aria-live="polite">
      <div class="tp-tag">Target</div>
      <div class="tp-name">—</div>
      <div class="tp-meta"></div>
      <div class="tp-bars"></div>
    </div>
    <div class="status-panel">
      <div class="row shield">
        <div class="row-label"><span>Shield</span><span class="value"></span></div>
        <div class="bar"><div class="fill"></div></div>
      </div>
      <div class="row armor">
        <div class="row-label"><span>Armour</span><span class="value"></span></div>
        <div class="bar"><div class="fill"></div></div>
      </div>
      <div class="row hull">
        <div class="row-label"><span>Hull</span><span class="value"></span></div>
        <div class="bar"><div class="fill"></div></div>
      </div>
      <div class="row drones-bay" style="display:none;margin-top:4px">
        <div class="row-label"><span>Drones</span><span class="value drones-bay-count"></span></div>
      </div>
      <div class="drones-block" style="display:none;margin-top:10px;padding-top:8px;border-top:1px solid rgba(111,216,242,0.25)">
        <div class="panel-title" style="margin-bottom:6px">Drones (deployed)</div>
        <div class="drone-rows"></div>
      </div>
    </div>
    <div class="velocity-panel">
      <div class="row-label"><span>Velocity</span><span class="speed"></span></div>
      <div class="bar velocity"><div class="zero-marker"></div><div class="fill"></div></div>
    </div>
  `
  container.appendChild(hud)

  const radar = document.createElement('div')
  radar.id = 'radar'
  radar.innerHTML = `
    <div class="radar-frame">
      <canvas width="164" height="164"></canvas>
    </div>
  `
  // Nested inside hud (position:fixed makes placement independent of parent)
  // so removing hud.element also cleans up the radar — no separate tracking.
  hud.appendChild(radar)
  // Between radar (above) and system overview (below) on the right column.
  const systemScanBtn = document.createElement('button')
  systemScanBtn.type = 'button'
  systemScanBtn.className = 'system-scan-btn'
  systemScanBtn.textContent = 'System Scan (B)'
  hud.appendChild(systemScanBtn)
  const radarCanvas = radar.querySelector('canvas')
  const radarCtx = radarCanvas.getContext('2d')
  const radarSize = radarCanvas.width
  const radarCenter = radarSize / 2

  const CONTACT_COLORS = {
    hostile: '#e05a5a',
    neutral: '#5ee6ff',
    body: '#5a7a9a',
    waypoint: '#7fe0a0',
    mission: '#ff8a3d',
    wreck: '#c27a3a',
    anomaly: '#d080ff',
    nodule: '#60f0ff',
    alien_base: '#ff6040'
  }
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
  const systemNameEl = hud.querySelector('.system-label .sys-name')
  const nearestBodyEl = hud.querySelector('.system-label .nearest-body')
  const nearestBodyNameEl = hud.querySelector('.system-label .nearest-body .nb-name')
  const targetPanel = hud.querySelector('.target-panel')
  const targetNameEl = hud.querySelector('.target-panel .tp-name')
  const targetMetaEl = hud.querySelector('.target-panel .tp-meta')
  const targetBarsEl = hud.querySelector('.target-panel .tp-bars')
  let lastSystemLabelKey = null
  let lastNearestBodyName = undefined

  function pct(value, max) {
    return Math.max(0, Math.min(100, (value / max) * 100))
  }

  function barRow(label, value, max, kind) {
    const p = max > 0 ? pct(value, max) : 0
    return `<div class="tp-row">
      <div class="tp-row-label"><span>${label}</span><span class="value">${p.toFixed(0)}%</span></div>
      <div class="bar ${kind}"><div class="fill" style="width:${p}%"></div></div>
    </div>`
  }

  function formatSystemLabel(systemName, securityRating) {
    const name = systemName || '—'
    if (securityRating == null || !Number.isFinite(securityRating)) return name
    const sec = Math.max(0, Math.min(6, Math.floor(securityRating)))
    let cls = 'sec-low'
    if (sec >= 4) cls = 'sec-high'
    else if (sec >= 2) cls = 'sec-mid'
    return `${name} <span class="sec-badge ${cls}" title="System security ${sec}/6">Sec ${sec}</span>`
  }

  return {
    // forwardSpeed is signed (negative while reversing), unlike speed which
    // is the overall (unsigned) velocity magnitude shown in the text readout.
    // nearestBodyName: string when within HUD proximity of a planet/moon/star/
    // station/settlement; null/undefined hides the line.
    // securityRating: 0–6 system security shown beside the name.
    update(shipState, shipClass, speed, forwardSpeed, systemName = null, nearestBodyName = null, securityRating = null) {
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

      // Installed drones / bay capacity — under hull whenever the hull has bays.
      const dronesBayRow = hud.querySelector('.drones-bay')
      const dronesBayCount = hud.querySelector('.drones-bay-count')
      const bayCount = Math.max(0, Math.floor(Number(shipClass?.droneBays) || 0))
      if (dronesBayRow && dronesBayCount) {
        if (bayCount > 0) {
          dronesBayRow.style.display = 'block'
          const installed = (shipState.drones ?? []).length
          dronesBayCount.textContent = `${installed}/${bayCount}`
        } else {
          dronesBayRow.style.display = 'none'
        }
      }

      const frac = Math.max(-1, Math.min(1, forwardSpeed / shipClass.stats.speed))
      velocityFill.classList.toggle('reversing', frac < 0)
      velocityFill.style.left = `${50 + Math.min(0, frac) * 50}%`
      velocityFill.style.width = `${Math.abs(frac) * 50}%`

      speedEl.textContent = `${speed.toFixed(0)} m/s`

      const sysKey = `${systemName ?? ''}|${securityRating ?? ''}`
      if (systemName != null && sysKey !== lastSystemLabelKey) {
        lastSystemLabelKey = sysKey
        systemNameEl.innerHTML = formatSystemLabel(systemName, securityRating)
      }

      const nb = nearestBodyName || null
      if (nb !== lastNearestBodyName) {
        lastNearestBodyName = nb
        if (nb) {
          nearestBodyNameEl.textContent = nb
          nearestBodyEl.classList.add('visible')
        } else {
          nearestBodyNameEl.textContent = ''
          nearestBodyEl.classList.remove('visible')
        }
      }

      // Deployed drones: live S/A/H under ship bars
      const dronesBlock = hud.querySelector('.drones-block')
      const droneRows = hud.querySelector('.drone-rows')
      const deployed = (shipState.drones ?? []).filter(
        (d) => d.deployed && !d.destroyed && d.hull > 0 && d.mode !== 'bay'
      )
      if (dronesBlock && droneRows) {
        if (deployed.length) {
          dronesBlock.style.display = 'block'
          droneRows.innerHTML = deployed
            .map((d, i) => {
              const h = pct(d.hull, d.maxHull || d.hull || 1)
              const s = pct(d.shields, d.maxShields || d.shields || 1)
              const a = pct(d.armor, d.maxArmor || d.armor || 1)
              return `<div class="row" style="margin-bottom:6px">
                <div class="row-label"><span>Drone ${i + 1}</span><span class="value">S${s.toFixed(0)} A${a.toFixed(0)} H${h.toFixed(0)}</span></div>
                <div class="bar hull" style="height:5px"><div class="fill" style="width:${h}%"></div></div>
              </div>`
            })
            .join('')
        } else {
          dronesBlock.style.display = 'none'
          droneRows.innerHTML = ''
        }
      }
    },
    /**
     * Tab-lock target panel (between system name and radar).
     * @param {null|{
     *   name:string, hostile?:boolean, meta?:string,
     *   shields?:number, maxShields?:number,
     *   armor?:number, maxArmor?:number,
     *   hull?:number, maxHull?:number,
     *   oreLeft?:number, oreMax?:number,
     *   kind?:string
     * }} info
     */
    updateTarget(info) {
      if (!targetPanel) return
      if (!info) {
        targetPanel.classList.remove('visible', 'hostile')
        return
      }
      targetPanel.classList.add('visible')
      targetPanel.classList.toggle('hostile', !!info.hostile)
      targetNameEl.textContent = info.name || '—'
      targetMetaEl.textContent = info.meta || ''
      targetMetaEl.style.display = info.meta ? 'block' : 'none'

      const parts = []
      if (info.maxShields != null && info.maxShields > 0) {
        parts.push(barRow('Shield', info.shields ?? 0, info.maxShields, 'shield'))
      }
      if (info.maxArmor != null && info.maxArmor > 0) {
        parts.push(barRow('Armour', info.armor ?? 0, info.maxArmor, 'armor'))
      }
      if (info.maxHull != null && info.maxHull > 0) {
        parts.push(barRow('Hull', info.hull ?? 0, info.maxHull, 'hull'))
      }
      if (info.oreMax != null && info.oreMax > 0) {
        parts.push(barRow('Ore', info.oreLeft ?? 0, info.oreMax, 'ore'))
      }
      targetBarsEl.innerHTML = parts.join('')
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
    /** Sparse chromatic glitch on all HUD chrome while supercruising. */
    setCruiseGlitch(active) {
      hud.classList.toggle('cruise-glitch', !!active)
    },
    /**
     * @param {() => void} fn
     */
    onSystemScan(fn) {
      systemScanBtn.onclick = () => fn?.()
    },
    /**
     * While docked: hide flight HUD (stats, velocity, radar, target).
     * Keep system name + station/settlement on the top-left.
     * @param {boolean} docked
     * @param {{ systemName?: string|null, locationName?: string|null, securityRating?: number|null }} [info]
     */
    setDocked(docked, info = {}) {
      hud.classList.toggle('docked', !!docked)
      if (!docked) {
        // Restore default nearest-body tag wording.
        const tag = nearestBodyEl.querySelector('.nb-tag')
        if (tag) tag.textContent = 'Nearest Body'
        return
      }
      const tag = nearestBodyEl.querySelector('.nb-tag')
      if (tag) tag.textContent = 'Docked'
      const systemName = info.systemName ?? null
      const securityRating = info.securityRating ?? null
      const locationName = info.locationName ?? null
      const sysKey = `${systemName ?? ''}|${securityRating ?? ''}|dock`
      if (systemName != null && sysKey !== lastSystemLabelKey) {
        lastSystemLabelKey = sysKey
        systemNameEl.innerHTML = formatSystemLabel(systemName, securityRating)
      }
      const loc = locationName || null
      if (loc !== lastNearestBodyName) {
        lastNearestBodyName = loc
        if (loc) {
          nearestBodyNameEl.textContent = loc
          nearestBodyEl.classList.add('visible')
        } else {
          nearestBodyNameEl.textContent = ''
          nearestBodyEl.classList.remove('visible')
        }
      }
    },
    element: hud
  }
}
