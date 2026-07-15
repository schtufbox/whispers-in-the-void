import { GOODS, MINED_ORE_GOOD_IDS, SHIP_PARTS_GOOD_ID, SURVEY_DATA_GOOD_ID, getGood } from '../data/goods.js'
import {
  getPrice, buyGood, sellGood, sellMinedOre, buyMinedOre, buyShipParts, purchaseShip, repairCost, repairShip,
  activateStoredShip, sellStoredShip, storeCargo, retrieveCargo, storeOre, retrieveOre, storeShipParts, retrieveShipParts,
  renameActiveShip, renameStoredShip, buyWeapon, sellStoredWeapon, equipWeapon, sellCarriedWeapon, storeCarriedWeapons
} from '../game/economy.js'
import {
  startCraft,
  storeBlueprints,
  retrieveBlueprints,
  jobsAtBody,
  craftRemainingS,
  ensureBlueprintMaps
} from '../game/crafting.js'
import {
  getBlueprint,
  oreCostForBlueprint,
  creditCostForBlueprint,
  craftDurationS,
  formatDuration,
  formatOreCost
} from '../data/blueprints.js'
import { purchasableShipClasses, getShipClass } from '../data/shipClasses.js'
import { WEAPONS, BASE_WEAPON_ID, getWeapon, weaponsForCategory } from '../data/weapons.js'
import { acceptMission, turnInMission } from '../game/missions.js'
import { escapeHtml } from './escapeHtml.js'

const STYLE = `
/* Docked chrome: actions stay clickable; full menu only when .services-open.
   Top-aligned so Trade / Shipyard / etc. keep the same header Y when side
   boxes appear or content height changes. */
#docking-ui {
  position: fixed; inset: 0; background: transparent; backdrop-filter: none;
  font-family: monospace; color: #cfe3ff; display: none;
  align-items: flex-start; justify-content: center;
  padding-top: 6vh; box-sizing: border-box; z-index: 50;
  pointer-events: none;
}
#docking-ui.services-open {
  background: rgba(4,6,12,0.38); backdrop-filter: blur(1.5px);
  pointer-events: auto;
}
#docking-ui .docked-layout {
  display: none; gap: 16px; align-items: flex-start;
  max-height: calc(100vh - 6vh - 2vh); min-height: 0;
  pointer-events: auto;
}
#docking-ui.services-open .docked-layout { display: flex; }
#docking-ui .panel, #docking-ui .side-panel {
  max-height: calc(100vh - 6vh - 2vh); overflow-y: auto; padding: 18px 22px;
  background: linear-gradient(135deg, rgba(12,20,36,0.95), rgba(7,12,22,0.9));
  border: 1px solid rgba(111,216,242,0.4); border-left: 3px solid #6fd8f2;
  box-shadow: 0 0 26px rgba(79,195,217,0.22), inset 0 0 26px rgba(79,195,217,0.05);
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%);
}
#docking-ui .panel { width: 720px; }
#docking-ui .side-column {
  display: flex; flex-direction: column; gap: 12px; width: 260px; flex-shrink: 0;
  max-height: calc(100vh - 6vh - 2vh); overflow-y: auto; min-height: 0;
}
#docking-ui .side-column.shipyard-left-column { width: 230px; }
#docking-ui .side-panel { width: 100%; max-height: none; box-sizing: border-box; }
#docking-ui .side-panel.ships-side { max-height: none; }
#docking-ui .side-panel.jobs-side { max-height: none; }
#docking-ui .side-panel h3 { margin: 0 0 8px 0; }
#docking-ui .side-panel h3 + h3 { margin-top: 14px; }
#docking-ui .side-panel .panel-kicker {
  font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase;
  color: #7fe6ff; opacity: 0.75; margin: 0 0 10px 0;
  text-shadow: 0 0 6px rgba(79,195,217,0.45);
}
#docking-ui .side-panel .meta-line {
  font-size: 11px; opacity: 0.75; margin: 0 0 8px 0;
}
#docking-ui .side-panel .holds-actions {
  display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0 4px;
}
#docking-ui .side-panel .holds-actions button {
  margin-right: 0; padding: 3px 8px; font-size: 11px;
}
#docking-ui .side-panel .empty { opacity: 0.5; font-size: 12px; }
#docking-ui .side-panel .job-row { font-size: 12px; margin-bottom: 10px; }
#docking-ui .side-panel .job-row .job-name { color: #cfe3ff; margin-bottom: 2px; }
#docking-ui .side-panel .job-row .job-meta { opacity: 0.7; font-size: 11px; margin-bottom: 4px; }
#docking-ui .side-panel .ship-row {
  font-size: 12px; margin-bottom: 12px; padding-bottom: 10px;
  border-bottom: 1px solid rgba(111,216,242,0.15);
}
#docking-ui .side-panel .ship-row:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
#docking-ui .side-panel .ship-row .ship-name { color: #cfe3ff; margin-bottom: 2px; }
#docking-ui .side-panel .ship-row .ship-class { opacity: 0.65; font-size: 11px; margin-bottom: 6px; }
#docking-ui .side-panel .ship-row .ship-actions { display: flex; flex-wrap: wrap; gap: 4px; }
#docking-ui .side-panel .ship-row .ship-actions button {
  margin-right: 0; padding: 3px 8px; font-size: 11px;
}
/* Electron: no window.prompt / unreliable alert — in-UI dialogs. */
#docking-ui .dock-prompt-overlay {
  position: absolute; inset: 0; z-index: 20;
  display: flex; align-items: center; justify-content: center;
  background: rgba(4,6,12,0.55);
}
#docking-ui .dock-prompt {
  width: min(400px, 90vw); padding: 18px 20px;
  background: linear-gradient(135deg, rgba(12,20,36,0.98), rgba(7,12,22,0.95));
  border: 1px solid rgba(111,216,242,0.5); border-left: 3px solid #6fd8f2;
  box-shadow: 0 0 28px rgba(79,195,217,0.3);
}
#docking-ui .dock-prompt .prompt-title {
  font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase;
  color: #7fe6ff; margin-bottom: 12px;
}
#docking-ui .dock-prompt .prompt-body {
  font-size: 13px; line-height: 1.45; color: #cfe3ff; opacity: 0.92;
  margin-bottom: 14px; white-space: pre-wrap;
}
#docking-ui .dock-prompt input {
  width: 100%; box-sizing: border-box; margin-bottom: 12px;
  background: rgba(8,14,26,0.95); border: 1px solid rgba(111,216,242,0.4);
  color: #cfe3ff; padding: 8px 10px; font-family: monospace; font-size: 13px;
}
#docking-ui .dock-prompt input:focus { outline: none; border-color: #7fe6ff; box-shadow: 0 0 8px rgba(79,195,217,0.35); }
#docking-ui .dock-prompt .prompt-actions { display: flex; justify-content: flex-end; gap: 8px; }
#docking-ui .dock-prompt button.prompt-ok {
  background: rgba(111,216,242,0.15); border: 1px solid rgba(111,216,242,0.5); color: #cfe3ff;
  padding: 6px 14px; cursor: pointer; font-family: monospace;
}
#docking-ui .dock-prompt button.prompt-cancel {
  background: rgba(224,90,90,0.12); border: 1px solid rgba(224,90,90,0.45); color: #ffb3b3;
  padding: 6px 14px; cursor: pointer; font-family: monospace;
}
#docking-ui .dock-prompt button.prompt-ok:hover { background: rgba(111,216,242,0.28); }
#docking-ui .dock-prompt button.prompt-cancel:hover { background: rgba(224,90,90,0.22); }
#docking-ui h2 { font-weight: normal; letter-spacing: 2px; text-shadow: 0 0 8px rgba(79,195,217,0.5); }
#docking-ui h3 { font-weight: normal; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #7fe6ff; text-shadow: 0 0 6px rgba(79,195,217,0.6); margin: 18px 0 8px; }
#docking-ui .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; gap: 12px; }
#docking-ui .header .body-name { flex: 1; min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#docking-ui .header-credits {
  flex-shrink: 0; font-size: 13px; letter-spacing: 1px; color: #ffe08a;
  text-shadow: 0 0 8px rgba(255,210,70,0.4); white-space: nowrap;
}
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
/* Bottom-right action stack, clear of cockpit corner braces (inset ~44px). */
#docking-ui .dock-actions {
  position: fixed; bottom: 52px; right: 52px; z-index: 55;
  display: flex; flex-direction: column; gap: 10px; align-items: stretch;
  pointer-events: auto;
}
#docking-ui button.services-btn {
  background: rgba(255,210,70,0.16); border: 1px solid rgba(255,210,70,0.65); color: #ffe08a;
  padding: 12px 22px; cursor: pointer; font-family: monospace; letter-spacing: 2px;
  font-size: 13px; text-transform: uppercase;
  box-shadow: 0 0 18px rgba(255,210,70,0.22), 0 2px 8px rgba(0,0,0,0.45);
  transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.12s ease;
}
#docking-ui button.services-btn:hover {
  background: rgba(255,210,70,0.28); box-shadow: 0 0 22px rgba(255,210,70,0.4), 0 2px 10px rgba(0,0,0,0.5);
  transform: translateY(-1px);
}
#docking-ui.services-open button.services-btn {
  background: rgba(255,210,70,0.28); box-shadow: 0 0 16px rgba(255,210,70,0.35);
}
#docking-ui button.undock-btn {
  background: rgba(224,90,90,0.16); border: 1px solid rgba(224,90,90,0.55); color: #ffb3b3;
  padding: 12px 28px; cursor: pointer; font-family: monospace; letter-spacing: 2px;
  font-size: 13px; text-transform: uppercase;
  box-shadow: 0 0 18px rgba(224,90,90,0.22), 0 2px 8px rgba(0,0,0,0.45);
  transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.12s ease;
}
#docking-ui button.undock-btn:hover {
  background: rgba(224,90,90,0.28); box-shadow: 0 0 22px rgba(224,90,90,0.4), 0 2px 10px rgba(0,0,0,0.5);
  transform: translateY(-1px);
}
#docking-ui button.buy, #docking-ui button.sell, #docking-ui button.buy-ore, #docking-ui button.sell-ore,
#docking-ui button.buy-parts, #docking-ui button.buy-ship, #docking-ui button.accept-mission, #docking-ui button.turnin,
#docking-ui button.repair-btn, #docking-ui button.store-cargo, #docking-ui button.retrieve-cargo,
#docking-ui button.store-ore, #docking-ui button.retrieve-ore, #docking-ui button.store-parts,
#docking-ui button.retrieve-parts, #docking-ui button.activate-ship, #docking-ui button.sell-ship,
#docking-ui button.rename-active, #docking-ui button.rename-stored,
#docking-ui button.buy-weapon, #docking-ui button.sell-weapon,
#docking-ui button.store-blueprints, #docking-ui button.retrieve-blueprints,
#docking-ui button.assemble-btn {
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
#docking-ui button.buy-weapon:hover, #docking-ui button.sell-weapon:hover,
#docking-ui button.store-blueprints:hover, #docking-ui button.retrieve-blueprints:hover,
#docking-ui button.assemble-btn:hover:not(:disabled) {
  background: rgba(111,216,242,0.22); box-shadow: 0 0 10px rgba(79,195,217,0.35);
}
#docking-ui button.assemble-btn:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
#docking-ui .craft-progress {
  height: 8px; background: #0c1424; border: 1px solid #2a3a55; margin-top: 4px; overflow: hidden;
}
#docking-ui .craft-progress .fill { height: 100%; background: linear-gradient(90deg, #2e8fa8, #7fe6ff); }
#docking-ui button.repair-btn:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
#docking-ui .repair-row { margin-bottom: 10px; }
/* Shipyard main content: ships | armoury (stats + loadout are external side boxes) */
#docking-ui .shipyard-main {
  display: flex; gap: 14px; align-items: flex-start;
}
#docking-ui .shipyard-main .ship-list,
#docking-ui .shipyard-main .armoury-list {
  flex: 1; min-width: 0; max-height: 52vh; overflow-y: auto;
}
#docking-ui .shipyard-main .ship-list h3,
#docking-ui .shipyard-main .armoury-list h3 { margin-top: 0; }
#docking-ui .shipyard-main tr[data-class] { cursor: pointer; }
#docking-ui .shipyard-main tr[data-class]:hover td { background: rgba(111,216,242,0.08); }
#docking-ui .shipyard-main tr[data-class].selected td { color: #7fe0a0; text-shadow: 0 0 6px rgba(127,224,160,0.5); }
#docking-ui .side-panel.stats-side .stat,
#docking-ui .side-panel.loadout-side .stat { font-size: 12px; margin-bottom: 4px; opacity: 0.9; }
#docking-ui .side-panel.loadout-side .hp-block { margin-bottom: 10px; }
#docking-ui .side-panel.loadout-side .hp-block:last-child { margin-bottom: 0; }
#docking-ui select.equip-select {
  width: 100%; max-width: 100%; box-sizing: border-box;
  background: rgba(8,14,26,0.9); border: 1px solid rgba(111,216,242,0.4);
  color: #cfe3ff; padding: 4px 6px; font-family: monospace; font-size: 11px;
}
#docking-ui select.equip-select option:disabled { color: #4a5a75; }
`

export function createDockingUI(container, gameState, rng, hooks = {}) {
  const { onCraftStarted, onPlayerShipChanged } = hooks
  const style = document.createElement('style')
  style.textContent = STYLE
  document.head.appendChild(style)

  const root = document.createElement('div')
  root.id = 'docking-ui'
  root.innerHTML = `
    <div class="docked-layout">
      <div class="side-column shipyard-left-column" style="display:none">
        <div class="side-panel stats-side"></div>
        <div class="side-panel loadout-side"></div>
      </div>
      <div class="panel">
        <div class="header">
          <h2 class="body-name"></h2>
          <span class="header-credits"></span>
        </div>
        <div class="tabs">
          <button data-tab="trade" class="tab active">Trade</button>
          <button data-tab="shipyard" class="tab">Shipyard</button>
          <button data-tab="missions" class="tab">Missions</button>
          <button data-tab="storage" class="tab">Storage</button>
          <button data-tab="industry" class="tab">Industry</button>
        </div>
        <div class="tab-content"></div>
      </div>
      <div class="side-column">
        <div class="side-panel holds-side"></div>
        <div class="side-panel ships-side" style="display:none"></div>
        <div class="side-panel jobs-side" style="display:none"></div>
      </div>
    </div>
    <div class="dock-actions">
      <button type="button" class="services-btn">Station Services</button>
      <button type="button" class="undock-btn">Undock</button>
    </div>
  `
  container.appendChild(root)

  const bodyNameEl = root.querySelector('.body-name')
  const headerCreditsEl = root.querySelector('.header-credits')
  const contentEl = root.querySelector('.tab-content')

  function updateHeaderCredits() {
    const n = Math.max(0, Math.floor(Number(gameState.player.credits) || 0))
    headerCreditsEl.textContent = `${n.toLocaleString()} cr`
  }
  const shipyardLeftCol = root.querySelector('.shipyard-left-column')
  const statsSideEl = root.querySelector('.stats-side')
  const loadoutSideEl = root.querySelector('.loadout-side')
  const holdsSideEl = root.querySelector('.holds-side')
  const shipsSideEl = root.querySelector('.ships-side')
  const jobsSideEl = root.querySelector('.jobs-side')
  const tabButtons = [...root.querySelectorAll('.tab')]

  // Electron disables window.prompt / often blocks alert — in-panel dialogs.
  function openDialog({ title, body = '', defaultValue = null, okLabel = 'OK', cancelLabel = null, maxLength = 40 }) {
    return new Promise((resolve) => {
      root.querySelector('.dock-prompt-overlay')?.remove()
      const overlay = document.createElement('div')
      overlay.className = 'dock-prompt-overlay'
      const hasInput = defaultValue !== null
      overlay.innerHTML = `
        <div class="dock-prompt" role="dialog" aria-label="${escapeHtml(title)}">
          <div class="prompt-title">${escapeHtml(title)}</div>
          ${body ? `<div class="prompt-body">${escapeHtml(body)}</div>` : ''}
          ${hasInput ? `<input type="text" maxlength="${maxLength}" />` : ''}
          <div class="prompt-actions">
            ${cancelLabel != null ? `<button type="button" class="prompt-cancel">${escapeHtml(cancelLabel)}</button>` : ''}
            <button type="button" class="prompt-ok">${escapeHtml(okLabel)}</button>
          </div>
        </div>
      `
      root.appendChild(overlay)
      const input = overlay.querySelector('input')
      if (input) {
        input.value = defaultValue ?? ''
        input.focus()
        input.select()
      } else {
        overlay.querySelector('.prompt-ok')?.focus()
      }
      const finish = (value) => {
        overlay.remove()
        resolve(value)
      }
      overlay.querySelector('.prompt-ok').addEventListener('click', () => finish(hasInput ? input.value : true))
      overlay.querySelector('.prompt-cancel')?.addEventListener('click', () => finish(null))
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) finish(hasInput ? null : true)
      })
      const onKey = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          finish(hasInput ? input.value : true)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          finish(hasInput ? null : true)
        }
      }
      ;(input ?? overlay).addEventListener('keydown', onKey)
    })
  }

  function askText(title, defaultValue = '') {
    return openDialog({ title, defaultValue, okLabel: 'Rename', cancelLabel: 'Cancel' })
  }

  function showNotice(title, body, okLabel = 'OK') {
    return openDialog({ title, body, okLabel })
  }

  // Always visible ship inventory on the right; station ships + industry jobs below.
  function renderSidePanel() {
    updateHeaderCredits()
    ensureBlueprintMaps(gameState)
    const shipClass = getShipClass(gameState.player.ship.classId)
    const ship = gameState.player.ship
    const cargoRows = Object.entries(ship.cargo).filter(([, qty]) => qty > 0)
    const oreRows = Object.entries(ship.miningHold).filter(([, qty]) => qty > 0)
    const cargoUsed = cargoRows.reduce((a, [, qty]) => a + qty, 0)
    const oreUsed = oreRows.reduce((a, [, qty]) => a + qty, 0)
    const spareWeaponRows = Object.entries(ship.spareWeapons ?? {}).filter(([, qty]) => qty > 0)
    const shipBpRows = Object.entries(ship.blueprints ?? {}).filter(([, qty]) => qty > 0)
    const shipParts = ship.shipParts ?? 0
    const atBay =
      currentBody &&
      (currentBody.kind === 'station' || currentBody.kind === 'settlement')
    // Transfer actions only when docked — Storage tab uses the same station body.
    const transferHtml = atBay
      ? `
      <div class="holds-actions">
        <button type="button" class="store-cargo">Store cargo</button>
        <button type="button" class="retrieve-cargo">Retrieve cargo</button>
      </div>
      <div class="holds-actions">
        <button type="button" class="store-ore">Store ore</button>
        <button type="button" class="retrieve-ore">Retrieve ore</button>
      </div>
      <div class="holds-actions">
        <button type="button" class="store-parts">Store parts</button>
        <button type="button" class="retrieve-parts">Retrieve parts</button>
      </div>
      ${spareWeaponRows.length ? `<div class="holds-actions"><button type="button" class="store-weapons">Store salvaged weapons</button></div>` : ''}
      ${shipBpRows.length ? `<div class="holds-actions"><button type="button" class="store-blueprints">Store blueprints</button></div>` : ''}
      `
      : ''

    holdsSideEl.innerHTML = `
      <div class="panel-kicker">Your ship</div>
      <h3>Cargo Hold (${cargoUsed}/${shipClass.stats.cargoCapacity})</h3>
      ${cargoRows.length ? `<table><tbody>${cargoRows.map(([id, qty]) => `<tr><td>${getGood(id).name}</td><td>${qty}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Empty</div>'}
      <h3>Mining Hold (${oreUsed}/${shipClass.stats.miningCapacity})</h3>
      ${oreRows.length ? `<table><tbody>${oreRows.map(([id, qty]) => `<tr><td>${getGood(id).name}</td><td>${qty}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Empty</div>'}
      <h3>Ship Parts</h3>
      <div class="meta-line">Carried: ${shipParts}</div>
      <h3>Salvaged Weapons</h3>
      ${spareWeaponRows.length
        ? `<table><tbody>${spareWeaponRows.map(([id, qty]) => `
            <tr>
              <td>${getWeapon(id).name}</td><td>×${qty}</td>
              <td><button type="button" class="sell-carried-weapon" data-weapon="${id}">Sell</button></td>
            </tr>`).join('')}</tbody></table>`
        : '<div class="empty">None</div>'}
      <h3>Blueprints</h3>
      ${shipBpRows.length
        ? `<table><tbody>${shipBpRows.map(([id, qty]) => {
          let name = id
          try { name = getBlueprint(id).name } catch { /* */ }
          return `<tr><td>${escapeHtml(name)}</td><td>×${qty}</td></tr>`
        }).join('')}</tbody></table>`
        : '<div class="empty">None</div>'}
      ${transferHtml}
    `

    if (atBay) {
      const reStorage = () => {
        renderSidePanel()
        if (currentTab === 'storage') renderStorage()
        else if (currentTab === 'industry') renderIndustry()
        else if (currentTab === 'shipyard') renderShipyard()
      }
      holdsSideEl.querySelector('.store-cargo')?.addEventListener('click', () => {
        storeCargo(gameState, currentBody.id)
        reStorage()
      })
      holdsSideEl.querySelector('.retrieve-cargo')?.addEventListener('click', async () => {
        try { retrieveCargo(gameState, currentBody.id) } catch (err) { await showNotice('Retrieve failed', err.message) }
        reStorage()
      })
      holdsSideEl.querySelector('.store-ore')?.addEventListener('click', () => {
        storeOre(gameState, currentBody.id)
        reStorage()
      })
      holdsSideEl.querySelector('.retrieve-ore')?.addEventListener('click', async () => {
        try { retrieveOre(gameState, currentBody.id) } catch (err) { await showNotice('Retrieve failed', err.message) }
        reStorage()
      })
      holdsSideEl.querySelector('.store-parts')?.addEventListener('click', () => {
        storeShipParts(gameState, currentBody.id)
        reStorage()
      })
      holdsSideEl.querySelector('.retrieve-parts')?.addEventListener('click', () => {
        retrieveShipParts(gameState, currentBody.id)
        reStorage()
      })
      holdsSideEl.querySelector('.store-weapons')?.addEventListener('click', () => {
        storeCarriedWeapons(gameState, currentBody.id)
        reStorage()
      })
      holdsSideEl.querySelector('.store-blueprints')?.addEventListener('click', () => {
        storeBlueprints(gameState, currentBody.id)
        reStorage()
      })
    }

    holdsSideEl.querySelectorAll('.sell-carried-weapon').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          sellCarriedWeapon(gameState, btn.dataset.weapon)
        } catch (err) {
          await showNotice('Sale failed', err.message)
        }
        renderSidePanel()
        if (currentTab === 'storage') renderStorage()
      })
    )

    if (!atBay) {
      shipsSideEl.style.display = 'none'
      shipsSideEl.innerHTML = ''
      jobsSideEl.style.display = 'none'
      jobsSideEl.innerHTML = ''
      return
    }

    const storage = gameState.stationStorage[currentBody.id] ?? { ships: [] }
    storage.ships ??= []
    shipsSideEl.style.display = 'block'
    shipsSideEl.innerHTML = `
      <h3>Ships stored here</h3>
      ${storage.ships.length
        ? storage.ships.map((s, i) => {
          let className = s.classId
          let sellPrice = 0
          try {
            const sc = getShipClass(s.classId)
            className = sc.name
            sellPrice = Math.round(sc.price * 0.5)
          } catch { /* */ }
          return `
            <div class="ship-row">
              <div class="ship-name">${escapeHtml(s.instanceName)}</div>
              <div class="ship-class">${escapeHtml(className)}</div>
              <div class="ship-actions">
                <button type="button" class="rename-stored" data-index="${i}">Rename</button>
                <button type="button" class="activate-ship" data-index="${i}">Activate</button>
                <button type="button" class="sell-ship" data-index="${i}">Sell (${sellPrice}cr)</button>
              </div>
            </div>`
        }).join('')
        : '<div class="empty">None — buy at Shipyard or craft at Industry</div>'}
    `
    shipsSideEl.querySelectorAll('.rename-stored').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const index = Number(btn.dataset.index)
        const current = storage.ships[index]
        const name = await askText('Rename ship', current?.instanceName ?? '')
        if (name == null) return
        try {
          renameStoredShip(gameState, currentBody.id, index, name)
        } catch (err) {
          await showNotice('Cannot rename', err.message)
        }
        renderSidePanel()
        if (currentTab === 'shipyard') renderShipyard()
      })
    )
    shipsSideEl.querySelectorAll('.activate-ship').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          activateStoredShip(gameState, currentBody.id, Number(btn.dataset.index))
          onPlayerShipChanged?.()
          await showNotice(
            'Ship activated',
            `${gameState.player.ship.instanceName} is now your active vessel.`
          )
        } catch (err) {
          await showNotice('Cannot activate', err.message)
        }
        renderSidePanel()
        renderCurrentTab()
      })
    )
    shipsSideEl.querySelectorAll('.sell-ship').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          const index = Number(btn.dataset.index)
          const sold = storage.ships[index]
          const label = sold ? `${sold.instanceName}` : 'Ship'
          sellStoredShip(gameState, currentBody.id, index)
          await showNotice('Ship sold', `${label} sold from station storage.`)
        } catch (err) {
          await showNotice('Cannot sell', err.message)
        }
        renderSidePanel()
        if (currentTab === 'storage') renderStorage()
      })
    )

    const jobs = jobsAtBody(gameState, currentBody.id)
    const now = Date.now()
    jobsSideEl.style.display = 'block'
    jobsSideEl.innerHTML = `
      <h3>Jobs at this bay</h3>
      ${jobs.length
        ? jobs.map((job) => {
          let name = job.blueprintId
          try { name = getBlueprint(job.blueprintId).itemName } catch { /* */ }
          const rem = craftRemainingS(job, now)
          const pct = Math.min(100, Math.round((1 - rem / Math.max(1, job.durationS)) * 100))
          return `
            <div class="job-row">
              <div class="job-name">${escapeHtml(name)}</div>
              <div class="job-meta">${formatDuration(rem)} remaining</div>
              <div class="craft-progress"><div class="fill" style="width:${pct}%"></div></div>
            </div>`
        }).join('')
        : '<div class="empty">No active builds</div>'}
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
    contentEl.querySelector('.buy-parts')?.addEventListener('click', async () => {
      try {
        buyShipParts(gameState, currentBody.id, 1)
        await showNotice('Purchased', 'Ship part added to your inventory.')
      } catch (err) {
        await showNotice('Purchase failed', err.message)
      }
      renderTrade()
    })
    contentEl.querySelectorAll('.buy').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          buyGood(gameState, currentBody.id, btn.dataset.good, 1)
        } catch (err) {
          await showNotice('Purchase failed', err.message)
        }
        renderTrade()
      })
    )
    contentEl.querySelectorAll('.sell').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          sellGood(gameState, currentBody.id, btn.dataset.good, 1)
        } catch (err) {
          await showNotice('Sale failed', err.message)
        }
        renderTrade()
      })
    )
    contentEl.querySelectorAll('.buy-ore').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          buyMinedOre(gameState, currentBody.id, btn.dataset.good, 1)
        } catch (err) {
          await showNotice('Purchase failed', err.message)
        }
        renderTrade()
      })
    )
    contentEl.querySelectorAll('.sell-ore').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          sellMinedOre(gameState, currentBody.id, btn.dataset.good, 1)
        } catch (err) {
          await showNotice('Sale failed', err.message)
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

  // Which ship class's stats the left panel shows — defaults to the
  // player's own current ship, and resets to that every time the Shipyard
  // tab (re)opens (see show() below), rather than persisting a stale
  // selection from a previous docking.
  let selectedShipClassId = null

  function hideShipyardSideBoxes() {
    shipyardLeftCol.style.display = 'none'
    statsSideEl.innerHTML = ''
    loadoutSideEl.innerHTML = ''
  }

  /** Stats + Loadout sit outside the main panel (same chrome as cargo/jobs). */
  function renderShipyardSideBoxes() {
    if (!currentBody?.hasShipyard || currentTab !== 'shipyard') {
      hideShipyardSideBoxes()
      return
    }
    const ship = gameState.player.ship
    const activeClass = getShipClass(ship.classId)
    selectedShipClassId ??= ship.classId
    const selectedClass = getShipClass(selectedShipClassId)
    const storageWeapons = gameState.stationStorage[currentBody.id]?.weapons ?? {}
    const spareWeapons = ship.spareWeapons ?? {}

    shipyardLeftCol.style.display = 'flex'
    statsSideEl.innerHTML = `
      <h3>Ship stats</h3>
      <div class="stat" style="font-size:13px;color:#7fe6ff;margin-bottom:8px">${escapeHtml(selectedClass.name)}</div>
      <div class="stat">Role: ${selectedClass.role}</div>
      <div class="stat">Price: ${selectedClass.price}cr</div>
      ${SHIP_STAT_ROWS.map(([key, label]) => `<div class="stat">${label}: ${selectedClass.stats[key]}</div>`).join('')}
    `
    loadoutSideEl.innerHTML = `
      <h3>Loadout</h3>
      <div class="stat" style="opacity:0.65;margin-bottom:8px;font-size:11px">${escapeHtml(ship.instanceName)} (${activeClass.name})</div>
      ${activeClass.hardpoints.map((hp) => {
        const mountType = hp.type === 'missile' ? 'missile' : 'laser'
        const equippedId = ship.equippedWeapons?.[hp.id] ?? BASE_WEAPON_ID[mountType]
        const options = weaponsForCategory(mountType).map((w) => {
          const isEquipped = w.id === equippedId
          const inStorage = storageWeapons[w.id] ?? 0
          const onShip = spareWeapons[w.id] ?? 0
          const owned = isEquipped || inStorage > 0 || onShip > 0
          const bits = []
          if (isEquipped) bits.push('eq')
          if (inStorage > 0) bits.push(`${inStorage} st`)
          if (onShip > 0) bits.push(`${onShip} sal`)
          const label = bits.length ? `${w.name} (${bits.join(', ')})` : `${w.name}`
          return `<option value="${w.id}" ${isEquipped ? 'selected' : ''} ${!owned ? 'disabled' : ''}>${label}</option>`
        }).join('')
        return `
          <div class="hp-block">
            <div class="stat">${hp.id} · ${mountType}</div>
            <select class="equip-select" data-hardpoint="${hp.id}">${options}</select>
          </div>`
      }).join('')}
    `
    loadoutSideEl.querySelectorAll('.equip-select').forEach((select) =>
      select.addEventListener('change', async () => {
        try {
          equipWeapon(gameState, currentBody.id, select.dataset.hardpoint, select.value)
        } catch (err) {
          await showNotice('Equip failed', err.message)
        }
        renderShipyard()
      })
    )
  }

  function renderShipyard() {
    const shipClass = getShipClass(gameState.player.ship.classId)
    const ship = gameState.player.ship
    selectedShipClassId ??= ship.classId
    // Repair (hull/armor only — shields already regenerate on their own, see
    // combat.js) is offered at both stations and settlements. Full shipyard
    // (buy/sell ships + armoury) is station-only — every station has one.
    const canRepairHere = currentBody.kind === 'station' || currentBody.kind === 'settlement'
    const repairCostHere = canRepairHere ? repairCost(gameState, currentBody) : 0
    const repairSection = canRepairHere
      ? `<div class="repair-row">
          Hull: ${Math.round(ship.hull)}/${shipClass.stats.hull} | Armour: ${Math.round(ship.armor)}/${shipClass.stats.armor}
          <button class="repair-btn" ${repairCostHere === 0 ? 'disabled' : ''}>${repairCostHere === 0 ? 'Fully Repaired' : `Repair Ship (${repairCostHere}cr)`}</button>
        </div>`
      : ''

    const storageWeapons = currentBody.hasShipyard ? (gameState.stationStorage[currentBody.id]?.weapons ?? {}) : {}

    if (!currentBody.hasShipyard) {
      hideShipyardSideBoxes()
      contentEl.innerHTML = `${repairSection}<p>No shipyard at this location.</p>`
    } else {
      contentEl.innerHTML = `
        ${repairSection}
        <div class="credits">Credits: ${gameState.player.credits}cr | Current: ${escapeHtml(ship.instanceName)} (${shipClass.name}) <button class="rename-active">Rename</button></div>
        <div class="shipyard-main">
          <div class="ship-list">
            <h3>Ships for sale</h3>
            <table>
              <thead><tr><th>Ship</th><th>Role</th><th>Price</th><th></th></tr></thead>
              <tbody>${purchasableShipClasses().map((c) => `
                <tr data-class="${c.id}" class="${c.id === selectedShipClassId ? 'selected' : ''}">
                  <td>${c.name}</td><td>${c.role}</td><td>${c.price}cr</td>
                  <td><button class="buy-ship" data-class="${c.id}">Buy</button></td>
                </tr>`).join('')}</tbody>
            </table>
          </div>
          <div class="armoury-list">
            <h3>Armoury</h3>
            <table>
              <thead><tr><th>Weapon</th><th>Cat</th><th>Dmg</th><th>Price</th><th>St</th><th></th></tr></thead>
              <tbody>${WEAPONS.map((w) => `
                <tr>
                  <td>${w.name}</td><td>${w.category}</td><td>${w.damage}</td><td>${w.price}cr</td><td>${storageWeapons[w.id] ?? 0}</td>
                  <td><button class="buy-weapon" data-weapon="${w.id}">Buy</button></td>
                </tr>`).join('')}</tbody>
            </table>
          </div>
        </div>
      `
      renderShipyardSideBoxes()
    }
    contentEl.querySelector('.repair-btn')?.addEventListener('click', async () => {
      try {
        repairShip(gameState, currentBody)
      } catch (err) {
        await showNotice('Repair failed', err.message)
      }
      renderShipyard()
    })
    contentEl.querySelector('.rename-active')?.addEventListener('click', async () => {
      const name = await askText('Rename your ship', ship.instanceName)
      if (name == null) return
      try {
        renameActiveShip(gameState, name)
      } catch (err) {
        await showNotice('Cannot rename', err.message)
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
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const classId = btn.dataset.class
        const shipClassBought = getShipClass(classId)
        try {
          purchaseShip(gameState, currentBody.id, classId, shipClassBought.name)
          await showNotice(
            'Ship purchased',
            `${shipClassBought.name} is in station storage (right panel). Activate it there to fly it — the hull will match the class you bought.`
          )
        } catch (err) {
          await showNotice('Purchase failed', err.message)
        }
        renderShipyard()
      })
    )
    contentEl.querySelectorAll('.buy-weapon').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          buyWeapon(gameState, currentBody.id, btn.dataset.weapon)
          const w = getWeapon(btn.dataset.weapon)
          await showNotice(
            'Weapon purchased',
            `${w.name} is in station storage. Equip it from the Loadout panel on the left.`
          )
        } catch (err) {
          await showNotice('Purchase failed', err.message)
        }
        renderShipyard()
      })
    )
    renderSidePanel()
  }

  function renderStorage() {
    ensureBlueprintMaps(gameState)
    const storage = gameState.stationStorage[currentBody.id] ?? {
      cargo: {}, miningHold: {}, shipParts: 0, ships: [], weapons: {}, blueprints: {}
    }
    storage.blueprints ??= {}
    const cargoRows = Object.entries(storage.cargo).filter(([, qty]) => qty > 0)
    const oreRows = Object.entries(storage.miningHold).filter(([, qty]) => qty > 0)
    const weaponRows = Object.entries(storage.weapons ?? {}).filter(([, qty]) => qty > 0)
    const storageBpRows = Object.entries(storage.blueprints ?? {}).filter(([, qty]) => qty > 0)
    const cargoStored = cargoRows.reduce((a, [, qty]) => a + qty, 0)
    const oreStored = oreRows.reduce((a, [, qty]) => a + qty, 0)

    // Station bay contents only — ship inventory + transfer controls live in the
    // right "Your ship" side panel (cargo / mining / parts / salvaged gear).
    contentEl.innerHTML = `
      <p style="opacity:0.7;font-size:12px;">Station storage at ${escapeHtml(currentBody.name)} — only retrievable here. Ship holds and transfer buttons are on the right.</p>
      <h3>Station Cargo</h3>
      <div class="credits">${cargoStored} unit${cargoStored === 1 ? '' : 's'} stored</div>
      ${cargoRows.length ? `<table><tbody>${cargoRows.map(([id, qty]) => `<tr><td>${getGood(id).name}</td><td>${qty}</td></tr>`).join('')}</tbody></table>` : '<p class="empty" style="opacity:0.5">Empty</p>'}
      <h3>Station Ore</h3>
      <div class="credits">${oreStored} unit${oreStored === 1 ? '' : 's'} stored</div>
      ${oreRows.length ? `<table><tbody>${oreRows.map(([id, qty]) => `<tr><td>${getGood(id).name}</td><td>${qty}</td></tr>`).join('')}</tbody></table>` : '<p class="empty" style="opacity:0.5">Empty</p>'}
      <h3>Station Ship Parts</h3>
      <div class="credits">${storage.shipParts ?? 0} in bay</div>
      <h3>Weapons (station)</h3>
      ${weaponRows.length ? `
      <table>
        <thead><tr><th>Weapon</th><th>In Storage</th><th></th></tr></thead>
        <tbody>${weaponRows.map(([id, qty]) => `
          <tr>
            <td>${getWeapon(id).name}</td><td>${qty}</td>
            <td><button class="sell-weapon" data-weapon="${id}">Sell (${Math.round(getWeapon(id).price * 0.5)}cr)</button></td>
          </tr>`).join('')}</tbody>
      </table>` : '<p style="opacity:0.5">No spare weapons stored here.</p>'}
      <h3>Blueprints (station)</h3>
      ${storageBpRows.length ? `
      <table>
        <thead><tr><th>Blueprint</th><th>Qty</th></tr></thead>
        <tbody>${storageBpRows.map(([id, qty]) => {
          let name = id
          try { name = getBlueprint(id).name } catch { /* */ }
          return `<tr><td>${escapeHtml(name)}</td><td>${qty}</td></tr>`
        }).join('')}</tbody>
      </table>
      <button class="retrieve-blueprints">Retrieve All Blueprints</button>
      <p style="opacity:0.65;font-size:11px;">Industry crafts from station storage — move ore + blueprints here from the ship panel first.</p>`
        : '<p style="opacity:0.5">No blueprints stored here.</p>'}
      <p style="opacity:0.7;font-size:12px;margin-top:16px;">Parked ships: <strong>Ships stored here</strong> on the right. Equip weapons from Shipyard Loadout.</p>
    `
    contentEl.querySelectorAll('.sell-weapon').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          sellStoredWeapon(gameState, currentBody.id, btn.dataset.weapon)
        } catch (err) {
          await showNotice('Sale failed', err.message)
        }
        renderStorage()
      })
    )
    contentEl.querySelector('.retrieve-blueprints')?.addEventListener('click', () => {
      retrieveBlueprints(gameState, currentBody.id)
      renderStorage()
    })
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
      btn.addEventListener('click', async () => {
        try {
          turnInMission(gameState, btn.dataset.id)
        } catch (err) {
          await showNotice('Turn-in failed', err.message)
        }
        renderMissions()
      })
    )
    renderSidePanel()
  }

  function renderIndustry() {
    ensureBlueprintMaps(gameState)
    if (currentBody.kind !== 'station' && currentBody.kind !== 'settlement') {
      contentEl.innerHTML = '<p>Industry bays are only available at stations and settlements.</p>'
      renderSidePanel()
      return
    }
    const storage = gameState.stationStorage[currentBody.id] ?? {
      cargo: {}, miningHold: {}, shipParts: 0, ships: [], weapons: {}, blueprints: {}
    }
    storage.blueprints ??= {}
    storage.miningHold ??= {}
    // Shortest build time first so quick crafts are easy to spot.
    const bpRows = Object.entries(storage.blueprints)
      .filter(([, qty]) => qty > 0)
      .sort((a, b) => craftDurationS(a[0]) - craftDurationS(b[0]))
    const oreRows = Object.entries(storage.miningHold).filter(([, qty]) => qty > 0)
    const credits = gameState.player.credits

    contentEl.innerHTML = `
      <p style="opacity:0.75;font-size:12px;">
        Assemble ships and weapons from <strong>station-stored</strong> blueprints and mined ore,
        plus a modest bay fee in credits. Move materials from your ship via the Storage tab first.
        Builds run in the background (wall-clock) — even while you fly or after you quit and reload.
      </p>
      <div class="credits">Credits: ${credits}cr</div>
      <h3>Ore in station storage</h3>
      ${oreRows.length
        ? `<table><tbody>${oreRows.map(([id, qty]) => `<tr><td>${getGood(id).name}</td><td>${qty}</td></tr>`).join('')}</tbody></table>`
        : '<p>No ore here. Mine asteroids, then Store All Ore on Storage.</p>'}
      <h3>Blueprints ready to assemble</h3>
      ${bpRows.length ? `
      <table>
        <thead><tr><th>Blueprint</th><th>Qty</th><th>Ore cost</th><th>Bay fee</th><th>Build time</th><th></th></tr></thead>
        <tbody>${bpRows.map(([id, qty]) => {
          let bp
          try { bp = getBlueprint(id) } catch { return '' }
          const cost = oreCostForBlueprint(id)
          const fee = creditCostForBlueprint(id)
          const dur = craftDurationS(id)
          const enoughOre = Object.entries(cost).every(([oid, need]) => (storage.miningHold[oid] ?? 0) >= need)
          const enoughCredits = credits >= fee
          const canAssemble = enoughOre && enoughCredits
          return `
          <tr>
            <td>${escapeHtml(bp.name)} <span style="opacity:0.55">(${bp.kind})</span></td>
            <td>${qty}</td>
            <td style="font-size:11px;opacity:0.85">${formatOreCost(cost)}</td>
            <td>${fee}cr</td>
            <td>${formatDuration(dur)}</td>
            <td><button class="assemble-btn" data-bp="${escapeHtml(id)}" ${canAssemble ? '' : 'disabled'}>Assemble</button></td>
          </tr>`
        }).join('')}</tbody>
      </table>` : '<p>No blueprints in storage. Rare wreck/probe drops; store them here to craft.</p>'}
    `

    contentEl.querySelectorAll('.assemble-btn').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          startCraft(gameState, currentBody.id, btn.dataset.bp)
          onCraftStarted?.('Build commenced - Will be informed when build complete.')
        } catch (err) {
          await showNotice('Assembly failed', err.message)
        }
        renderIndustry()
      })
    )
    renderSidePanel()
  }

  const renderers = {
    trade: renderTrade,
    shipyard: renderShipyard,
    missions: renderMissions,
    storage: renderStorage,
    industry: renderIndustry
  }

  function renderCurrentTab() {
    updateHeaderCredits()
    if (currentTab !== 'shipyard') hideShipyardSideBoxes()
    renderers[currentTab]()
  }

  tabButtons.forEach((btn) =>
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab
      tabButtons.forEach((b) => b.classList.toggle('active', b === btn))
      renderCurrentTab()
    })
  )

  const servicesBtn = root.querySelector('.services-btn')
  let servicesOpen = false

  function setServicesOpen(open) {
    servicesOpen = !!open
    root.classList.toggle('services-open', servicesOpen)
    servicesBtn.textContent = servicesOpen ? 'Close Services' : 'Station Services'
    servicesBtn.setAttribute('aria-pressed', servicesOpen ? 'true' : 'false')
    if (servicesOpen) {
      updateHeaderCredits()
      renderCurrentTab()
    }
  }

  servicesBtn.addEventListener('click', () => {
    setServicesOpen(!servicesOpen)
  })

  root.querySelector('.undock-btn').addEventListener('click', () => {
    setServicesOpen(false)
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
      updateHeaderCredits()
      selectedShipClassId = null
      currentTab = 'trade'
      tabButtons.forEach((b) => b.classList.toggle('active', b.dataset.tab === 'trade'))
      // Menu closed by default — only Station Services + Undock until opened.
      setServicesOpen(false)
      root.style.display = 'flex'
    },
    hide() {
      setServicesOpen(false)
      root.style.display = 'none'
    },
    element: root
  }
}
