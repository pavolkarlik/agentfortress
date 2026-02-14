import type { MapData, Position } from '@shared/types'

export function tileIndex(map: MapData, x: number, y: number): number {
  return y * map.width + x
}

export function inBounds(map: MapData, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height
}

export function tileKey(x: number, y: number): string {
  return `${x},${y}`
}

export function positionEquals(a: Position | null, b: Position | null): boolean {
  if (!a || !b) {
    return false
  }

  return a.x === b.x && a.y === b.y
}
