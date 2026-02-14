import { describe, expect, it } from 'vitest'
import type { SaveBlob } from '@shared/types'
import { createInitialState, createSaveBlob, migrateSaveBlob, restoreState } from '@sim/world/state'

describe('Save migration', () => {
  it('migrates pre-v3 save fields to v3 defaults', () => {
    const state = createInitialState({ seed: 121, mapSize: { w: 24, h: 18 } })
    const snapshot = createSaveBlob(state)

    const legacyLikeBlob = {
      version: 2,
      seed: snapshot.seed,
      tick: snapshot.tick,
      money: snapshot.money,
      bankruptcyTicks: snapshot.bankruptcyTicks,
      gameOver: snapshot.gameOver,
      map: snapshot.map,
      roads: snapshot.roads,
      buildings: snapshot.buildings,
      agents: snapshot.agents,
      ecs: snapshot.ecs,
    } as unknown as SaveBlob

    const migrated = migrateSaveBlob(legacyLikeBlob)

    expect(migrated.version).toBe(3)
    expect(migrated.blueprints.courierBot.capacity).toBeGreaterThan(0)
    expect(migrated.economy.ledger).toEqual([])
    expect(migrated.policyRuntime).toEqual([])
  })

  it('restores legacy save blob through migration path', () => {
    const state = createInitialState({ seed: 122, mapSize: { w: 24, h: 18 } })
    const saved = createSaveBlob(state)

    const legacyBlob = {
      version: 1,
      seed: saved.seed,
      tick: saved.tick,
      money: saved.money,
      bankruptcyTicks: saved.bankruptcyTicks,
      gameOver: saved.gameOver,
      map: saved.map,
      roads: saved.roads,
      buildings: saved.buildings,
      agents: saved.agents,
    } as unknown as SaveBlob

    const restored = restoreState(legacyBlob)

    expect(restored.seed).toBe(saved.seed)
    expect(restored.ecs.building.size).toBeGreaterThan(0)
    expect(restored.blueprints.minibus.capacity).toBeGreaterThan(0)
    expect(restored.policyRuntime.size).toBe(0)
  })
})
