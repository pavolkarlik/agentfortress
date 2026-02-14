import { BUILDING_BUILD_COST, ROAD_BUILD_COST } from '@shared/constants'
import { inBounds, tileIndex, tileKey } from '@shared/map'
import type { BuildingKind, EntityId, Position } from '@shared/types'
import {
  addBuildingEntity,
  addCitizenEntity,
  addCourierEntity,
  addRoadEntity,
  invalidatePathCache,
  recordExpense,
  type InternalState,
} from '@sim/world/state'

const EXPANSION_INTERVAL_TICKS = 160
const MIN_EXPANSION_RESERVE = 220
const ROAD_BUILD_BUDGET_PER_CYCLE = 10
const POPULATION_PER_HOUSING = 6
const MAX_POPULATION_TARGET = 80
const MAX_COURIER_TARGET = 8
const CITIZEN_RECRUIT_COST = 8
const COURIER_PROCUREMENT_COST = 90

export function runExpansionSystem(state: InternalState): void {
  if (!state.autoExpansionEnabled) {
    return
  }

  if (state.tick % EXPANSION_INTERVAL_TICKS !== 0) {
    return
  }

  const buildingKindCount = countBuildingsByKind(state)

  ensureEssentialBuildings(state, buildingKindCount)
  ensureTransitStops(state)

  const market = firstBuildingPosition(state, 'market')
  const housing = firstBuildingPosition(state, 'housing')
  const warehouse = firstBuildingPosition(state, 'warehouse')
  const foodSource = firstBuildingPosition(state, 'foodSource')
  const depot = firstBuildingPosition(state, 'depot')
  const stops = buildingPositions(state, 'stop')

  let roadBudget = ROAD_BUILD_BUDGET_PER_CYCLE
  roadBudget = connectBuildings(state, roadBudget, housing, market)
  roadBudget = connectBuildings(state, roadBudget, market, warehouse)
  roadBudget = connectBuildings(state, roadBudget, warehouse, foodSource)
  roadBudget = connectBuildings(state, roadBudget, market, depot)
  for (const stop of stops) {
    roadBudget = connectBuildings(state, roadBudget, stop, market)
    if (roadBudget <= 0) {
      break
    }
  }

  const citizenCount = countAgents(state, 'citizen')
  const courierCount = countAgents(state, 'courierBot')
  const housingCount = buildingKindCount.housing
  const marketFood = totalFoodAtBuildings(state, 'market')
  const targetPopulation = Math.min(MAX_POPULATION_TARGET, Math.max(8, housingCount * POPULATION_PER_HOUSING))

  if (
    citizenCount >= targetPopulation - 1 &&
    canAffordExpansion(state, BUILDING_BUILD_COST.housing)
  ) {
    const anchor = housing ?? market ?? mapCenter(state)
    const nextHousingTile = findBuildableTileNear(state, anchor, 8)
    if (nextHousingTile) {
      placeBuildingWithCost(state, 'housing', nextHousingTile)
    }
  }

  if (citizenCount < targetPopulation && canAffordExpansion(state, CITIZEN_RECRUIT_COST)) {
    const spawnTile = findAgentSpawnTile(state, housing ?? market ?? mapCenter(state))
    addCitizenEntity(state, spawnTile.x, spawnTile.y)
    recordExpense(state, CITIZEN_RECRUIT_COST)
  }

  const targetCouriers = Math.min(
    MAX_COURIER_TARGET,
    Math.max(
      1,
      Math.ceil(citizenCount / 8) + (marketFood < 18 ? 1 : 0),
    ),
  )
  if (courierCount < targetCouriers && canAffordExpansion(state, COURIER_PROCUREMENT_COST)) {
    const spawnTile = findAgentSpawnTile(state, depot ?? warehouse ?? market ?? mapCenter(state))
    addCourierEntity(state, spawnTile.x, spawnTile.y)
    recordExpense(state, COURIER_PROCUREMENT_COST)
  }
}

function ensureEssentialBuildings(
  state: InternalState,
  counts: Record<BuildingKind, number>,
): void {
  const essentials: BuildingKind[] = ['market', 'housing', 'warehouse', 'foodSource', 'depot']
  const center = mapCenter(state)

  for (const kind of essentials) {
    if (counts[kind] > 0) {
      continue
    }

    const tile = findBuildableTileNear(state, center, 10)
    if (!tile) {
      continue
    }

    if (!placeBuildingWithCost(state, kind, tile)) {
      return
    }
  }
}

function ensureTransitStops(state: InternalState): void {
  const stopCount = buildingCount(state, 'stop')
  if (stopCount >= 2) {
    return
  }

  const housing = firstBuildingPosition(state, 'housing')
  const market = firstBuildingPosition(state, 'market')
  if (!housing || !market) {
    return
  }

  const stopTargets: Position[] = [housing, market]

  for (const anchor of stopTargets) {
    if (buildingCount(state, 'stop') >= 2) {
      return
    }

    const tile = findBuildableTileNear(state, anchor, 4)
    if (!tile) {
      continue
    }

    if (!placeBuildingWithCost(state, 'stop', tile)) {
      return
    }
  }
}

function connectBuildings(
  state: InternalState,
  roadBudget: number,
  from: Position | null,
  to: Position | null,
): number {
  if (!from || !to || roadBudget <= 0) {
    return roadBudget
  }

  const start = findRoadAccessPoint(state, from)
  const goal = findRoadAccessPoint(state, to)
  if (!start || !goal) {
    return roadBudget
  }

  const path = findWalkPathAvoidingBuildings(state, start, goal)
  if (!path || path.length <= 1) {
    return roadBudget
  }

  let placedRoad = false
  for (const point of path) {
    if (roadBudget <= 0) {
      break
    }
    if (!canPlaceRoad(state, point.x, point.y)) {
      continue
    }
    if (!canAffordExpansion(state, ROAD_BUILD_COST)) {
      break
    }

    addRoadEntity(state, point.x, point.y)
    recordExpense(state, ROAD_BUILD_COST)
    roadBudget -= 1
    placedRoad = true
  }

  if (placedRoad) {
    invalidatePathCache(state)
  }

  return roadBudget
}

function findRoadAccessPoint(state: InternalState, origin: Position): Position | null {
  const neighbors: Position[] = [
    { x: origin.x, y: origin.y - 1 },
    { x: origin.x + 1, y: origin.y },
    { x: origin.x, y: origin.y + 1 },
    { x: origin.x - 1, y: origin.y },
  ]

  for (const candidate of neighbors) {
    if (!isPassableTile(state, candidate.x, candidate.y)) {
      continue
    }
    if (state.roadEntityByTile.has(tileKey(candidate.x, candidate.y))) {
      return candidate
    }
  }

  for (const candidate of neighbors) {
    if (!canPlaceRoad(state, candidate.x, candidate.y)) {
      continue
    }
    return candidate
  }

  return null
}

function findWalkPathAvoidingBuildings(
  state: InternalState,
  start: Position,
  goal: Position,
): Position[] | null {
  const startKey = tileKey(start.x, start.y)
  const goalKey = tileKey(goal.x, goal.y)

  const queue: Position[] = [{ x: start.x, y: start.y }]
  const visited = new Set<string>([startKey])
  const cameFrom = new Map<string, string>()
  const directions: Position[] = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) {
      break
    }

    const currentKey = tileKey(current.x, current.y)
    if (currentKey === goalKey) {
      return reconstructPath(cameFrom, current)
    }

    for (const direction of directions) {
      const next = { x: current.x + direction.x, y: current.y + direction.y }
      if (!inBounds(state.map, next.x, next.y)) {
        continue
      }
      const nextKey = tileKey(next.x, next.y)
      if (visited.has(nextKey)) {
        continue
      }
      if (!isPassableTile(state, next.x, next.y)) {
        continue
      }
      if (state.buildingEntityByTile.has(nextKey) && nextKey !== goalKey) {
        continue
      }

      visited.add(nextKey)
      cameFrom.set(nextKey, currentKey)
      queue.push(next)
    }
  }

  return null
}

function reconstructPath(cameFrom: Map<string, string>, current: Position): Position[] {
  const result: Position[] = [{ x: current.x, y: current.y }]
  let cursor = tileKey(current.x, current.y)

  while (cameFrom.has(cursor)) {
    const previous = cameFrom.get(cursor)
    if (!previous) {
      break
    }

    const [x, y] = previous.split(',').map(Number)
    result.push({ x, y })
    cursor = previous
  }

  result.reverse()
  return result
}

function placeBuildingWithCost(
  state: InternalState,
  kind: BuildingKind,
  position: Position,
): boolean {
  const cost = BUILDING_BUILD_COST[kind]
  if (!canAffordExpansion(state, cost)) {
    return false
  }

  if (!canPlaceBuilding(state, position.x, position.y)) {
    return false
  }

  addBuildingEntity(state, kind, position.x, position.y, undefined, kind === 'foodSource' ? 20 : 0)
  recordExpense(state, cost)
  return true
}

function findBuildableTileNear(
  state: InternalState,
  origin: Position,
  maxRadius: number,
): Position | null {
  for (let radius = 0; radius <= maxRadius; radius += 1) {
    const minY = origin.y - radius
    const maxY = origin.y + radius
    const minX = origin.x - radius
    const maxX = origin.x + radius

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const onPerimeter =
          radius === 0 ||
          y === minY ||
          y === maxY ||
          x === minX ||
          x === maxX
        if (!onPerimeter) {
          continue
        }

        if (canPlaceBuilding(state, x, y)) {
          return { x, y }
        }
      }
    }
  }

  return null
}

function findAgentSpawnTile(state: InternalState, anchor: Position): Position {
  const tile = findBuildableTileNear(state, anchor, 3)
  if (tile) {
    return tile
  }

  return anchor
}

function canPlaceBuilding(state: InternalState, x: number, y: number): boolean {
  if (!isPassableTile(state, x, y)) {
    return false
  }

  const key = tileKey(x, y)
  return !state.buildingEntityByTile.has(key) && !state.roadEntityByTile.has(key)
}

function canPlaceRoad(state: InternalState, x: number, y: number): boolean {
  if (!isPassableTile(state, x, y)) {
    return false
  }

  const key = tileKey(x, y)
  return !state.roadEntityByTile.has(key) && !state.buildingEntityByTile.has(key)
}

function isPassableTile(state: InternalState, x: number, y: number): boolean {
  if (!inBounds(state.map, x, y)) {
    return false
  }

  return state.map.tiles[tileIndex(state.map, x, y)].passable
}

function canAffordExpansion(state: InternalState, cost: number): boolean {
  return state.money >= cost + MIN_EXPANSION_RESERVE
}

function mapCenter(state: InternalState): Position {
  return {
    x: Math.floor(state.map.width / 2),
    y: Math.floor(state.map.height / 2),
  }
}

function buildingCount(state: InternalState, kind: BuildingKind): number {
  let count = 0
  for (const building of state.ecs.building.values()) {
    if (building.kind === kind) {
      count += 1
    }
  }
  return count
}

function countBuildingsByKind(state: InternalState): Record<BuildingKind, number> {
  return {
    housing: buildingCount(state, 'housing'),
    market: buildingCount(state, 'market'),
    warehouse: buildingCount(state, 'warehouse'),
    depot: buildingCount(state, 'depot'),
    foodSource: buildingCount(state, 'foodSource'),
    stop: buildingCount(state, 'stop'),
  }
}

function firstBuildingPosition(
  state: InternalState,
  kind: BuildingKind,
): Position | null {
  const entityId = firstBuildingId(state, kind)
  if (entityId === null) {
    return null
  }

  const position = state.ecs.position.get(entityId)
  if (!position) {
    return null
  }

  return { x: position.x, y: position.y }
}

function buildingPositions(state: InternalState, kind: BuildingKind): Position[] {
  const ids = [...state.ecs.building.entries()]
    .filter(([, building]) => building.kind === kind)
    .map(([entityId]) => entityId)
    .sort((a, b) => a - b)

  const result: Position[] = []
  for (const id of ids) {
    const position = state.ecs.position.get(id)
    if (position) {
      result.push({ x: position.x, y: position.y })
    }
  }
  return result
}

function firstBuildingId(state: InternalState, kind: BuildingKind): EntityId | null {
  for (const [entityId, building] of [...state.ecs.building.entries()].sort((a, b) => a[0] - b[0])) {
    if (building.kind === kind) {
      return entityId
    }
  }
  return null
}

function countAgents(state: InternalState, kind: 'citizen' | 'courierBot'): number {
  let count = 0
  for (const agent of state.ecs.agentKind.values()) {
    if (agent.kind === kind) {
      count += 1
    }
  }
  return count
}

function totalFoodAtBuildings(
  state: InternalState,
  kind: BuildingKind,
): number {
  let total = 0
  for (const [entityId, building] of state.ecs.building.entries()) {
    if (building.kind !== kind) {
      continue
    }
    total += state.ecs.inventory.get(entityId)?.food ?? 0
  }
  return total
}
