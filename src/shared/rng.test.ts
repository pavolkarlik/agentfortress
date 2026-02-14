import { describe, expect, it } from 'vitest'
import { mulberry32 } from '@shared/rng'

describe('mulberry32', () => {
  it('produces identical sequences for the same seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)

    const seqA = Array.from({ length: 8 }, () => a())
    const seqB = Array.from({ length: 8 }, () => b())

    expect(seqA).toEqual(seqB)
  })

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(41)
    const b = mulberry32(42)

    const seqA = Array.from({ length: 8 }, () => a())
    const seqB = Array.from({ length: 8 }, () => b())

    expect(seqA).not.toEqual(seqB)
  })
})
