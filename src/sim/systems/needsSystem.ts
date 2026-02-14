import { tileKey } from '@shared/map'
import { clamp } from '@shared/rng'
import type { InternalState } from '@sim/world/state'

export function runNeedsSystem(state: InternalState): void {
  const marketByTile = mapMarketByTile(state)
  const stopByTile = mapStopByTile(state)
  let totalMarketFood = findMarketFood(state)

  resetMarketQueues(state)

  const sortedAgentEntries = [...state.ecs.agentKind.entries()].sort((a, b) => a[0] - b[0])

  for (const [entityId, agentKind] of sortedAgentEntries) {
    if (agentKind.kind !== 'citizen') {
      continue
    }

    const position = state.ecs.position.get(entityId)
    const needs = state.ecs.needs.get(entityId)
    const decision = state.ecs.decisionLog.get(entityId)
    if (!position || !needs || !decision) {
      continue
    }

    const currentMarketId = marketByTile.get(tileKey(position.x, position.y)) ?? null
    const currentStopId = stopByTile.get(tileKey(position.x, position.y)) ?? null

    if (currentMarketId !== null) {
      const marketInventory = state.ecs.inventory.get(currentMarketId)
      const marketQueue = state.ecs.queue.get(currentMarketId)

      if (marketInventory && marketInventory.food > 0 && needs.hunger > 0.18) {
        marketInventory.food -= 1
        totalMarketFood = Math.max(0, totalMarketFood - 1)
        needs.hunger = clamp(needs.hunger - 0.42, 0, 1)
        needs.happiness = clamp(needs.happiness + 0.02, 0, 1)
        decision.lastDecision = 'eat'
        decision.lastReason = 'Consumed market food to satisfy hunger'
        decision.lastTarget = 'market'
        continue
      }

      if (needs.hunger > 0.4 && marketQueue) {
        marketQueue.count += 1
        needs.hunger = clamp(needs.hunger + 0.0014, 0, 1)
        needs.happiness = clamp(needs.happiness - 0.0012, 0, 1)
        decision.lastDecision = 'queue'
        decision.lastReason = 'Waiting at market queue for food'
        decision.lastTarget = 'market'
        continue
      }
    }

    if (currentStopId !== null && needs.hunger > 0.65) {
      const stopQueue = state.ecs.queue.get(currentStopId)
      if (stopQueue) {
        stopQueue.count += 1
      }

      needs.hunger = clamp(needs.hunger + 0.0012, 0, 1)
      needs.happiness = clamp(needs.happiness - 0.0009, 0, 1)
      decision.lastDecision = 'queueTransit'
      decision.lastReason = 'Waiting at stop for minibus to market'
      decision.lastTarget = 'stop'
      continue
    }

    if (totalMarketFood > 0) {
      needs.hunger = clamp(needs.hunger + 0.0009, 0, 1)
      needs.happiness = clamp(needs.happiness + 0.0002, 0, 1)
      decision.lastDecision = 'commute'
      decision.lastReason = 'Market has food stock available'
      decision.lastTarget = 'market'
    } else {
      needs.hunger = clamp(needs.hunger + 0.0018, 0, 1)
      needs.happiness = clamp(needs.happiness - 0.0009, 0, 1)
      decision.lastDecision = 'wait'
      decision.lastReason = 'Market food is depleted'
      decision.lastTarget = 'housing'
    }
  }
}

function findMarketFood(state: InternalState): number {
  let food = 0
  for (const [entityId, building] of state.ecs.building.entries()) {
    if (building.kind === 'market') {
      food += state.ecs.inventory.get(entityId)?.food ?? 0
    }
  }
  return food
}

function mapMarketByTile(state: InternalState): Map<string, number> {
  const result = new Map<string, number>()
  for (const [entityId, building] of state.ecs.building.entries()) {
    if (building.kind !== 'market') {
      continue
    }

    const position = state.ecs.position.get(entityId)
    if (!position) {
      continue
    }

    result.set(tileKey(position.x, position.y), entityId)
  }
  return result
}

function mapStopByTile(state: InternalState): Map<string, number> {
  const result = new Map<string, number>()
  for (const [entityId, building] of state.ecs.building.entries()) {
    if (building.kind !== 'stop') {
      continue
    }

    const position = state.ecs.position.get(entityId)
    if (!position) {
      continue
    }

    result.set(tileKey(position.x, position.y), entityId)
  }
  return result
}

function resetMarketQueues(state: InternalState): void {
  for (const [entityId, building] of state.ecs.building.entries()) {
    if (building.kind !== 'market' && building.kind !== 'stop') {
      continue
    }

    const queue = state.ecs.queue.get(entityId)
    if (queue) {
      queue.count = 0
    }
  }
}
