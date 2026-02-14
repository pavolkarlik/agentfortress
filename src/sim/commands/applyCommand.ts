import {
  BUILDING_BUILD_COST,
  BANKRUPTCY_TICK_LIMIT,
  ROAD_BUILD_COST,
  TICKS_PER_DAY,
} from '@shared/constants'
import { inBounds, tileIndex, tileKey } from '@shared/map'
import type { BuildingKind, SimCommand } from '@shared/types'
import {
  addBuildingEntity,
  addRoadEntity,
  finalizeEconomyDay,
  invalidatePathCache,
  InternalState,
  recordExpense,
  setAutoExpansionEnabled,
  setBlueprint,
} from '@sim/world/state'

export function applyCommand(state: InternalState, command: SimCommand): void {
  if (state.gameOver) {
    return
  }

  if (command.type === 'setBlueprint') {
    setBlueprint(state, command.kind, command.blueprint)
    return
  }

  if (command.type === 'setAutoExpansion') {
    setAutoExpansionEnabled(state, command.enabled)
    return
  }

  if (command.type === 'buildRoad') {
    applyBuildRoad(state, command.x, command.y)
    return
  }

  applyPlaceBuilding(state, command.kind, command.x, command.y)
}

export function applyEconomyTick(state: InternalState): void {
  if (state.tick > 0 && state.tick % TICKS_PER_DAY === 0) {
    finalizeEconomyDay(state)

    const buildingUpkeep = [...state.ecs.building.values()].reduce(
      (sum, building) => sum + building.upkeep,
      0,
    )
    const lineUpkeep = state.ecs.line.size * 4
    const minibusUpkeep =
      [...state.ecs.agentKind.values()].filter((agentKind) => agentKind.kind === 'minibus').length * 3
    const upkeep = buildingUpkeep + lineUpkeep + minibusUpkeep
    recordExpense(state, upkeep)
  }

  if (state.money < 0) {
    state.bankruptcyTicks += 1
    state.bankruptcyDaysRemaining = Math.ceil(
      Math.max(0, BANKRUPTCY_TICK_LIMIT - state.bankruptcyTicks) / TICKS_PER_DAY,
    )
    if (state.bankruptcyTicks >= BANKRUPTCY_TICK_LIMIT) {
      state.gameOver = true
      state.gameOverReason = 'Bankrupt for too long'
      state.bankruptcyDaysRemaining = 0
    }
  } else {
    state.bankruptcyTicks = 0
    state.bankruptcyDaysRemaining = Math.ceil(BANKRUPTCY_TICK_LIMIT / TICKS_PER_DAY)
    state.gameOverReason = null
  }
}

function applyBuildRoad(state: InternalState, x: number, y: number): void {
  if (!canBuildAtTile(state, x, y)) {
    return
  }

  if (state.money < ROAD_BUILD_COST) {
    return
  }

  const key = tileKey(x, y)
  if (state.roadEntityByTile.has(key)) {
    return
  }
  if (state.buildingEntityByTile.has(key)) {
    return
  }

  recordExpense(state, ROAD_BUILD_COST)

  addRoadEntity(state, x, y)
  invalidatePathCache(state)
}

function applyPlaceBuilding(state: InternalState, kind: BuildingKind, x: number, y: number): void {
  if (!canBuildAtTile(state, x, y)) {
    return
  }

  const cost = BUILDING_BUILD_COST[kind]
  if (state.money < cost) {
    return
  }

  const key = tileKey(x, y)
  if (state.buildingEntityByTile.has(key) || state.roadEntityByTile.has(key)) {
    return
  }

  recordExpense(state, cost)

  addBuildingEntity(state, kind, x, y, undefined, kind === 'foodSource' ? 20 : 0)
}

function canBuildAtTile(state: InternalState, x: number, y: number): boolean {
  if (!inBounds(state.map, x, y)) {
    return false
  }

  const tile = state.map.tiles[tileIndex(state.map, x, y)]
  return tile.passable
}
