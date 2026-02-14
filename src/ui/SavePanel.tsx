interface SavePanelProps {
  autoExpansionEnabled: boolean
  onSetAutoExpansion: (enabled: boolean) => Promise<void>
  onSaveNow: () => Promise<void>
  onLoadAutosave: () => Promise<void>
  onNewGame: () => Promise<void>
}

export function SavePanel({
  autoExpansionEnabled,
  onSetAutoExpansion,
  onSaveNow,
  onLoadAutosave,
  onNewGame,
}: SavePanelProps) {
  return (
    <aside className="panel">
      <h2>Save / Load</h2>
      <div className="toggle-row">
        <span>Auto Expand</span>
        <div className="inline-buttons">
          <button
            type="button"
            className={autoExpansionEnabled ? 'active' : ''}
            onClick={() => void onSetAutoExpansion(true)}
          >
            On
          </button>
          <button
            type="button"
            className={!autoExpansionEnabled ? 'active' : ''}
            onClick={() => void onSetAutoExpansion(false)}
          >
            Off
          </button>
        </div>
      </div>
      <button type="button" onClick={() => void onSaveNow()}>
        Save Now
      </button>
      <button type="button" onClick={() => void onLoadAutosave()}>
        Load Autosave
      </button>
      <button type="button" onClick={() => void onNewGame()}>
        New Game
      </button>
      <p>Autosave runs every 60 seconds.</p>
    </aside>
  )
}
