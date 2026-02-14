import { getPathCached } from '@sim/path/aStar'
import type { AgentKind, MaintenanceState } from '@shared/types'
import type { InternalState } from '@sim/world/state'

const RESUME_THRESHOLD = 0.2

const MOVE_INTERVAL_BY_KIND: Record<'courierBot' | 'minibus', number> = {
  courierBot: 3,
  minibus: 2,
}

const REPAIR_RATE_BY_KIND: Record<'courierBot' | 'minibus', number> = {
  courierBot: 0.012,
  minibus: 0.01,
}

export function runMaintenanceSystem(state: InternalState): void {
  const vehicleIds = [...state.ecs.agentKind.entries()]
    .filter(([, agent]) => agent.kind === 'courierBot' || agent.kind === 'minibus')
    .map(([entityId]) => entityId)
    .sort((a, b) => a - b)

  for (const vehicleId of vehicleIds) {
    maintainVehicle(state, vehicleId)
  }
}

function maintainVehicle(state: InternalState, vehicleId: number): void {
  const agent = state.ecs.agentKind.get(vehicleId)
  const position = state.ecs.position.get(vehicleId)
  const movement = state.ecs.movement.get(vehicleId)
  const condition = state.ecs.condition.get(vehicleId)
  const decision = state.ecs.decisionLog.get(vehicleId)

  if (!agent || !position || !movement || !condition || !decision) {
    return
  }

  const vehicleKind = asVehicleKind(agent.kind)
  if (!vehicleKind) {
    return
  }

  if (
    condition.maintenanceState === 'operational' &&
    condition.wear < condition.maintenanceThreshold
  ) {
    return
  }

  const depot = findAssignedOrNearestDepot(state, vehicleId, position.x, position.y)
  if (!depot) {
    condition.maintenanceState = 'toDepot'
    decision.lastDecision = 'maintenanceBlocked'
    decision.lastReason = 'No depot available for repair'
    decision.lastTarget = 'depot:none'
    return
  }

  condition.assignedDepotId = depot.entityId

  if (position.x === depot.x && position.y === depot.y) {
    condition.maintenanceState = 'repairing'
    movement.path = []
    condition.wear = Math.max(0, condition.wear - REPAIR_RATE_BY_KIND[vehicleKind])

    decision.lastDecision = 'repairing'
    decision.lastReason = `Repairing at depot ${depot.entityId}`
    decision.lastTarget = `depot:${depot.entityId}`

    if (condition.wear <= RESUME_THRESHOLD) {
      condition.maintenanceState = 'operational'
      condition.assignedDepotId = undefined
      decision.lastDecision = 'resumeService'
      decision.lastReason = 'Maintenance complete, returning to route'
      decision.lastTarget = 'service'
    }
    return
  }

  if (condition.maintenanceState === 'operational') {
    condition.maintenanceState = 'toDepot'

    if (vehicleKind === 'minibus') {
      const onboard = state.ecs.queue.get(vehicleId)
      if (onboard) {
        onboard.count = 0
      }
    }
  }

  if (movement.path.length === 0) {
    const path = getPathCached(state, position, { x: depot.x, y: depot.y })
    if (!path || path.length < 2) {
      decision.lastDecision = 'maintenanceBlocked'
      decision.lastReason = `No path to depot ${depot.entityId}`
      decision.lastTarget = `depot:${depot.entityId}`
      return
    }

    movement.path = path.slice(1)
  }

  if (state.tick % MOVE_INTERVAL_BY_KIND[vehicleKind] === 0) {
    const nextWaypoint = movement.path.shift()
    if (nextWaypoint) {
      position.x = nextWaypoint.x
      position.y = nextWaypoint.y
    }
  }

  decision.lastDecision = 'maintenanceTravel'
  decision.lastReason = `Returning to depot ${depot.entityId} for repairs`
  decision.lastTarget = `depot:${depot.entityId}`
}

function findAssignedOrNearestDepot(
  state: InternalState,
  vehicleId: number,
  x: number,
  y: number,
): { entityId: number; x: number; y: number } | null {
  const condition = state.ecs.condition.get(vehicleId)

  if (condition?.assignedDepotId !== undefined) {
    const assignedPosition = state.ecs.position.get(condition.assignedDepotId)
    const assignedBuilding = state.ecs.building.get(condition.assignedDepotId)
    if (assignedPosition && assignedBuilding?.kind === 'depot') {
      return {
        entityId: condition.assignedDepotId,
        x: assignedPosition.x,
        y: assignedPosition.y,
      }
    }
  }

  let nearest: { entityId: number; x: number; y: number } | null = null
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const [entityId, building] of [...state.ecs.building.entries()].sort((a, b) => a[0] - b[0])) {
    if (building.kind !== 'depot') {
      continue
    }

    const depotPosition = state.ecs.position.get(entityId)
    if (!depotPosition) {
      continue
    }

    const distance = Math.abs(depotPosition.x - x) + Math.abs(depotPosition.y - y)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearest = {
        entityId,
        x: depotPosition.x,
        y: depotPosition.y,
      }
    }
  }

  return nearest
}

function asVehicleKind(kind: AgentKind): 'courierBot' | 'minibus' | null {
  if (kind === 'courierBot' || kind === 'minibus') {
    return kind
  }

  return null
}

export function isVehicleOperational(state: InternalState, vehicleId: number): boolean {
  const condition = state.ecs.condition.get(vehicleId)
  return (condition?.maintenanceState ?? 'operational') === 'operational'
}

export function getVehicleMaintenanceState(
  state: InternalState,
  vehicleId: number,
): MaintenanceState {
  return state.ecs.condition.get(vehicleId)?.maintenanceState ?? 'operational'
}
