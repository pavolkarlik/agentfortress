import { tileKey } from '@shared/map'
import { getPathCached } from '@sim/path/aStar'
import { isVehicleOperational } from '@sim/systems/maintenanceSystem'
import { recordIncome } from '@sim/world/state'
import {
  addLineEntity,
  addMinibusEntity,
  type InternalState,
} from '@sim/world/state'

const MINIBUS_MOVE_INTERVAL = 2
export function runTransitSystem(state: InternalState): void {
  const lineId = ensureLineFromStops(state)
  if (lineId === null) {
    return
  }

  const line = state.ecs.line.get(lineId)
  if (!line || line.stops.length < 2) {
    return
  }

  for (const vehicleId of [...line.assignedVehicles].sort((a, b) => a - b)) {
    runMinibus(state, vehicleId, lineId)
  }
}

function ensureLineFromStops(state: InternalState): number | null {
  const stops = [...state.ecs.building.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, building]) => building.kind === 'stop')
    .map(([stopId]) => state.ecs.position.get(stopId))
    .filter((position): position is { x: number; y: number } => position !== undefined)

  if (stops.length < 2) {
    return null
  }

  const lineId = [...state.ecs.line.keys()].sort((a, b) => a - b)[0] ?? addLineEntity(state, stops)
  const line = state.ecs.line.get(lineId)
  if (!line) {
    return null
  }

  line.stops = stops.map((stop) => ({ x: stop.x, y: stop.y }))

  line.assignedVehicles = line.assignedVehicles.filter((vehicleId) =>
    state.ecs.agentKind.get(vehicleId)?.kind === 'minibus',
  )

  if (line.assignedVehicles.length === 0) {
    const firstStop = line.stops[0]
    const minibusId = addMinibusEntity(state, firstStop.x, firstStop.y, lineId)
    line.assignedVehicles.push(minibusId)
    const decision = state.ecs.decisionLog.get(minibusId)
    if (decision) {
      decision.lastTarget = 'stopIndex:1'
      decision.lastReason = 'Assigned to first bus line'
    }
  }

  return lineId
}

function runMinibus(state: InternalState, vehicleId: number, lineId: number): void {
  const line = state.ecs.line.get(lineId)
  const position = state.ecs.position.get(vehicleId)
  const movement = state.ecs.movement.get(vehicleId)
  const decision = state.ecs.decisionLog.get(vehicleId)
  const condition = state.ecs.condition.get(vehicleId)
  const passengerCount = state.ecs.queue.get(vehicleId)

  if (!line || !position || !movement || !decision || !condition || !passengerCount) {
    return
  }

  if (!isVehicleOperational(state, vehicleId)) {
    return
  }

  if (movement.path.length > 0) {
    if (state.tick % MINIBUS_MOVE_INTERVAL !== 0) {
      return
    }

    const next = movement.path.shift()
    if (!next) {
      return
    }

    position.x = next.x
    position.y = next.y
    condition.wear = Math.min(1, condition.wear + condition.wearRate)

    if (movement.path.length === 0) {
      decision.lastDecision = 'arriveStop'
      decision.lastReason = 'Reached route stop'
    }

    return
  }

  const stopIndex = parseNextStopIndex(decision.lastTarget, line.stops.length)
  const currentStop = line.stops[stopIndex]

  if (position.x === currentStop.x && position.y === currentStop.y) {
    if (passengerCount.count > 0) {
      recordIncome(state, passengerCount.count * line.fare)
      passengerCount.count = 0
    }

    const stopEntityId = state.buildingEntityByTile.get(tileKey(currentStop.x, currentStop.y))
    const stopQueue = stopEntityId !== undefined ? state.ecs.queue.get(stopEntityId) : null
    if (stopQueue) {
      const freeSeats = Math.max(0, (passengerCount.capacity ?? 16) - passengerCount.count)
      const boarded = Math.min(freeSeats, stopQueue.count)
      stopQueue.count -= boarded
      passengerCount.count += boarded
    }

    const nextStopIndex = (stopIndex + 1) % line.stops.length
    const nextStop = line.stops[nextStopIndex]
    const path = getPathCached(state, position, nextStop)

    if (path && path.length > 1) {
      movement.path = path.slice(1)
      decision.lastDecision = 'departStop'
      decision.lastReason = `Departing stop ${stopIndex} to stop ${nextStopIndex}`
      decision.lastTarget = `stopIndex:${nextStopIndex}`
    } else {
      decision.lastDecision = 'blocked'
      decision.lastReason = 'No road route between stops'
      decision.lastTarget = `stopIndex:${nextStopIndex}`
    }

    return
  }

  const path = getPathCached(state, position, currentStop)
  if (path && path.length > 1) {
    movement.path = path.slice(1)
    decision.lastDecision = 'travelStop'
    decision.lastReason = `Heading toward stop ${stopIndex}`
    decision.lastTarget = `stopIndex:${stopIndex}`
  } else {
    decision.lastDecision = 'blocked'
    decision.lastReason = `Cannot reach stop ${stopIndex}`
    decision.lastTarget = `stopIndex:${stopIndex}`
  }
}

function parseNextStopIndex(lastTarget: string, stopCount: number): number {
  const parsed = Number(lastTarget.replace('stopIndex:', ''))
  if (!Number.isInteger(parsed) || parsed < 0 || parsed >= stopCount) {
    return 0
  }

  return parsed
}
