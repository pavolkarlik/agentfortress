import type { OverlayMode, SimSnapshot } from '@shared/types'

export interface WalkthroughBaseline {
  roads: number
  stops: number
}

export interface WalkthroughContext {
  selectedTile: boolean
  hasInspectorDetails: boolean
  overlayMode: OverlayMode
}

export interface WalkthroughStep {
  id: string
  label: string
  done: boolean
}

export function createWalkthroughBaseline(snapshot: SimSnapshot): WalkthroughBaseline {
  return {
    roads: snapshot.roads.length,
    stops: countStops(snapshot),
  }
}

export function computeWalkthroughSteps(
  snapshot: SimSnapshot,
  baseline: WalkthroughBaseline,
  context: WalkthroughContext,
): WalkthroughStep[] {
  const stopCount = countStops(snapshot)

  return [
    {
      id: 'select_tile',
      label: 'Select a tile on the map',
      done: context.selectedTile,
    },
    {
      id: 'build_road',
      label: 'Build at least one new road',
      done: snapshot.roads.length > baseline.roads,
    },
    {
      id: 'place_stop',
      label: 'Place a bus stop',
      done: stopCount > baseline.stops,
    },
    {
      id: 'overlay',
      label: 'Turn on any overlay',
      done: context.overlayMode !== 'none',
    },
    {
      id: 'inspector',
      label: 'Inspect an entity to see why it acts',
      done: context.hasInspectorDetails,
    },
    {
      id: 'queues',
      label: 'Watch queues form at stops/market',
      done: snapshot.stopQueues.some((queue) => queue.count > 0),
    },
  ]
}

export function nextWalkthroughStep(steps: WalkthroughStep[]): WalkthroughStep | null {
  return steps.find((step) => !step.done) ?? null
}

export function buildContextTips(snapshot: SimSnapshot): string[] {
  const tips: string[] = [
    'Tip: use mouse wheel to zoom, and middle mouse or Space+drag to pan.',
  ]

  if (snapshot.money < 100 && !snapshot.gameOver) {
    tips.push('Low cash: reduce expansion and stabilize fares/food flow before building more.')
  }

  const maxQueue = snapshot.stopQueues.reduce((max, item) => Math.max(max, item.count), 0)
  if (maxQueue >= 15) {
    tips.push('High queue pressure: add stops/roads and let line auto-scale spawn extra buses.')
  }

  if (snapshot.snapshotMetrics.overBudget) {
    tips.push('Snapshot payload is over budget: reduce clutter and avoid excessive entities while debugging.')
  }

  if (snapshot.gameOver) {
    tips.push('Game over reached. Load autosave or start new seed and protect cash runway.')
  }

  return tips
}

function countStops(snapshot: SimSnapshot): number {
  return snapshot.buildings.filter((building) => building.kind === 'stop').length
}
