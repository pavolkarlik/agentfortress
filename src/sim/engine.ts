import {
  MS_PER_TICK,
  SNAPSHOT_BUDGET_BYTES,
  SNAPSHOT_INTERVAL_MS,
} from '@shared/constants'
import type {
  EntityDetails,
  InitConfig,
  SaveBlob,
  SimCommand,
  SimSnapshot,
} from '@shared/types'
import { applyCommand, applyEconomyTick } from '@sim/commands/applyCommand'
import { runCourierSystem } from '@sim/systems/courierSystem'
import { runExpansionSystem } from '@sim/systems/expansionSystem'
import { runFoodSystem } from '@sim/systems/foodSystem'
import { runMaintenanceSystem } from '@sim/systems/maintenanceSystem'
import { runMovementSystem } from '@sim/systems/movementSystem'
import { runNeedsSystem } from '@sim/systems/needsSystem'
import { runPolicySystem } from '@sim/policies/policySystem'
import { runTransitSystem } from '@sim/systems/transitSystem'
import {
  createInitialState,
  createSaveBlob,
  createSnapshot,
  InternalState,
  restoreState,
} from '@sim/world/state'

type SnapshotListener = (snapshot: SimSnapshot) => void

export class SimEngine {
  private state: InternalState = createInitialState({
    seed: 1,
    mapSize: { w: 24, h: 24 },
  })

  private pendingCommands: SimCommand[] = []
  private snapshotListener: SnapshotListener | null = null
  private tickInterval: ReturnType<typeof setInterval> | null = null
  private snapshotInterval: ReturnType<typeof setInterval> | null = null

  init(config: InitConfig): void {
    this.state = createInitialState(config)
    this.pendingCommands = []
    this.ensureLoopRunning()
    this.emitSnapshot()
  }

  enqueueCommands(commands: SimCommand[]): void {
    this.pendingCommands.push(...commands)
    this.pendingCommands.sort(sortCommands)
  }

  step(untilTick: number): void {
    while (this.state.tick < untilTick) {
      this.stepTick()
    }
    this.emitSnapshot()
  }

  getSnapshot(): SimSnapshot {
    return this.buildSnapshot()
  }

  save(): SaveBlob {
    return createSaveBlob(this.state)
  }

  load(blob: SaveBlob): void {
    this.state = restoreState(blob)
    this.pendingCommands = []
    this.ensureLoopRunning()
    this.emitSnapshot()
  }

  onSnapshot(listener: SnapshotListener): void {
    this.snapshotListener = listener
    this.emitSnapshot()
  }

  getEntityDetails(entityId: number): EntityDetails | null {
    const building = this.state.ecs.building.get(entityId)
    if (building) {
      const position = this.state.ecs.position.get(entityId)
      const inventory = this.state.ecs.inventory.get(entityId)
      const queue = this.state.ecs.queue.get(entityId)
      return {
        entityId,
        label: `Building: ${building.kind}`,
        doing: building.kind === 'foodSource' ? 'Producing food' : 'Standing by',
        why:
          building.kind === 'foodSource'
            ? 'ProductionSystem keeps inventory flowing.'
            : 'No active building-specific task in milestone 0.',
        needs:
          building.kind === 'market' && (inventory?.food ?? 0) < 10
            ? ['Needs courier delivery']
            : ['Operating normally'],
        stats: {
          x: position?.x ?? -1,
          y: position?.y ?? -1,
          upkeep: building.upkeep,
          food: inventory?.food ?? 0,
          queue: queue?.count ?? 0,
        },
      }
    }

    const agentKind = this.state.ecs.agentKind.get(entityId)
    const position = this.state.ecs.position.get(entityId)
    const decision = this.state.ecs.decisionLog.get(entityId)
    if (!agentKind || !position || !decision) {
      return null
    }

    const needs = this.state.ecs.needs.get(entityId)
    const inventory = this.state.ecs.inventory.get(entityId)
    const condition = this.state.ecs.condition.get(entityId)

    return {
      entityId,
      label: `Agent: ${agentKind.kind}`,
      doing: decision.lastDecision,
      why: decision.lastReason,
      needs:
        agentKind.kind === 'citizen'
          ? (needs?.hunger ?? 0) > 0.7
            ? ['Needs food']
            : ['Needs are stable']
          : ['Following active policy cards'],
      stats: {
        x: position.x,
        y: position.y,
        hunger: Number((needs?.hunger ?? 0).toFixed(2)),
        happiness: Number((needs?.happiness ?? 1).toFixed(2)),
        cargoFood: inventory?.food ?? 0,
        wear: Number((condition?.wear ?? 0).toFixed(2)),
        maintenance: condition?.maintenanceState ?? 'operational',
      },
    }
  }

  dispose(): void {
    if (this.tickInterval !== null) {
      clearInterval(this.tickInterval)
      this.tickInterval = null
    }
    if (this.snapshotInterval !== null) {
      clearInterval(this.snapshotInterval)
      this.snapshotInterval = null
    }
  }

  private ensureLoopRunning(): void {
    if (this.tickInterval === null) {
      this.tickInterval = globalThis.setInterval(() => {
        this.stepTick()
      }, MS_PER_TICK)
    }

    if (this.snapshotInterval === null) {
      this.snapshotInterval = globalThis.setInterval(() => {
        this.emitSnapshot()
      }, SNAPSHOT_INTERVAL_MS)
    }
  }

  private stepTick(): void {
    const currentTick = this.state.tick

    while (this.pendingCommands.length > 0 && this.pendingCommands[0].tickId <= currentTick) {
      const command = this.pendingCommands.shift()
      if (command) {
        applyCommand(this.state, command)
      }
    }

    if (this.state.gameOver) {
      this.state.tick += 1
      return
    }

    runExpansionSystem(this.state)
    runFoodSystem(this.state)
    runMaintenanceSystem(this.state)
    runCourierSystem(this.state)
    runNeedsSystem(this.state)
    runPolicySystem(this.state)
    runTransitSystem(this.state)
    runMovementSystem(this.state)
    applyEconomyTick(this.state)

    this.state.tick += 1
  }

  private emitSnapshot(): void {
    if (!this.snapshotListener) {
      return
    }

    this.snapshotListener(this.buildSnapshot())
  }

  private buildSnapshot(): SimSnapshot {
    const snapshot = createSnapshot(this.state)
    snapshot.snapshotMetrics = {
      payloadBytes: 0,
      budgetBytes: SNAPSHOT_BUDGET_BYTES,
      overBudget: false,
    }

    const payloadBytes = new TextEncoder().encode(JSON.stringify(snapshot)).length
    snapshot.snapshotMetrics.payloadBytes = payloadBytes
    snapshot.snapshotMetrics.overBudget = payloadBytes > SNAPSHOT_BUDGET_BYTES

    return snapshot
  }
}

function sortCommands(a: SimCommand, b: SimCommand): number {
  if (a.tickId !== b.tickId) {
    return a.tickId - b.tickId
  }

  if (a.type !== b.type) {
    return a.type.localeCompare(b.type)
  }

  if ('x' in a && 'x' in b) {
    return a.x - b.x || a.y - b.y
  }

  if ('kind' in a && 'kind' in b && a.kind !== b.kind) {
    return String(a.kind).localeCompare(String(b.kind))
  }

  return 0
}
