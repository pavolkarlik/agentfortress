import { BANKRUPTCY_TICK_LIMIT, BUILDING_UPKEEP, TICKS_PER_DAY } from '@shared/constants'
import { defaultBlueprints, normalizeBlueprintSet } from '@shared/blueprint'
import { tileIndex, tileKey } from '@shared/map'
import type {
  AgentKind,
  AgentSnapshot,
  BuildingKind,
  BuildingSnapshot,
  BlueprintSet,
  MaintenanceState,
  EconomySummary,
  DecisionLogComponent,
  EntityId,
  InitConfig,
  InventoryComponent,
  MapData,
  PolicyRuntimeState,
  PositionComponent,
  RoadSnapshot,
  SaveBlob,
  SerializedComponent,
  SerializedEcs,
  SimSnapshot,
} from '@shared/types'
import { generateMap } from '@sim/world/mapGen'

export interface EcsWorld {
  entities: Set<EntityId>
  position: Map<EntityId, PositionComponent>
  movement: Map<EntityId, { speed: number; path: PositionComponent[] }>
  inventory: Map<EntityId, InventoryComponent>
  needs: Map<EntityId, { hunger: number; happiness: number }>
  wallet: Map<EntityId, { money: number }>
  building: Map<EntityId, { kind: BuildingKind; footprint: { w: number; h: number }; upkeep: number }>
  road: Map<EntityId, { kind: 'road' }>
  agentKind: Map<EntityId, { kind: 'citizen' | 'courierBot' | 'minibus' }>
  policy: Map<EntityId, { policyIds: string[] }>
  ownership: Map<EntityId, { ownerEntityId?: EntityId }>
  line: Map<EntityId, { stops: PositionComponent[]; assignedVehicles: EntityId[]; fare: number; headwayTarget: number }>
  queue: Map<EntityId, { count: number; capacity?: number }>
  condition: Map<
    EntityId,
    {
      wear: number
      wearRate: number
      maintenanceThreshold: number
      maintenanceState: MaintenanceState
      assignedDepotId?: EntityId
    }
  >
  systemAgent: Map<EntityId, { children: EntityId[] }>
  decisionLog: Map<EntityId, DecisionLogComponent>
}

export interface InternalState {
  seed: number
  tick: number
  money: number
  bankruptcyTicks: number
  bankruptcyDaysRemaining: number
  gameOver: boolean
  gameOverReason: string | null
  nextEntityId: number
  map: MapData
  economy: EconomySummary
  blueprints: BlueprintSet
  policyRuntime: Map<string, PolicyRuntimeState>
  ecs: EcsWorld
  roadEntityByTile: Map<string, EntityId>
  buildingEntityByTile: Map<string, EntityId>
  pathCacheRevision: number
  pathCache: Map<string, PositionComponent[]>
}

export function createInitialState(config: InitConfig): InternalState {
  const map = generateMap(config.seed, config.mapSize)
  const state: InternalState = {
    seed: config.seed,
    tick: 0,
    money: 800,
    bankruptcyTicks: 0,
    bankruptcyDaysRemaining: Math.ceil(BANKRUPTCY_TICK_LIMIT / TICKS_PER_DAY),
    gameOver: false,
    gameOverReason: null,
    nextEntityId: 1,
    map,
    economy: createEmptyEconomySummary(),
    blueprints: defaultBlueprints(),
    policyRuntime: new Map(),
    ecs: createEmptyEcsWorld(),
    roadEntityByTile: new Map(),
    buildingEntityByTile: new Map(),
    pathCacheRevision: 0,
    pathCache: new Map(),
  }

  seedStarterEntities(state)
  return state
}

export function restoreState(blob: SaveBlob): InternalState {
  const migrated = migrateSaveBlob(blob)

  if (migrated.ecs) {
    return restoreFromSerializedEcs(migrated)
  }

  return restoreLegacyBlob(migrated)
}

export function migrateSaveBlob(blob: SaveBlob): SaveBlob {
  const migrated: SaveBlob = {
    ...blob,
    version: 3,
    bankruptcyDaysRemaining:
      blob.bankruptcyDaysRemaining ??
      Math.ceil(Math.max(0, BANKRUPTCY_TICK_LIMIT - blob.bankruptcyTicks) / TICKS_PER_DAY),
    gameOverReason: blob.gameOverReason ?? null,
    economy: blob.economy ? cloneEconomySummary(blob.economy) : createEmptyEconomySummary(),
    blueprints: blob.blueprints
      ? normalizeBlueprintSet(blob.blueprints)
      : defaultBlueprints(),
    policyRuntime: blob.policyRuntime ?? [],
  }

  return migrated
}

export function createSnapshot(state: InternalState): SimSnapshot {
  const roads: RoadSnapshot[] = sortedIds(state.ecs.road).flatMap((entityId) => {
    const position = state.ecs.position.get(entityId)
    if (!position) {
      return []
    }

    return [{ id: entityId, x: position.x, y: position.y }]
  })

  roads.sort((a, b) => a.y - b.y || a.x - b.x || a.id - b.id)

  const buildings: BuildingSnapshot[] = sortedIds(state.ecs.building).flatMap((entityId) => {
    const building = state.ecs.building.get(entityId)
    const position = state.ecs.position.get(entityId)
    if (!building || !position) {
      return []
    }

    return [
      {
        id: entityId,
        kind: building.kind,
        x: position.x,
        y: position.y,
        upkeep: building.upkeep,
        food: state.ecs.inventory.get(entityId)?.food ?? 0,
      },
    ]
  })

  const agents: AgentSnapshot[] = sortedIds(state.ecs.agentKind).flatMap((entityId) => {
    const kind = state.ecs.agentKind.get(entityId)
    const position = state.ecs.position.get(entityId)
    if (!kind || !position) {
      return []
    }

    const needs = state.ecs.needs.get(entityId) ?? { hunger: 0, happiness: 1 }
    const decision = state.ecs.decisionLog.get(entityId) ?? {
      lastDecision: 'idle',
      lastReason: 'No decision yet',
      lastTarget: 'none',
    }

    return [
      {
        id: entityId,
        kind: kind.kind,
        x: position.x,
        y: position.y,
        hunger: needs.hunger,
        happiness: needs.happiness,
        lastDecision: decision.lastDecision,
        lastReason: decision.lastReason,
      },
    ]
  })

  const foodStock = buildings.reduce((sum, building) => sum + building.food, 0)
  const citizens = agents.filter((agent) => agent.kind === 'citizen')
  const population = citizens.length
  const avgHappiness =
    population > 0 ? citizens.reduce((sum, agent) => sum + agent.happiness, 0) / population : 1
  const stopQueues = sortedIds(state.ecs.queue).flatMap((entityId) => {
    const building = state.ecs.building.get(entityId)
    const position = state.ecs.position.get(entityId)
    const queue = state.ecs.queue.get(entityId)

    if (!building || !position || !queue) {
      return []
    }

    if (building.kind !== 'stop' && building.kind !== 'market') {
      return []
    }

    return [
      {
        id: entityId,
        x: position.x,
        y: position.y,
        count: queue.count,
      },
    ]
  })

  return {
    tick: state.tick,
    seed: state.seed,
    money: state.money,
    population,
    foodStock,
    avgHappiness,
    bankruptcyTicks: state.bankruptcyTicks,
    bankruptcyDaysRemaining: state.bankruptcyDaysRemaining,
    gameOver: state.gameOver,
    gameOverReason: state.gameOverReason,
    economy: cloneEconomySummary(state.economy),
    blueprints: cloneBlueprintSet(state.blueprints),
    snapshotMetrics: {
      payloadBytes: 0,
      budgetBytes: 0,
      overBudget: false,
    },
    map: state.map,
    roads,
    buildings,
    agents,
    stopQueues,
  }
}

export function createSaveBlob(state: InternalState): SaveBlob {
  const snapshot = createSnapshot(state)

  return {
    version: 3,
    seed: state.seed,
    tick: state.tick,
    money: state.money,
    bankruptcyTicks: state.bankruptcyTicks,
    bankruptcyDaysRemaining: state.bankruptcyDaysRemaining,
    gameOver: state.gameOver,
    gameOverReason: state.gameOverReason,
    economy: cloneEconomySummary(state.economy),
    blueprints: cloneBlueprintSet(state.blueprints),
    policyRuntime: [...state.policyRuntime.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    map: state.map,
    roads: snapshot.roads,
    buildings: snapshot.buildings,
    agents: snapshot.agents,
    ecs: serializeEcs(state.ecs),
  }
}

export function nextEntityId(state: InternalState): number {
  const id = state.nextEntityId
  state.nextEntityId += 1
  return id
}

export function getUpkeep(kind: BuildingKind): number {
  return BUILDING_UPKEEP[kind]
}

export function addRoadEntity(
  state: InternalState,
  x: number,
  y: number,
  explicitId?: EntityId,
): EntityId {
  const key = tileKey(x, y)
  const existing = state.roadEntityByTile.get(key)
  if (existing !== undefined) {
    return existing
  }

  ensurePlacedTilePassable(state, x, y)
  const entityId = registerEntity(state, explicitId)

  state.ecs.position.set(entityId, { x, y })
  state.ecs.road.set(entityId, { kind: 'road' })
  state.roadEntityByTile.set(key, entityId)

  return entityId
}

export function invalidatePathCache(state: InternalState): void {
  state.pathCacheRevision += 1
  state.pathCache.clear()
}

export function recordIncome(state: InternalState, amount: number): void {
  if (amount <= 0) {
    return
  }

  state.money += amount
  state.economy.currentDayIncome += amount
}

export function recordExpense(state: InternalState, amount: number): void {
  if (amount <= 0) {
    return
  }

  state.money -= amount
  state.economy.currentDayExpense += amount
}

export function finalizeEconomyDay(state: InternalState): void {
  const day = Math.floor(state.tick / TICKS_PER_DAY)
  const income = state.economy.currentDayIncome
  const expense = state.economy.currentDayExpense
  const net = income - expense

  state.economy.lastDayIncome = income
  state.economy.lastDayExpense = expense
  state.economy.lastDayNet = net
  state.economy.currentDayIncome = 0
  state.economy.currentDayExpense = 0

  state.economy.ledger.push({
    day,
    income,
    expense,
    net,
    moneyAfter: state.money,
  })

  if (state.economy.ledger.length > 14) {
    state.economy.ledger.shift()
  }
}

export function setBlueprint(
  state: InternalState,
  kind: 'courierBot' | 'minibus',
  blueprint: {
    speed: number
    capacity: number
    wearRate: number
    maintenanceThreshold: number
    policyIds: string[]
  },
): void {
  const normalized = normalizeBlueprintSet({
    ...state.blueprints,
    [kind]: blueprint,
  })
  state.blueprints = normalized
}

export function addBuildingEntity(
  state: InternalState,
  kind: BuildingKind,
  x: number,
  y: number,
  explicitId?: EntityId,
  food = 0,
): EntityId {
  const key = tileKey(x, y)
  const existing = state.buildingEntityByTile.get(key)
  if (existing !== undefined) {
    return existing
  }

  ensurePlacedTilePassable(state, x, y)
  const entityId = registerEntity(state, explicitId)

  state.ecs.position.set(entityId, { x, y })
  state.ecs.building.set(entityId, {
    kind,
    footprint: { w: 1, h: 1 },
    upkeep: getUpkeep(kind),
  })
  state.ecs.inventory.set(entityId, { food })
  if (kind === 'market' || kind === 'stop') {
    state.ecs.queue.set(entityId, { count: 0 })
  }
  state.buildingEntityByTile.set(key, entityId)

  return entityId
}

export function addCitizenEntity(
  state: InternalState,
  x: number,
  y: number,
  explicitId?: EntityId,
): EntityId {
  const entityId = registerEntity(state, explicitId)

  state.ecs.position.set(entityId, { x, y })
  state.ecs.agentKind.set(entityId, { kind: 'citizen' })
  state.ecs.needs.set(entityId, { hunger: 0.1, happiness: 0.9 })
  state.ecs.decisionLog.set(entityId, {
    lastDecision: 'idle',
    lastReason: 'Starting in housing district',
    lastTarget: 'housing',
  })

  return entityId
}

export function addCourierEntity(
  state: InternalState,
  x: number,
  y: number,
  explicitId?: EntityId,
): EntityId {
  const blueprint = state.blueprints.courierBot
  const entityId = registerEntity(state, explicitId)

  state.ecs.position.set(entityId, { x, y })
  state.ecs.agentKind.set(entityId, { kind: 'courierBot' })
  state.ecs.inventory.set(entityId, { food: 0, capacity: blueprint.capacity })
  state.ecs.movement.set(entityId, { speed: blueprint.speed, path: [] })
  state.ecs.condition.set(entityId, {
    wear: 0,
    wearRate: blueprint.wearRate,
    maintenanceThreshold: blueprint.maintenanceThreshold,
    maintenanceState: 'operational',
  })
  state.ecs.policy.set(entityId, {
    policyIds: [...blueprint.policyIds],
  })
  state.ecs.decisionLog.set(entityId, {
    lastDecision: 'standby',
    lastReason: 'Awaiting delivery signal',
    lastTarget: 'depot',
  })

  return entityId
}

export function addLineEntity(
  state: InternalState,
  stops: PositionComponent[],
  fare = 4,
  explicitId?: EntityId,
): EntityId {
  const entityId = registerEntity(state, explicitId)
  state.ecs.line.set(entityId, {
    stops: stops.map((stop) => ({ x: stop.x, y: stop.y })),
    assignedVehicles: [],
    fare,
    headwayTarget: 80,
  })
  state.ecs.policy.set(entityId, {
    policyIds: ['line_auto_add_minibus_when_queue_high'],
  })
  state.ecs.systemAgent.set(entityId, { children: [] })
  return entityId
}

export function addMinibusEntity(
  state: InternalState,
  x: number,
  y: number,
  lineId?: EntityId,
  explicitId?: EntityId,
): EntityId {
  const blueprint = state.blueprints.minibus
  const entityId = registerEntity(state, explicitId)

  state.ecs.position.set(entityId, { x, y })
  state.ecs.agentKind.set(entityId, { kind: 'minibus' })
  state.ecs.movement.set(entityId, { speed: blueprint.speed, path: [] })
  state.ecs.condition.set(entityId, {
    wear: 0,
    wearRate: blueprint.wearRate,
    maintenanceThreshold: blueprint.maintenanceThreshold,
    maintenanceState: 'operational',
  })
  state.ecs.queue.set(entityId, { count: 0, capacity: blueprint.capacity })
  state.ecs.policy.set(entityId, { policyIds: [...blueprint.policyIds] })
  state.ecs.decisionLog.set(entityId, {
    lastDecision: 'standby',
    lastReason: 'Awaiting line assignment',
    lastTarget: 'line:none',
  })
  if (lineId !== undefined) {
    state.ecs.ownership.set(entityId, { ownerEntityId: lineId })
  }

  return entityId
}

function seedStarterEntities(state: InternalState): void {
  const centerX = Math.floor(state.map.width / 2)
  const centerY = Math.floor(state.map.height / 2)

  addBuildingEntity(state, 'market', centerX, centerY, undefined, 20)
  addBuildingEntity(state, 'housing', centerX - 4, centerY + 1, undefined, 0)
  addBuildingEntity(state, 'foodSource', centerX + 4, centerY - 2, undefined, 20)
  addBuildingEntity(state, 'warehouse', centerX + 1, centerY + 3, undefined, 20)
  addBuildingEntity(state, 'depot', centerX - 2, centerY - 3, undefined, 0)

  for (let x = centerX - 4; x <= centerX + 1; x += 1) {
    addRoadEntity(state, x, centerY + 1)
  }
  for (let y = centerY - 2; y <= centerY + 3; y += 1) {
    addRoadEntity(state, centerX + 1, y)
  }
  for (let x = centerX + 1; x <= centerX + 4; x += 1) {
    addRoadEntity(state, x, centerY - 2)
  }
  for (let x = centerX - 2; x <= centerX + 1; x += 1) {
    addRoadEntity(state, x, centerY - 3)
  }

  for (let i = 0; i < 8; i += 1) {
    addCitizenEntity(state, centerX - 4 + (i % 3), centerY + 1 + Math.floor(i / 3))
  }

  addCourierEntity(state, centerX - 2, centerY - 3)
}

function restoreFromSerializedEcs(blob: SaveBlob): InternalState {
  const ecs = deserializeEcs(blob.ecs as SerializedEcs)
  const state: InternalState = {
    seed: blob.seed,
    tick: blob.tick,
    money: blob.money,
    bankruptcyTicks: blob.bankruptcyTicks,
    bankruptcyDaysRemaining:
      blob.bankruptcyDaysRemaining ??
      Math.ceil(Math.max(0, BANKRUPTCY_TICK_LIMIT - blob.bankruptcyTicks) / TICKS_PER_DAY),
    gameOver: blob.gameOver,
    gameOverReason: blob.gameOverReason ?? null,
    nextEntityId: 1,
    map: blob.map,
    economy: blob.economy ? cloneEconomySummary(blob.economy) : createEmptyEconomySummary(),
    blueprints: blob.blueprints
      ? normalizeBlueprintSet(blob.blueprints)
      : defaultBlueprints(),
    policyRuntime: new Map(blob.policyRuntime ?? []),
    ecs,
    roadEntityByTile: new Map(),
    buildingEntityByTile: new Map(),
    pathCacheRevision: 0,
    pathCache: new Map(),
  }

  for (const entityId of sortedIds(state.ecs.road)) {
    const position = state.ecs.position.get(entityId)
    if (position) {
      state.roadEntityByTile.set(tileKey(position.x, position.y), entityId)
    }
  }

  for (const entityId of sortedIds(state.ecs.building)) {
    const position = state.ecs.position.get(entityId)
    if (position) {
      state.buildingEntityByTile.set(tileKey(position.x, position.y), entityId)
    }
  }

  state.nextEntityId = findMaxEntityId(state.ecs.entities) + 1
  normalizeConditionComponents(state)
  return state
}

function restoreLegacyBlob(blob: SaveBlob): InternalState {
  const state: InternalState = {
    seed: blob.seed,
    tick: blob.tick,
    money: blob.money,
    bankruptcyTicks: blob.bankruptcyTicks,
    bankruptcyDaysRemaining:
      blob.bankruptcyDaysRemaining ??
      Math.ceil(Math.max(0, BANKRUPTCY_TICK_LIMIT - blob.bankruptcyTicks) / TICKS_PER_DAY),
    gameOver: blob.gameOver,
    gameOverReason: blob.gameOverReason ?? null,
    nextEntityId: 1,
    map: blob.map,
    economy: blob.economy ? cloneEconomySummary(blob.economy) : createEmptyEconomySummary(),
    blueprints: blob.blueprints
      ? normalizeBlueprintSet(blob.blueprints)
      : defaultBlueprints(),
    policyRuntime: new Map(blob.policyRuntime ?? []),
    ecs: createEmptyEcsWorld(),
    roadEntityByTile: new Map(),
    buildingEntityByTile: new Map(),
    pathCacheRevision: 0,
    pathCache: new Map(),
  }

  for (const road of blob.roads) {
    addRoadEntity(state, road.x, road.y, road.id)
  }

  for (const building of blob.buildings) {
    addBuildingEntity(state, building.kind, building.x, building.y, building.id, building.food)
  }

  for (const agent of blob.agents) {
    const entityId = addAgentFromSnapshot(state, agent)
    state.ecs.agentKind.set(entityId, { kind: agent.kind })
  }

  state.nextEntityId = findMaxEntityId(state.ecs.entities) + 1
  normalizeConditionComponents(state)
  return state
}

function createEmptyEcsWorld(): EcsWorld {
  return {
    entities: new Set(),
    position: new Map(),
    movement: new Map(),
    inventory: new Map(),
    needs: new Map(),
    wallet: new Map(),
    building: new Map(),
    road: new Map(),
    agentKind: new Map(),
    policy: new Map(),
    ownership: new Map(),
    line: new Map(),
    queue: new Map(),
    condition: new Map(),
    systemAgent: new Map(),
    decisionLog: new Map(),
  }
}

function serializeEcs(ecs: EcsWorld): SerializedEcs {
  return {
    entities: [...ecs.entities].sort((a, b) => a - b),
    position: serializeComponentMap(ecs.position),
    movement: serializeComponentMap(ecs.movement),
    inventory: serializeComponentMap(ecs.inventory),
    needs: serializeComponentMap(ecs.needs),
    wallet: serializeComponentMap(ecs.wallet),
    building: serializeComponentMap(ecs.building),
    road: serializeComponentMap(ecs.road),
    agentKind: serializeComponentMap(ecs.agentKind),
    policy: serializeComponentMap(ecs.policy),
    ownership: serializeComponentMap(ecs.ownership),
    line: serializeComponentMap(ecs.line),
    queue: serializeComponentMap(ecs.queue),
    condition: serializeComponentMap(ecs.condition),
    systemAgent: serializeComponentMap(ecs.systemAgent),
    decisionLog: serializeComponentMap(ecs.decisionLog),
  }
}

function deserializeEcs(serialized: SerializedEcs): EcsWorld {
  return {
    entities: new Set(serialized.entities),
    position: new Map(serialized.position),
    movement: new Map(serialized.movement),
    inventory: new Map(serialized.inventory),
    needs: new Map(serialized.needs),
    wallet: new Map(serialized.wallet),
    building: new Map(serialized.building),
    road: new Map(serialized.road),
    agentKind: new Map(serialized.agentKind),
    policy: new Map(serialized.policy),
    ownership: new Map(serialized.ownership),
    line: new Map(serialized.line),
    queue: new Map(serialized.queue),
    condition: new Map(serialized.condition),
    systemAgent: new Map(serialized.systemAgent),
    decisionLog: new Map(serialized.decisionLog),
  }
}

function normalizeConditionComponents(state: InternalState): void {
  for (const [entityId, condition] of state.ecs.condition.entries()) {
    const agentKind = state.ecs.agentKind.get(entityId)?.kind
    const defaultBlueprint =
      agentKind === 'minibus' ? state.blueprints.minibus : state.blueprints.courierBot

    state.ecs.condition.set(entityId, {
      wear: condition.wear,
      wearRate: condition.wearRate ?? defaultBlueprint.wearRate,
      maintenanceThreshold:
        condition.maintenanceThreshold ?? defaultBlueprint.maintenanceThreshold,
      maintenanceState: condition.maintenanceState ?? 'operational',
      assignedDepotId: condition.assignedDepotId,
    })
  }
}

function serializeComponentMap<T>(map: Map<EntityId, T>): SerializedComponent<T> {
  return [...map.entries()].sort((a, b) => a[0] - b[0])
}

function registerEntity(state: InternalState, explicitId?: EntityId): EntityId {
  const entityId = explicitId ?? nextEntityId(state)
  state.ecs.entities.add(entityId)

  if (explicitId !== undefined) {
    state.nextEntityId = Math.max(state.nextEntityId, explicitId + 1)
  }

  return entityId
}

function sortedIds<T>(map: Map<EntityId, T>): EntityId[] {
  return [...map.keys()].sort((a, b) => a - b)
}

function findMaxEntityId(entities: Set<EntityId>): EntityId {
  let max = 0
  for (const entityId of entities) {
    if (entityId > max) {
      max = entityId
    }
  }
  return max
}

function addAgentFromSnapshot(state: InternalState, agent: AgentSnapshot): EntityId {
  const kind: AgentKind = agent.kind
  if (kind === 'citizen') {
    const entityId = addCitizenEntity(state, agent.x, agent.y, agent.id)
    state.ecs.needs.set(entityId, { hunger: agent.hunger, happiness: agent.happiness })
    state.ecs.decisionLog.set(entityId, {
      lastDecision: agent.lastDecision,
      lastReason: agent.lastReason,
      lastTarget: 'unknown',
    })
    return entityId
  }

  if (kind === 'minibus') {
    const entityId = addMinibusEntity(state, agent.x, agent.y, undefined, agent.id)
    state.ecs.decisionLog.set(entityId, {
      lastDecision: agent.lastDecision,
      lastReason: agent.lastReason,
      lastTarget: 'line:unknown',
    })
    return entityId
  }

  const entityId = addCourierEntity(state, agent.x, agent.y, agent.id)
  state.ecs.decisionLog.set(entityId, {
    lastDecision: agent.lastDecision,
    lastReason: agent.lastReason,
    lastTarget: 'unknown',
  })
  return entityId
}

function ensurePlacedTilePassable(state: InternalState, x: number, y: number): void {
  const idx = tileIndex(state.map, x, y)
  const tile = state.map.tiles[idx]
  tile.passable = true
  if (tile.terrain === 'water') {
    tile.terrain = 'grass'
  }
}

function createEmptyEconomySummary(): EconomySummary {
  return {
    currentDayIncome: 0,
    currentDayExpense: 0,
    lastDayIncome: 0,
    lastDayExpense: 0,
    lastDayNet: 0,
    ledger: [],
  }
}

function cloneEconomySummary(economy: EconomySummary): EconomySummary {
  return {
    currentDayIncome: economy.currentDayIncome,
    currentDayExpense: economy.currentDayExpense,
    lastDayIncome: economy.lastDayIncome,
    lastDayExpense: economy.lastDayExpense,
    lastDayNet: economy.lastDayNet,
    ledger: economy.ledger.map((entry) => ({ ...entry })),
  }
}

function cloneBlueprintSet(blueprints: BlueprintSet): BlueprintSet {
  return {
    courierBot: {
      ...blueprints.courierBot,
      policyIds: [...blueprints.courierBot.policyIds],
    },
    minibus: {
      ...blueprints.minibus,
      policyIds: [...blueprints.minibus.policyIds],
    },
  }
}
