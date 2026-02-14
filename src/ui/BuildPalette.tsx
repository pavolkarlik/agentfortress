import type { OverlayMode, ToolMode } from '@shared/types'

interface BuildPaletteProps {
  toolMode: ToolMode
  overlayMode: OverlayMode
  onToolChange: (toolMode: ToolMode) => void
  onOverlayChange: (overlayMode: OverlayMode) => void
}

const TOOLS: Array<{ mode: ToolMode; label: string }> = [
  { mode: 'select', label: 'Select' },
  { mode: 'buildRoad', label: 'Road' },
  { mode: 'placeHousing', label: 'Housing' },
  { mode: 'placeMarket', label: 'Market' },
  { mode: 'placeWarehouse', label: 'Warehouse' },
  { mode: 'placeDepot', label: 'Depot' },
  { mode: 'placeFoodSource', label: 'Food Source' },
  { mode: 'placeStop', label: 'Stop' },
]

const OVERLAYS: Array<{ mode: OverlayMode; label: string }> = [
  { mode: 'none', label: 'No Overlay' },
  { mode: 'queue', label: 'Queue Heatmap' },
  { mode: 'coverage', label: 'Coverage' },
]

export function BuildPalette({
  toolMode,
  overlayMode,
  onToolChange,
  onOverlayChange,
}: BuildPaletteProps) {
  return (
    <aside className="panel">
      <h2>Build Palette</h2>
      <div className="button-grid">
        {TOOLS.map((tool) => (
          <button
            key={tool.mode}
            className={tool.mode === toolMode ? 'active' : ''}
            onClick={() => onToolChange(tool.mode)}
            type="button"
          >
            {tool.label}
          </button>
        ))}
      </div>
      <h3>Overlays</h3>
      <div className="button-grid">
        {OVERLAYS.map((overlay) => (
          <button
            key={overlay.mode}
            className={overlay.mode === overlayMode ? 'active' : ''}
            onClick={() => onOverlayChange(overlay.mode)}
            type="button"
          >
            {overlay.label}
          </button>
        ))}
      </div>
    </aside>
  )
}
