import { inBounds, tileIndex, tileKey } from '@shared/map'
import type { EntityId, Position } from '@shared/types'
import { getPathCached } from '@sim/path/aStar'
import type { InternalState } from '@sim/world/state'

const TICKS_PER_MOVE = 4

const CARDINAL_DIRECTIONS: ReadonlyArray<Position> = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
]

export function runMovementSystem(state: InternalState): void {
  const marketPosition = findBuildingPosition(state, 'market')
  const housingPosition = findBuildingPosition(state, 'housing')
  const stopPositions = findBuildingPositions(state, 'stop')
  const stopTileSet = new Set(stopPositions.map((position) => tileKey(position.x, position.y)))

  if (!marketPosition || !housingPosition) {
    return
  }

  for (const entityId of sortedAgentIds(state)) {
    const kind = state.ecs.agentKind.get(entityId)
    if (!kind || kind.kind !== 'citizen') {
      continue
    }

    const position = state.ecs.position.get(entityId)
    const needs = state.ecs.needs.get(entityId)
    const decision = state.ecs.decisionLog.get(entityId)
    if (!position || !needs || !decision) {
      continue
    }

    const primaryTarget = needs.hunger > 0.65 ? marketPosition : housingPosition
    const primaryLabel = needs.hunger > 0.65 ? 'market' : 'housing'

    const routing = chooseRoutingTarget(position, primaryTarget, primaryLabel, stopPositions, stopTileSet, needs.hunger)

    if (position.x === routing.target.x && position.y === routing.target.y) {
      continue
    }

    const movement = state.ecs.movement.get(entityId) ?? { speed: 1, path: [] }
    state.ecs.movement.set(entityId, movement)

    if (movement.path.length === 0) {
      const roadPath = getPathCached(state, position, routing.target)
      if (roadPath && roadPath.length > 1) {
        movement.path = roadPath.slice(1)
        decision.lastDecision = 'travel'
        decision.lastReason = `Following road path toward ${routing.label}`
        decision.lastTarget = routing.label
      } else {
        const walkPath = findWalkPath(state, position, routing.target)
        if (walkPath && walkPath.length > 1) {
          movement.path = walkPath.slice(1)
          decision.lastDecision = 'travel'
          decision.lastReason = `Road unavailable, walking toward ${routing.label}`
          decision.lastTarget = routing.label
        } else {
          decision.lastDecision = 'wait'
          decision.lastReason = `No route to ${routing.label}`
          decision.lastTarget = routing.label
        }
      }
      continue
    }

    if (state.tick % TICKS_PER_MOVE !== 0) {
      continue
    }

    const nextWaypoint = movement.path.shift()
    if (!nextWaypoint) {
      continue
    }

    position.x = nextWaypoint.x
    position.y = nextWaypoint.y

    if (movement.path.length === 0) {
      decision.lastDecision = 'arrive'
      decision.lastReason = `Reached ${routing.label}`
      decision.lastTarget = routing.label
    }
  }
}

function chooseRoutingTarget(
  position: Position,
  primaryTarget: Position,
  primaryLabel: 'market' | 'housing',
  stopPositions: Position[],
  stopTileSet: Set<string>,
  hunger: number,
): { target: Position; label: 'market' | 'housing' | 'stop' } {
  const standingOnStop = stopTileSet.has(tileKey(position.x, position.y))
  if (!standingOnStop && primaryLabel === 'market' && hunger > 0.7 && stopPositions.length > 0) {
    const nearestStop = nearestPosition(position, stopPositions)
    if (nearestStop && manhattan(position, nearestStop) + 1 < manhattan(position, primaryTarget)) {
      return {
        target: nearestStop,
        label: 'stop',
      }
    }
  }

  return {
    target: primaryTarget,
    label: primaryLabel,
  }
}

function findWalkPath(state: InternalState, start: Position, goal: Position): Position[] | null {
  const startKey = tileKey(start.x, start.y)
  const goalKey = tileKey(goal.x, goal.y)

  const queue: Position[] = [{ x: start.x, y: start.y }]
  const visited = new Set<string>([startKey])
  const cameFrom = new Map<string, string>()

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) {
      break
    }

    const currentKey = tileKey(current.x, current.y)
    if (currentKey === goalKey) {
      return reconstructPath(cameFrom, current)
    }

    for (const dir of CARDINAL_DIRECTIONS) {
      const next = { x: current.x + dir.x, y: current.y + dir.y }
      if (!isWalkable(state, next.x, next.y)) {
        continue
      }

      const nextKey = tileKey(next.x, next.y)
      if (visited.has(nextKey)) {
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

function isWalkable(state: InternalState, x: number, y: number): boolean {
  if (!inBounds(state.map, x, y)) {
    return false
  }

  return state.map.tiles[tileIndex(state.map, x, y)].passable
}

function findBuildingPosition(
  state: InternalState,
  kind: 'housing' | 'market',
): Position | null {
  return findBuildingPositions(state, kind)[0] ?? null
}

function findBuildingPositions(
  state: InternalState,
  kind: 'housing' | 'market' | 'stop',
): Position[] {
  return [...state.ecs.building.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, building]) => building.kind === kind)
    .map(([entityId]) => {
      const position = state.ecs.position.get(entityId)
      return position ? { x: position.x, y: position.y } : null
    })
    .filter((position): position is Position => position !== null)
}

function nearestPosition(origin: Position, candidates: Position[]): Position | null {
  let chosen: Position | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (const candidate of candidates) {
    const distance = manhattan(origin, candidate)
    if (distance < bestDistance) {
      bestDistance = distance
      chosen = candidate
    }
  }

  return chosen
}

function manhattan(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

function sortedAgentIds(state: InternalState): EntityId[] {
  return [...state.ecs.agentKind.keys()].sort((a, b) => a - b)
}
