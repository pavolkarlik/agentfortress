import { describe, expect, it } from 'vitest'
import { applyCommand } from '@sim/commands/applyCommand'
import { addMinibusEntity, createInitialState } from '@sim/world/state'

describe('Blueprint command', () => {
  it('applies blueprint changes to newly created minibuses', () => {
    const state = createInitialState({ seed: 111, mapSize: { w: 24, h: 18 } })

    applyCommand(state, {
      type: 'setBlueprint',
      tickId: 0,
      kind: 'minibus',
      blueprint: {
        speed: 1.7,
        capacity: 32,
        wearRate: 0.002,
        maintenanceThreshold: 0.8,
        policyIds: ['return_to_depot_when_worn'],
      },
    })

    const busId = addMinibusEntity(state, 3, 3)
    const movement = state.ecs.movement.get(busId)
    const queue = state.ecs.queue.get(busId)
    const condition = state.ecs.condition.get(busId)

    expect(movement?.speed).toBe(1.7)
    expect(queue?.capacity).toBe(32)
    expect(condition?.wearRate).toBe(0.002)
    expect(condition?.maintenanceThreshold).toBe(0.8)
  })
})
