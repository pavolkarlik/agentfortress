interface SavePanelProps {
  onSaveNow: () => Promise<void>
  onLoadAutosave: () => Promise<void>
}

export function SavePanel({ onSaveNow, onLoadAutosave }: SavePanelProps) {
  return (
    <aside className="panel">
      <h2>Save / Load</h2>
      <button type="button" onClick={() => void onSaveNow()}>
        Save Now
      </button>
      <button type="button" onClick={() => void onLoadAutosave()}>
        Load Autosave
      </button>
      <p>Autosave runs every 60 seconds.</p>
    </aside>
  )
}
