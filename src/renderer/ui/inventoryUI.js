import { getGood } from '../data/goods.js'
import { getShipClass } from '../data/shipClasses.js'
import { useShipPart, storageHasAssets } from '../game/economy.js'
import { findBody, findSystemOfBody } from '../procgen/galaxy.js'
import { getWeapon } from '../data/weapons.js'
import { getAccessory, effectiveMiningCapacity } from '../data/accessories.js'
import { craftRemainingS } from '../game/crafting.js'
import { getBlueprint, formatDuration } from '../data/blueprints.js'
import { escapeHtml } from './escapeHtml.js'
import { gameNotice } from './gameDialog.js'

const STYLE = `
/* Above docking chrome (z 50) so Inventory opens while docked.
   Vertical anchor: just below the HUD system-label (+50px), not screen-centered. */
#inventory-ui {
  position: fixed; inset: 0; background: rgba(4,6,12,0.75); backdrop-filter: blur(2px);
  font-family: monospace; color: #cfe3ff; display: none;
  align-items: flex-start; justify-content: center; z-index: 55;
  padding-top: 120px; /* fallback if system-label not measured */
  box-sizing: border-box;
}
#inventory-ui .panel {
  width: 620px; max-height: calc(100vh - 140px); overflow-y: auto; padding: 18px 22px;
  background: linear-gradient(135deg, rgba(12,20,36,0.95), rgba(7,12,22,0.9));
  border: 1px solid rgba(111,216,242,0.4); border-left: 3px solid #6fd8f2;
  box-shadow: 0 0 26px rgba(79,195,217,0.22), inset 0 0 26px rgba(79,195,217,0.05);
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%);
}
#inventory-ui .inv-float-toast {
  position: fixed; left: 50%; top: 42%; transform: translate(-50%, -50%);
  pointer-events: none; z-index: 70; font-family: monospace; font-size: 14px;
  letter-spacing: 1px; color: #ffe08a;
  text-shadow: 0 0 8px rgba(255,210,70,0.45), 0 1px 3px rgba(0,0,0,0.9);
  opacity: 0; transition: opacity 0.2s ease;
}
#inventory-ui .inv-float-toast.show { opacity: 1; }

#inventory-ui h2 { font-weight: normal; letter-spacing: 2px; text-shadow: 0 0 8px rgba(79,195,217,0.5); margin: 0; }
#inventory-ui h3 { font-weight: normal; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #7fe6ff; text-shadow: 0 0 6px rgba(79,195,217,0.6); margin: 0 0 10px; }
#inventory-ui .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 12px; }
#inventory-ui .header-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
#inventory-ui .credits-display {
  font-size: 13px; letter-spacing: 1px; color: #ffe08a;
  text-shadow: 0 0 8px rgba(255,210,70,0.4);
  white-space: nowrap;
}
#inventory-ui .tabs {
  display: flex; gap: 2px; margin-bottom: 14px;
  border-bottom: 1px solid rgba(111,216,242,0.25);
  flex-wrap: wrap;
}
#inventory-ui .tab {
  background: transparent; border: none; border-bottom: 2px solid transparent;
  color: #8fb3d9; padding: 7px 12px; cursor: pointer; font-family: monospace;
  font-size: 11px; letter-spacing: 1px; text-transform: uppercase;
  transition: color 0.15s ease, border-color 0.15s ease;
}
#inventory-ui .tab:hover { color: #cfe3ff; }
#inventory-ui .tab.active {
  color: #7fe6ff; border-bottom-color: #6fd8f2;
  text-shadow: 0 0 6px rgba(79,195,217,0.55);
}
#inventory-ui table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
#inventory-ui th { text-align: left; padding: 6px 8px; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #7fa8c9; font-weight: normal; border-bottom: 1px solid rgba(111,216,242,0.3); }
#inventory-ui td { text-align: left; padding: 5px 8px; border-bottom: 1px solid rgba(42,58,85,0.5); }
#inventory-ui button.close {
  background: rgba(224,90,90,0.12); border: 1px solid rgba(224,90,90,0.5); color: #ffb3b3;
  padding: 7px 16px; cursor: pointer; font-family: monospace; letter-spacing: 1px;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}
#inventory-ui button.close:hover { background: rgba(224,90,90,0.22); box-shadow: 0 0 12px rgba(224,90,90,0.35); }
#inventory-ui button.repair-btn {
  background: rgba(127,224,160,0.12); border: 1px solid rgba(127,224,160,0.5); color: #bdf5cf;
  padding: 7px 14px; cursor: pointer; font-family: monospace; letter-spacing: 1px;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}
#inventory-ui button.repair-btn:not(:disabled):hover {
  background: rgba(127,224,160,0.22); box-shadow: 0 0 12px rgba(127,224,160,0.35);
}
#inventory-ui button.repair-btn:disabled { opacity: 0.35; cursor: not-allowed; }
#inventory-ui .parts-badge {
  font-size: 12px; letter-spacing: 0.5px; color: #bdf5cf; opacity: 0.95;
  white-space: nowrap;
  text-shadow: 0 0 6px rgba(127,224,160,0.35);
}
#inventory-ui .parts-badge.none { color: #8fb3d9; opacity: 0.65; }
#inventory-ui .empty { opacity: 0.5; font-size: 12px; }
#inventory-ui .tab-meta {
  font-size: 12px; opacity: 0.75; margin: 0 0 12px 0; line-height: 1.4;
}
#inventory-ui .hull-status {
  font-size: 12px; opacity: 0.9; margin-bottom: 10px;
}
#inventory-ui .remote-station {
  margin-bottom: 12px; padding: 10px 12px;
  background: rgba(79,195,217,0.05); border-left: 2px solid rgba(111,216,242,0.35);
}
#inventory-ui .remote-station h4 { margin: 0 0 2px 0; font-size: 13px; color: #7fe6ff; font-weight: normal; }
#inventory-ui .remote-station .location {
  font-size: 11px; opacity: 0.75; margin-bottom: 6px; letter-spacing: 0.3px;
}
#inventory-ui .remote-station .location .sys { color: #ffe08a; }
#inventory-ui .remote-station .location .here {
  color: #7fe0a0; margin-left: 6px; font-size: 10px; letter-spacing: 1px; text-transform: uppercase;
}
#inventory-ui .remote-station .assets { font-size: 12px; line-height: 1.45; opacity: 0.95; }
#inventory-ui .job-row {
  margin-bottom: 12px; padding: 10px 12px;
  background: rgba(79,195,217,0.05); border-left: 2px solid rgba(127,224,160,0.45);
}
#inventory-ui .job-row .job-name { color: #cfe3ff; margin-bottom: 4px; }
#inventory-ui .job-row .job-meta { font-size: 11px; opacity: 0.75; margin-bottom: 6px; line-height: 1.4; }
#inventory-ui .job-row .job-loc { color: #ffe08a; }
#inventory-ui .craft-progress {
  height: 8px; background: #0c1424; border: 1px solid #2a3a55; overflow: hidden;
}
#inventory-ui .craft-progress .fill {
  height: 100%; background: linear-gradient(90deg, #2e8fa8, #7fe6ff);
}
`

// Cargo / ore / stored assets / industry jobs — tabbed inventory.
// Ship-part repair is in the header (consumes one part via useShipPart).
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
        <div class="header-right">
          <span class="credits-display"></span>
          <span class="parts-badge none">Parts: 0</span>
          <button type="button" class="repair-btn" disabled>Repair</button>
          <button type="button" class="close">Close</button>
        </div>
      </div>
      <div class="tabs">
        <button type="button" class="tab active" data-tab="cargo">Cargo</button>
        <button type="button" class="tab" data-tab="ore">Ore</button>
        <button type="button" class="tab" data-tab="parts">Ship parts</button>
        <button type="button" class="tab" data-tab="blueprints">Blueprints</button>
        <button type="button" class="tab" data-tab="stored">Stored assets</button>
        <button type="button" class="tab" data-tab="industry">Industry</button>
      </div>
      <div class="content"></div>
    </div>
  `
  container.appendChild(root)

  const contentEl = root.querySelector('.content')
  const creditsEl = root.querySelector('.credits-display')
  const partsBadgeEl = root.querySelector('.parts-badge')
  const repairBtn = root.querySelector('.repair-btn')
  const tabButtons = [...root.querySelectorAll('.tab')]
  let currentTab = 'cargo'

  function formatCredits(n) {
    return `${Math.max(0, Math.floor(Number(n) || 0)).toLocaleString()} cr`
  }

  function formatBodyKind(kind) {
    if (kind === 'station') return 'Station'
    if (kind === 'settlement') return 'Settlement'
    return kind || 'Facility'
  }

  function qtyMapBits(map, label, nameOf) {
    const rows = Object.entries(map ?? {}).filter(([, q]) => q > 0)
    if (!rows.length) return null
    return `${label}: ${rows.map(([id, q]) => {
      let name = id
      try { name = nameOf(id) } catch { /* keep id */ }
      return `${q} ${name}`
    }).join(', ')}`
  }

  function shipNeedsRepair(ship, shipClass) {
    return ship.hull < shipClass.stats.hull || ship.armor < shipClass.stats.armor
  }

  function updatePartsAndRepair() {
    const ship = gameState.player.ship
    const shipClass = getShipClass(ship.classId)
    const parts = ship.shipParts ?? 0
    const needsRepair = shipNeedsRepair(ship, shipClass)
    partsBadgeEl.textContent = `Parts: ${parts}`
    partsBadgeEl.classList.toggle('none', parts <= 0)
    partsBadgeEl.title = 'Ship parts on board'
    repairBtn.disabled = parts <= 0 || !needsRepair
    if (parts <= 0) repairBtn.title = 'No ship parts on board'
    else if (!needsRepair) repairBtn.title = 'No repair needed — hull and armour are full'
    else repairBtn.title = `Use 1 ship part (${parts} on board) — restores 10% hull/armour`
  }

  function renderCargoTab(ship, shipClass) {
    const cargoRows = Object.entries(ship.cargo).filter(([, qty]) => qty > 0)
    const used = cargoRows.reduce((a, [, q]) => a + q, 0)
    contentEl.innerHTML = `
      <h3>Cargo Hold (${used}/${shipClass.stats.cargoCapacity})</h3>
      ${cargoRows.length
        ? `<table>
            <thead><tr><th>Good</th><th>Qty</th></tr></thead>
            <tbody>${cargoRows.map(([id, qty]) => `<tr><td>${getGood(id).name}</td><td>${qty}</td></tr>`).join('')}</tbody>
          </table>`
        : '<div class="empty">Empty</div>'}
    `
  }

  function renderPartsTab(ship, shipClass) {
    const parts = ship.shipParts ?? 0
    const hull = Math.round(ship.hull)
    const armor = Math.round(ship.armor)
    contentEl.innerHTML = `
      <h3>Ship Parts</h3>
      <p class="tab-meta">On board: <strong>${parts}</strong></p>
      <div class="hull-status">Hull ${hull}/${shipClass.stats.hull} · Armour ${armor}/${shipClass.stats.armor}</div>
      <p class="tab-meta">Each repair uses 1 part and restores 10% of max hull and armour.</p>
    `
  }

  function renderOreTab(ship, shipClass) {
    const oreRows = Object.entries(ship.miningHold).filter(([, qty]) => qty > 0)
    const used = oreRows.reduce((a, [, q]) => a + q, 0)
    const cap = effectiveMiningCapacity(ship, shipClass)
    contentEl.innerHTML = `
      <h3>Ore Hold (${used}/${cap})</h3>
      ${oreRows.length
        ? `<table>
            <thead><tr><th>Ore</th><th>Qty</th></tr></thead>
            <tbody>${oreRows.map(([id, qty]) => `<tr><td>${getGood(id).name}</td><td>${qty}</td></tr>`).join('')}</tbody>
          </table>`
        : '<div class="empty">Empty</div>'}
    `
  }

  function renderBlueprintsTab(ship) {
    const bpRows = Object.entries(ship.blueprints ?? {}).filter(([, qty]) => qty > 0)
    const total = bpRows.reduce((a, [, q]) => a + q, 0)
    const byKind = { ship: [], accessory: [], weapon: [], other: [] }
    for (const [id, qty] of bpRows) {
      let bp
      try {
        bp = getBlueprint(id)
      } catch {
        byKind.other.push({ id, qty, name: id, kind: 'unknown' })
        continue
      }
      const bucket = byKind[bp.kind] ? bp.kind : 'other'
      byKind[bucket].push({ id, qty, name: bp.name ?? bp.itemName ?? id, itemName: bp.itemName, kind: bp.kind })
    }
    for (const list of Object.values(byKind)) {
      list.sort((a, b) => String(a.name).localeCompare(String(b.name)))
    }
    function section(title, rows) {
      if (!rows.length) return ''
      return `
        <h3 style="margin-top:14px">${escapeHtml(title)}</h3>
        <table>
          <thead><tr><th>Blueprint</th><th>Builds</th><th>Qty</th></tr></thead>
          <tbody>${rows.map((r) => `
            <tr>
              <td>${escapeHtml(r.name)}</td>
              <td>${escapeHtml(r.itemName ?? '—')}</td>
              <td>×${r.qty}</td>
            </tr>`).join('')}</tbody>
        </table>`
    }
    contentEl.innerHTML = `
      <h3>Blueprints on board (${total})</h3>
      <p class="tab-meta">One-shot: each craft consumes one blueprint. Not sellable — store or assemble at Industry.</p>
      ${total
        ? `${section('Ships', byKind.ship)}
           ${section('Accessories', byKind.accessory)}
           ${section('Weapons', byKind.weapon)}
           ${section('Other', byKind.other)}`
        : '<div class="empty">None on board — find via wrecks, probes, or transfer from station Industry.</div>'}
    `
  }

  function renderStoredTab() {
    const dockedBodyId = gameState.player.dockedBodyId ?? null
    const remoteEntries = Object.entries(gameState.stationStorage ?? {}).filter(([, s]) =>
      storageHasAssets(s)
    )
    contentEl.innerHTML = `
      <h3>Stored Assets</h3>
      <p class="tab-meta">Cargo, ships, and gear left at stations and settlements.</p>
      ${remoteEntries.length
        ? remoteEntries
            .map(([bodyId, s]) => {
              const body = findBody(gameState.galaxy, bodyId)
              const system = findSystemOfBody(gameState.galaxy, bodyId)
              const bodyName = body?.name ?? bodyId
              const kindLabel = formatBodyKind(body?.kind)
              const systemName = system?.name ?? 'Unknown system'
              const isHere = dockedBodyId != null && bodyId === dockedBodyId
              const bits = []
              const cargoBit = qtyMapBits(s.cargo, 'Cargo', (id) => getGood(id).name)
              const oreBit = qtyMapBits(s.miningHold, 'Ore', (id) => getGood(id).name)
              if (cargoBit) bits.push(cargoBit)
              if (oreBit) bits.push(oreBit)
              if ((s.shipParts ?? 0) > 0) bits.push(`${s.shipParts} Ship Part(s)`)
              if (s.ships?.length) {
                bits.push(
                  `${s.ships.length} stored ship(s): ${s.ships.map((sh) => escapeHtml(sh.instanceName)).join(', ')}`
                )
              }
              const weaponBit = qtyMapBits(s.weapons, 'Weapons', (id) => getWeapon(id).name)
              const accBit = qtyMapBits(s.accessories, 'Accessories', (id) => getAccessory(id).name)
              if (weaponBit) bits.push(weaponBit)
              if (accBit) bits.push(accBit)
              const bpRows = Object.entries(s.blueprints ?? {}).filter(([, q]) => q > 0)
              if (bpRows.length) {
                bits.push(`Blueprints: ${bpRows.reduce((a, [, q]) => a + q, 0)}`)
              }
              return `<div class="remote-station">
          <h4>${escapeHtml(bodyName)} <span style="opacity:0.55;font-size:11px">(${escapeHtml(kindLabel)})</span></h4>
          <div class="location">System: <span class="sys">${escapeHtml(systemName)}</span>${isHere ? '<span class="here">· docked here</span>' : ''}</div>
          <div class="assets">${bits.join(' · ') || '—'}</div>
        </div>`
            })
            .join('')
        : '<div class="empty">Nothing stored anywhere yet — leave items at a station or settlement Storage bay.</div>'}
    `
  }

  function renderIndustryTab() {
    const now = Date.now()
    // In-progress jobs only (finished ones are removed after delivery).
    const jobs = gameState.craftingJobs ?? []
    contentEl.innerHTML = `
      <h3>Industry Jobs</h3>
      <p class="tab-meta">Builds run on wall-clock at their bay — even while you fly elsewhere.</p>
      ${jobs.length
        ? jobs
            .map((job) => {
              let name = job.blueprintId
              try {
                name = getBlueprint(job.blueprintId).itemName
              } catch {
                /* */
              }
              const rem = craftRemainingS(job, now)
              const pct = Math.min(
                100,
                Math.round((1 - rem / Math.max(1, job.durationS)) * 100)
              )
              const systemName = job.systemName ?? 'Unknown system'
              const stationName = job.stationName ?? job.bodyId ?? 'Unknown bay'
              return `
            <div class="job-row">
              <div class="job-name">${escapeHtml(name)}</div>
              <div class="job-meta">
                <span class="job-loc">${escapeHtml(systemName)}</span>
                · ${escapeHtml(stationName)}
                · ${formatDuration(rem)} remaining
              </div>
              <div class="craft-progress"><div class="fill" style="width:${pct}%"></div></div>
            </div>`
            })
            .join('')
        : '<div class="empty">No active industry jobs. Start builds at a station or settlement Industry bay.</div>'}
    `
  }

  function render() {
    creditsEl.textContent = formatCredits(gameState.player.credits)
    updatePartsAndRepair()
    const ship = gameState.player.ship
    const shipClass = getShipClass(ship.classId)
    tabButtons.forEach((b) => b.classList.toggle('active', b.dataset.tab === currentTab))

    if (currentTab === 'cargo') renderCargoTab(ship, shipClass)
    else if (currentTab === 'ore') renderOreTab(ship, shipClass)
    else if (currentTab === 'parts') renderPartsTab(ship, shipClass)
    else if (currentTab === 'blueprints') renderBlueprintsTab(ship)
    else if (currentTab === 'stored') renderStoredTab()
    else renderIndustryTab()
  }

  tabButtons.forEach((btn) =>
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab
      render()
    })
  )

  let floatToastTimer = null
  function showFloatToast(msg) {
    let el = root.querySelector('.inv-float-toast')
    if (!el) {
      el = document.createElement('div')
      el.className = 'inv-float-toast'
      root.appendChild(el)
    }
    el.textContent = msg
    el.classList.add('show')
    clearTimeout(floatToastTimer)
    floatToastTimer = setTimeout(() => el.classList.remove('show'), 2200)
  }

  /** Anchor the panel 50px below the HUD system-name box. */
  function positionBelowSystemLabel() {
    const sys = document.querySelector('#hud .system-label')
    if (!sys) {
      root.style.paddingTop = '120px'
      return
    }
    const bottom = sys.getBoundingClientRect().bottom
    root.style.paddingTop = `${Math.max(60, Math.round(bottom + 50))}px`
  }

  repairBtn.addEventListener('click', async () => {
    const ship = gameState.player.ship
    const shipClass = getShipClass(ship.classId)
    if ((ship.shipParts ?? 0) <= 0 || !shipNeedsRepair(ship, shipClass)) return
    try {
      useShipPart(gameState)
      const hull = Math.round(ship.hull)
      const armor = Math.round(ship.armor)
      showFloatToast(`Repaired · ${ship.shipParts ?? 0} parts left · H${hull} A${armor}`)
    } catch (err) {
      if (err?.message === 'No repair needed') showFloatToast('No repair needed')
      else await gameNotice('Repair failed', err.message)
    }
    render()
  })

  root.querySelector('.close').addEventListener('click', () => {
    root.style.display = 'none'
    onCloseCallback?.()
  })

  let onCloseCallback = null

  return {
    show(onClose) {
      onCloseCallback = onClose
      currentTab = 'cargo'
      positionBelowSystemLabel()
      render()
      root.style.display = 'flex'
      // Re-measure after layout (HUD may have just become visible).
      requestAnimationFrame(positionBelowSystemLabel)
    },
    hide() {
      root.style.display = 'none'
    },
    element: root
  }
}
