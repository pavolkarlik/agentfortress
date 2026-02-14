import { tileIndex } from '@shared/map'
import { describe, expect, it } from 'vitest'
import { getPathCached } from '@sim/path/aStar'
import { addRoadEntity, createInitialState, invalidatePathCache } from '@sim/world/state'

describe('A* pathfinding', () => {
  it('finds a shortest road path', () => {
    const state = createInitialState({ seed: 10, mapSize: { w: 18, h: 14 } })
    makeAllTilesPassable(state)

    addRoadEntity(state, 1, 1)
    addRoadEntity(state, 2, 1)
    addRoadEntity(state, 3, 1)
    addRoadEntity(state, 4, 1)
    addRoadEntity(state, 4, 2)

    const path = getPathCached(state, { x: 1, y: 1 }, { x: 4, y: 2 })

    expect(path).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 4, y: 1 },
      { x: 4, y: 2 },
    ])
  })

  it('uses cache and invalidates correctly when road network changes', () => {
    const state = createInitialState({ seed: 11, mapSize: { w: 18, h: 14 } })
    makeAllTilesPassable(state)

    addRoadEntity(state, 1, 1)
    addRoadEntity(state, 2, 1)
    addRoadEntity(state, 3, 1)

    const first = getPathCached(state, { x: 1, y: 1 }, { x: 3, y: 1 })
    const second = getPathCached(state, { x: 1, y: 1 }, { x: 3, y: 1 })

    expect(first).toEqual(second)
    expect(state.pathCache.size).toBe(1)
    expect(state.pathCacheRevision).toBe(0)

    invalidatePathCache(state)

    expect(state.pathCache.size).toBe(0)
    expect(state.pathCacheRevision).toBe(1)

    getPathCached(state, { x: 1, y: 1 }, { x: 3, y: 1 })
    expect(state.pathCache.size).toBe(1)
  })
})

function makeAllTilesPassable(state: ReturnType<typeof createInitialState>): void {
  for (let y = 0; y < state.map.height; y += 1) {
    for (let x = 0; x < state.map.width; x += 1) {
      const idx = tileIndex(state.map, x, y)
      state.map.tiles[idx].passable = true
      if (state.map.tiles[idx].terrain === 'water') {
        state.map.tiles[idx].terrain = 'grass'
      }
    }
  }
}
