import { inBounds, tileIndex, tileKey } from '@shared/map'
import type { Position } from '@shared/types'
import type { InternalState } from '@sim/world/state'

const CARDINAL_DIRECTIONS: ReadonlyArray<Position> = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
]

export function getPathCached(
  state: InternalState,
  start: Position,
  goal: Position,
): Position[] | null {
  const cacheKey = `${state.pathCacheRevision}:${start.x},${start.y}->${goal.x},${goal.y}`
  const cached = state.pathCache.get(cacheKey)
  if (cached) {
    return cached.map(copyPosition)
  }

  const path = findPathAStar(state, start, goal)
  if (!path) {
    return null
  }

  state.pathCache.set(cacheKey, path.map(copyPosition))
  return path
}

export function findPathAStar(
  state: InternalState,
  start: Position,
  goal: Position,
): Position[] | null {
  if (!isTraversable(state, start.x, start.y, start, goal)) {
    return null
  }

  if (!isTraversable(state, goal.x, goal.y, start, goal)) {
    return null
  }

  const startKey = tileKey(start.x, start.y)
  const goalKey = tileKey(goal.x, goal.y)

  const openKeys = new Set<string>([startKey])
  const openQueue: Position[] = [copyPosition(start)]
  const cameFrom = new Map<string, string>()

  const gScore = new Map<string, number>()
  gScore.set(startKey, 0)

  const fScore = new Map<string, number>()
  fScore.set(startKey, heuristic(start, goal))

  while (openQueue.length > 0) {
    const currentIndex = lowestScoreIndex(openQueue, fScore)
    const [current] = openQueue.splice(currentIndex, 1)
    const currentKey = tileKey(current.x, current.y)

    if (currentKey === goalKey) {
      return reconstructPath(cameFrom, current)
    }

    openKeys.delete(currentKey)

    const currentGScore = gScore.get(currentKey) ?? Number.POSITIVE_INFINITY

    for (const direction of CARDINAL_DIRECTIONS) {
      const next: Position = {
        x: current.x + direction.x,
        y: current.y + direction.y,
      }

      if (!isTraversable(state, next.x, next.y, start, goal)) {
        continue
      }

      const nextKey = tileKey(next.x, next.y)
      const tentativeGScore = currentGScore + 1

      if (tentativeGScore >= (gScore.get(nextKey) ?? Number.POSITIVE_INFINITY)) {
        continue
      }

      cameFrom.set(nextKey, currentKey)
      gScore.set(nextKey, tentativeGScore)
      fScore.set(nextKey, tentativeGScore + heuristic(next, goal))

      if (!openKeys.has(nextKey)) {
        openQueue.push(next)
        openKeys.add(nextKey)
      }
    }
  }

  return null
}

function reconstructPath(cameFrom: Map<string, string>, current: Position): Position[] {
  const result: Position[] = [copyPosition(current)]
  let currentKey = tileKey(current.x, current.y)

  while (cameFrom.has(currentKey)) {
    const previousKey = cameFrom.get(currentKey)
    if (!previousKey) {
      break
    }

    const [x, y] = previousKey.split(',').map(Number)
    result.push({ x, y })
    currentKey = previousKey
  }

  result.reverse()
  return result
}

function lowestScoreIndex(openQueue: Position[], fScore: Map<string, number>): number {
  let bestIndex = 0
  let bestScore = Number.POSITIVE_INFINITY

  for (let i = 0; i < openQueue.length; i += 1) {
    const candidate = openQueue[i]
    const score = fScore.get(tileKey(candidate.x, candidate.y)) ?? Number.POSITIVE_INFINITY
    if (score < bestScore) {
      bestScore = score
      bestIndex = i
    }
  }

  return bestIndex
}

function heuristic(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

function isTraversable(
  state: InternalState,
  x: number,
  y: number,
  start: Position,
  goal: Position,
): boolean {
  if (!inBounds(state.map, x, y)) {
    return false
  }

  const tile = state.map.tiles[tileIndex(state.map, x, y)]
  if (!tile.passable) {
    return false
  }

  if ((x === start.x && y === start.y) || (x === goal.x && y === goal.y)) {
    return true
  }

  return state.roadEntityByTile.has(tileKey(x, y))
}

function copyPosition(position: Position): Position {
  return { x: position.x, y: position.y }
}
