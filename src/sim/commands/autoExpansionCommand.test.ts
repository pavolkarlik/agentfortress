import { describe, expect, it } from 'vitest'
import { applyCommand } from '@sim/commands/applyCommand'
import { createInitialState } from '@sim/world/state'

describe('Auto expansion command', () => {
  it('toggles auto expansion mode', () => {
    const state = createInitialState({ seed: 17, mapSize: { w: 24, h: 18 } })

    expect(state.autoExpansionEnabled).toBe(true)

    applyCommand(state, {
      type: 'setAutoExpansion',
      tickId: 0,
      enabled: false,
    })
    expect(state.autoExpansionEnabled).toBe(false)

    applyCommand(state, {
      type: 'setAutoExpansion',
      tickId: 1,
      enabled: true,
    })
    expect(state.autoExpansionEnabled).toBe(true)
  })
})
