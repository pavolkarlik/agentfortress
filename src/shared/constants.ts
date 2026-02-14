export const TICKS_PER_SECOND = 20
export const MS_PER_TICK = 1000 / TICKS_PER_SECOND

export const SNAPSHOTS_PER_SECOND = 6
export const SNAPSHOT_INTERVAL_MS = 1000 / SNAPSHOTS_PER_SECOND
export const SNAPSHOT_BUDGET_BYTES = 180_000

export const TICKS_PER_DAY = TICKS_PER_SECOND * 60
export const BANKRUPTCY_DAYS_LIMIT = 3
export const BANKRUPTCY_TICK_LIMIT = TICKS_PER_DAY * BANKRUPTCY_DAYS_LIMIT

export const ROAD_BUILD_COST = 5

export const BUILDING_BUILD_COST: Record<string, number> = {
  housing: 80,
  market: 140,
  warehouse: 120,
  depot: 160,
  foodSource: 100,
  stop: 20,
}

export const BUILDING_UPKEEP: Record<string, number> = {
  housing: 1,
  market: 3,
  warehouse: 2,
  depot: 2,
  foodSource: 1,
  stop: 1,
}
