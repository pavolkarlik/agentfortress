import { describe, expect, it } from 'vitest'
import { runMaintenanceSystem } from '@sim/systems/maintenanceSystem'
import { runTransitSystem } from '@sim/systems/transitSystem'
import { addBuildingEntity, createInitialState } from '@sim/world/state'

describe('Maintenance system', () => {
  it('sends a worn courier to depot and repairs it back to operational', () => {
    const state = createInitialState({ seed: 91, mapSize: { w: 30, h: 20 } })

    const courierId = getAgentId(state, 'courierBot')
    const condition = state.ecs.condition.get(courierId)

    if (!condition) {
      throw new Error('Expected courier condition component')
    }

    condition.wear = 0.95

    for (let tick = 0; tick < 500; tick += 1) {
      state.tick = tick
      runMaintenanceSystem(state)
    }

    expect(condition.maintenanceState).toBe('operational')
    expect(condition.wear).toBeLessThanOrEqual(0.2)
  })

  it('keeps minibuses out of service while in maintenance', () => {
    const state = createInitialState({ seed: 92, mapSize: { w: 30, h: 20 } })

    const centerX = Math.floor(state.map.width / 2)
    const centerY = Math.floor(state.map.height / 2)

    const stopAId = addBuildingEntity(state, 'stop', centerX - 3, centerY + 1)
    addBuildingEntity(state, 'stop', centerX + 1, centerY)

    state.tick = 0
    runTransitSystem(state)

    const minibusId = getAgentId(state, 'minibus')
    const minibusCondition = state.ecs.condition.get(minibusId)
    const stopAQueue = state.ecs.queue.get(stopAId)

    if (!minibusCondition || !stopAQueue) {
      throw new Error('Expected minibus condition and stop queue')
    }

    stopAQueue.count = 10
    minibusCondition.wear = 0.95

    const moneyStart = state.money

    for (let tick = 1; tick <= 25; tick += 1) {
      state.tick = tick
      runMaintenanceSystem(state)
      runTransitSystem(state)
    }

    expect(stopAQueue.count).toBe(10)
    expect(state.money).toBe(moneyStart)
    expect(minibusCondition.maintenanceState).not.toBe('operational')
  })
})

function getAgentId(
  state: ReturnType<typeof createInitialState>,
  kind: 'courierBot' | 'minibus',
): number {
  const entityId = [...state.ecs.agentKind.entries()].find(([, agent]) => agent.kind === kind)?.[0]

  if (entityId === undefined) {
    throw new Error(`Missing agent kind: ${kind}`)
  }

  return entityId
}
