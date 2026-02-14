import { getPathCached } from '@sim/path/aStar'
import type { InternalState } from '@sim/world/state'

const PRODUCTION_INTERVAL = 10
const TRANSFER_INTERVAL = 15
const SPOILAGE_INTERVAL = 180

const BUILDING_FOOD_CAPACITY = {
  housing: 0,
  market: 140,
  warehouse: 260,
  depot: 0,
  foodSource: 360,
  stop: 0,
} as const

export function runFoodSystem(state: InternalState): void {
  if (state.gameOver) {
    return
  }

  produceFood(state)

  if (state.tick % TRANSFER_INTERVAL === 0) {
    runFoodTransfers(state)
  }

  if (state.tick % SPOILAGE_INTERVAL === 0) {
    applyFoodSpoilage(state)
  }
}

function produceFood(state: InternalState): void {
  if (state.tick % PRODUCTION_INTERVAL !== 0) {
    return
  }

  for (const [entityId, building] of sortedBuildingEntries(state)) {
    if (building.kind !== 'foodSource') {
      continue
    }

    const inventory = state.ecs.inventory.get(entityId)
    if (!inventory) {
      continue
    }

    const cap = BUILDING_FOOD_CAPACITY.foodSource
    inventory.food = Math.min(cap, inventory.food + 3)
  }
}

function runFoodTransfers(state: InternalState): void {
  const sourceIds = getBuildingIdsByKind(state, 'foodSource')
  const warehouseIds = getBuildingIdsByKind(state, 'warehouse')
  const marketIds = getBuildingIdsByKind(state, 'market')

  for (const sourceId of sourceIds) {
    const sourceInventory = state.ecs.inventory.get(sourceId)
    if (!sourceInventory || sourceInventory.food <= 0) {
      continue
    }

    const warehouseTarget = pickTransferTarget(state, sourceId, warehouseIds)
    if (warehouseTarget !== null) {
      transferFood(state, sourceId, warehouseTarget, 6)
      continue
    }

    const marketTarget = pickTransferTarget(state, sourceId, marketIds)
    if (marketTarget !== null) {
      transferFood(state, sourceId, marketTarget, 4)
    }
  }

  for (const warehouseId of warehouseIds) {
    const warehouseInventory = state.ecs.inventory.get(warehouseId)
    if (!warehouseInventory || warehouseInventory.food <= 0) {
      continue
    }

    const marketTarget = pickTransferTarget(state, warehouseId, marketIds)
    if (marketTarget !== null) {
      transferFood(state, warehouseId, marketTarget, 8)
    }
  }
}

function applyFoodSpoilage(state: InternalState): void {
  for (const [entityId, building] of sortedBuildingEntries(state)) {
    if (building.kind !== 'market') {
      continue
    }

    const inventory = state.ecs.inventory.get(entityId)
    if (inventory && inventory.food > 0) {
      inventory.food -= 1
    }
  }
}

function pickTransferTarget(
  state: InternalState,
  sourceId: number,
  candidateIds: number[],
): number | null {
  const sourcePosition = state.ecs.position.get(sourceId)
  if (!sourcePosition) {
    return null
  }

  let chosenId: number | null = null
  let chosenFood = Number.POSITIVE_INFINITY
  let chosenDistance = Number.POSITIVE_INFINITY

  for (const candidateId of candidateIds) {
    if (candidateId === sourceId) {
      continue
    }

    const building = state.ecs.building.get(candidateId)
    const candidateInventory = state.ecs.inventory.get(candidateId)
    const candidatePosition = state.ecs.position.get(candidateId)
    if (!building || !candidateInventory || !candidatePosition) {
      continue
    }

    const capacity = BUILDING_FOOD_CAPACITY[building.kind]
    if (candidateInventory.food >= capacity) {
      continue
    }

    const path = getPathCached(state, sourcePosition, candidatePosition)
    if (!path || path.length === 0) {
      continue
    }

    const distance = path.length
    if (
      candidateInventory.food < chosenFood ||
      (candidateInventory.food === chosenFood && distance < chosenDistance) ||
      (candidateInventory.food === chosenFood &&
        distance === chosenDistance &&
        candidateId < (chosenId ?? Number.MAX_SAFE_INTEGER))
    ) {
      chosenId = candidateId
      chosenFood = candidateInventory.food
      chosenDistance = distance
    }
  }

  return chosenId
}

function transferFood(
  state: InternalState,
  sourceId: number,
  targetId: number,
  maxAmount: number,
): void {
  const sourceInventory = state.ecs.inventory.get(sourceId)
  const targetInventory = state.ecs.inventory.get(targetId)
  const targetBuilding = state.ecs.building.get(targetId)
  if (!sourceInventory || !targetInventory || !targetBuilding) {
    return
  }

  const capacity = BUILDING_FOOD_CAPACITY[targetBuilding.kind]
  const freeSpace = Math.max(0, capacity - targetInventory.food)
  const moved = Math.min(maxAmount, sourceInventory.food, freeSpace)
  if (moved <= 0) {
    return
  }

  sourceInventory.food -= moved
  targetInventory.food += moved
}

function sortedBuildingEntries(state: InternalState) {
  return [...state.ecs.building.entries()].sort((a, b) => a[0] - b[0])
}

function getBuildingIdsByKind(
  state: InternalState,
  kind: 'foodSource' | 'warehouse' | 'market',
): number[] {
  return sortedBuildingEntries(state)
    .filter(([, building]) => building.kind === kind)
    .map(([entityId]) => entityId)
}
