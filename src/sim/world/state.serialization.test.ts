import { describe, expect, it } from 'vitest'
import {
  addBuildingEntity,
  addRoadEntity,
  createInitialState,
  createSaveBlob,
  createSnapshot,
  restoreState,
} from '@sim/world/state'

describe('ECS world serialization', () => {
  it('restores an identical snapshot from serialized ECS save blob', () => {
    const state = createInitialState({ seed: 77, mapSize: { w: 20, h: 16 } })

    addRoadEntity(state, 3, 3)
    addRoadEntity(state, 4, 3)
    addBuildingEntity(state, 'market', 5, 3, undefined, 33)

    state.tick = 123
    state.money = 456

    const before = createSnapshot(state)
    const saveBlob = createSaveBlob(state)
    const restored = restoreState(saveBlob)
    const after = createSnapshot(restored)

    expect(after).toEqual(before)
  })
})
