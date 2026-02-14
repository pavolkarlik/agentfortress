export type EntityId = number

export type TerrainKind = 'grass' | 'hill' | 'water'

export type ToolMode =
  | 'select'
  | 'buildRoad'
  | 'placeHousing'
  | 'placeMarket'
  | 'placeWarehouse'
  | 'placeDepot'
  | 'placeFoodSource'
  | 'placeStop'

export type OverlayMode = 'none' | 'queue' | 'coverage'

export interface MapSize {
  w: number
  h: number
}

export interface TerrainTile {
  terrain: TerrainKind
  passable: boolean
}

export interface MapData {
  width: number
  height: number
  tiles: TerrainTile[]
}

export interface Position {
  x: number
  y: number
}

export type BuildingKind = 'housing' | 'market' | 'warehouse' | 'depot' | 'foodSource' | 'stop'
export type AgentKind = 'citizen' | 'courierBot' | 'minibus'
export type BlueprintAgentKind = 'courierBot' | 'minibus'

export interface PositionComponent {
  x: number
  y: number
}

export interface MovementComponent {
  speed: number
  path: Position[]
}

export interface InventoryComponent {
  food: number
  capacity?: number
}

export interface NeedsComponent {
  hunger: number
  happiness: number
}

export interface WalletComponent {
  money: number
}

export interface BuildingComponent {
  kind: BuildingKind
  footprint: { w: number; h: number }
  upkeep: number
}

export interface RoadComponent {
  kind: 'road'
}

export interface AgentKindComponent {
  kind: AgentKind
}

export interface PolicyComponent {
  policyIds: string[]
}

export interface OwnershipComponent {
  ownerEntityId?: EntityId
}

export interface LineComponent {
  stops: Position[]
  assignedVehicles: EntityId[]
  fare: number
  headwayTarget: number
}

export interface QueueComponent {
  count: number
  capacity?: number
}

export type MaintenanceState = 'operational' | 'toDepot' | 'repairing'

export interface ConditionComponent {
  wear: number
  wearRate: number
  maintenanceThreshold: number
  maintenanceState: MaintenanceState
  assignedDepotId?: EntityId
}

export interface SystemAgentComponent {
  children: EntityId[]
}

export interface DecisionLogComponent {
  lastDecision: string
  lastReason: string
  lastTarget: string
}

export interface AgentBlueprint {
  speed: number
  capacity: number
  wearRate: number
  maintenanceThreshold: number
  policyIds: string[]
}

export interface BlueprintSet {
  courierBot: AgentBlueprint
  minibus: AgentBlueprint
}

export interface RoadSnapshot {
  id: EntityId
  x: number
  y: number
}

export interface BuildingSnapshot {
  id: EntityId
  kind: BuildingKind
  x: number
  y: number
  upkeep: number
  food: number
}

export interface AgentSnapshot {
  id: EntityId
  kind: AgentKind
  x: number
  y: number
  hunger: number
  happiness: number
  lastDecision: string
  lastReason: string
}

export interface StopQueueSnapshot {
  id: EntityId
  x: number
  y: number
  count: number
}

export interface EconomyLedgerEntry {
  day: number
  income: number
  expense: number
  net: number
  moneyAfter: number
}

export interface EconomySummary {
  currentDayIncome: number
  currentDayExpense: number
  lastDayIncome: number
  lastDayExpense: number
  lastDayNet: number
  ledger: EconomyLedgerEntry[]
}

export interface SnapshotMetrics {
  payloadBytes: number
  budgetBytes: number
  overBudget: boolean
}

export interface PolicyRuntimeState {
  activeTicks: number
  cooldownUntilTick: number
}

export interface SimSnapshot {
  tick: number
  seed: number
  money: number
  population: number
  foodStock: number
  avgHappiness: number
  bankruptcyTicks: number
  bankruptcyDaysRemaining: number
  gameOver: boolean
  gameOverReason: string | null
  economy: EconomySummary
  blueprints: BlueprintSet
  snapshotMetrics: SnapshotMetrics
  map: MapData
  roads: RoadSnapshot[]
  buildings: BuildingSnapshot[]
  agents: AgentSnapshot[]
  stopQueues: StopQueueSnapshot[]
}

export interface InitConfig {
  seed: number
  mapSize: MapSize
}

export interface BaseCommand {
  tickId: number
}

export interface BuildRoadCommand extends BaseCommand {
  type: 'buildRoad'
  x: number
  y: number
}

export interface PlaceBuildingCommand extends BaseCommand {
  type: 'placeBuilding'
  kind: BuildingKind
  x: number
  y: number
}

export interface SetBlueprintCommand extends BaseCommand {
  type: 'setBlueprint'
  kind: BlueprintAgentKind
  blueprint: AgentBlueprint
}

export type SimCommand = BuildRoadCommand | PlaceBuildingCommand | SetBlueprintCommand

export type SerializedComponent<T> = Array<[EntityId, T]>

export interface SerializedEcs {
  entities: EntityId[]
  position: SerializedComponent<PositionComponent>
  movement: SerializedComponent<MovementComponent>
  inventory: SerializedComponent<InventoryComponent>
  needs: SerializedComponent<NeedsComponent>
  wallet: SerializedComponent<WalletComponent>
  building: SerializedComponent<BuildingComponent>
  road: SerializedComponent<RoadComponent>
  agentKind: SerializedComponent<AgentKindComponent>
  policy: SerializedComponent<PolicyComponent>
  ownership: SerializedComponent<OwnershipComponent>
  line: SerializedComponent<LineComponent>
  queue: SerializedComponent<QueueComponent>
  condition: SerializedComponent<ConditionComponent>
  systemAgent: SerializedComponent<SystemAgentComponent>
  decisionLog: SerializedComponent<DecisionLogComponent>
}

export interface SaveBlob {
  version: number
  seed: number
  tick: number
  money: number
  bankruptcyTicks: number
  bankruptcyDaysRemaining: number
  gameOver: boolean
  gameOverReason: string | null
  economy: EconomySummary
  blueprints: BlueprintSet
  policyRuntime?: Array<[string, PolicyRuntimeState]>
  map: MapData
  roads: RoadSnapshot[]
  buildings: BuildingSnapshot[]
  agents: AgentSnapshot[]
  ecs?: SerializedEcs
}

export interface EntityDetails {
  entityId: EntityId
  label: string
  doing: string
  why: string
  needs: string[]
  stats: Record<string, number | string>
}

export interface SimWorkerApi {
  init(config: InitConfig): void
  step(untilTick: number): void
  enqueueCommands(cmds: SimCommand[]): void
  getSnapshot(): SimSnapshot
  save(): SaveBlob
  load(blob: SaveBlob): void
  onSnapshot(cb: (snapshot: SimSnapshot) => void): void
  getEntityDetails(entityId: EntityId): EntityDetails | null
}
