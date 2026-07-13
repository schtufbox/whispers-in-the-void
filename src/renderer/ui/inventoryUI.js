import { getGood } from '../data/goods.js'
import { getShipClass } from '../data/shipClasses.js'
import { useShipPart } from '../game/economy.js'
import { findBody } from '../procgen/galaxy.js'

const STYLE = `
#inventory-ui { position: fixed; inset: 0; background: rgba(4,6,12,0.85); font-family: monospace; color: #cfe3ff; display: none; align-items: center; justify-content: center; z-index: 50; }
#inventory-ui .panel { width: 520px; max-height: 80vh; overflow-y: auto; background: #0b1020; border: 1px solid #2a3a55; padding: 16px; }
#inventory-ui .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
#inventory-ui table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
#inventory-ui th, #inventory-ui td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #1a2438; }
#inventory-ui button.close { background: #a13a3a; border: none; color: white; padding: 6px 12px; cursor: pointer; }
#inventory-ui button.use-part { background: #2a5a3a; border: none; color: #cfe3ff; padding: 4px 10px; cursor: pointer; }
#inventory-ui button.use-part:disabled { opacity: 0.4; cursor: not-allowed; }
#inventory-ui .empty { opacity: 0.5; font-size: 12px; }
#inventory-ui .remote-station { margin-bottom: 10px; }
#inventory-ui .remote-station h4 { margin: 0 0 4px 0; font-size: 13px; color: #7fe6ff; }
`

// Cargo/mining hold, ship parts (with a use-in-space button), and remote
// assets (what's sitting in per-station storage elsewhere, per body) — a
// read-only view of anywhere but the player's current ship; storage.js's own
// deposit/withdraw actions only apply at the currently docked station.
export function createInventoryUI(container, gameState) {
  const style = document.createElement('style')
  style.textContent = STYLE
  document.head.appendChild(style)

  const root = document.createElement('div')
  root.id = 'inventory-ui'
  root.innerHTML = `
    <div class="panel">
      <div class="header">
        <h2>Inventory</h2>
        <button class="close">Close</button>
      </div>
      <div class="content"></div>
    </div>
  `
  container.appendChild(root)

  const contentEl = root.querySelector('.content')

  function render() {
    const ship = gameState.player.ship
    const shipClass = getShipClass(ship.classId)
    const cargoRows = Object.entries(ship.cargo).filter(([, qty]) => qty > 0)
    const oreRows = Object.entries(ship.miningHold).filter(([, qty]) => qty > 0)
    const remoteEntries = Object.entries(gameState.stationStorage).filter(([, s]) =>
      Object.values(s.cargo).some((q) => q > 0) || Object.values(s.miningHold).some((q) => q > 0) || s.shipParts > 0 || s.ships.length > 0
    )

    contentEl.innerHTML = `
      <h3>Cargo Hold (${cargoRows.reduce((a, [, q]) => a + q, 0)}/${shipClass.stats.cargoCapacity})</h3>
      ${cargoRows.length ? `<table><tbody>${cargoRows.map(([id, qty]) => `<tr><td>${getGood(id).name}</td><td>${qty}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Empty</div>'}
      <h3>Mining Hold (${oreRows.reduce((a, [, q]) => a + q, 0)}/${shipClass.stats.miningCapacity})</h3>
      ${oreRows.length ? `<table><tbody>${oreRows.map(([id, qty]) => `<tr><td>${getGood(id).name}</td><td>${qty}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Empty</div>'}
      <h3>Ship Parts</h3>
      <p>Carried: ${ship.shipParts ?? 0} — each repairs 10% of max hull/armor. Usable anywhere, unlike station repair.</p>
      <button class="use-part" ${(ship.shipParts ?? 0) <= 0 ? 'disabled' : ''}>Use 1 Ship Part</button>
      <h3>Remote Assets</h3>
      ${remoteEntries.length ? remoteEntries.map(([bodyId, s]) => {
        const body = findBody(gameState.galaxy, bodyId)
        const cargoRowsHere = Object.entries(s.cargo).filter(([, q]) => q > 0)
        const oreRowsHere = Object.entries(s.miningHold).filter(([, q]) => q > 0)
        const bits = []
        if (cargoRowsHere.length) bits.push(`Cargo: ${cargoRowsHere.map(([id, q]) => `${q} ${getGood(id).name}`).join(', ')}`)
        if (oreRowsHere.length) bits.push(`Ore: ${oreRowsHere.map(([id, q]) => `${q} ${getGood(id).name}`).join(', ')}`)
        if (s.shipParts > 0) bits.push(`${s.shipParts} Ship Part(s)`)
        if (s.ships.length) bits.push(`${s.ships.length} stored ship(s): ${s.ships.map((sh) => sh.instanceName).join(', ')}`)
        return `<div class="remote-station"><h4>${body?.name ?? bodyId}</h4><div>${bits.join(' · ')}</div></div>`
      }).join('') : '<div class="empty">Nothing stored anywhere yet — visit a station or settlement\'s Storage tab to leave items behind.</div>'}
    `
    contentEl.querySelector('.use-part')?.addEventListener('click', () => {
      try {
        useShipPart(gameState)
      } catch (err) {
        alert(err.message)
      }
      render()
    })
  }

  root.querySelector('.close').addEventListener('click', () => {
    root.style.display = 'none'
    onCloseCallback?.()
  })

  let onCloseCallback = null

  return {
    show(onClose) {
      onCloseCallback = onClose
      render()
      root.style.display = 'flex'
    },
    hide() {
      root.style.display = 'none'
    },
    element: root
  }
}
