import { GOODS, MINED_ORE_GOOD_IDS, getGood } from '../data/goods.js'
import { getPrice, buyGood, sellGood, sellMinedOre, purchaseShip } from '../game/economy.js'
import { purchasableShipClasses, getShipClass } from '../data/shipClasses.js'
import { acceptMission, turnInMission } from '../game/missions.js'

const STYLE = `
#docking-ui { position: fixed; inset: 0; background: rgba(4,6,12,0.35); font-family: monospace; color: #cfe3ff; display: none; align-items: center; justify-content: center; }
#docking-ui .panel { width: 640px; max-height: 80vh; overflow-y: auto; background: #0b1020; border: 1px solid #2a3a55; padding: 16px; }
#docking-ui .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
#docking-ui .tabs { display: flex; gap: 8px; margin-bottom: 12px; }
#docking-ui .tab { background: #10182a; border: 1px solid #2a3a55; color: #cfe3ff; padding: 6px 12px; cursor: pointer; }
#docking-ui .tab.active { background: #2a3a55; }
#docking-ui table { width: 100%; border-collapse: collapse; }
#docking-ui th, #docking-ui td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #1a2438; }
#docking-ui button.close { background: #a13a3a; border: none; color: white; padding: 6px 12px; cursor: pointer; }
#docking-ui button.buy, #docking-ui button.sell, #docking-ui button.buy-ship, #docking-ui button.accept-mission, #docking-ui button.turnin {
  background: #2a3a55; border: none; color: #cfe3ff; padding: 3px 8px; cursor: pointer; margin-right: 4px;
}
`

export function createDockingUI(container, gameState, rng) {
  const style = document.createElement('style')
  style.textContent = STYLE
  document.head.appendChild(style)

  const root = document.createElement('div')
  root.id = 'docking-ui'
  root.innerHTML = `
    <div class="panel">
      <div class="header">
        <h2 class="body-name"></h2>
        <button class="close">Undock</button>
      </div>
      <div class="tabs">
        <button data-tab="trade" class="tab active">Trade</button>
        <button data-tab="shipyard" class="tab">Shipyard</button>
        <button data-tab="missions" class="tab">Missions</button>
      </div>
      <div class="tab-content"></div>
    </div>
  `
  container.appendChild(root)

  const bodyNameEl = root.querySelector('.body-name')
  const contentEl = root.querySelector('.tab-content')
  const tabButtons = [...root.querySelectorAll('.tab')]

  let currentBody = null
  let currentTab = 'trade'
  let onUndock = null

  function renderTrade() {
    const shipClass = getShipClass(gameState.player.ship.classId)
    const cargoUsed = Object.values(gameState.player.ship.cargo).reduce((a, b) => a + b, 0)
    const miningHold = gameState.player.ship.miningHold
    const miningUsed = Object.values(miningHold).reduce((a, b) => a + b, 0)
    contentEl.innerHTML = `
      <div class="credits">Credits: ${gameState.player.credits}cr | Cargo: ${cargoUsed}/${shipClass.stats.cargoCapacity}</div>
      <table>
        <thead><tr><th>Good</th><th>Price</th><th>Held</th><th></th></tr></thead>
        <tbody>${GOODS.filter((g) => !MINED_ORE_GOOD_IDS.includes(g.id)).map((g) => {
          const price = getPrice(gameState, currentBody.id, g.id)
          const held = gameState.player.ship.cargo[g.id] ?? 0
          return `<tr>
            <td>${g.name}</td><td>${price}cr</td><td>${held}</td>
            <td><button class="buy" data-good="${g.id}">Buy 1</button><button class="sell" data-good="${g.id}">Sell 1</button></td>
          </tr>`
        }).join('')}</tbody>
      </table>
      <h3>Mining Hold (${miningUsed}/${shipClass.stats.miningCapacity})</h3>
      <table>
        <thead><tr><th>Ore</th><th>Price</th><th>Held</th><th></th></tr></thead>
        <tbody>${MINED_ORE_GOOD_IDS.map((goodId) => {
          const good = getGood(goodId)
          const price = getPrice(gameState, currentBody.id, goodId)
          const held = miningHold[goodId] ?? 0
          return `<tr>
            <td>${good.name}</td><td>${price}cr</td><td>${held}</td>
            <td><button class="sell-ore" data-good="${goodId}">Sell 1</button></td>
          </tr>`
        }).join('')}</tbody>
      </table>
    `
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
  }

  function renderShipyard() {
    if (!currentBody.hasShipyard) {
      contentEl.innerHTML = '<p>No shipyard at this location.</p>'
      return
    }
    contentEl.innerHTML = `
      <div class="credits">Credits: ${gameState.player.credits}cr | Current: ${getShipClass(gameState.player.ship.classId).name}</div>
      <table>
        <thead><tr><th>Ship</th><th>Role</th><th>Price</th><th></th></tr></thead>
        <tbody>${purchasableShipClasses().map((c) => `
          <tr>
            <td>${c.name}</td><td>${c.role}</td><td>${c.price}cr</td>
            <td><button class="buy-ship" data-class="${c.id}">Buy</button></td>
          </tr>`).join('')}</tbody>
      </table>
    `
    contentEl.querySelectorAll('.buy-ship').forEach((btn) =>
      btn.addEventListener('click', () => {
        const classId = btn.dataset.class
        const name = window.prompt('Name your new ship:', getShipClass(classId).name) ?? getShipClass(classId).name
        try {
          purchaseShip(gameState, classId, name)
        } catch (err) {
          alert(err.message)
        }
        renderShipyard()
      })
    )
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
  }

  const renderers = { trade: renderTrade, shipyard: renderShipyard, missions: renderMissions }

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
      bodyNameEl.textContent = `${body.name} (${body.kind})`
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
