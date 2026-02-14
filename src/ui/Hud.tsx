import type { SimSnapshot } from '@shared/types'

interface HudProps {
  snapshot: SimSnapshot | null
}

export function Hud({ snapshot }: HudProps) {
  if (!snapshot) {
    return <header className="hud">Booting simulation...</header>
  }

  return (
    <header className="hud">
      <div className="hud-item">
        <span>Tick</span>
        <strong>{snapshot.tick}</strong>
      </div>
      <div className="hud-item">
        <span>Money</span>
        <strong>${snapshot.money}</strong>
      </div>
      <div className="hud-item">
        <span>Population</span>
        <strong>{snapshot.population}</strong>
      </div>
      <div className="hud-item">
        <span>Food</span>
        <strong>{snapshot.foodStock}</strong>
      </div>
      <div className="hud-item">
        <span>Happiness</span>
        <strong>{Math.round(snapshot.avgHappiness * 100)}%</strong>
      </div>
      <div className="hud-item">
        <span>Status</span>
        <strong>{snapshot.gameOver ? 'Game Over' : 'Running'}</strong>
      </div>
      <div className="hud-item">
        <span>Auto Expand</span>
        <strong>{snapshot.autoExpansionEnabled ? 'On' : 'Off'}</strong>
      </div>
      <div className="hud-item">
        <span>Daily Net</span>
        <strong>${snapshot.economy.lastDayNet}</strong>
      </div>
      <div className="hud-item">
        <span>Bankruptcy</span>
        <strong>
          {snapshot.money < 0
            ? `${snapshot.bankruptcyDaysRemaining} day(s) left`
            : 'Safe'}
        </strong>
      </div>
      <div className="hud-item">
        <span>Snapshot</span>
        <strong>
          {Math.round(snapshot.snapshotMetrics.payloadBytes / 1024)} KB
          {snapshot.snapshotMetrics.overBudget ? ' (Over)' : ''}
        </strong>
      </div>
    </header>
  )
}
