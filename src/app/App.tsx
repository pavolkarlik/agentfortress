import { useEffect, useRef } from 'react'
import { loadGameFromStorage, saveGameToStorage } from '@app/persistence'
import { createSimClient, SimClient } from '@app/simClient'
import { useGameStore } from '@app/store'
import { GameRenderer } from '@render/GameRenderer'
import type { BuildingKind, Position, SimCommand, ToolMode } from '@shared/types'
import { BuildPalette } from '@ui/BuildPalette'
import { BlueprintEditor } from '@ui/BlueprintEditor'
import { Hud } from '@ui/Hud'
import { Inspector } from '@ui/Inspector'
import { SavePanel } from '@ui/SavePanel'
import { WalkthroughPanel } from '@ui/WalkthroughPanel'

const INITIAL_SEED = 133742
const INITIAL_MAP_SIZE = { w: 56, h: 36 }

export function AppShell() {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<GameRenderer | null>(null)

  const snapshot = useGameStore((state) => state.snapshot)
  const toolMode = useGameStore((state) => state.toolMode)
  const overlayMode = useGameStore((state) => state.overlayMode)
  const selectedTile = useGameStore((state) => state.selectedTile)
  const selectedEntityDetails = useGameStore((state) => state.selectedEntityDetails)

  const setToolMode = useGameStore((state) => state.setToolMode)
  const setOverlayMode = useGameStore((state) => state.setOverlayMode)
  const setSelectedTile = useGameStore((state) => state.setSelectedTile)
  const setSelectedEntityId = useGameStore((state) => state.setSelectedEntityId)
  const setSelectedEntityDetails = useGameStore((state) => state.setSelectedEntityDetails)

  const toolModeRef = useRef<ToolMode>(toolMode)
  const snapshotRef = useRef(snapshot)
  const clientRef = useRef<SimClient | null>(null)

  const startNewGame = async (seedMode: 'sameSeed' | 'random'): Promise<void> => {
    const activeClient = clientRef.current
    if (!activeClient) {
      return
    }

    const currentSeed = snapshotRef.current?.seed ?? INITIAL_SEED
    const randomSeed = (Math.floor(Date.now() % 2_147_483_647) || 1) >>> 0
    const nextSeed = seedMode === 'sameSeed' ? currentSeed : randomSeed

    await activeClient.init({ seed: nextSeed, mapSize: INITIAL_MAP_SIZE })
    const freshSnapshot = await activeClient.getSnapshot()

    setSelectedTile(null)
    setSelectedEntityId(null)
    setSelectedEntityDetails(null)
    useGameStore.getState().setToolMode('select')
    useGameStore.getState().setOverlayMode('none')
    useGameStore.getState().setSnapshot(freshSnapshot)
    await saveGameToStorage(await activeClient.save())
  }

  useEffect(() => {
    toolModeRef.current = toolMode
  }, [toolMode])

  useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])

  useEffect(() => {
    let mounted = true
    let autosaveInterval: ReturnType<typeof setInterval> | null = null

    const setup = async () => {
      const simClient = createSimClient()
      await simClient.onSnapshot((nextSnapshot) => {
        useGameStore.getState().setSnapshot(nextSnapshot)
      })
      await simClient.init({ seed: INITIAL_SEED, mapSize: INITIAL_MAP_SIZE })
      const autosave = await loadGameFromStorage()
      if (autosave) {
        await simClient.load(autosave)
      }
      const firstSnapshot = await simClient.getSnapshot()
      useGameStore.getState().setSnapshot(firstSnapshot)
      clientRef.current = simClient

      autosaveInterval = setInterval(async () => {
        const activeClient = clientRef.current
        if (!activeClient) {
          return
        }

        const blob = await activeClient.save()
        await saveGameToStorage(blob)
      }, 60_000)

      if (!viewportRef.current || !mounted) {
        return
      }

      const nextRenderer = new GameRenderer({
        onTileClick: (position) => {
          void handleTileClick(position)
        },
      })

      await nextRenderer.mount(viewportRef.current)
      nextRenderer.render(firstSnapshot, null, useGameStore.getState().overlayMode, null)
      rendererRef.current = nextRenderer
    }

    const handleTileClick = async (position: Position) => {
      const activeTool = toolModeRef.current
      const activeSnapshot = snapshotRef.current
      const activeClient = clientRef.current

      if (!activeClient || !activeSnapshot) {
        return
      }

      if (activeTool === 'select') {
        useGameStore.getState().setSelectedTile(position)

        const selectedBuilding = activeSnapshot.buildings.find(
          (building) => building.x === position.x && building.y === position.y,
        )

        const selectedAgent = activeSnapshot.agents.find(
          (agent) => agent.x === position.x && agent.y === position.y,
        )

        const entityId = selectedAgent?.id ?? selectedBuilding?.id ?? null
        useGameStore.getState().setSelectedEntityId(entityId)

        if (entityId === null) {
          useGameStore.getState().setSelectedEntityDetails(null)
          return
        }

        const details = await activeClient.getEntityDetails(entityId)
        useGameStore.getState().setSelectedEntityDetails(details)
        return
      }

      const command = commandForTool(activeTool, activeSnapshot.tick, position)
      if (!command) {
        return
      }

      await activeClient.enqueueCommands([command])
    }

    void setup()

    return () => {
      mounted = false
      if (autosaveInterval !== null) {
        clearInterval(autosaveInterval)
      }
      rendererRef.current?.destroy()
      clientRef.current?.dispose()
      rendererRef.current = null
      clientRef.current = null
    }
  }, [])

  useEffect(() => {
    if (rendererRef.current && snapshot) {
      rendererRef.current.render(snapshot, selectedTile, overlayMode, selectedEntityDetails)
    }
  }, [overlayMode, selectedEntityDetails, snapshot, selectedTile])

  return (
    <div className="app-shell">
      <Hud snapshot={snapshot} />
      {snapshot?.gameOver ? (
        <div className="game-over-banner">
          <strong>Game Over:</strong> {snapshot.gameOverReason ?? 'Simulation ended'}
          <div className="game-over-actions">
            <button type="button" onClick={() => void startNewGame('sameSeed')}>
              Restart Seed
            </button>
            <button type="button" onClick={() => void startNewGame('random')}>
              New Random Seed
            </button>
          </div>
        </div>
      ) : null}
      <div className="app-body">
        <div className="left-stack">
          <WalkthroughPanel
            snapshot={snapshot}
            selectedTile={selectedTile}
            selectedEntityDetails={selectedEntityDetails}
            overlayMode={overlayMode}
          />
          <BuildPalette
            toolMode={toolMode}
            overlayMode={overlayMode}
            onToolChange={setToolMode}
            onOverlayChange={setOverlayMode}
          />
          <BlueprintEditor
            snapshot={snapshot}
            onApplyBlueprint={async (kind, blueprint) => {
              const activeClient = clientRef.current
              const activeSnapshot = snapshotRef.current
              if (!activeClient || !activeSnapshot) {
                return
              }

              await activeClient.enqueueCommands([
                {
                  type: 'setBlueprint',
                  tickId: activeSnapshot.tick,
                  kind,
                  blueprint,
                },
              ])
            }}
          />
          <SavePanel
            autoExpansionEnabled={snapshot?.autoExpansionEnabled ?? true}
            onSetAutoExpansion={async (enabled) => {
              const activeClient = clientRef.current
              const activeSnapshot = snapshotRef.current
              if (!activeClient || !activeSnapshot) {
                return
              }

              await activeClient.enqueueCommands([
                {
                  type: 'setAutoExpansion',
                  tickId: activeSnapshot.tick,
                  enabled,
                },
              ])
            }}
            onSaveNow={async () => {
              const activeClient = clientRef.current
              if (!activeClient) {
                return
              }

              const blob = await activeClient.save()
              await saveGameToStorage(blob)
            }}
            onLoadAutosave={async () => {
              const activeClient = clientRef.current
              if (!activeClient) {
                return
              }

              const blob = await loadGameFromStorage()
              if (!blob) {
                return
              }

              await activeClient.load(blob)
            }}
            onNewGame={async () => {
              await startNewGame('random')
            }}
          />
        </div>
        <main className="viewport" ref={viewportRef} />
        <Inspector
          snapshot={snapshot}
          selectedTile={selectedTile}
          selectedEntityDetails={selectedEntityDetails}
        />
      </div>
    </div>
  )
}

function commandForTool(toolMode: ToolMode, tickId: number, position: Position): SimCommand | null {
  if (toolMode === 'buildRoad') {
    return {
      type: 'buildRoad',
      tickId,
      x: position.x,
      y: position.y,
    }
  }

  const buildingKind = toBuildingKind(toolMode)
  if (!buildingKind) {
    return null
  }

  return {
    type: 'placeBuilding',
    tickId,
    kind: buildingKind,
    x: position.x,
    y: position.y,
  }
}

function toBuildingKind(toolMode: ToolMode): BuildingKind | null {
  switch (toolMode) {
    case 'placeHousing':
      return 'housing'
    case 'placeMarket':
      return 'market'
    case 'placeWarehouse':
      return 'warehouse'
    case 'placeDepot':
      return 'depot'
    case 'placeFoodSource':
      return 'foodSource'
    case 'placeStop':
      return 'stop'
    default:
      return null
  }
}
