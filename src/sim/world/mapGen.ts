import { mulberry32 } from '@shared/rng'
import type { MapData, MapSize, TerrainKind, TerrainTile } from '@shared/types'

export function generateMap(seed: number, mapSize: MapSize): MapData {
  const rand = mulberry32(seed)
  const tiles: TerrainTile[] = []

  for (let y = 0; y < mapSize.h; y += 1) {
    for (let x = 0; x < mapSize.w; x += 1) {
      const noise = rand()
      const terrain = pickTerrain(noise)
      tiles.push({
        terrain,
        passable: terrain !== 'water',
      })
    }
  }

  return {
    width: mapSize.w,
    height: mapSize.h,
    tiles,
  }
}

function pickTerrain(noise: number): TerrainKind {
  if (noise < 0.1) {
    return 'water'
  }

  if (noise < 0.3) {
    return 'hill'
  }

  return 'grass'
}
