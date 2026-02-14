import { create } from 'zustand'
import type {
  EntityDetails,
  OverlayMode,
  Position,
  SimSnapshot,
  ToolMode,
} from '@shared/types'

interface GameStore {
  snapshot: SimSnapshot | null
  toolMode: ToolMode
  overlayMode: OverlayMode
  selectedTile: Position | null
  selectedEntityId: number | null
  selectedEntityDetails: EntityDetails | null
  setSnapshot: (snapshot: SimSnapshot) => void
  setToolMode: (toolMode: ToolMode) => void
  setOverlayMode: (overlayMode: OverlayMode) => void
  setSelectedTile: (tile: Position | null) => void
  setSelectedEntityId: (entityId: number | null) => void
  setSelectedEntityDetails: (details: EntityDetails | null) => void
}

export const useGameStore = create<GameStore>((set) => ({
  snapshot: null,
  toolMode: 'select',
  overlayMode: 'none',
  selectedTile: null,
  selectedEntityId: null,
  selectedEntityDetails: null,
  setSnapshot: (snapshot) => set({ snapshot }),
  setToolMode: (toolMode) => set({ toolMode }),
  setOverlayMode: (overlayMode) => set({ overlayMode }),
  setSelectedTile: (selectedTile) => set({ selectedTile }),
  setSelectedEntityId: (selectedEntityId) => set({ selectedEntityId }),
  setSelectedEntityDetails: (selectedEntityDetails) => set({ selectedEntityDetails }),
}))
