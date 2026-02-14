import { z } from 'zod'
import type { AgentBlueprint, BlueprintSet, BlueprintAgentKind } from '@shared/types'

export const BLUEPRINT_POLICY_OPTIONS: Record<BlueprintAgentKind, string[]> = {
  courierBot: ['deliver_market_if_low', 'warehouse_surplus_to_market'],
  minibus: ['return_to_depot_when_worn'],
}

export const agentBlueprintSchema = z.object({
  speed: z.number().min(0.1).max(5),
  capacity: z.number().int().min(1).max(200),
  wearRate: z.number().min(0.0001).max(0.1),
  maintenanceThreshold: z.number().min(0.3).max(0.95),
  policyIds: z.array(z.string()).default([]),
})

export const blueprintSetSchema = z.object({
  courierBot: agentBlueprintSchema,
  minibus: agentBlueprintSchema,
})

export function defaultBlueprints(): BlueprintSet {
  return {
    courierBot: {
      speed: 1,
      capacity: 20,
      wearRate: 0.0006,
      maintenanceThreshold: 0.72,
      policyIds: ['deliver_market_if_low', 'warehouse_surplus_to_market'],
    },
    minibus: {
      speed: 1,
      capacity: 16,
      wearRate: 0.0008,
      maintenanceThreshold: 0.72,
      policyIds: ['return_to_depot_when_worn'],
    },
  }
}

export function normalizeBlueprint(input: AgentBlueprint): AgentBlueprint {
  return agentBlueprintSchema.parse(input)
}

export function normalizeBlueprintSet(input: BlueprintSet): BlueprintSet {
  return blueprintSetSchema.parse(input)
}
