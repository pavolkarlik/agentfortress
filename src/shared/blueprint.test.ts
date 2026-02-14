import { describe, expect, it } from 'vitest'
import { agentBlueprintSchema, defaultBlueprints } from '@shared/blueprint'

describe('Blueprint schema', () => {
  it('accepts defaults', () => {
    const defaults = defaultBlueprints()

    expect(agentBlueprintSchema.parse(defaults.courierBot)).toEqual(defaults.courierBot)
    expect(agentBlueprintSchema.parse(defaults.minibus)).toEqual(defaults.minibus)
  })

  it('rejects invalid maintenance threshold', () => {
    const result = agentBlueprintSchema.safeParse({
      speed: 1,
      capacity: 20,
      wearRate: 0.001,
      maintenanceThreshold: 0.1,
      policyIds: [],
    })

    expect(result.success).toBe(false)
  })
})
