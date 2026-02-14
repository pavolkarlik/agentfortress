import { describe, expect, it } from 'vitest'
import { runTransitSystem } from '@sim/systems/transitSystem'
import { addBuildingEntity, createInitialState } from '@sim/world/state'

describe('Transit system', () => {
  it('creates a line, runs a minibus, and collects fares from stop queues', () => {
    const state = createInitialState({ seed: 71, mapSize: { w: 32, h: 22 } })

    const marketPosition = getBuildingPosition(state, 'market')
    if (!marketPosition) {
      throw new Error('Missing market for transit test')
    }

    const stopAId = addBuildingEntity(state, 'stop', marketPosition.x - 3, marketPosition.y + 1)
    const stopBId = addBuildingEntity(state, 'stop', marketPosition.x + 1, marketPosition.y)

    const stopAQueue = state.ecs.queue.get(stopAId)
    const stopBQueue = state.ecs.queue.get(stopBId)
    if (!stopAQueue || !stopBQueue) {
      throw new Error('Stops should have queue components')
    }

    stopAQueue.count = 12
    stopBQueue.count = 0

    const startMoney = state.money

    for (let tick = 0; tick < 320; tick += 1) {
      state.tick = tick
      runTransitSystem(state)
    }

    expect(state.ecs.line.size).toBeGreaterThan(0)

    const minibusCount = [...state.ecs.agentKind.values()].filter(
      (agentKind) => agentKind.kind === 'minibus',
    ).length
    expect(minibusCount).toBeGreaterThan(0)

    expect(state.money).toBeGreaterThan(startMoney)
  })
})

function getBuildingPosition(
  state: ReturnType<typeof createInitialState>,
  kind: 'market',
): { x: number; y: number } | null {
  const entityId = [...state.ecs.building.entries()]
    .sort((a, b) => a[0] - b[0])
    .find(([, building]) => building.kind === kind)?.[0]

  if (entityId === undefined) {
    return null
  }

  const position = state.ecs.position.get(entityId)
  return position ? { x: position.x, y: position.y } : null
}
