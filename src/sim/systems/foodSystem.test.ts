import { describe, expect, it } from 'vitest'
import { runFoodSystem } from '@sim/systems/foodSystem'
import { runNeedsSystem } from '@sim/systems/needsSystem'
import { createInitialState } from '@sim/world/state'

describe('Food loop plumbing', () => {
  it('moves food from source to warehouse and then toward market', () => {
    const state = createInitialState({ seed: 22, mapSize: { w: 24, h: 18 } })

    const sourceId = getBuildingId(state, 'foodSource')
    const warehouseId = getBuildingId(state, 'warehouse')
    const marketId = getBuildingId(state, 'market')

    const source = state.ecs.inventory.get(sourceId)
    const warehouse = state.ecs.inventory.get(warehouseId)
    const market = state.ecs.inventory.get(marketId)
    if (!source || !warehouse || !market) {
      throw new Error('Expected source/warehouse/market inventory components')
    }

    source.food = 120
    warehouse.food = 0
    market.food = 0

    for (let tick = 0; tick < 60; tick += 1) {
      state.tick = tick
      runFoodSystem(state)
    }

    expect(source.food).toBeLessThan(120)
    expect(warehouse.food + market.food).toBeGreaterThan(0)
    expect(market.food).toBeGreaterThan(0)
  })

  it('citizen consumes market food when at market tile', () => {
    const state = createInitialState({ seed: 24, mapSize: { w: 24, h: 18 } })

    const marketId = getBuildingId(state, 'market')
    const marketPosition = state.ecs.position.get(marketId)
    const marketInventory = state.ecs.inventory.get(marketId)
    const citizenId = [...state.ecs.agentKind.keys()].sort((a, b) => a - b)[0]

    if (!marketPosition || !marketInventory) {
      throw new Error('Expected market position and inventory')
    }

    const citizenPosition = state.ecs.position.get(citizenId)
    const citizenNeeds = state.ecs.needs.get(citizenId)
    if (!citizenPosition || !citizenNeeds) {
      throw new Error('Expected citizen components')
    }

    marketInventory.food = 10
    citizenPosition.x = marketPosition.x
    citizenPosition.y = marketPosition.y
    citizenNeeds.hunger = 0.9

    runNeedsSystem(state)

    expect(marketInventory.food).toBe(9)
    expect(citizenNeeds.hunger).toBeLessThan(0.9)
  })
})

function getBuildingId(
  state: ReturnType<typeof createInitialState>,
  kind: 'foodSource' | 'warehouse' | 'market',
): number {
  const id = [...state.ecs.building.entries()]
    .sort((a, b) => a[0] - b[0])
    .find(([, building]) => building.kind === kind)?.[0]

  if (id === undefined) {
    throw new Error(`Missing building kind: ${kind}`)
  }

  return id
}
