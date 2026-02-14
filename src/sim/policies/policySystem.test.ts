import { describe, expect, it } from 'vitest'
import { runPolicySystem } from '@sim/policies/policySystem'
import {
  addBuildingEntity,
  addLineEntity,
  addMinibusEntity,
  createInitialState,
} from '@sim/world/state'

const POLICY_ID = 'line_auto_add_minibus_when_queue_high'

describe('Policy system', () => {
  it('auto-adds a bus after sustained high stop queues and respects cooldown', () => {
    const state = createInitialState({ seed: 101, mapSize: { w: 34, h: 22 } })

    const { lineId, stopAId, stopBId } = createLineScenario(state, 0)
    const line = state.ecs.line.get(lineId)
    const stopAQueue = state.ecs.queue.get(stopAId)
    const stopBQueue = state.ecs.queue.get(stopBId)

    if (!line || !stopAQueue || !stopBQueue) {
      throw new Error('Expected line and stop queues')
    }

    stopAQueue.count = 20
    stopBQueue.count = 20

    for (let tick = 0; tick <= 1250; tick += 1) {
      state.tick = tick
      runPolicySystem(state)
    }

    expect(line.assignedVehicles.length).toBe(2)

    for (let tick = 1251; tick <= 1450; tick += 1) {
      state.tick = tick
      runPolicySystem(state)
    }

    expect(line.assignedVehicles.length).toBe(2)
  })

  it('uses deterministic conflict order and hysteresis reset', () => {
    const state = createInitialState({ seed: 102, mapSize: { w: 34, h: 22 } })

    const first = createLineScenario(state, 0)
    const second = createLineScenario(state, 1)

    const firstLine = state.ecs.line.get(first.lineId)
    const secondLine = state.ecs.line.get(second.lineId)

    if (!firstLine || !secondLine) {
      throw new Error('Expected both lines to exist')
    }

    state.ecs.queue.get(first.stopAId)!.count = 18
    state.ecs.queue.get(first.stopBId)!.count = 18
    state.ecs.queue.get(second.stopAId)!.count = 18
    state.ecs.queue.get(second.stopBId)!.count = 18

    state.policyRuntime.set(`${first.lineId}:${POLICY_ID}`, {
      activeTicks: 1200,
      cooldownUntilTick: 0,
    })
    state.policyRuntime.set(`${second.lineId}:${POLICY_ID}`, {
      activeTicks: 1200,
      cooldownUntilTick: 0,
    })

    state.tick = 500
    runPolicySystem(state)

    expect(firstLine.assignedVehicles.length).toBe(2)
    expect(secondLine.assignedVehicles.length).toBe(1)

    state.policyRuntime.set(`${second.lineId}:${POLICY_ID}`, {
      activeTicks: 1190,
      cooldownUntilTick: 0,
    })
    state.ecs.queue.get(second.stopAId)!.count = 4
    state.ecs.queue.get(second.stopBId)!.count = 4

    state.tick = 501
    runPolicySystem(state)

    const secondRuntime = state.policyRuntime.get(`${second.lineId}:${POLICY_ID}`)
    expect(secondRuntime?.activeTicks).toBe(0)
  })
})

function createLineScenario(
  state: ReturnType<typeof createInitialState>,
  rowOffset: number,
): { lineId: number; stopAId: number; stopBId: number } {
  const centerX = Math.floor(state.map.width / 2)
  const centerY = Math.floor(state.map.height / 2)

  const y = centerY + rowOffset
  const stopAId = addBuildingEntity(state, 'stop', centerX - 3, y)
  const stopBId = addBuildingEntity(state, 'stop', centerX + 1, y)

  const lineId = addLineEntity(state, [
    { x: centerX - 3, y },
    { x: centerX + 1, y },
  ])

  const busId = addMinibusEntity(state, centerX - 3, y, lineId)
  state.ecs.line.get(lineId)?.assignedVehicles.push(busId)

  return { lineId, stopAId, stopBId }
}
