import { describe, expect, it } from 'vitest'
import { generateMap } from '@sim/world/mapGen'

describe('generateMap', () => {
  it('is deterministic for the same seed and map size', () => {
    const first = generateMap(1337, { w: 12, h: 8 })
    const second = generateMap(1337, { w: 12, h: 8 })

    expect(second).toEqual(first)
  })

  it('generates expected tile count', () => {
    const map = generateMap(7, { w: 9, h: 7 })

    expect(map.tiles).toHaveLength(63)
    expect(map.width).toBe(9)
    expect(map.height).toBe(7)
  })
})
