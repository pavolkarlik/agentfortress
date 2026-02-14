import type { EntityDetails, Position, SimSnapshot } from '@shared/types'

interface InspectorProps {
  snapshot: SimSnapshot | null
  selectedTile: Position | null
  selectedEntityDetails: EntityDetails | null
}

export function Inspector({ snapshot, selectedTile, selectedEntityDetails }: InspectorProps) {
  const selectedRoad =
    snapshot && selectedTile
      ? snapshot.roads.find((road) => road.x === selectedTile.x && road.y === selectedTile.y)
      : null

  const selectedBuilding =
    snapshot && selectedTile
      ? snapshot.buildings.find(
          (building) => building.x === selectedTile.x && building.y === selectedTile.y,
        )
      : null

  return (
    <aside className="panel">
      <h2>Inspector</h2>

      {selectedTile ? (
        <p>
          Tile: <strong>{selectedTile.x}</strong>, <strong>{selectedTile.y}</strong>
        </p>
      ) : (
        <p>Click a tile to inspect.</p>
      )}

      {selectedRoad && <p>Road ID: {selectedRoad.id}</p>}

      {selectedBuilding && (
        <p>
          Building: {selectedBuilding.kind} (upkeep {selectedBuilding.upkeep})
        </p>
      )}

      {selectedEntityDetails ? (
        <>
          <h3>{selectedEntityDetails.label}</h3>
          <p>
            <strong>Doing:</strong> {selectedEntityDetails.doing}
          </p>
          <p>
            <strong>Why:</strong> {selectedEntityDetails.why}
          </p>
          <p>
            <strong>Needs:</strong> {selectedEntityDetails.needs.join(', ')}
          </p>
        </>
      ) : (
        <p>No entity details.</p>
      )}
    </aside>
  )
}
