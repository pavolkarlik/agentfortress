import { describe, expect, it } from 'vitest'
import { runCourierSystem } from '@sim/systems/courierSystem'
import { createInitialState } from '@sim/world/state'

describe('Courier system', () => {
  it('delivers food to low-stock market using policy-driven behavior', () => {
    const state = createInitialState({ seed: 31, mapSize: { w: 30, h: 20 } })

    const courierId = getCourierId(state)
    const warehouseId = getBuildingId(state, 'warehouse')
    const marketId = getBuildingId(state, 'market')

    const warehouseInventory = state.ecs.inventory.get(warehouseId)
    const marketInventory = state.ecs.inventory.get(marketId)
    const decisionLog = state.ecs.decisionLog.get(courierId)

    if (!warehouseInventory || !marketInventory || !decisionLog) {
      throw new Error('Expected courier, warehouse, and market components')
    }

    warehouseInventory.food = 120
    marketInventory.food = 0

    for (let tick = 0; tick < 220; tick += 1) {
      state.tick = tick
      runCourierSystem(state)
    }

    expect(marketInventory.food).toBeGreaterThan(0)
    expect(['deliverFood', 'travel', 'pickupFood', 'arrive', 'standby']).toContain(
      decisionLog.lastDecision,
    )
    expect(decisionLog.lastReason.length).toBeGreaterThan(0)
  })
})

function getCourierId(state: ReturnType<typeof createInitialState>): number {
  const id = [...state.ecs.agentKind.entries()]
    .find(([, kind]) => kind.kind === 'courierBot')?.[0]

  if (id === undefined) {
    throw new Error('Missing courier bot')
  }

  return id
}

function getBuildingId(
  state: ReturnType<typeof createInitialState>,
  kind: 'market' | 'warehouse',
): number {
  const id = [...state.ecs.building.entries()]
    .sort((a, b) => a[0] - b[0])
    .find(([, building]) => building.kind === kind)?.[0]

  if (id === undefined) {
    throw new Error(`Missing building kind: ${kind}`)
  }

  return id
}
