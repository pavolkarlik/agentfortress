import { BANKRUPTCY_TICK_LIMIT, TICKS_PER_DAY } from '@shared/constants'
import { describe, expect, it } from 'vitest'
import { applyEconomyTick } from '@sim/commands/applyCommand'
import { createInitialState, recordExpense, recordIncome } from '@sim/world/state'

describe('Economy and bankruptcy', () => {
  it('finalizes a daily ledger entry with income and expense totals', () => {
    const state = createInitialState({ seed: 81, mapSize: { w: 24, h: 18 } })

    state.ecs.building.clear()

    recordIncome(state, 125)
    recordExpense(state, 45)

    state.tick = TICKS_PER_DAY
    applyEconomyTick(state)

    expect(state.economy.lastDayIncome).toBe(125)
    expect(state.economy.lastDayExpense).toBe(45)
    expect(state.economy.lastDayNet).toBe(80)
    expect(state.economy.ledger.length).toBe(1)
    expect(state.economy.currentDayIncome).toBe(0)
    expect(state.economy.currentDayExpense).toBe(0)
  })

  it('triggers game over when bankruptcy limit is reached', () => {
    const state = createInitialState({ seed: 82, mapSize: { w: 24, h: 18 } })

    state.tick = 1
    state.money = -1
    state.bankruptcyTicks = BANKRUPTCY_TICK_LIMIT - 1

    applyEconomyTick(state)

    expect(state.gameOver).toBe(true)
    expect(state.gameOverReason).toBe('Bankrupt for too long')
    expect(state.bankruptcyDaysRemaining).toBe(0)
  })
})
