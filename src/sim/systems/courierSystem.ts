import { getPathCached } from '@sim/path/aStar'
import { isVehicleOperational } from '@sim/systems/maintenanceSystem'
import type { InternalState } from '@sim/world/state'

const COURIER_MOVE_INTERVAL = 3
const COURIER_CAPACITY = 20
const MARKET_LOW_THRESHOLD = 20
const WAREHOUSE_SURPLUS_THRESHOLD = 50

export function runCourierSystem(state: InternalState): void {
  const courierIds = [...state.ecs.agentKind.entries()]
    .filter(([, kind]) => kind.kind === 'courierBot')
    .map(([entityId]) => entityId)
    .sort((a, b) => a - b)

  for (const courierId of courierIds) {
    runCourierTick(state, courierId)
  }
}

function runCourierTick(state: InternalState, courierId: number): void {
  const position = state.ecs.position.get(courierId)
  const inventory = state.ecs.inventory.get(courierId)
  const movement = state.ecs.movement.get(courierId)
  const decision = state.ecs.decisionLog.get(courierId)
  const policy = state.ecs.policy.get(courierId)
  const condition = state.ecs.condition.get(courierId)
  if (!position || !inventory || !movement || !decision || !policy || !condition) {
    return
  }

  if (!isVehicleOperational(state, courierId)) {
    return
  }

  if (movement.path.length > 0) {
    if (state.tick % COURIER_MOVE_INTERVAL === 0) {
      const next = movement.path.shift()
      if (next) {
        position.x = next.x
        position.y = next.y
        condition.wear = Math.min(1, condition.wear + condition.wearRate)
      }

      if (movement.path.length === 0) {
        decision.lastDecision = 'arrive'
        decision.lastReason = 'Reached logistic waypoint'
      }
    }
    return
  }

  const marketTarget = findMarketNeedingFood(state)

  if (inventory.food > 0) {
    if (marketTarget === null) {
      decision.lastDecision = 'hold'
      decision.lastReason = 'No market target available'
      decision.lastTarget = 'none'
      return
    }

    const marketPosition = state.ecs.position.get(marketTarget)
    const marketInventory = state.ecs.inventory.get(marketTarget)
    if (!marketPosition || !marketInventory) {
      return
    }

    if (position.x === marketPosition.x && position.y === marketPosition.y) {
      marketInventory.food += inventory.food
      decision.lastDecision = 'deliverFood'
      decision.lastReason = `Delivered ${inventory.food} food to market`
      decision.lastTarget = `building:${marketTarget}`
      inventory.food = 0
      return
    }

    const path = getPathCached(state, position, marketPosition)
    if (path && path.length > 1) {
      movement.path = path.slice(1)
      decision.lastDecision = 'travel'
      decision.lastReason = 'Heading to market for dropoff'
      decision.lastTarget = `building:${marketTarget}`
    } else {
      decision.lastDecision = 'blocked'
      decision.lastReason = 'No road path to market'
      decision.lastTarget = `building:${marketTarget}`
    }
    return
  }

  const pickupSource = pickPickupSource(state, policy.policyIds)
  if (pickupSource === null) {
    decision.lastDecision = 'standby'
    decision.lastReason = 'Policy found no pickup source'
    decision.lastTarget = 'none'
    return
  }

  const sourcePosition = state.ecs.position.get(pickupSource)
  const sourceInventory = state.ecs.inventory.get(pickupSource)
  if (!sourcePosition || !sourceInventory) {
    return
  }

  if (position.x === sourcePosition.x && position.y === sourcePosition.y) {
    if (sourceInventory.food <= 0) {
      decision.lastDecision = 'wait'
      decision.lastReason = 'Pickup source is empty'
      decision.lastTarget = `building:${pickupSource}`
      return
    }

    const amount = Math.min(COURIER_CAPACITY, sourceInventory.food)
    sourceInventory.food -= amount
    inventory.food += amount
    decision.lastDecision = 'pickupFood'
    decision.lastReason = `Picked up ${amount} food for market`
    decision.lastTarget = `building:${pickupSource}`
    return
  }

  const path = getPathCached(state, position, sourcePosition)
  if (path && path.length > 1) {
    movement.path = path.slice(1)
    decision.lastDecision = 'travel'
    decision.lastReason = 'Heading to pickup source'
    decision.lastTarget = `building:${pickupSource}`
  } else {
    decision.lastDecision = 'blocked'
    decision.lastReason = 'No road path to pickup source'
    decision.lastTarget = `building:${pickupSource}`
  }
}

function pickPickupSource(state: InternalState, policyIds: string[]): number | null {
  const prefersWarehouseSurplus = policyIds.includes('warehouse_surplus_to_market')
  const deliverOnMarketLow = policyIds.includes('deliver_market_if_low')

  const markets = buildingIdsByKind(state, 'market')
  const warehouses = buildingIdsByKind(state, 'warehouse')
  const foodSources = buildingIdsByKind(state, 'foodSource')

  const marketLow = markets.some((marketId) => {
    const food = state.ecs.inventory.get(marketId)?.food ?? 0
    return food < MARKET_LOW_THRESHOLD
  })

  if (!marketLow && !prefersWarehouseSurplus) {
    return null
  }

  if (prefersWarehouseSurplus) {
    const surplusWarehouse = warehouses.find(
      (warehouseId) => (state.ecs.inventory.get(warehouseId)?.food ?? 0) > WAREHOUSE_SURPLUS_THRESHOLD,
    )

    if (surplusWarehouse !== undefined) {
      return surplusWarehouse
    }
  }

  if (!marketLow && deliverOnMarketLow) {
    return null
  }

  const candidates = [...warehouses, ...foodSources]
  const source = candidates.find((sourceId) => (state.ecs.inventory.get(sourceId)?.food ?? 0) > 0)
  return source ?? null
}

function findMarketNeedingFood(state: InternalState): number | null {
  const markets = buildingIdsByKind(state, 'market')
  let chosen: number | null = null
  let chosenFood = Number.POSITIVE_INFINITY

  for (const marketId of markets) {
    const food = state.ecs.inventory.get(marketId)?.food ?? 0
    if (food < chosenFood) {
      chosenFood = food
      chosen = marketId
    }
  }

  return chosen
}

function buildingIdsByKind(
  state: InternalState,
  kind: 'market' | 'warehouse' | 'foodSource',
): number[] {
  return [...state.ecs.building.entries()]
    .filter(([, building]) => building.kind === kind)
    .map(([entityId]) => entityId)
    .sort((a, b) => a - b)
}
