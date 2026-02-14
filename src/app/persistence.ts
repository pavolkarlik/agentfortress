import { get, set } from 'idb-keyval'
import { blueprintSetSchema } from '@shared/blueprint'
import type { BlueprintSet, SaveBlob } from '@shared/types'

const AUTOSAVE_KEY = 'agentworks:autosave'

export async function saveGameToStorage(blob: SaveBlob): Promise<void> {
  await set(AUTOSAVE_KEY, blob)
}

export async function loadGameFromStorage(): Promise<SaveBlob | null> {
  const blob = await get<SaveBlob>(AUTOSAVE_KEY)
  return blob ?? null
}

export function exportBlueprintSet(blueprints: BlueprintSet): string {
  return JSON.stringify(blueprintSetSchema.parse(blueprints), null, 2)
}

export function importBlueprintSet(raw: string): BlueprintSet {
  const parsed = JSON.parse(raw) as unknown
  return blueprintSetSchema.parse(parsed)
}
