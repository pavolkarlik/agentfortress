import { tileKey } from '@shared/map'
import { addMinibusEntity, type InternalState } from '@sim/world/state'

const LINE_AUTO_ADD_POLICY_ID = 'line_auto_add_minibus_when_queue_high'

const HIGH_QUEUE_THRESHOLD = 15
const LOW_QUEUE_RESET_THRESHOLD = 8
const TRIGGER_TICKS = 1200
const COOLDOWN_TICKS = 800
const MAX_BUSES_PER_LINE = 6

export function runPolicySystem(state: InternalState): void {
  let addVehicleBudget = 1
  const policyEntries = [...state.ecs.policy.entries()].sort((a, b) => a[0] - b[0])

  for (const [entityId, policy] of policyEntries) {
    for (const policyId of [...policy.policyIds].sort()) {
      if (policyId === LINE_AUTO_ADD_POLICY_ID) {
        const addedVehicle = applyLineAutoScalePolicy(state, entityId, addVehicleBudget > 0)
        if (addedVehicle) {
          addVehicleBudget -= 1
        }
      }
    }
  }
}

function applyLineAutoScalePolicy(
  state: InternalState,
  lineEntityId: number,
  allowSpawn: boolean,
): boolean {
  const line = state.ecs.line.get(lineEntityId)
  if (!line || line.stops.length === 0) {
    return false
  }

  const runtimeKey = `${lineEntityId}:${LINE_AUTO_ADD_POLICY_ID}`
  const runtime = state.policyRuntime.get(runtimeKey) ?? {
    activeTicks: 0,
    cooldownUntilTick: 0,
  }

  const avgQueue = averageQueueAtStops(state, line.stops)

  if (avgQueue >= HIGH_QUEUE_THRESHOLD) {
    runtime.activeTicks += 1
  } else if (avgQueue <= LOW_QUEUE_RESET_THRESHOLD) {
    runtime.activeTicks = 0
  }

  const inCooldown = state.tick < runtime.cooldownUntilTick
  if (
    allowSpawn &&
    !inCooldown &&
    runtime.activeTicks >= TRIGGER_TICKS &&
    line.assignedVehicles.length < MAX_BUSES_PER_LINE
  ) {
    const firstStop = line.stops[0]
    const vehicleId = addMinibusEntity(state, firstStop.x, firstStop.y, lineEntityId)
    line.assignedVehicles.push(vehicleId)

    const decision = state.ecs.decisionLog.get(vehicleId)
    if (decision) {
      decision.lastDecision = 'assigned'
      decision.lastReason = 'Line auto-scale policy added vehicle for sustained queues'
      decision.lastTarget = `line:${lineEntityId}`
    }

    runtime.activeTicks = 0
    runtime.cooldownUntilTick = state.tick + COOLDOWN_TICKS
    state.policyRuntime.set(runtimeKey, runtime)
    return true
  }

  state.policyRuntime.set(runtimeKey, runtime)
  return false
}

function averageQueueAtStops(
  state: InternalState,
  stops: Array<{ x: number; y: number }>,
): number {
  if (stops.length === 0) {
    return 0
  }

  let total = 0
  for (const stop of stops) {
    const stopEntityId = state.buildingEntityByTile.get(tileKey(stop.x, stop.y))
    if (stopEntityId === undefined) {
      continue
    }

    total += state.ecs.queue.get(stopEntityId)?.count ?? 0
  }

  return total / stops.length
}
