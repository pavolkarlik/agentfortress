import { describe, expect, it } from 'vitest'
import type { SimCommand } from '@shared/types'
import { SimEngine } from '@sim/engine'

describe('SimEngine determinism', () => {
  it('replays to an identical snapshot for same seed and commands', () => {
    const commands: SimCommand[] = [
      { type: 'buildRoad', tickId: 2, x: 12, y: 10 },
      { type: 'buildRoad', tickId: 3, x: 13, y: 10 },
      { type: 'placeBuilding', tickId: 4, kind: 'housing', x: 14, y: 10 },
      { type: 'placeBuilding', tickId: 5, kind: 'market', x: 15, y: 10 },
    ]

    const first = runScenario(commands)
    const second = runScenario(commands)

    expect(second).toEqual(first)
  })
})

function runScenario(commands: SimCommand[]): string {
  const engine = new SimEngine()
  engine.init({ seed: 999, mapSize: { w: 28, h: 20 } })
  engine.enqueueCommands(commands)
  engine.step(180)

  const snapshot = engine.getSnapshot()
  engine.dispose()
  return JSON.stringify(snapshot)
}
