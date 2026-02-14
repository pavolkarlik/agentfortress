import { describe, expect, it } from 'vitest'
import { runNeedsSystem } from '@sim/systems/needsSystem'
import { createInitialState } from '@sim/world/state'

describe('Needs system', () => {
  it('increments market queue when hungry citizen waits at empty market', () => {
    const state = createInitialState({ seed: 51, mapSize: { w: 24, h: 18 } })

    const marketId = getBuildingId(state, 'market')
    const marketPosition = state.ecs.position.get(marketId)
    const marketInventory = state.ecs.inventory.get(marketId)
    const marketQueue = state.ecs.queue.get(marketId)

    const citizenId = [...state.ecs.agentKind.entries()]
      .find(([, kind]) => kind.kind === 'citizen')?.[0]

    if (!marketPosition || !marketInventory || !marketQueue || citizenId === undefined) {
      throw new Error('Missing required entities for queue test')
    }

    const citizenPosition = state.ecs.position.get(citizenId)
    const citizenNeeds = state.ecs.needs.get(citizenId)

    if (!citizenPosition || !citizenNeeds) {
      throw new Error('Missing citizen components')
    }

    marketInventory.food = 0
    citizenPosition.x = marketPosition.x
    citizenPosition.y = marketPosition.y
    citizenNeeds.hunger = 0.8

    runNeedsSystem(state)

    expect(marketQueue.count).toBe(1)
    expect(citizenNeeds.hunger).toBeGreaterThan(0.8)
  })
})

function getBuildingId(
  state: ReturnType<typeof createInitialState>,
  kind: 'market',
): number {
  const id = [...state.ecs.building.entries()]
    .sort((a, b) => a[0] - b[0])
    .find(([, building]) => building.kind === kind)?.[0]

  if (id === undefined) {
    throw new Error(`Missing building kind: ${kind}`)
  }

  return id
}
