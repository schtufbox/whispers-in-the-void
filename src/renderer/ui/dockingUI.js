import {
  GOODS,
  MINED_ORE_GOOD_IDS,
  SHIP_PARTS_GOOD_ID,
  SURVEY_DATA_GOOD_ID,
  getGood,
  isTradeListGood
} from '../data/goods.js'
import {
  getPrice, getMarketAvailable, buyGood, sellGood, sellMinedOre, buyMinedOre, buyShipParts, purchaseShip, repairCost, repairShip,
  activateStoredShip, sellStoredShip,
  renameActiveShip, renameStoredShip, buyWeapon, sellStoredWeapon, equipWeapon, sellCarriedWeapon, storeCarriedWeapons,
  buyAccessory, sellStoredAccessory, equipAccessory, storageHasAssets, transferStorageItem
} from '../game/economy.js'
import {
  startCraft,
  transferBlueprintItem,
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
import { ACCESSORIES, getAccessory, accessorySlotCount, effectiveMiningCapacity } from '../data/accessories.js'
import { EXPLORER_PROBE_LOOT_BONUS } from '../game/probe.js'
import { findBody, findSystemOfBody } from '../procgen/galaxy.js'
import { acceptMission, turnInMission } from '../game/missions.js'
import { refillMissionsIfExhausted } from '../data/missionTemplates.js'
import { escapeHtml } from './escapeHtml.js'
import { gameNotice, gamePrompt } from './gameDialog.js'

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
/* Industry: ore box closer to main panel, 60px inset from left screen side */
#docking-ui.industry-layout .docked-layout {
  gap: 8px; /* default is 16px */
}
#docking-ui .side-column.shipyard-left-column.industry-ore-col {
  padding-top: 78px;
  margin-left: 60px;
  box-sizing: border-box;
}
#docking-ui .side-panel { width: 100%; max-height: none; box-sizing: border-box; }
#docking-ui .side-panel.ships-side { max-height: none; }
#docking-ui .side-panel.jobs-side { max-height: none; }
#docking-ui .side-panel.ore-side {
  max-height: min(52vh, calc(100vh - 6vh - 2vh - 100px)); overflow-y: auto;
}
#docking-ui .side-panel.ore-side > h3:first-child { margin-top: 0; }
#docking-ui .side-panel.ore-side table { margin-bottom: 0; }
#docking-ui .side-panel.ore-side .xfer-hint { margin-top: 0; }
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
/* Storage drag-and-drop transfers */
#docking-ui .xfer-item {
  cursor: grab; user-select: none;
}
#docking-ui .xfer-item:active { cursor: grabbing; }
#docking-ui tr.xfer-item td { transition: background 0.12s ease; }
#docking-ui tr.xfer-item:hover td { background: rgba(111,216,242,0.1); }
#docking-ui .xfer-item.xfer-dragging { opacity: 0.45; }
#docking-ui .xfer-drop-target.drag-over {
  outline: 1px solid rgba(127,224,160,0.55);
  box-shadow: inset 0 0 18px rgba(127,224,160,0.1);
  background: rgba(127,224,160,0.06);
}
#docking-ui .xfer-hint {
  font-size: 11px; opacity: 0.65; line-height: 1.4; margin: 0 0 10px 0;
}
#docking-ui .xfer-parts {
  display: inline-block; padding: 2px 8px; margin-top: 2px;
  border: 1px dashed rgba(111,216,242,0.35); border-radius: 2px;
}
#docking-ui .bp-section { margin-top: 4px; }
#docking-ui .bp-header {
  display: flex; align-items: center; gap: 8px; margin: 0 0 6px 0;
}
#docking-ui .bp-header h3 { margin: 0; flex: 1; }
#docking-ui .bp-toggle {
  background: transparent; border: none; color: #7fe6ff; cursor: pointer;
  font-family: monospace; font-size: 11px; letter-spacing: 1.5px;
  text-transform: uppercase; padding: 0; text-align: left;
  text-shadow: 0 0 6px rgba(79,195,217,0.45);
}
#docking-ui .bp-toggle:hover { color: #cfe3ff; }
#docking-ui .bp-toggle .chev { opacity: 0.7; margin-right: 4px; display: inline-block; width: 0.9em; }
#docking-ui button.store-all-bps {
  background: rgba(111,216,242,0.1); border: 1px solid rgba(111,216,242,0.4); color: #cfe3ff;
  padding: 2px 8px; cursor: pointer; font-family: monospace; font-size: 11px;
  margin-right: 0;
}
#docking-ui button.store-all-bps:hover {
  background: rgba(111,216,242,0.22); box-shadow: 0 0 10px rgba(79,195,217,0.35);
}
#docking-ui .bp-body { margin-top: 4px; }
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
#docking-ui button.repair-btn,
#docking-ui button.activate-ship, #docking-ui button.sell-ship, #docking-ui button.sell-ship-class,
#docking-ui button.rename-active, #docking-ui button.rename-stored,
#docking-ui button.buy-weapon, #docking-ui button.sell-weapon,
#docking-ui button.buy-accessory, #docking-ui button.sell-accessory,
#docking-ui button.store-weapons, #docking-ui button.store-all-bps,
#docking-ui button.assemble-btn {
  background: rgba(111,216,242,0.1); border: 1px solid rgba(111,216,242,0.4); color: #cfe3ff;
  padding: 4px 10px; cursor: pointer; margin-right: 4px; font-family: monospace;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}
#docking-ui button.buy:hover, #docking-ui button.sell:hover, #docking-ui button.buy-ore:hover, #docking-ui button.sell-ore:hover,
#docking-ui button.buy-parts:hover, #docking-ui button.buy-ship:hover, #docking-ui button.accept-mission:hover, #docking-ui button.turnin:hover,
#docking-ui button.repair-btn:not(:disabled):hover,
#docking-ui button.activate-ship:hover, #docking-ui button.sell-ship:hover, #docking-ui button.sell-ship-class:hover,
#docking-ui button.rename-active:hover, #docking-ui button.rename-stored:hover,
#docking-ui button.buy-weapon:hover, #docking-ui button.sell-weapon:hover,
#docking-ui button.buy-accessory:hover, #docking-ui button.sell-accessory:hover,
#docking-ui button.store-weapons:hover, #docking-ui button.store-all-bps:hover,
#docking-ui button.assemble-btn:hover:not(:disabled) {
  background: rgba(111,216,242,0.22); box-shadow: 0 0 10px rgba(79,195,217,0.35);
}
#docking-ui button.assemble-btn:disabled,
#docking-ui button.buy:disabled,
#docking-ui button.buy-ore:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
#docking-ui .craft-progress {
  height: 8px; background: #0c1424; border: 1px solid #2a3a55; margin-top: 4px; overflow: hidden;
}
#docking-ui .craft-progress .fill { height: 100%; background: linear-gradient(90deg, #2e8fa8, #7fe6ff); }
#docking-ui button.repair-btn:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
#docking-ui .repair-row { margin-bottom: 10px; }
/* Nested service sub-tabs (Trade / Shipyard / Missions / Storage) */
#docking-ui .svc-subtabs {
  display: flex; gap: 2px; margin-bottom: 12px;
  border-bottom: 1px solid rgba(111,216,242,0.2);
}
#docking-ui .svc-subtab {
  background: transparent; border: none; border-bottom: 2px solid transparent;
  color: #8fb3d9; padding: 7px 12px; cursor: pointer; font-family: monospace;
  font-size: 11px; letter-spacing: 1px; text-transform: uppercase;
  transition: color 0.15s ease, border-color 0.15s ease;
}
#docking-ui .svc-subtab:hover { color: #cfe3ff; }
#docking-ui .svc-subtab.active {
  color: #7fe6ff; border-bottom-color: #6fd8f2;
  text-shadow: 0 0 6px rgba(79,195,217,0.55);
}
/* Shipyard: current ship header + sub-tabs */
#docking-ui .shipyard-current {
  margin-bottom: 12px; padding-bottom: 10px;
  border-bottom: 1px solid rgba(111,216,242,0.2);
  font-size: 13px; opacity: 0.95;
}
#docking-ui .shipyard-current .ship-name { color: #7fe6ff; }
#docking-ui .shipyard-main {
  min-width: 0; max-height: 52vh; overflow-y: auto;
}
#docking-ui .shipyard-main h3 { margin-top: 0; }
#docking-ui .shipyard-main tr[data-class] { cursor: pointer; }
#docking-ui .shipyard-main tr[data-class]:hover td { background: rgba(111,216,242,0.08); }
#docking-ui .shipyard-main tr[data-class].selected td { color: #7fe0a0; text-shadow: 0 0 6px rgba(127,224,160,0.5); }
#docking-ui .shipyard-main .acc-desc {
  font-size: 11px; opacity: 0.65; max-width: 280px; line-height: 1.35;
}
/* Industry main panel: blueprints fill the content area (ore is a left side box) */
#docking-ui .industry-main {
  min-width: 0; max-height: 52vh; overflow-y: auto;
}
#docking-ui .industry-bp-header {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin: 0 0 8px 0;
}
#docking-ui .industry-bp-header h3 { margin: 0; }
#docking-ui button.move-all-bps {
  background: rgba(111,216,242,0.1); border: 1px solid rgba(111,216,242,0.4); color: #cfe3ff;
  padding: 4px 10px; cursor: pointer; font-family: monospace; font-size: 11px;
  letter-spacing: 0.5px; flex-shrink: 0;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}
#docking-ui button.move-all-bps:hover:not(:disabled) {
  background: rgba(111,216,242,0.22); box-shadow: 0 0 10px rgba(79,195,217,0.35);
}
#docking-ui button.move-all-bps:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
#docking-ui .bp-kind {
  margin-bottom: 10px; border: 1px solid rgba(111,216,242,0.2);
  background: rgba(8,14,26,0.45);
}
#docking-ui .bp-kind-toggle {
  width: 100%; box-sizing: border-box; text-align: left;
  background: rgba(111,216,242,0.06); border: none; border-bottom: 1px solid rgba(111,216,242,0.15);
  color: #7fe6ff; cursor: pointer; font-family: monospace; font-size: 11px;
  letter-spacing: 1.5px; text-transform: uppercase; padding: 8px 10px;
}
#docking-ui .bp-kind-toggle:hover { background: rgba(111,216,242,0.12); color: #cfe3ff; }
#docking-ui .bp-kind-toggle .chev { opacity: 0.7; margin-right: 6px; display: inline-block; width: 0.9em; }
#docking-ui .bp-kind-body { padding: 6px 8px 10px; }
#docking-ui .bp-kind-body table { margin-bottom: 0; }
#docking-ui .remote-asset {
  margin-bottom: 12px; padding: 10px 12px;
  background: rgba(79,195,217,0.05); border-left: 2px solid rgba(111,216,242,0.35);
}
#docking-ui .remote-asset h4 { margin: 0 0 2px 0; font-size: 13px; color: #7fe6ff; font-weight: normal; }
#docking-ui .remote-asset .location {
  font-size: 11px; opacity: 0.75; margin-bottom: 6px;
}
#docking-ui .remote-asset .location .sys { color: #ffe08a; }
#docking-ui .remote-asset .assets { font-size: 12px; line-height: 1.45; }
#docking-ui .side-panel.stats-side .stat,
#docking-ui .side-panel.loadout-side .stat { font-size: 12px; margin-bottom: 4px; opacity: 0.9; }
#docking-ui .side-panel.stats-side .stat-section {
  margin-top: 12px; padding-top: 8px;
  border-top: 1px solid rgba(111,216,242,0.2);
  font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase;
  color: #7fe6ff; opacity: 0.9; margin-bottom: 6px;
}
#docking-ui .side-panel.stats-side .stat.bonus {
  color: #a8e6c8; opacity: 0.95; padding-left: 2px;
}
#docking-ui .side-panel.stats-side .stat.bonus-none { opacity: 0.45; font-size: 11px; }
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
        <div class="side-panel ore-side" style="display:none"></div>
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
  const oreSideEl = root.querySelector('.ore-side')
  const holdsSideEl = root.querySelector('.holds-side')
  const shipsSideEl = root.querySelector('.ships-side')
  const jobsSideEl = root.querySelector('.jobs-side')
  const tabButtons = [...root.querySelectorAll('.tab')]

  // Shared in-game dialogs (Electron blocks window.alert/confirm/prompt).
  function askText(title, defaultValue = '') {
    return gamePrompt(title, defaultValue, { okLabel: 'Rename', cancelLabel: 'Cancel' })
  }

  function showNotice(title, body, okLabel = 'OK') {
    return gameNotice(title, body, okLabel)
  }

  const XFER_MIME = 'application/x-witv-storage'

  function xferEnabled() {
    if (!currentBody || (currentBody.kind !== 'station' && currentBody.kind !== 'settlement')) {
      return false
    }
    // Cargo/parts on Storage; ore/blueprints on Industry.
    if (currentTab === 'storage' && storageSubTab === 'local') return true
    if (currentTab === 'industry') return true
    return false
  }

  /** data-* + draggable for transfer rows (caller adds class="xfer-item"). */
  function xferAttrs(from, kind, id, qty) {
    if (!xferEnabled() || qty <= 0) return ''
    return ` draggable="true" data-from="${from}" data-kind="${kind}" data-id="${escapeHtml(String(id))}" data-qty="${qty}"`
  }

  function xferClass(qty) {
    return xferEnabled() && qty > 0 ? ' xfer-item' : ''
  }

  function itemLabel(kind, id) {
    if (kind === 'parts') return 'Ship Parts'
    if (kind === 'blueprint') {
      try { return getBlueprint(id).name } catch { return id }
    }
    if (kind === 'cargo' || kind === 'ore') {
      try { return getGood(id).name } catch { return id }
    }
    return id
  }

  async function resolveTransferQty(available, shiftKey, label) {
    if (available <= 0) return 0
    if (shiftKey || available === 1) return available
    const ans = await gamePrompt(
      'Transfer quantity',
      String(available),
      {
        body: `How many “${label}” to transfer? (max ${available})`,
        okLabel: 'Transfer',
        cancelLabel: 'Cancel',
        maxLength: 10
      }
    )
    if (ans == null) return 0
    const n = Math.floor(Number(String(ans).trim()))
    if (!Number.isFinite(n) || n < 1) return 0
    return Math.min(available, n)
  }

  /**
   * Buy/Sell quantity dialog with afford / stock limits.
   * Buy defaults to 1; sell defaults to max held in station storage.
   * @param {'buy'|'sell'} side
   * @returns {Promise<number>} 0 if cancelled
   */
  async function planTradeQty({ side, label, unitPrice, maxQty, credits }) {
    const max = Math.max(0, Math.floor(maxQty))
    if (max < 1) {
      await showNotice(
        side === 'buy' ? 'Cannot buy' : 'Cannot sell',
        side === 'buy'
          ? `Not enough credits for one ${label} (${unitPrice}cr each; you have ${credits}cr).`
          : `No ${label} in station storage to sell.`
      )
      return 0
    }
    const defaultQty = side === 'buy' ? 1 : max
    const ans = await gamePrompt(
      side === 'buy' ? `Buy — ${label}` : `Sell — ${label}`,
      String(defaultQty),
      {
        body:
          side === 'buy'
            ? `${unitPrice}cr each · max ${max} (credits & bay stock)\nGoes into station storage.`
            : `${unitPrice}cr each · ${max} in your station storage\nSells into the bay (raises Available).`,
        okLabel: side === 'buy' ? 'Buy' : 'Sell',
        cancelLabel: 'Cancel',
        maxLength: 10
      }
    )
    if (ans == null) return 0
    const n = Math.floor(Number(String(ans).trim()))
    if (!Number.isFinite(n) || n < 1) return 0
    return Math.min(max, n)
  }

  function refreshStorageViews() {
    renderSidePanel()
    if (currentTab === 'storage') renderStorage()
    else if (currentTab === 'industry') renderIndustry()
    else if (currentTab === 'shipyard') renderShipyard()
  }

  function liveAvailable(payload, direction) {
    if (!currentBody || !payload) return 0
    const { kind, id, from } = payload
    // direction toStation ← ship; toShip ← station
    const fromShip = direction === 'toStation' || from === 'ship'
    const ship = gameState.player.ship
    const storage = gameState.stationStorage[currentBody.id] ?? {}
    if (kind === 'parts') {
      return fromShip ? (ship.shipParts ?? 0) : (storage.shipParts ?? 0)
    }
    if (kind === 'blueprint') {
      const map = fromShip ? (ship.blueprints ?? {}) : (storage.blueprints ?? {})
      return map[id] ?? 0
    }
    if (kind === 'cargo') {
      const map = fromShip ? (ship.cargo ?? {}) : (storage.cargo ?? {})
      return map[id] ?? 0
    }
    if (kind === 'ore') {
      const map = fromShip ? (ship.miningHold ?? {}) : (storage.miningHold ?? {})
      return map[id] ?? 0
    }
    return 0
  }

  async function performStorageTransfer(payload, direction, shiftKey) {
    if (!currentBody || !payload) return
    const { kind, id } = payload
    const available = liveAvailable(payload, direction)
    const label = itemLabel(kind, id)
    const want = await resolveTransferQty(available, shiftKey, label)
    if (want < 1) return

    let result
    if (kind === 'blueprint') {
      result = transferBlueprintItem(gameState, currentBody.id, id, want, direction)
    } else {
      result = transferStorageItem(gameState, currentBody.id, kind, id, want, direction)
    }

    if (result.capacityLimited) {
      const hold = kind === 'ore' ? 'ore hold' : 'cargo hold'
      await showNotice(
        'Hold full',
        result.moved > 0
          ? `Your ${hold} is full. Transferred ${result.moved} of ${want} ${label}; the rest stays where it was.`
          : `Your ${hold} is full — nothing transferred.`
      )
    }
    refreshStorageViews()
  }

  function wireXferItems(rootEl) {
    rootEl.querySelectorAll('.xfer-item[draggable="true"]').forEach((el) => {
      el.addEventListener('dragstart', (e) => {
        const payload = {
          from: el.dataset.from,
          kind: el.dataset.kind,
          id: el.dataset.id,
          qty: Number(el.dataset.qty)
        }
        e.dataTransfer.setData(XFER_MIME, JSON.stringify(payload))
        e.dataTransfer.setData('text/plain', JSON.stringify(payload))
        e.dataTransfer.effectAllowed = 'move'
        el.classList.add('xfer-dragging')
        // Remember shift at drop time via drag event (shift can change; read on drop).
        e.dataTransfer.setData('application/x-witv-shift', e.shiftKey ? '1' : '0')
      })
      el.addEventListener('dragend', () => el.classList.remove('xfer-dragging'))
    })
  }

  function wireDropZone(el, acceptFrom, direction) {
    if (!el) return
    el.classList.add('xfer-drop-target')
    el.dataset.xferAccept = acceptFrom
    el.dataset.xferDirection = direction
    // Element is stable across re-renders — bind listeners only once.
    if (el._xferDropWired) return
    el._xferDropWired = true
    el.addEventListener('dragover', (e) => {
      if (!xferEnabled()) return
      const types = [...(e.dataTransfer?.types ?? [])]
      if (types.includes(XFER_MIME) || types.includes('text/plain') || types.includes('Text')) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        el.classList.add('drag-over')
      }
    })
    el.addEventListener('dragleave', (e) => {
      if (!el.contains(e.relatedTarget)) el.classList.remove('drag-over')
    })
    el.addEventListener('drop', async (e) => {
      e.preventDefault()
      el.classList.remove('drag-over')
      if (!xferEnabled()) return
      let payload = null
      try {
        payload = JSON.parse(e.dataTransfer.getData(XFER_MIME) || e.dataTransfer.getData('text/plain') || 'null')
      } catch {
        return
      }
      if (!payload || payload.from !== el.dataset.xferAccept) return
      const shiftKey = e.shiftKey || e.dataTransfer.getData('application/x-witv-shift') === '1'
      await performStorageTransfer(payload, el.dataset.xferDirection, shiftKey)
    })
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
    const canXfer = xferEnabled()
    const weaponsStoreHtml =
      atBay && spareWeaponRows.length
        ? `<div class="holds-actions"><button type="button" class="store-weapons">Store salvaged weapons</button></div>`
        : ''

    // Ore + blueprints transfer on Industry; cargo/parts on Storage.
    const onIndustry = canXfer && currentTab === 'industry'
    const onStorage = canXfer && currentTab === 'storage'
    holdsSideEl.innerHTML = `
      <div class="panel-kicker">Your ship</div>
      ${onStorage ? `<p class="xfer-hint">Drag cargo or parts onto station storage (or reverse). Ore &amp; blueprints: use the Industry tab.</p>` : ''}
      ${onIndustry ? `<p class="xfer-hint">Drag ore or blueprints onto the Industry bay (or reverse).</p>` : ''}
      <h3>Cargo Hold (${cargoUsed}/${shipClass.stats.cargoCapacity})</h3>
      ${cargoRows.length
        ? `<table><tbody>${cargoRows.map(([id, qty]) =>
            `<tr class="${onStorage ? xferClass(qty).trim() : ''}"${onStorage ? xferAttrs('ship', 'cargo', id, qty) : ''}><td>${getGood(id).name}</td><td>${qty}</td></tr>`
          ).join('')}</tbody></table>`
        : '<div class="empty">Empty</div>'}
      <h3>Ore Hold (${oreUsed}/${effectiveMiningCapacity(ship, shipClass)})</h3>
      ${oreRows.length
        ? `<table><tbody>${oreRows.map(([id, qty]) =>
            `<tr class="${onIndustry ? xferClass(qty).trim() : ''}"${onIndustry ? xferAttrs('ship', 'ore', id, qty) : ''}><td>${getGood(id).name}</td><td>${qty}</td></tr>`
          ).join('')}</tbody></table>`
        : '<div class="empty">Empty</div>'}
      <h3>Ship Parts</h3>
      ${shipParts > 0
        ? `<div class="meta-line${onStorage ? ` xfer-parts${xferClass(shipParts)}` : ''}"${onStorage ? xferAttrs('ship', 'parts', 'ship_parts', shipParts) : ''}>Carried: ${shipParts}</div>`
        : '<div class="meta-line">Carried: 0</div>'}
      <h3>Salvaged Weapons</h3>
      ${spareWeaponRows.length
        ? `<table><tbody>${spareWeaponRows.map(([id, qty]) => `
            <tr>
              <td>${getWeapon(id).name}</td><td>×${qty}</td>
            </tr>`).join('')}</tbody></table>
          <p class="empty" style="font-size:11px">Sell salvaged weapons from Shipyard → Armoury.</p>`
        : '<div class="empty">None</div>'}
      <div class="bp-section">
        <div class="bp-header">
          <button type="button" class="bp-toggle" aria-expanded="${shipBlueprintsExpanded ? 'true' : 'false'}">
            <span class="chev">${shipBlueprintsExpanded ? '▼' : '▶'}</span>Blueprints${shipBpRows.length ? ` (${shipBpRows.length})` : ''}
          </button>
          ${onIndustry && shipBpRows.length
            ? `<button type="button" class="store-all-bps" title="Move all blueprints to station Industry storage">All</button>`
            : ''}
        </div>
        <div class="bp-body" style="display:${shipBlueprintsExpanded ? 'block' : 'none'}">
          ${shipBpRows.length
            ? `<table><tbody>${shipBpRows.map(([id, qty]) => {
              let name = id
              try { name = getBlueprint(id).name } catch { /* */ }
              return `<tr class="${onIndustry ? xferClass(qty).trim() : ''}"${onIndustry ? xferAttrs('ship', 'blueprint', id, qty) : ''}><td>${escapeHtml(name)}</td><td>×${qty}</td></tr>`
            }).join('')}</tbody></table>`
            : '<div class="empty">None (1-shot; not sellable)</div>'}
        </div>
      </div>
      ${weaponsStoreHtml}
    `

    holdsSideEl.querySelector('.bp-toggle')?.addEventListener('click', () => {
      shipBlueprintsExpanded = !shipBlueprintsExpanded
      renderSidePanel()
    })

    if (atBay) {
      holdsSideEl.querySelector('.store-weapons')?.addEventListener('click', () => {
        storeCarriedWeapons(gameState, currentBody.id)
        refreshStorageViews()
      })
      holdsSideEl.querySelector('.store-all-bps')?.addEventListener('click', () => {
        storeBlueprints(gameState, currentBody.id)
        refreshStorageViews()
      })
    }

    if (canXfer) {
      wireXferItems(holdsSideEl)
      // Drop station → ship.
      wireDropZone(holdsSideEl, 'station', 'toShip')
    }



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
                ${currentTab === 'shipyard'
                  ? `<button type="button" class="sell-ship" data-index="${i}">Sell (${sellPrice}cr)</button>`
                  : ''}
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
        if (currentTab === 'shipyard') renderShipyard()
        else if (currentTab === 'storage') renderStorage()
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
    const sub = tradeSubTab === 'ore' ? 'ore' : 'goods'
    tradeSubTab = sub

    let bodyHtml = ''
    const credits = gameState.player.credits
    const stationBay = gameState.stationStorage[currentBody.id] ?? {}
    const stationCargo = stationBay.cargo ?? {}
    const stationOre = stationBay.miningHold ?? {}
    if (sub === 'goods') {
      bodyHtml = `
        <p style="opacity:0.7;font-size:12px;margin:0 0 10px">Buy and sell use <strong>station storage</strong> — transfer cargo (including Survey Data) to the bay on Storage, then sell here.</p>
        <div class="credits">Station cargo bay · Credits: ${credits}cr · Ship hold: ${cargoUsed}/${shipClass.stats.cargoCapacity}</div>
        <table>
          <thead><tr><th>Good</th><th>Price</th><th>Available</th><th>Stored</th><th></th></tr></thead>
          <tbody>${GOODS.filter((g) => isTradeListGood(g.id)).map((g) => {
            const price = getPrice(gameState, currentBody.id, g.id)
            const held = stationCargo[g.id] ?? 0
            const available = getMarketAvailable(gameState, currentBody.id, g.id)
            if (g.id === SURVEY_DATA_GOOD_ID) {
              if (held <= 0) return ''
              return `<tr>
                <td>${g.name}</td><td>${price}cr</td><td>—</td><td>${held}</td>
                <td><button class="sell" data-good="${g.id}" data-price="${price}" data-held="${held}">Sell</button></td>
              </tr>`
            }
            return `<tr>
              <td>${g.name}</td><td>${price}cr</td><td>${available}</td><td>${held}</td>
              <td>
                <button class="buy" data-good="${g.id}" data-price="${price}" data-available="${available}" ${available < 1 ? 'disabled' : ''}>Buy</button>
                <button class="sell" data-good="${g.id}" data-price="${price}" data-held="${held}">Sell</button>
              </td>
            </tr>`
          }).join('')}</tbody>
        </table>
        ${currentBody.hasShipParts ? `
        <h3>Ship Parts</h3>
        <p>Bought parts go to station storage. Transfer to ship for repairs (I).</p>
        <button class="buy-parts" data-price="${getPrice(gameState, currentBody.id, SHIP_PARTS_GOOD_ID)}">Buy</button>` : ''}
      `
    } else {
      bodyHtml = `
        <p style="opacity:0.7;font-size:12px;margin:0 0 10px">Buy and sell use <strong>station ore storage</strong> — transfer ore on the Industry tab. Selling restocks the bay.</p>
        <div class="credits">Station ore bay · Credits: ${credits}cr · Ship ore: ${miningUsed}/${effectiveMiningCapacity(ship, shipClass)}</div>
        <table>
          <thead><tr><th>Ore</th><th>Price</th><th>Available</th><th>Stored</th><th></th></tr></thead>
          <tbody>${MINED_ORE_GOOD_IDS.map((goodId) => {
            const good = getGood(goodId)
            const price = getPrice(gameState, currentBody.id, goodId)
            const held = stationOre[goodId] ?? 0
            const available = getMarketAvailable(gameState, currentBody.id, goodId)
            return `<tr>
              <td>${good.name}</td><td>${price}cr</td><td>${available}</td><td>${held}</td>
              <td>
                <button class="buy-ore" data-good="${goodId}" data-price="${price}" data-available="${available}" ${available < 1 ? 'disabled' : ''}>Buy</button>
                <button class="sell-ore" data-good="${goodId}" data-price="${price}" data-held="${held}">Sell</button>
              </td>
            </tr>`
          }).join('')}</tbody>
        </table>
      `
    }

    contentEl.innerHTML = `
      <div class="svc-subtabs">
        <button type="button" class="svc-subtab ${sub === 'goods' ? 'active' : ''}" data-subtab="goods">Goods</button>
        <button type="button" class="svc-subtab ${sub === 'ore' ? 'active' : ''}" data-subtab="ore">Ore</button>
      </div>
      ${bodyHtml}
    `
    contentEl.querySelectorAll('.svc-subtab').forEach((btn) =>
      btn.addEventListener('click', () => {
        tradeSubTab = btn.dataset.subtab
        renderTrade()
      })
    )
    contentEl.querySelector('.buy-parts')?.addEventListener('click', async () => {
      const price = Number(contentEl.querySelector('.buy-parts').dataset.price)
      const maxBuy = price > 0 ? Math.floor(gameState.player.credits / price) : 0
      const qty = await planTradeQty({
        side: 'buy',
        label: 'Ship Parts',
        unitPrice: price,
        maxQty: maxBuy,
        credits: gameState.player.credits
      })
      if (qty < 1) return
      try {
        buyShipParts(gameState, currentBody.id, qty)
        await showNotice('Purchased', `${qty} ship part(s) in station storage.`)
      } catch (err) {
        await showNotice('Purchase failed', err.message)
      }
      renderTrade()
    })
    contentEl.querySelectorAll('.buy').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const goodId = btn.dataset.good
        const price = Number(btn.dataset.price)
        const available = getMarketAvailable(gameState, currentBody.id, goodId)
        const affordable = price > 0 ? Math.floor(gameState.player.credits / price) : 0
        const maxBuy = Math.min(available, affordable)
        const name = getGood(goodId).name
        const qty = await planTradeQty({
          side: 'buy',
          label: name,
          unitPrice: price,
          maxQty: maxBuy,
          credits: gameState.player.credits
        })
        if (qty < 1) return
        try {
          buyGood(gameState, currentBody.id, goodId, qty)
          await showNotice('Purchased', `${qty}× ${name} in station storage.`)
        } catch (err) {
          await showNotice('Purchase failed', err.message)
        }
        renderTrade()
      })
    )
    contentEl.querySelectorAll('.sell').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const goodId = btn.dataset.good
        const price = Number(btn.dataset.price)
        const held = Number(btn.dataset.held)
        const name = getGood(goodId).name
        const qty = await planTradeQty({
          side: 'sell',
          label: name,
          unitPrice: price,
          maxQty: held,
          credits: gameState.player.credits
        })
        if (qty < 1) return
        try {
          sellGood(gameState, currentBody.id, goodId, qty)
        } catch (err) {
          await showNotice('Sale failed', err.message)
        }
        renderTrade()
      })
    )
    contentEl.querySelectorAll('.buy-ore').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const goodId = btn.dataset.good
        const price = Number(btn.dataset.price)
        const available = getMarketAvailable(gameState, currentBody.id, goodId)
        const affordable = price > 0 ? Math.floor(gameState.player.credits / price) : 0
        const maxBuy = Math.min(available, affordable)
        const name = getGood(goodId).name
        const qty = await planTradeQty({
          side: 'buy',
          label: name,
          unitPrice: price,
          maxQty: maxBuy,
          credits: gameState.player.credits
        })
        if (qty < 1) return
        try {
          buyMinedOre(gameState, currentBody.id, goodId, qty)
          await showNotice('Purchased', `${qty}× ${name} in station ore storage.`)
        } catch (err) {
          await showNotice('Purchase failed', err.message)
        }
        renderTrade()
      })
    )
    contentEl.querySelectorAll('.sell-ore').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const goodId = btn.dataset.good
        const price = Number(btn.dataset.price)
        const held = Number(btn.dataset.held)
        const name = getGood(goodId).name
        const qty = await planTradeQty({
          side: 'sell',
          label: name,
          unitPrice: price,
          maxQty: held,
          credits: gameState.player.credits
        })
        if (qty < 1) return
        try {
          sellMinedOre(gameState, currentBody.id, goodId, qty)
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

  /** Hull/role bonuses shown under shipyard stats (not accessory loadout). */
  function shipRoleBonusLines(shipClass) {
    const lines = []
    if (shipClass?.role === 'explorer') {
      const pct = Math.round(EXPLORER_PROBE_LOOT_BONUS * 100)
      lines.push(`+${pct}% chance of good loot when probing`)
    }
    const bays = Math.max(0, Math.floor(Number(shipClass?.droneBays) || 0))
    if (bays > 0) {
      lines.push(`${bays} combat drone bay${bays === 1 ? '' : 's'} (Asp Light Combat)`)
    }
    return lines
  }

  // Which ship class's stats the left panel shows — defaults to the
  // player's own current ship, and resets to that every time the Shipyard
  // tab (re)opens (see show() below), rather than persisting a stale
  // selection from a previous docking.
  let selectedShipClassId = null
  // Sub-tabs inside Shipyard: ships | armoury | accessories
  let shipyardSubTab = 'ships'
  let tradeSubTab = 'goods'
  let missionsSubTab = 'available'
  let storageSubTab = 'local'
  /** Ship-side blueprints list collapsed by default (Storage / Your ship panel). */
  let shipBlueprintsExpanded = false
  /** Industry blueprint kind dropdowns — closed by default. */
  const industryBpOpen = { ship: false, accessory: false, weapon: false }

  function hideLeftSideBoxes() {
    shipyardLeftCol.style.display = 'none'
    shipyardLeftCol.classList.remove('industry-ore-col')
    root.classList.remove('industry-layout')
    statsSideEl.style.display = 'none'
    loadoutSideEl.style.display = 'none'
    oreSideEl.style.display = 'none'
    statsSideEl.innerHTML = ''
    loadoutSideEl.innerHTML = ''
    oreSideEl.innerHTML = ''
  }

  function hideShipyardSideBoxes() {
    // Keep industry ore box if that tab is active; otherwise clear the whole left column.
    if (currentTab === 'industry') {
      statsSideEl.style.display = 'none'
      loadoutSideEl.style.display = 'none'
      statsSideEl.innerHTML = ''
      loadoutSideEl.innerHTML = ''
      return
    }
    hideLeftSideBoxes()
  }

  /** Stats + Loadout sit outside the main panel (same chrome as cargo/jobs). */
  function renderShipyardSideBoxes() {
    if (!currentBody?.hasShipyard || currentTab !== 'shipyard') {
      hideShipyardSideBoxes()
      return
    }
    shipyardLeftCol.classList.remove('industry-ore-col')
    root.classList.remove('industry-layout')
    oreSideEl.style.display = 'none'
    oreSideEl.innerHTML = ''
    statsSideEl.style.display = 'block'
    loadoutSideEl.style.display = 'block'
    const ship = gameState.player.ship
    const activeClass = getShipClass(ship.classId)
    selectedShipClassId ??= ship.classId
    const selectedClass = getShipClass(selectedShipClassId)
    const storageWeapons = gameState.stationStorage[currentBody.id]?.weapons ?? {}
    const storageAccessories = gameState.stationStorage[currentBody.id]?.accessories ?? {}
    const spareWeapons = ship.spareWeapons ?? {}
    const accSlots = accessorySlotCount(activeClass)
    const equippedAcc = Array.isArray(ship.equippedAccessories) ? ship.equippedAccessories : []

    const roleLabel = selectedClass.role
      ? selectedClass.role.charAt(0).toUpperCase() + selectedClass.role.slice(1)
      : '—'
    const bonusLines = shipRoleBonusLines(selectedClass)
    shipyardLeftCol.style.display = 'flex'
    statsSideEl.innerHTML = `
      <h3>Ship stats</h3>
      <div class="stat" style="font-size:13px;color:#7fe6ff;margin-bottom:8px">${escapeHtml(selectedClass.name)}</div>
      <div class="stat">Role: ${escapeHtml(roleLabel)}</div>
      <div class="stat">Price: ${selectedClass.price}cr</div>
      <div class="stat">Accessory slots: ${accessorySlotCount(selectedClass)}</div>
      ${SHIP_STAT_ROWS.map(([key, label]) => {
        let val = selectedClass.stats[key]
        // When viewing your active hull, show live mining capacity with accessories.
        if (key === 'miningCapacity' && selectedShipClassId === ship.classId) {
          val = effectiveMiningCapacity(ship, selectedClass)
          if (val !== selectedClass.stats.miningCapacity) {
            return `<div class="stat">${label}: ${val} <span style="opacity:0.55">(base ${selectedClass.stats.miningCapacity})</span></div>`
          }
        }
        return `<div class="stat">${label}: ${val}</div>`
      }).join('')}
      <div class="stat-section">Bonus</div>
      ${bonusLines.length
        ? bonusLines.map((line) => `<div class="stat bonus">${escapeHtml(line)}</div>`).join('')
        : '<div class="stat bonus-none">None</div>'}
    `
    const weaponBlocks = activeClass.hardpoints.map((hp) => {
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
    }).join('')

    let accessoryBlocks = ''
    if (accSlots <= 0) {
      accessoryBlocks = `<div class="stat" style="opacity:0.5;font-size:11px;margin-top:10px">No accessory slots on this hull.</div>`
    } else {
      accessoryBlocks = `
        <div class="stat" style="opacity:0.75;font-size:11px;margin:12px 0 6px;letter-spacing:1px;text-transform:uppercase">Accessories</div>
        ${Array.from({ length: accSlots }, (_, slot) => {
          const equippedId = equippedAcc[slot] ?? null
          const options = [
            `<option value="" ${!equippedId ? 'selected' : ''}>— empty —</option>`,
            ...ACCESSORIES.map((a) => {
              const isEquippedHere = a.id === equippedId
              const fittedElsewhere = equippedAcc.some((id, i) => id === a.id && i !== slot)
              const inStorage = storageAccessories[a.id] ?? 0
              const owned = isEquippedHere || inStorage > 0
              const bits = []
              if (isEquippedHere) bits.push('eq')
              if (inStorage > 0) bits.push(`${inStorage} st`)
              if (fittedElsewhere) bits.push('fitted')
              const label = bits.length ? `${a.name} (${bits.join(', ')})` : a.name
              const disabled = !owned || fittedElsewhere
              return `<option value="${a.id}" ${isEquippedHere ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${label}</option>`
            })
          ].join('')
          return `
            <div class="hp-block">
              <div class="stat">Slot ${slot + 1}</div>
              <select class="equip-accessory" data-slot="${slot}">${options}</select>
            </div>`
        }).join('')}
      `
    }

    loadoutSideEl.innerHTML = `
      <h3>Loadout</h3>
      <div class="stat" style="opacity:0.65;margin-bottom:8px;font-size:11px">${escapeHtml(ship.instanceName)} (${activeClass.name})</div>
      ${weaponBlocks}
      ${accessoryBlocks}
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
    loadoutSideEl.querySelectorAll('.equip-accessory').forEach((select) =>
      select.addEventListener('change', async () => {
        try {
          equipAccessory(gameState, currentBody.id, Number(select.dataset.slot), select.value || null)
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
    const storageAccessories = currentBody.hasShipyard
      ? (gameState.stationStorage[currentBody.id]?.accessories ?? {})
      : {}

    if (!currentBody.hasShipyard) {
      hideShipyardSideBoxes()
      contentEl.innerHTML = `${repairSection}<p>No shipyard at this location.</p>`
    } else {
      const sub = shipyardSubTab === 'armoury' || shipyardSubTab === 'accessories' ? shipyardSubTab : 'ships'
      shipyardSubTab = sub

      const storedShips = gameState.stationStorage[currentBody.id]?.ships ?? []
      const storedShipCountByClass = {}
      for (const s of storedShips) {
        storedShipCountByClass[s.classId] = (storedShipCountByClass[s.classId] ?? 0) + 1
      }

      let catalogHtml = ''
      if (sub === 'ships') {
        catalogHtml = `
          <p style="opacity:0.7;font-size:12px;margin:0 0 10px">Buy parks a hull in station storage. Sell sells one stored ship of that class (half list price).</p>
          <table>
            <thead><tr><th>Ship</th><th>Role</th><th>Acc</th><th>Price</th><th>Stored</th><th>Buy</th><th>Sell</th></tr></thead>
            <tbody>${purchasableShipClasses().map((c) => {
              const stored = storedShipCountByClass[c.id] ?? 0
              const sellPrice = Math.round(c.price * 0.5)
              return `
              <tr data-class="${c.id}" class="${c.id === selectedShipClassId ? 'selected' : ''}">
                <td>${c.name}</td><td>${c.role}</td><td>${accessorySlotCount(c)}</td><td>${c.price}cr</td>
                <td>${stored}</td>
                <td><button class="buy-ship" data-class="${c.id}">Buy</button></td>
                <td>${stored > 0
                  ? `<button class="sell-ship-class" data-class="${c.id}" data-price="${sellPrice}">Sell (${sellPrice}cr)</button>`
                  : ''}</td>
              </tr>`
            }).join('')}</tbody>
          </table>
          ${storedShips.length
            ? `<h3 style="margin-top:16px">Stored here</h3>
              <table>
                <thead><tr><th>Name</th><th>Class</th><th>Sell</th></tr></thead>
                <tbody>${storedShips.map((s, i) => {
                  let className = s.classId
                  let sellPrice = 0
                  try {
                    const sc = getShipClass(s.classId)
                    className = sc.name
                    sellPrice = Math.round(sc.price * 0.5)
                  } catch { /* */ }
                  return `<tr>
                    <td>${escapeHtml(s.instanceName)}</td>
                    <td>${escapeHtml(className)}</td>
                    <td><button class="sell-ship" data-index="${i}">Sell (${sellPrice}cr)</button></td>
                  </tr>`
                }).join('')}</tbody>
              </table>`
            : ''}`
      } else if (sub === 'armoury') {
        const spareWeapons = ship.spareWeapons ?? {}
        catalogHtml = `
          <p style="opacity:0.7;font-size:12px;margin:0 0 10px">Buy into station storage. Sell column sells from storage (salvaged weapons listed separately).</p>
          <table>
            <thead><tr><th>Weapon</th><th>Cat</th><th>Dmg</th><th>Price</th><th>St</th><th>Buy</th><th>Sell</th></tr></thead>
            <tbody>${WEAPONS.map((w) => {
              const st = storageWeapons[w.id] ?? 0
              const sal = spareWeapons[w.id] ?? 0
              const unitSell = Math.round(w.price * 0.5)
              return `
              <tr>
                <td>${w.name}</td><td>${w.category}</td><td>${w.damage}</td><td>${w.price}cr</td>
                <td>${st}</td>
                <td><button class="buy-weapon" data-weapon="${w.id}" data-price="${w.price}">Buy</button></td>
                <td>
                  ${st > 0
                    ? `<button class="sell-weapon" data-weapon="${w.id}" data-held="${st}" data-src="storage" data-price="${unitSell}">Sell</button>`
                    : ''}
                  ${sal > 0
                    ? `<button class="sell-weapon" data-weapon="${w.id}" data-held="${sal}" data-src="spare" data-price="${unitSell}">Sell salv</button>`
                    : ''}
                </td>
              </tr>`
            }).join('')}</tbody>
          </table>`
      } else {
        catalogHtml = `
          <p style="opacity:0.7;font-size:12px;margin:0 0 10px">Buy and sell use station storage.</p>
          <table>
            <thead><tr><th>Accessory</th><th>Price</th><th>St</th><th>Buy</th><th>Sell</th></tr></thead>
            <tbody>${ACCESSORIES.map((a) => {
              const st = storageAccessories[a.id] ?? 0
              return `
              <tr>
                <td>
                  <div>${a.name}</div>
                  <div class="acc-desc">${escapeHtml(a.description)}</div>
                </td>
                <td>${a.price}cr</td>
                <td>${st}</td>
                <td><button class="buy-accessory" data-accessory="${a.id}" data-price="${a.price}">Buy</button></td>
                <td>${st > 0
                  ? `<button class="sell-accessory" data-accessory="${a.id}" data-held="${st}">Sell</button>`
                  : ''}</td>
              </tr>`
            }).join('')}</tbody>
          </table>`
      }

      contentEl.innerHTML = `
        ${repairSection}
        <div class="shipyard-current">
          Current: <span class="ship-name">${escapeHtml(ship.instanceName)}</span>
          (${escapeHtml(shipClass.name)})
          <button class="rename-active">Rename</button>
        </div>
        <div class="svc-subtabs">
          <button type="button" class="svc-subtab ${sub === 'ships' ? 'active' : ''}" data-subtab="ships">Ships</button>
          <button type="button" class="svc-subtab ${sub === 'armoury' ? 'active' : ''}" data-subtab="armoury">Armoury</button>
          <button type="button" class="svc-subtab ${sub === 'accessories' ? 'active' : ''}" data-subtab="accessories">Accessories</button>
        </div>
        <div class="shipyard-main">
          ${catalogHtml}
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
    contentEl.querySelectorAll('.svc-subtab').forEach((btn) =>
      btn.addEventListener('click', () => {
        shipyardSubTab = btn.dataset.subtab
        renderShipyard()
      })
    )
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
    contentEl.querySelectorAll('.sell-ship-class').forEach((btn) =>
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const classId = btn.dataset.class
        const ships = gameState.stationStorage[currentBody.id]?.ships ?? []
        const index = ships.findIndex((s) => s.classId === classId)
        if (index < 0) {
          await showNotice('Cannot sell', 'No ship of that class in station storage.')
          return
        }
        try {
          const sold = ships[index]
          const label = sold?.instanceName ?? 'Ship'
          sellStoredShip(gameState, currentBody.id, index)
          await showNotice('Ship sold', `${label} sold from station storage.`)
        } catch (err) {
          await showNotice('Cannot sell', err.message)
        }
        renderShipyard()
      })
    )
    contentEl.querySelectorAll('.sell-ship').forEach((btn) =>
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const index = Number(btn.dataset.index)
        const ships = gameState.stationStorage[currentBody.id]?.ships ?? []
        try {
          const sold = ships[index]
          const label = sold?.instanceName ?? 'Ship'
          sellStoredShip(gameState, currentBody.id, index)
          await showNotice('Ship sold', `${label} sold from station storage.`)
        } catch (err) {
          await showNotice('Cannot sell', err.message)
        }
        renderShipyard()
      })
    )
    contentEl.querySelectorAll('.buy-weapon').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const weaponId = btn.dataset.weapon
        const price = Number(btn.dataset.price)
        const w = getWeapon(weaponId)
        const maxBuy = price > 0 ? Math.floor(gameState.player.credits / price) : 0
        const qty = await planTradeQty({
          side: 'buy',
          label: w.name,
          unitPrice: price,
          maxQty: maxBuy,
          credits: gameState.player.credits
        })
        if (qty < 1) return
        try {
          buyWeapon(gameState, currentBody.id, weaponId, qty)
          await showNotice(
            'Weapon purchased',
            `${qty}× ${w.name} in station storage. Equip from Loadout (left).`
          )
        } catch (err) {
          await showNotice('Purchase failed', err.message)
        }
        renderShipyard()
      })
    )
    contentEl.querySelectorAll('.sell-weapon').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const weaponId = btn.dataset.weapon
        const held = Number(btn.dataset.held)
        const src = btn.dataset.src
        const w = getWeapon(weaponId)
        const unit = Math.round(w.price * 0.5)
        const qty = await planTradeQty({
          side: 'sell',
          label: w.name,
          unitPrice: unit,
          maxQty: held,
          credits: gameState.player.credits
        })
        if (qty < 1) return
        try {
          if (src === 'spare') sellCarriedWeapon(gameState, weaponId, qty)
          else sellStoredWeapon(gameState, currentBody.id, weaponId, qty)
        } catch (err) {
          await showNotice('Sale failed', err.message)
        }
        renderShipyard()
      })
    )
    contentEl.querySelectorAll('.buy-accessory').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const accessoryId = btn.dataset.accessory
        const price = Number(btn.dataset.price)
        const a = getAccessory(accessoryId)
        const maxBuy = price > 0 ? Math.floor(gameState.player.credits / price) : 0
        const qty = await planTradeQty({
          side: 'buy',
          label: a.name,
          unitPrice: price,
          maxQty: maxBuy,
          credits: gameState.player.credits
        })
        if (qty < 1) return
        try {
          buyAccessory(gameState, currentBody.id, accessoryId, qty)
          await showNotice(
            'Accessory purchased',
            `${qty}× ${a.name} in station storage. Equip from Loadout (left).`
          )
        } catch (err) {
          await showNotice('Purchase failed', err.message)
        }
        renderShipyard()
      })
    )
    contentEl.querySelectorAll('.sell-accessory').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const accessoryId = btn.dataset.accessory
        const held = Number(btn.dataset.held)
        const a = getAccessory(accessoryId)
        const unit = Math.round(a.price * 0.5)
        const qty = await planTradeQty({
          side: 'sell',
          label: a.name,
          unitPrice: unit,
          maxQty: held,
          credits: gameState.player.credits
        })
        if (qty < 1) return
        try {
          sellStoredAccessory(gameState, currentBody.id, accessoryId, qty)
        } catch (err) {
          await showNotice('Sale failed', err.message)
        }
        renderShipyard()
      })
    )
    renderSidePanel()
  }

  function formatRemoteStorageBits(s) {
    const bits = []
    const cargoRows = Object.entries(s.cargo ?? {}).filter(([, q]) => q > 0)
    const oreRows = Object.entries(s.miningHold ?? {}).filter(([, q]) => q > 0)
    if (cargoRows.length) {
      bits.push(`Cargo: ${cargoRows.map(([id, q]) => `${q} ${getGood(id).name}`).join(', ')}`)
    }
    if (oreRows.length) {
      bits.push(`Ore: ${oreRows.map(([id, q]) => `${q} ${getGood(id).name}`).join(', ')}`)
    }
    if ((s.shipParts ?? 0) > 0) bits.push(`${s.shipParts} Ship Part(s)`)
    if (s.ships?.length) {
      bits.push(
        `${s.ships.length} ship(s): ${s.ships.map((sh) => escapeHtml(sh.instanceName)).join(', ')}`
      )
    }
    const weaponRows = Object.entries(s.weapons ?? {}).filter(([, q]) => q > 0)
    if (weaponRows.length) {
      bits.push(
        `Weapons: ${weaponRows.map(([id, q]) => {
          try { return `${q} ${getWeapon(id).name}` } catch { return `${q} ${id}` }
        }).join(', ')}`
      )
    }
    const accRows = Object.entries(s.accessories ?? {}).filter(([, q]) => q > 0)
    if (accRows.length) {
      bits.push(
        `Accessories: ${accRows.map(([id, q]) => {
          try { return `${q} ${getAccessory(id).name}` } catch { return `${q} ${id}` }
        }).join(', ')}`
      )
    }
    const bpRows = Object.entries(s.blueprints ?? {}).filter(([, q]) => q > 0)
    if (bpRows.length) bits.push(`Blueprints: ${bpRows.reduce((a, [, q]) => a + q, 0)}`)
    return bits.join(' · ') || '—'
  }

  function renderStorage() {
    ensureBlueprintMaps(gameState)
    const sub = storageSubTab === 'remote' ? 'remote' : 'local'
    storageSubTab = sub

    let bodyHtml = ''
    if (sub === 'local') {
      const storage = gameState.stationStorage[currentBody.id] ?? {
        cargo: {}, miningHold: {}, shipParts: 0, ships: [], weapons: {}, accessories: {}, blueprints: {}
      }
      storage.blueprints ??= {}
      storage.accessories ??= {}
      const cargoRows = Object.entries(storage.cargo).filter(([, qty]) => qty > 0)
      const cargoStored = cargoRows.reduce((a, [, qty]) => a + qty, 0)
      const stationParts = storage.shipParts ?? 0
      bodyHtml = `
        <p class="xfer-hint">Drag cargo or ship parts from <strong>Your ship</strong> into this bay (or reverse). Ore &amp; blueprints: Industry tab only.</p>
        <h3>Cargo</h3>
        <div class="credits">${cargoStored} unit${cargoStored === 1 ? '' : 's'} stored</div>
        ${cargoRows.length
          ? `<table><tbody>${cargoRows.map(([id, qty]) =>
              `<tr class="${xferClass(qty).trim()}"${xferAttrs('station', 'cargo', id, qty)}><td>${getGood(id).name}</td><td>${qty}</td></tr>`
            ).join('')}</tbody></table>`
          : '<p class="empty" style="opacity:0.5">Empty</p>'}
        <h3>Ship Parts</h3>
        ${stationParts > 0
          ? `<div class="credits xfer-parts${xferClass(stationParts)}"${xferAttrs('station', 'parts', 'ship_parts', stationParts)}>${stationParts} in bay</div>`
          : '<div class="credits">0 in bay</div>'}
        <p style="opacity:0.6;font-size:11px;margin-top:14px">Weapons &amp; accessories: buy/sell on Shipyard. Ore &amp; blueprints: Industry.</p>
      `
    } else {
      const remoteEntries = Object.entries(gameState.stationStorage ?? {})
        .filter(([bodyId, s]) => bodyId !== currentBody.id && storageHasAssets(s))
      bodyHtml = `
        <p style="opacity:0.7;font-size:12px;">Assets left at other stations and settlements. Travel there to retrieve them.</p>
        ${remoteEntries.length
          ? remoteEntries.map(([bodyId, s]) => {
            const body = findBody(gameState.galaxy, bodyId)
            const system = findSystemOfBody(gameState.galaxy, bodyId)
            const kind =
              body?.kind === 'station' ? 'Station' : body?.kind === 'settlement' ? 'Settlement' : body?.kind || 'Facility'
            return `<div class="remote-asset">
              <h4>${escapeHtml(body?.name ?? bodyId)} <span style="opacity:0.55;font-size:11px">(${escapeHtml(kind)})</span></h4>
              <div class="location">System: <span class="sys">${escapeHtml(system?.name ?? 'Unknown')}</span></div>
              <div class="assets">${formatRemoteStorageBits(s)}</div>
            </div>`
          }).join('')
          : '<p class="empty" style="opacity:0.5">No remote assets — leave cargo, ships, or gear at other bays to see them here.</p>'}
      `
    }

    contentEl.innerHTML = `
      <div class="svc-subtabs">
        <button type="button" class="svc-subtab ${sub === 'local' ? 'active' : ''}" data-subtab="local">Local storage</button>
        <button type="button" class="svc-subtab ${sub === 'remote' ? 'active' : ''}" data-subtab="remote">Remote</button>
      </div>
      ${bodyHtml}
    `
    contentEl.querySelectorAll('.svc-subtab').forEach((btn) =>
      btn.addEventListener('click', () => {
        storageSubTab = btn.dataset.subtab
        renderStorage()
      })
    )
    if (sub === 'local' && xferEnabled()) {
      wireXferItems(contentEl)
      // Drop ship → station bay (cargo / parts only).
      wireDropZone(contentEl, 'ship', 'toStation')
    }
    renderSidePanel()
  }

  /**
   * @param {{ tryRefill?: boolean }} [opts]
   * tryRefill: only after turn-in / when opening the tab — never after Accept
   * (accepting must not restock the board while contracts are still open).
   */
  function renderMissions(opts = {}) {
    const tryRefill = opts.tryRefill !== false
    if (tryRefill) {
      refillMissionsIfExhausted(gameState, currentBody.id, rng)
    }
    const bodyId = String(currentBody.id)
    const boardMissions = gameState.missions.available.filter((m) => String(m.giverStationId) === bodyId)
    const activeHere = gameState.missions.active.filter((m) => String(m.giverStationId) === bodyId)
    const sub = missionsSubTab === 'turnin' ? 'turnin' : 'available'
    missionsSubTab = sub

    const bodyHtml =
      sub === 'available'
        ? `
      <table>
        <thead><tr><th>Type</th><th>Title</th><th>Reward</th><th></th></tr></thead>
        <tbody>${boardMissions.length
          ? boardMissions.map((m) => `
          <tr>
            <td>${m.type ? m.type.charAt(0).toUpperCase() + m.type.slice(1) : ''}</td><td>${m.title}</td><td>${m.reward}cr</td>
            <td><button class="accept-mission" data-id="${m.id}">Accept</button></td>
          </tr>`).join('')
          : '<tr><td colspan="4" style="opacity:0.5">No contracts available.</td></tr>'}</tbody>
      </table>`
        : `
      <table>
        <thead><tr><th>Title</th><th>Status</th><th></th></tr></thead>
        <tbody>${activeHere.length
          ? activeHere.map((m) => `
          <tr>
            <td>${m.title}</td><td>${m.objectiveComplete ? 'Ready' : 'In progress'}</td>
            <td>${m.objectiveComplete ? `<button class="turnin" data-id="${m.id}">Turn In</button>` : ''}</td>
          </tr>`).join('')
          : '<tr><td colspan="3" style="opacity:0.5">No active contracts from this bay.</td></tr>'}</tbody>
      </table>`

    contentEl.innerHTML = `
      <div class="svc-subtabs">
        <button type="button" class="svc-subtab ${sub === 'available' ? 'active' : ''}" data-subtab="available">Available</button>
        <button type="button" class="svc-subtab ${sub === 'turnin' ? 'active' : ''}" data-subtab="turnin">Turn In</button>
      </div>
      ${bodyHtml}
    `
    contentEl.querySelectorAll('.svc-subtab').forEach((btn) =>
      btn.addEventListener('click', () => {
        missionsSubTab = btn.dataset.subtab
        renderMissions({ tryRefill: false })
      })
    )
    contentEl.querySelectorAll('.accept-mission').forEach((btn) =>
      btn.addEventListener('click', () => {
        try {
          acceptMission(gameState, btn.dataset.id, rng)
        } catch (err) {
          showNotice('Accept failed', err.message)
          return
        }
        renderMissions({ tryRefill: false })
      })
    )
    contentEl.querySelectorAll('.turnin').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          turnInMission(gameState, btn.dataset.id)
        } catch (err) {
          await showNotice('Turn-in failed', err.message)
          return
        }
        renderMissions({ tryRefill: true })
      })
    )
    renderSidePanel()
  }

  /** Ore in storage — left side box on Industry (mirrors shipyard stats column). */
  function renderIndustryOreSide() {
    if (currentTab !== 'industry' || !currentBody) {
      oreSideEl.style.display = 'none'
      oreSideEl.innerHTML = ''
      return
    }
    if (currentBody.kind !== 'station' && currentBody.kind !== 'settlement') {
      hideLeftSideBoxes()
      return
    }
    const storage = gameState.stationStorage[currentBody.id] ?? {}
    storage.miningHold ??= {}
    const oreRows = Object.entries(storage.miningHold).filter(([, qty]) => qty > 0)

    statsSideEl.style.display = 'none'
    loadoutSideEl.style.display = 'none'
    statsSideEl.innerHTML = ''
    loadoutSideEl.innerHTML = ''
    shipyardLeftCol.style.display = 'flex'
    shipyardLeftCol.classList.add('industry-ore-col')
    root.classList.add('industry-layout')
    oreSideEl.style.display = 'block'
    oreSideEl.innerHTML = `
      <h3>Ore in storage</h3>
      <p class="xfer-hint">Drag ore from Your ship here (or reverse). Used by Assemble.</p>
      ${oreRows.length
        ? `<table><tbody>${oreRows.map(([id, qty]) =>
            `<tr class="${xferClass(qty).trim()}"${xferAttrs('station', 'ore', id, qty)}><td>${getGood(id).name}</td><td>${qty}</td></tr>`
          ).join('')}</tbody></table>`
        : '<div class="empty">Empty — drag from ship or buy on Trade → Ore</div>'}
    `
    if (xferEnabled()) {
      wireXferItems(oreSideEl)
      wireDropZone(oreSideEl, 'ship', 'toStation')
    }
  }

  function renderIndustry() {
    ensureBlueprintMaps(gameState)
    if (currentBody.kind !== 'station' && currentBody.kind !== 'settlement') {
      contentEl.innerHTML = '<p>Industry bays are only available at stations and settlements.</p>'
      hideLeftSideBoxes()
      renderSidePanel()
      return
    }
    const storage = gameState.stationStorage[currentBody.id] ?? {
      cargo: {}, miningHold: {}, shipParts: 0, ships: [], weapons: {}, blueprints: {}
    }
    storage.blueprints ??= {}
    storage.miningHold ??= {}
    const credits = gameState.player.credits

    const byKind = { ship: [], accessory: [], weapon: [] }
    for (const [id, qty] of Object.entries(storage.blueprints)) {
      if (qty <= 0) continue
      let bp
      try {
        bp = getBlueprint(id)
      } catch {
        continue
      }
      if (byKind[bp.kind]) byKind[bp.kind].push([id, qty, bp])
    }
    for (const list of Object.values(byKind)) {
      list.sort((a, b) => craftDurationS(a[0]) - craftDurationS(b[0]))
    }

    const kindMeta = [
      { key: 'ship', label: 'Ships' },
      { key: 'accessory', label: 'Accessories' },
      { key: 'weapon', label: 'Weapons' }
    ]

    function bpKindSection(key, label, rows) {
      const open = !!industryBpOpen[key]
      const count = rows.length
      const body =
        count === 0
          ? `<p style="opacity:0.5;font-size:11px;margin:4px 0 0">None in storage</p>`
          : `<table>
            <thead><tr><th>Blueprint</th><th>Qty</th><th>Ore</th><th>Fee</th><th>Time</th><th></th></tr></thead>
            <tbody>${rows
              .map(([id, qty, bp]) => {
                const cost = oreCostForBlueprint(id)
                const fee = creditCostForBlueprint(id)
                const dur = craftDurationS(id)
                const enoughOre = Object.entries(cost).every(
                  ([oid, need]) => (storage.miningHold[oid] ?? 0) >= need
                )
                const canAssemble = enoughOre && credits >= fee
                return `
              <tr class="${xferClass(qty).trim()}"${xferAttrs('station', 'blueprint', id, qty)}>
                <td>${escapeHtml(bp.itemName)}</td>
                <td>${qty}</td>
                <td style="font-size:10px;opacity:0.85">${formatOreCost(cost)}</td>
                <td>${fee}cr</td>
                <td>${formatDuration(dur)}</td>
                <td><button class="assemble-btn" data-bp="${escapeHtml(id)}" ${canAssemble ? '' : 'disabled'}>Assemble</button></td>
              </tr>`
              })
              .join('')}</tbody>
          </table>`
      return `
        <div class="bp-kind" data-kind="${key}">
          <button type="button" class="bp-kind-toggle" data-kind="${key}" aria-expanded="${open}">
            <span class="chev">${open ? '▼' : '▶'}</span>${label}${count ? ` (${count})` : ''}
          </button>
          <div class="bp-kind-body" style="display:${open ? 'block' : 'none'}">${body}</div>
        </div>`
    }

    const totalBps = byKind.ship.length + byKind.accessory.length + byKind.weapon.length

    contentEl.innerHTML = `
      <p style="opacity:0.75;font-size:12px;">
        Assemble from <strong>station-stored</strong> blueprints and ore (1 blueprint per build, consumed on start).
        Ore bay is on the <strong>left</strong>; drag BPs from Your ship onto this panel.
      </p>
      <div class="industry-main industry-bp-drop">
        <div class="industry-bp-header">
          <h3>Blueprints</h3>
          <button type="button" class="move-all-bps" ${totalBps ? '' : 'disabled'} title="Transfer all station blueprints to your ship">Move All</button>
        </div>
        ${totalBps
          ? kindMeta.map(({ key, label }) => bpKindSection(key, label, byKind[key])).join('')
          : '<p style="opacity:0.55;font-size:12px">No blueprints. Drag from ship or find via wrecks/probes. Not sellable.</p>'}
      </div>
    `

    contentEl.querySelector('.move-all-bps')?.addEventListener('click', () => {
      if (!totalBps) return
      retrieveBlueprints(gameState, currentBody.id)
      renderIndustry()
    })
    contentEl.querySelectorAll('.bp-kind-toggle').forEach((btn) =>
      btn.addEventListener('click', () => {
        const k = btn.dataset.kind
        industryBpOpen[k] = !industryBpOpen[k]
        renderIndustry()
      })
    )
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
    if (xferEnabled()) {
      wireXferItems(contentEl)
      // Ship → station industry (blueprints into main panel)
      wireDropZone(contentEl, 'ship', 'toStation')
    }
    renderIndustryOreSide()
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
    if (currentTab !== 'shipyard' && currentTab !== 'industry') hideLeftSideBoxes()
    else if (currentTab !== 'shipyard') hideShipyardSideBoxes()
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
      shipyardSubTab = 'ships'
      tradeSubTab = 'goods'
      missionsSubTab = 'available'
      storageSubTab = 'local'
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
