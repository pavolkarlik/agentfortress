import { useEffect, useMemo, useState } from 'react'
import type { EntityDetails, OverlayMode, Position, SimSnapshot } from '@shared/types'
import {
  buildContextTips,
  computeWalkthroughSteps,
  createWalkthroughBaseline,
  nextWalkthroughStep,
  type WalkthroughBaseline,
} from '@ui/walkthrough'

interface WalkthroughPanelProps {
  snapshot: SimSnapshot | null
  selectedTile: Position | null
  selectedEntityDetails: EntityDetails | null
  overlayMode: OverlayMode
}

const DISMISS_KEY = 'agentworks:walkthrough:dismissed'

export function WalkthroughPanel({
  snapshot,
  selectedTile,
  selectedEntityDetails,
  overlayMode,
}: WalkthroughPanelProps) {
  const [dismissed, setDismissed] = useState<boolean>(() => readDismissedState())
  const [baseline, setBaseline] = useState<WalkthroughBaseline | null>(null)
  const [baselineSeed, setBaselineSeed] = useState<number | null>(null)
  const [baselineTick, setBaselineTick] = useState<number | null>(null)

  useEffect(() => {
    if (!snapshot) {
      return
    }

    const shouldResetBaseline =
      baseline === null ||
      baselineSeed !== snapshot.seed ||
      (baselineTick !== null && snapshot.tick < baselineTick)

    if (shouldResetBaseline) {
      setBaseline(createWalkthroughBaseline(snapshot))
      setBaselineSeed(snapshot.seed)
      setBaselineTick(snapshot.tick)
    }
  }, [baseline, baselineSeed, baselineTick, snapshot])

  const steps = useMemo(() => {
    if (!snapshot || !baseline) {
      return []
    }

    return computeWalkthroughSteps(snapshot, baseline, {
      selectedTile: selectedTile !== null,
      hasInspectorDetails: selectedEntityDetails !== null,
      overlayMode,
    })
  }, [baseline, overlayMode, selectedEntityDetails, selectedTile, snapshot])

  const nextStep = nextWalkthroughStep(steps)
  const completedSteps = steps.filter((step) => step.done).length
  const totalSteps = steps.length
  const tips = snapshot ? buildContextTips(snapshot) : []

  const dismissGuide = () => {
    setDismissed(true)
    writeDismissedState(true)
  }

  const showGuide = () => {
    setDismissed(false)
    writeDismissedState(false)
  }

  const resetProgress = () => {
    if (!snapshot) {
      return
    }

    setBaseline(createWalkthroughBaseline(snapshot))
    setBaselineSeed(snapshot.seed)
    setBaselineTick(snapshot.tick)
    setDismissed(false)
    writeDismissedState(false)
  }

  if (!snapshot) {
    return null
  }

  if (dismissed) {
    return (
      <aside className="panel walkthrough-panel">
        <h2>Walkthrough</h2>
        <p>Guide is hidden.</p>
        <div className="walkthrough-actions">
          <button type="button" onClick={showGuide}>
            Show Guide
          </button>
          <button type="button" onClick={resetProgress}>
            Reset Progress
          </button>
        </div>
      </aside>
    )
  }

  return (
    <aside className="panel walkthrough-panel">
      <h2>Walkthrough</h2>
      <p>
        Progress: {completedSteps}/{totalSteps}
      </p>
      <p>
        <strong>Next:</strong> {nextStep ? nextStep.label : 'All onboarding steps complete.'}
      </p>

      <ul className="walkthrough-list">
        {steps.map((step) => (
          <li key={step.id} className={step.done ? 'done' : ''}>
            {step.done ? '[x]' : '[ ]'} {step.label}
          </li>
        ))}
      </ul>

      <h3>Tips</h3>
      <ul className="walkthrough-list">
        {tips.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>

      <div className="walkthrough-actions">
        <button type="button" onClick={dismissGuide}>
          Dismiss
        </button>
        <button type="button" onClick={resetProgress}>
          Reset Progress
        </button>
      </div>
    </aside>
  )
}

function readDismissedState(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(DISMISS_KEY) === '1'
}

function writeDismissedState(value: boolean): void {
  if (typeof window === 'undefined') {
    return
  }

  if (value) {
    window.localStorage.setItem(DISMISS_KEY, '1')
    return
  }

  window.localStorage.removeItem(DISMISS_KEY)
}
