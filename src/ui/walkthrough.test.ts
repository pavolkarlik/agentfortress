import { describe, expect, it } from 'vitest'
import type { SimSnapshot } from '@shared/types'
import {
  buildContextTips,
  computeWalkthroughSteps,
  createWalkthroughBaseline,
  nextWalkthroughStep,
} from '@ui/walkthrough'

function createSnapshot(overrides: Partial<SimSnapshot> = {}): SimSnapshot {
  return {
    tick: 100,
    seed: 7,
    money: 500,
    population: 12,
    foodStock: 40,
    avgHappiness: 0.9,
    bankruptcyTicks: 0,
    bankruptcyDaysRemaining: 3,
    gameOver: false,
    gameOverReason: null,
    economy: {
      currentDayIncome: 0,
      currentDayExpense: 0,
      lastDayIncome: 0,
      lastDayExpense: 0,
      lastDayNet: 0,
      ledger: [],
    },
    blueprints: {
      courierBot: {
        speed: 1.4,
        capacity: 20,
        wearRate: 0.002,
        maintenanceThreshold: 0.7,
        policyIds: [],
      },
      minibus: {
        speed: 1.2,
        capacity: 24,
        wearRate: 0.003,
        maintenanceThreshold: 0.75,
        policyIds: [],
      },
    },
    snapshotMetrics: {
      payloadBytes: 5120,
      budgetBytes: 16384,
      overBudget: false,
    },
    map: {
      width: 4,
      height: 4,
      tiles: Array.from({ length: 16 }, () => ({ terrain: 'grass' as const, passable: true })),
    },
    roads: [{ id: 1, x: 0, y: 0 }],
    buildings: [{ id: 2, kind: 'market', x: 1, y: 1, upkeep: 4, food: 20 }],
    agents: [],
    stopQueues: [{ id: 2, x: 1, y: 1, count: 0 }],
    ...overrides,
  }
}

describe('walkthrough', () => {
  it('tracks step completion against baseline and context', () => {
    const initial = createSnapshot()
    const baseline = createWalkthroughBaseline(initial)

    const progressed = createSnapshot({
      roads: [...initial.roads, { id: 8, x: 2, y: 2 }],
      buildings: [...initial.buildings, { id: 9, kind: 'stop', x: 2, y: 1, upkeep: 1, food: 0 }],
      stopQueues: [{ id: 9, x: 2, y: 1, count: 3 }],
    })

    const steps = computeWalkthroughSteps(progressed, baseline, {
      selectedTile: true,
      hasInspectorDetails: true,
      overlayMode: 'queue',
    })

    expect(steps.every((step) => step.done)).toBe(true)
    expect(nextWalkthroughStep(steps)).toBeNull()
  })

  it('builds context tips for pressure states', () => {
    const activeTips = buildContextTips(
      createSnapshot({
        money: 60,
        stopQueues: [{ id: 4, x: 3, y: 1, count: 18 }],
        snapshotMetrics: { payloadBytes: 22000, budgetBytes: 16384, overBudget: true },
      }),
    )

    expect(activeTips.some((tip) => tip.includes('Low cash'))).toBe(true)
    expect(activeTips.some((tip) => tip.includes('High queue pressure'))).toBe(true)
    expect(activeTips.some((tip) => tip.includes('over budget'))).toBe(true)

    const endedTips = buildContextTips(
      createSnapshot({
        gameOver: true,
        gameOverReason: 'Bankruptcy',
      }),
    )

    expect(endedTips.some((tip) => tip.includes('Game over'))).toBe(true)
  })
})
