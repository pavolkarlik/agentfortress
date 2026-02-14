import { describe, expect, it } from 'vitest'
import { runExpansionSystem } from '@sim/systems/expansionSystem'
import { createInitialState } from '@sim/world/state'

describe('Expansion system', () => {
  it('auto-builds stop infrastructure and scales citizens/couriers with healthy budget', () => {
    const state = createInitialState({ seed: 404, mapSize: { w: 40, h: 28 } })

    state.money = 3_500
    const initialRoads = state.ecs.road.size
    const initialCitizens = countAgents(state, 'citizen')
    const initialCouriers = countAgents(state, 'courierBot')

    for (let tick = 0; tick <= 1_280; tick += 1) {
      state.tick = tick
      runExpansionSystem(state)
    }

    const stopCount = countBuildings(state, 'stop')
    const housingCount = countBuildings(state, 'housing')
    const citizens = countAgents(state, 'citizen')
    const couriers = countAgents(state, 'courierBot')

    expect(stopCount).toBeGreaterThanOrEqual(2)
    expect(housingCount).toBeGreaterThanOrEqual(2)
    expect(state.ecs.road.size).toBeGreaterThan(initialRoads)
    expect(citizens).toBeGreaterThan(initialCitizens)
    expect(couriers).toBeGreaterThan(initialCouriers)
  })

  it('does not expand when expansion reserve cannot be satisfied', () => {
    const state = createInitialState({ seed: 505, mapSize: { w: 36, h: 24 } })

    state.money = 50
    const initialRoads = state.ecs.road.size
    const initialStops = countBuildings(state, 'stop')
    const initialCitizens = countAgents(state, 'citizen')
    const initialCouriers = countAgents(state, 'courierBot')

    for (let tick = 0; tick <= 960; tick += 1) {
      state.tick = tick
      runExpansionSystem(state)
    }

    expect(state.ecs.road.size).toBe(initialRoads)
    expect(countBuildings(state, 'stop')).toBe(initialStops)
    expect(countAgents(state, 'citizen')).toBe(initialCitizens)
    expect(countAgents(state, 'courierBot')).toBe(initialCouriers)
  })
})

function countBuildings(
  state: ReturnType<typeof createInitialState>,
  kind: 'housing' | 'stop',
): number {
  let count = 0
  for (const building of state.ecs.building.values()) {
    if (building.kind === kind) {
      count += 1
    }
  }
  return count
}

function countAgents(
  state: ReturnType<typeof createInitialState>,
  kind: 'citizen' | 'courierBot',
): number {
  let count = 0
  for (const agent of state.ecs.agentKind.values()) {
    if (agent.kind === kind) {
      count += 1
    }
  }
  return count
}
