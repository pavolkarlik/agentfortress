import { describe, expect, it } from 'vitest'
import { runMovementSystem } from '@sim/systems/movementSystem'
import { addBuildingEntity, createInitialState, invalidatePathCache } from '@sim/world/state'

describe('Movement system', () => {
  it('uses walk fallback when no road path exists', () => {
    const state = createInitialState({ seed: 61, mapSize: { w: 30, h: 20 } })

    state.ecs.road.clear()
    state.roadEntityByTile.clear()
    invalidatePathCache(state)

    const citizenId = getCitizenId(state)
    const citizenPosition = state.ecs.position.get(citizenId)
    const citizenNeeds = state.ecs.needs.get(citizenId)
    const marketPosition = getBuildingPosition(state, 'market')

    if (!citizenPosition || !citizenNeeds || !marketPosition) {
      throw new Error('Missing required components for movement fallback test')
    }

    const startDistance = manhattan(citizenPosition, marketPosition)
    citizenNeeds.hunger = 0.95

    for (let tick = 0; tick < 40; tick += 1) {
      state.tick = tick
      runMovementSystem(state)
    }

    const endDistance = manhattan(citizenPosition, marketPosition)
    expect(endDistance).toBeLessThan(startDistance)
  })

  it('prefers nearby stop before market when hungry', () => {
    const state = createInitialState({ seed: 62, mapSize: { w: 30, h: 20 } })

    const citizenId = getCitizenId(state)
    const citizenPosition = state.ecs.position.get(citizenId)
    const citizenNeeds = state.ecs.needs.get(citizenId)
    const decisionLog = state.ecs.decisionLog.get(citizenId)

    if (!citizenPosition || !citizenNeeds || !decisionLog) {
      throw new Error('Missing citizen components')
    }

    addBuildingEntity(state, 'stop', citizenPosition.x + 1, citizenPosition.y)
    citizenNeeds.hunger = 0.9

    state.tick = 0
    runMovementSystem(state)

    expect(decisionLog.lastTarget).toBe('stop')
  })
})

function getCitizenId(state: ReturnType<typeof createInitialState>): number {
  const id = [...state.ecs.agentKind.entries()]
    .find(([, kind]) => kind.kind === 'citizen')?.[0]

  if (id === undefined) {
    throw new Error('Missing citizen')
  }

  return id
}

function getBuildingPosition(
  state: ReturnType<typeof createInitialState>,
  kind: 'market',
): { x: number; y: number } | null {
  const buildingId = [...state.ecs.building.entries()]
    .sort((a, b) => a[0] - b[0])
    .find(([, building]) => building.kind === kind)?.[0]

  if (buildingId === undefined) {
    return null
  }

  const position = state.ecs.position.get(buildingId)
  return position ? { x: position.x, y: position.y } : null
}

function manhattan(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}
