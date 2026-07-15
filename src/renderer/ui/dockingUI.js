import { GOODS, MINED_ORE_GOOD_IDS, SHIP_PARTS_GOOD_ID, SURVEY_DATA_GOOD_ID, getGood } from '../data/goods.js'
import {
  getPrice, buyGood, sellGood, sellMinedOre, buyMinedOre, buyShipParts, purchaseShip, repairCost, repairShip,
  activateStoredShip, sellStoredShip, storeCargo, retrieveCargo, storeOre, retrieveOre, storeShipParts, retrieveShipParts,
  renameActiveShip, renameStoredShip, buyWeapon, sellStoredWeapon, equipWeapon, sellCarriedWeapon, storeCarriedWeapons
} from '../game/economy.js'
import { purchasableShipClasses, getShipClass } from '../data/shipClasses.js'
import { WEAPONS, BASE_WEAPON_ID, getWeapon, weaponsForCategory } from '../data/weapons.js'
import { acceptMission, turnInMission } from '../game/missions.js'
import { escapeHtml } from './escapeHtml.js'

const STYLE = `
#docking-ui { position: fixed; inset: 0; background: rgba(4,6,12,0.38); backdrop-filter: blur(1.5px); font-family: monospace; color: #cfe3ff; display: none; align-items: center; justify-content: center; z-index: 50; }
#docking-ui .docked-layout { display: flex; gap: 16px; align-items: flex-start; }
#docking-ui .panel, #docking-ui .side-panel {
  max-height: 80vh; overflow-y: auto; padding: 18px 22px;
  background: linear-gradient(135deg, rgba(12,20,36,0.95), rgba(7,12,22,0.9));
  border: 1px solid rgba(111,216,242,0.4); border-left: 3px solid #6fd8f2;
  box-shadow: 0 0 26px rgba(79,195,217,0.22), inset 0 0 26px rgba(79,195,217,0.05);
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%);
}
#docking-ui .panel { width: 640px; }
#docking-ui .side-panel { width: 220px; }
#docking-ui .side-panel h3 { margin: 0 0 8px 0; }
#docking-ui .side-panel .empty { opacity: 0.5; font-size: 12px; }
#docking-ui h2 { font-weight: normal; letter-spacing: 2px; text-shadow: 0 0 8px rgba(79,195,217,0.5); }
#docking-ui h3 { font-weight: normal; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #7fe6ff; text-shadow: 0 0 6px rgba(79,195,217,0.6); margin: 18px 0 8px; }
#docking-ui .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
#docking-ui .tabs { display: flex; gap: 2px; margin-bottom: 16px; border-bottom: 1px solid rgba(111,216,242,0.25); }
#docking-ui .tab {
  background: transparent; border: none; border-bottom: 2px solid transparent; color: #8fb3d9;
  padding: 8px 16px; cursor: pointer; font-family: monospace; font-size: 11px;
  letter-spacing: 1.5px; text-transform: uppercase; transition: color 0.15s ease, border-color 0.15s ease;
}
#docking-ui .tab:hover { color: #cfe3ff; }
#docking-ui .tab.active { color: #7fe6ff; border-bottom-color: #6fd8f2; text-shadow: 0 0 6px rgba(79,195,217,0.6); }
#docking-ui table { width: 100%; border-collapse: collapse; }
#docking-ui th { text-align: left; padding: 6px 8px; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #7fa8c9; font-weight: normal; border-bottom: 1px solid rgba(111,216,242,0.3); }
#docking-ui td { text-align: left; padding: 6px 8px; border-bottom: 1px solid rgba(42,58,85,0.5); }
#docking-ui tbody tr:hover td { background: rgba(111,216,242,0.05); }
#docking-ui .credits { margin-bottom: 10px; opacity: 0.85; font-size: 12px; letter-spacing: 0.5px; }
#docking-ui button.close {
  background: rgba(224,90,90,0.12); border: 1px solid rgba(224,90,90,0.5); color: #ffb3b3;
  padding: 7px 16px; cursor: pointer; font-family: monospace; letter-spacing: 1px;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}
#docking-ui button.close:hover { background: rgba(224,90,90,0.22); box-shadow: 0 0 12px rgba(224,90,90,0.35); }
#docking-ui button.buy, #docking-ui button.sell, #docking-ui button.buy-ore, #docking-ui button.sell-ore,
#docking-ui button.buy-parts, #docking-ui button.buy-ship, #docking-ui button.accept-mission, #docking-ui button.turnin,
#docking-ui button.repair-btn, #docking-ui button.store-cargo, #docking-ui button.retrieve-cargo,
#docking-ui button.store-ore, #docking-ui button.retrieve-ore, #docking-ui button.store-parts,
#docking-ui button.retrieve-parts, #docking-ui button.activate-ship, #docking-ui button.sell-ship,
#docking-ui button.rename-active, #docking-ui button.rename-stored,
#docking-ui button.buy-weapon, #docking-ui button.sell-weapon {
  background: rgba(111,216,242,0.1); border: 1px solid rgba(111,216,242,0.4); color: #cfe3ff;
  padding: 4px 10px; cursor: pointer; margin-right: 4px; font-family: monospace;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}
#docking-ui button.buy:hover, #docking-ui button.sell:hover, #docking-ui button.buy-ore:hover, #docking-ui button.sell-ore:hover,
#docking-ui button.buy-parts:hover, #docking-ui button.buy-ship:hover, #docking-ui button.accept-mission:hover, #docking-ui button.turnin:hover,
#docking-ui button.repair-btn:not(:disabled):hover, #docking-ui button.store-cargo:hover, #docking-ui button.retrieve-cargo:hover,
#docking-ui button.store-ore:hover, #docking-ui button.retrieve-ore:hover, #docking-ui button.store-parts:hover,
#docking-ui button.retrieve-parts:hover, #docking-ui button.activate-ship:hover, #docking-ui button.sell-ship:hover,
#docking-ui button.rename-active:hover, #docking-ui button.rename-stored:hover,
#docking-ui button.buy-weapon:hover, #docking-ui button.sell-weapon:hover {
  background: rgba(111,216,242,0.22); box-shadow: 0 0 10px rgba(79,195,217,0.35);
}
#docking-ui button.repair-btn:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
#docking-ui .repair-row { margin-bottom: 10px; }
#docking-ui .shipyard-body { display: flex; gap: 16px; align-items: flex-start; }
#docking-ui .shipyard-body .ship-list { flex: 1.4; min-width: 0; }
#docking-ui .shipyard-body tr[data-class] { cursor: pointer; }
#docking-ui .shipyard-body tr[data-class]:hover td { background: rgba(111,216,242,0.08); }
#docking-ui .shipyard-body tr[data-class].selected td { color: #7fe0a0; text-shadow: 0 0 6px rgba(127,224,160,0.5); }
#docking-ui .ship-stats-panel {
  flex: 1; min-width: 200px; padding: 12px 16px;
  background: rgba(111,216,242,0.05); border: 1px solid rgba(111,216,242,0.3);
}
#docking-ui .ship-stats-panel h3 { margin-top: 0; }
#docking-ui .ship-stats-panel .stat { font-size: 13px; margin-bottom: 4px; opacity: 0.9; }
#docking-ui select.equip-select { background: rgba(8,14,26,0.9); border: 1px solid rgba(111,216,242,0.4); color: #cfe3ff; padding: 4px 8px; font-family: monospace; }
#docking-ui select.equip-select option:disabled { color: #4a5a75; }
`

export function createDockingUI(container, gameState, rng) {
  const style = document.createElement('style')
  style.textContent = STYLE
  document.head.appendChild(style)

  const root = document.createElement('div')
  root.id = 'docking-ui'
  root.innerHTML = `
    <div class="docked-layout">
      <div class="panel">
        <div class="header">
          <h2 class="body-name"></h2>
          <button class="close">Undock</button>
        </div>
        <div class="tabs">
          <button data-tab="trade" class="tab active">Trade</button>
          <button data-tab="shipyard" class="tab">Shipyard</button>
          <button data-tab="missions" class="tab">Missions</button>
          <button data-tab="storage" class="tab">Storage</button>
        </div>
        <div class="tab-content"></div>
      </div>
      <div class="side-panel"></div>
    </div>
  `
  container.appendChild(root)

  const bodyNameEl = root.querySelector('.body-name')
  const contentEl = root.querySelector('.tab-content')
  const sidePanelEl = root.querySelector('.side-panel')
  const tabButtons = [...root.querySelectorAll('.tab')]

  // Always visible regardless of which tab is open, so the player can see
  // what they're carrying while browsing the shipyard or mission board too,
  // not just while actively trading.
  function renderSidePanel() {
    const shipClass = getShipClass(gameState.player.ship.classId)
    const ship = gameState.player.ship
    const cargoRows = Object.entries(ship.cargo).filter(([, qty]) => qty > 0)
    const oreRows = Object.entries(ship.miningHold).filter(([, qty]) => qty > 0)
    const cargoUsed = cargoRows.reduce((a, [, qty]) => a + qty, 0)
    const oreUsed = oreRows.reduce((a, [, qty]) => a + qty, 0)
    sidePanelEl.innerHTML = `
      <h3>Cargo Hold (${cargoUsed}/${shipClass.stats.cargoCapacity})</h3>
      ${cargoRows.length ? `<table><tbody>${cargoRows.map(([id, qty]) => `<tr><td>${getGood(id).name}</td><td>${qty}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Empty</div>'}
      <h3>Mining Hold (${oreUsed}/${shipClass.stats.miningCapacity})</h3>
      ${oreRows.length ? `<table><tbody>${oreRows.map(([id, qty]) => `<tr><td>${getGood(id).name}</td><td>${qty}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Empty</div>'}
    `
  }

  let currentBody = null
  let currentTab = 'trade'
  let onUndock = null

  function renderTrade() {
    const shipClass = getShipClass(gameState.player.ship.classId)
    const ship = gameState.player.ship
    const cargoUsed = Object.values(ship.cargo).reduce((a, b) => a + b, 0)
    const miningHold = ship.miningHold
    const miningUsed = Object.values(miningHold).reduce((a, b) => a + b, 0)
    contentEl.innerHTML = `
      <div class="credits">Credits: ${gameState.player.credits}cr | Cargo: ${cargoUsed}/${shipClass.stats.cargoCapacity}</div>
      <table>
        <thead><tr><th>Good</th><th>Price</th><th>Held</th><th></th></tr></thead>
        <tbody>${GOODS.filter((g) => !MINED_ORE_GOOD_IDS.includes(g.id) && g.id !== SHIP_PARTS_GOOD_ID).map((g) => {
          const price = getPrice(gameState, currentBody.id, g.id)
          const held = gameState.player.ship.cargo[g.id] ?? 0
          // Survey data: probe-only — show sell row only when carried, never Buy.
          if (g.id === SURVEY_DATA_GOOD_ID) {
            if (held <= 0) return ''
            return `<tr>
              <td>${g.name}</td><td>${price}cr</td><td>${held}</td>
              <td><button class="sell" data-good="${g.id}">Sell 1</button></td>
            </tr>`
          }
          return `<tr>
            <td>${g.name}</td><td>${price}cr</td><td>${held}</td>
            <td><button class="buy" data-good="${g.id}">Buy 1</button><button class="sell" data-good="${g.id}">Sell 1</button></td>
          </tr>`
        }).join('')}</tbody>
      </table>
      <h3>Ore Sales (${miningUsed}/${shipClass.stats.miningCapacity})</h3>
      <table>
        <thead><tr><th>Ore</th><th>Price</th><th>Held</th><th></th></tr></thead>
        <tbody>${MINED_ORE_GOOD_IDS.map((goodId) => {
          const good = getGood(goodId)
          const price = getPrice(gameState, currentBody.id, goodId)
          const held = miningHold[goodId] ?? 0
          return `<tr>
            <td>${good.name}</td><td>${price}cr</td><td>${held}</td>
            <td><button class="buy-ore" data-good="${goodId}">Buy 1</button><button class="sell-ore" data-good="${goodId}">Sell 1</button></td>
          </tr>`
        }).join('')}</tbody>
      </table>
      ${currentBody.hasShipParts ? `
      <h3>Ship Parts</h3>
      <p>Carried: ${ship.shipParts ?? 0} — repairs 10% of hull/armour damage each when used from the Inventory (I) screen.</p>
      <button class="buy-parts">Buy 1 (${getPrice(gameState, currentBody.id, SHIP_PARTS_GOOD_ID)}cr)</button>` : ''}
    `
    contentEl.querySelector('.buy-parts')?.addEventListener('click', () => {
      try {
        buyShipParts(gameState, currentBody.id, 1)
      } catch (err) {
        alert(err.message)
      }
      renderTrade()
    })
    contentEl.querySelectorAll('.buy').forEach((btn) =>
      btn.addEventListener('click', () => {
        try {
          buyGood(gameState, currentBody.id, btn.dataset.good, 1)
        } catch (err) {
          alert(err.message)
        }
        renderTrade()
      })
    )
    contentEl.querySelectorAll('.sell').forEach((btn) =>
      btn.addEventListener('click', () => {
        try {
          sellGood(gameState, currentBody.id, btn.dataset.good, 1)
        } catch (err) {
          alert(err.message)
        }
        renderTrade()
      })
    )
    contentEl.querySelectorAll('.buy-ore').forEach((btn) =>
      btn.addEventListener('click', () => {
        try {
          buyMinedOre(gameState, currentBody.id, btn.dataset.good, 1)
        } catch (err) {
          alert(err.message)
        }
        renderTrade()
      })
    )
    contentEl.querySelectorAll('.sell-ore').forEach((btn) =>
      btn.addEventListener('click', () => {
        try {
          sellMinedOre(gameState, currentBody.id, btn.dataset.good, 1)
        } catch (err) {
          alert(err.message)
        }
        renderTrade()
      })
    )
    renderSidePanel()
  }

  // [key, label, formatter] rows shown in the Shipyard's stats panel — shared
  // between "browsing a ship for sale" and "the ship you currently fly" so
  // both read identically.
  const SHIP_STAT_ROWS = [
    ['hull', 'Hull'], ['shields', 'Shields'], ['armor', 'Armour'],
    ['cargoCapacity', 'Cargo Capacity'], ['miningCapacity', 'Mining Capacity'],
    ['speed', 'Speed'], ['turnRate', 'Turn Rate'], ['accel', 'Acceleration']
  ]

  function renderShipStatsPanel(shipClass) {
    return `
      <div class="ship-stats-panel">
        <h3>${shipClass.name}</h3>
        <div class="stat">Role: ${shipClass.role}</div>
        <div class="stat">Price: ${shipClass.price}cr</div>
        ${SHIP_STAT_ROWS.map(([key, label]) => `<div class="stat">${label}: ${shipClass.stats[key]}</div>`).join('')}
      </div>
    `
  }

  // Which ship class's stats the info panel shows — defaults to the
  // player's own current ship, and resets to that every time the Shipyard
  // tab (re)opens (see show() below), rather than persisting a stale
  // selection from a previous docking.
  let selectedShipClassId = null

  function renderShipyard() {
    const shipClass = getShipClass(gameState.player.ship.classId)
    const ship = gameState.player.ship
    selectedShipClassId ??= ship.classId
    // Repair (hull/armor only — shields already regenerate on their own, see
    // combat.js) is offered at both stations and settlements, unlike buying/
    // selling ships which stays station-only (settlements never generate
    // hasShipyard: true — see procgen/galaxy.js).
    const canRepairHere = currentBody.kind === 'station' || currentBody.kind === 'settlement'
    const repairCostHere = canRepairHere ? repairCost(gameState, currentBody) : 0
    const repairSection = canRepairHere
      ? `<div class="repair-row">
          Hull: ${Math.round(ship.hull)}/${shipClass.stats.hull} | Armour: ${Math.round(ship.armor)}/${shipClass.stats.armor}
          <button class="repair-btn" ${repairCostHere === 0 ? 'disabled' : ''}>${repairCostHere === 0 ? 'Fully Repaired' : `Repair Ship (${repairCostHere}cr)`}</button>
        </div>`
      : ''

    // Weapons (see data/weapons.js) are also a shipyard-only service, same
    // gating as buying/selling ships — a settlement's repair bay doesn't
    // stock hardpoint weapons.
    const storageWeapons = currentBody.hasShipyard ? (gameState.stationStorage[currentBody.id]?.weapons ?? {}) : {}
    const spareWeapons = ship.spareWeapons ?? {}
    const armorySection = currentBody.hasShipyard
      ? `
        <h3>Armoury</h3>
        <table>
          <thead><tr><th>Weapon</th><th>Category</th><th>Damage</th><th>Price</th><th>In Storage</th><th></th></tr></thead>
          <tbody>${WEAPONS.map((w) => `
            <tr>
              <td>${w.name}</td><td>${w.category}</td><td>${w.damage}</td><td>${w.price}cr</td><td>${storageWeapons[w.id] ?? 0}</td>
              <td><button class="buy-weapon" data-weapon="${w.id}">Buy</button></td>
            </tr>`).join('')}</tbody>
        </table>
        <h3>Loadout</h3>
        <table>
          <thead><tr><th>Hardpoint</th><th>Mount</th><th>Equipped Weapon</th></tr></thead>
          <tbody>${shipClass.hardpoints.map((hp) => {
            const mountType = hp.type === 'missile' ? 'missile' : 'laser'
            const equippedId = ship.equippedWeapons?.[hp.id] ?? BASE_WEAPON_ID[mountType]
            const options = weaponsForCategory(mountType).map((w) => {
              const isEquipped = w.id === equippedId
              const inStorage = storageWeapons[w.id] ?? 0
              const onShip = spareWeapons[w.id] ?? 0
              const owned = isEquipped || inStorage > 0 || onShip > 0
              const bits = []
              if (isEquipped) bits.push('equipped')
              if (inStorage > 0) bits.push(`${inStorage} storage`)
              if (onShip > 0) bits.push(`${onShip} salvaged`)
              const label = bits.length ? `${w.name} (${bits.join(', ')})` : `${w.name} (none available)`
              return `<option value="${w.id}" ${isEquipped ? 'selected' : ''} ${!owned ? 'disabled' : ''}>${label}</option>`
            }).join('')
            return `<tr>
              <td>${hp.id}</td><td>${mountType}</td>
              <td><select class="equip-select" data-hardpoint="${hp.id}">${options}</select></td>
            </tr>`
          }).join('')}</tbody>
        </table>
      `
      : ''

    if (!currentBody.hasShipyard) {
      contentEl.innerHTML = `${repairSection}<p>No shipyard at this location.</p>`
    } else {
      const selectedClass = getShipClass(selectedShipClassId)
      contentEl.innerHTML = `
        ${repairSection}
        <div class="credits">Credits: ${gameState.player.credits}cr | Current: ${escapeHtml(ship.instanceName)} (${shipClass.name}) <button class="rename-active">Rename</button></div>
        <div class="shipyard-body">
          <div class="ship-list">
            <table>
              <thead><tr><th>Ship</th><th>Role</th><th>Price</th><th></th></tr></thead>
              <tbody>${purchasableShipClasses().map((c) => `
                <tr data-class="${c.id}" class="${c.id === selectedShipClassId ? 'selected' : ''}">
                  <td>${c.name}</td><td>${c.role}</td><td>${c.price}cr</td>
                  <td><button class="buy-ship" data-class="${c.id}">Buy</button></td>
                </tr>`).join('')}</tbody>
            </table>
          </div>
          ${renderShipStatsPanel(selectedClass)}
        </div>
        ${armorySection}
      `
    }
    contentEl.querySelector('.repair-btn')?.addEventListener('click', () => {
      try {
        repairShip(gameState, currentBody)
      } catch (err) {
        alert(err.message)
      }
      renderShipyard()
    })
    contentEl.querySelector('.rename-active')?.addEventListener('click', () => {
      const name = window.prompt('Rename your ship:', ship.instanceName)
      if (name == null) return
      try {
        renameActiveShip(gameState, name)
      } catch (err) {
        alert(err.message)
      }
      renderShipyard()
    })
    contentEl.querySelectorAll('tr[data-class]').forEach((row) =>
      row.addEventListener('click', () => {
        selectedShipClassId = row.dataset.class
        renderShipyard()
      })
    )
    contentEl.querySelectorAll('.buy-ship').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const classId = btn.dataset.class
        const shipClassBought = getShipClass(classId)
        try {
          purchaseShip(gameState, currentBody.id, classId, shipClassBought.name)
          alert(`${shipClassBought.name} purchased and placed into storage here — visit the Storage tab to rename, activate, or sell it.`)
        } catch (err) {
          alert(err.message)
        }
        renderShipyard()
      })
    )
    contentEl.querySelectorAll('.buy-weapon').forEach((btn) =>
      btn.addEventListener('click', () => {
        try {
          buyWeapon(gameState, currentBody.id, btn.dataset.weapon)
        } catch (err) {
          alert(err.message)
        }
        renderShipyard()
      })
    )
    contentEl.querySelectorAll('.equip-select').forEach((select) =>
      select.addEventListener('change', () => {
        try {
          equipWeapon(gameState, currentBody.id, select.dataset.hardpoint, select.value)
        } catch (err) {
          alert(err.message)
        }
        renderShipyard()
      })
    )
    renderSidePanel()
  }

  function renderStorage() {
    const storage = gameState.stationStorage[currentBody.id] ?? { cargo: {}, miningHold: {}, shipParts: 0, ships: [], weapons: {} }
    const ship = gameState.player.ship
    const shipClass = getShipClass(ship.classId)
    const cargoRows = Object.entries(storage.cargo).filter(([, qty]) => qty > 0)
    const oreRows = Object.entries(storage.miningHold).filter(([, qty]) => qty > 0)
    const weaponRows = Object.entries(storage.weapons ?? {}).filter(([, qty]) => qty > 0)
    const spareWeaponRows = Object.entries(ship.spareWeapons ?? {}).filter(([, qty]) => qty > 0)

    contentEl.innerHTML = `
      <p style="opacity:0.7;font-size:12px;">Storage is per-station — anything left here can only be picked up again at ${currentBody.name}.</p>
      <h3>Cargo</h3>
      <div class="credits">In ship: ${Object.values(ship.cargo).reduce((a, b) => a + b, 0)}/${shipClass.stats.cargoCapacity} | In storage: ${cargoRows.reduce((a, [, qty]) => a + qty, 0)}</div>
      ${cargoRows.length ? `<table><tbody>${cargoRows.map(([id, qty]) => `<tr><td>${getGood(id).name}</td><td>${qty}</td></tr>`).join('')}</tbody></table>` : ''}
      <button class="store-cargo">Store All Cargo</button><button class="retrieve-cargo">Retrieve All Cargo</button>
      <h3>Mining Hold</h3>
      <div class="credits">In ship: ${Object.values(ship.miningHold).reduce((a, b) => a + b, 0)}/${shipClass.stats.miningCapacity} | In storage: ${oreRows.reduce((a, [, qty]) => a + qty, 0)}</div>
      ${oreRows.length ? `<table><tbody>${oreRows.map(([id, qty]) => `<tr><td>${getGood(id).name}</td><td>${qty}</td></tr>`).join('')}</tbody></table>` : ''}
      <button class="store-ore">Store All Ore</button><button class="retrieve-ore">Retrieve All Ore</button>
      <h3>Ship Parts</h3>
      <div class="credits">Carried: ${ship.shipParts ?? 0} | In storage: ${storage.shipParts ?? 0}</div>
      <button class="store-parts">Store All</button><button class="retrieve-parts">Retrieve All</button>
      <h3>Salvaged Weapons (on ship)</h3>
      ${spareWeaponRows.length ? `
      <table>
        <thead><tr><th>Weapon</th><th>Carried</th><th></th></tr></thead>
        <tbody>${spareWeaponRows.map(([id, qty]) => `
          <tr>
            <td>${getWeapon(id).name}</td><td>${qty}</td>
            <td>
              <button class="sell-carried-weapon" data-weapon="${id}">Sell (${Math.round(getWeapon(id).price * 0.5)}cr)</button>
            </td>
          </tr>`).join('')}</tbody>
      </table>
      <button class="store-weapons">Store All Salvaged Weapons Here</button>
      <p style="opacity:0.65;font-size:11px;">Equip salvaged weapons from the Shipyard Loadout tab.</p>` : '<p>No salvaged weapons on board. Rare wreck drops may yield hardpoint weapons.</p>'}
      <h3>Weapons (station storage)</h3>
      ${weaponRows.length ? `
      <table>
        <thead><tr><th>Weapon</th><th>In Storage</th><th></th></tr></thead>
        <tbody>${weaponRows.map(([id, qty]) => `
          <tr>
            <td>${getWeapon(id).name}</td><td>${qty}</td>
            <td><button class="sell-weapon" data-weapon="${id}">Sell (${Math.round(getWeapon(id).price * 0.5)}cr)</button></td>
          </tr>`).join('')}</tbody>
      </table>` : '<p>No spare weapons stored here.</p>'}
      <h3>Stored Ships</h3>
      ${storage.ships.length ? `
      <table>
        <thead><tr><th>Ship</th><th></th></tr></thead>
        <tbody>${storage.ships.map((s, i) => `
          <tr>
            <td>${escapeHtml(s.instanceName)} (${getShipClass(s.classId).name})</td>
            <td>
              <button class="rename-stored" data-index="${i}">Rename</button>
              <button class="activate-ship" data-index="${i}">Activate</button>
              <button class="sell-ship" data-index="${i}">Sell (${Math.round(getShipClass(s.classId).price * 0.5)}cr)</button>
            </td>
          </tr>`).join('')}</tbody>
      </table>` : '<p>No ships stored here.</p>'}
    `
    contentEl.querySelector('.store-cargo').addEventListener('click', () => { storeCargo(gameState, currentBody.id); renderStorage() })
    contentEl.querySelector('.retrieve-cargo').addEventListener('click', () => {
      try { retrieveCargo(gameState, currentBody.id) } catch (err) { alert(err.message) }
      renderStorage()
    })
    contentEl.querySelector('.store-ore').addEventListener('click', () => { storeOre(gameState, currentBody.id); renderStorage() })
    contentEl.querySelector('.retrieve-ore').addEventListener('click', () => {
      try { retrieveOre(gameState, currentBody.id) } catch (err) { alert(err.message) }
      renderStorage()
    })
    contentEl.querySelector('.store-parts').addEventListener('click', () => { storeShipParts(gameState, currentBody.id); renderStorage() })
    contentEl.querySelector('.retrieve-parts').addEventListener('click', () => { retrieveShipParts(gameState, currentBody.id); renderStorage() })
    contentEl.querySelectorAll('.sell-weapon').forEach((btn) =>
      btn.addEventListener('click', () => {
        try {
          sellStoredWeapon(gameState, currentBody.id, btn.dataset.weapon)
        } catch (err) {
          alert(err.message)
        }
        renderStorage()
      })
    )
    contentEl.querySelectorAll('.sell-carried-weapon').forEach((btn) =>
      btn.addEventListener('click', () => {
        try {
          sellCarriedWeapon(gameState, btn.dataset.weapon)
        } catch (err) {
          alert(err.message)
        }
        renderStorage()
      })
    )
    contentEl.querySelector('.store-weapons')?.addEventListener('click', () => {
      storeCarriedWeapons(gameState, currentBody.id)
      renderStorage()
    })
    contentEl.querySelectorAll('.rename-stored').forEach((btn) =>
      btn.addEventListener('click', () => {
        const index = Number(btn.dataset.index)
        const current = storage.ships[index]
        const name = window.prompt('Rename ship:', current?.instanceName)
        if (name == null) return
        try {
          renameStoredShip(gameState, currentBody.id, index, name)
        } catch (err) {
          alert(err.message)
        }
        renderStorage()
      })
    )
    contentEl.querySelectorAll('.activate-ship').forEach((btn) =>
      btn.addEventListener('click', () => {
        try {
          activateStoredShip(gameState, currentBody.id, Number(btn.dataset.index))
        } catch (err) {
          alert(err.message)
        }
        renderStorage()
      })
    )
    contentEl.querySelectorAll('.sell-ship').forEach((btn) =>
      btn.addEventListener('click', () => {
        try {
          sellStoredShip(gameState, currentBody.id, Number(btn.dataset.index))
        } catch (err) {
          alert(err.message)
        }
        renderStorage()
      })
    )
    renderSidePanel()
  }

  function renderMissions() {
    const boardMissions = gameState.missions.available.filter((m) => m.giverStationId === currentBody.id)
    const activeHere = gameState.missions.active.filter((m) => m.giverStationId === currentBody.id)
    contentEl.innerHTML = `
      <h3>Available</h3>
      <table>
        <thead><tr><th>Type</th><th>Title</th><th>Reward</th><th></th></tr></thead>
        <tbody>${boardMissions.map((m) => `
          <tr>
            <td>${m.type}</td><td>${m.title}</td><td>${m.reward}cr</td>
            <td><button class="accept-mission" data-id="${m.id}">Accept</button></td>
          </tr>`).join('')}</tbody>
      </table>
      <h3>Turn In</h3>
      <table>
        <thead><tr><th>Title</th><th>Status</th><th></th></tr></thead>
        <tbody>${activeHere.map((m) => `
          <tr>
            <td>${m.title}</td><td>${m.objectiveComplete ? 'Ready' : 'In progress'}</td>
            <td>${m.objectiveComplete ? `<button class="turnin" data-id="${m.id}">Turn In</button>` : ''}</td>
          </tr>`).join('')}</tbody>
      </table>
    `
    contentEl.querySelectorAll('.accept-mission').forEach((btn) =>
      btn.addEventListener('click', () => {
        acceptMission(gameState, btn.dataset.id, rng)
        renderMissions()
      })
    )
    contentEl.querySelectorAll('.turnin').forEach((btn) =>
      btn.addEventListener('click', () => {
        try {
          turnInMission(gameState, btn.dataset.id)
        } catch (err) {
          alert(err.message)
        }
        renderMissions()
      })
    )
    renderSidePanel()
  }

  const renderers = { trade: renderTrade, shipyard: renderShipyard, missions: renderMissions, storage: renderStorage }

  function renderCurrentTab() {
    renderers[currentTab]()
  }

  tabButtons.forEach((btn) =>
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab
      tabButtons.forEach((b) => b.classList.toggle('active', b === btn))
      renderCurrentTab()
    })
  )

  root.querySelector('.close').addEventListener('click', () => {
    root.style.display = 'none'
    onUndock?.()
  })

  return {
    show(body, undockCallback) {
      currentBody = body
      onUndock = undockCallback
      // Station/settlement names are generated already ending in "Station"/
      // "Settlement" (see procgen/names.js) — appending "(kind)" on top of
      // that said it twice ("Dunell Settlement (settlement)"). Only append it
      // for kinds (planet/moon) whose name doesn't already spell it out.
      const kindLabel = body.kind.charAt(0).toUpperCase() + body.kind.slice(1)
      bodyNameEl.textContent = body.name.endsWith(kindLabel) ? body.name : `${body.name} (${body.kind})`
      selectedShipClassId = null
      currentTab = 'trade'
      tabButtons.forEach((b) => b.classList.toggle('active', b.dataset.tab === 'trade'))
      renderCurrentTab()
      root.style.display = 'flex'
    },
    hide() {
      root.style.display = 'none'
    },
    element: root
  }
}
