import { Application, Container, Graphics, Text } from 'pixi.js'
import { clamp } from '@shared/rng'
import type { EntityDetails, OverlayMode, Position, SimSnapshot } from '@shared/types'

interface CameraState {
  x: number
  y: number
  zoom: number
}

interface RendererOptions {
  tileSize?: number
  onTileClick: (position: Position) => void
}

interface AgentActionBubbleState {
  text: string
  expiresTick: number
}

interface BubblePalette {
  background: number
  border: number
  text: number
}

const ACTION_BUBBLE_LIFETIME_TICKS = 80
const MAX_VISIBLE_AGENT_ACTION_BUBBLES = 18
const SELECTION_BUBBLE_PALETTE: BubblePalette = {
  background: 0x111827,
  border: 0xfbbf24,
  text: 0xf8fafc,
}
const ACTION_BUBBLE_PALETTE: BubblePalette = {
  background: 0x0f172a,
  border: 0x60a5fa,
  text: 0xe2e8f0,
}

export class GameRenderer {
  private readonly tileSize: number
  private readonly onTileClick: (position: Position) => void

  private app: Application | null = null

  private readonly worldLayer = new Container()
  private readonly terrainLayer = new Graphics()
  private readonly roadLayer = new Graphics()
  private readonly buildingLayer = new Graphics()
  private readonly overlayLayer = new Graphics()
  private readonly bubbleLayer = new Container()

  private readonly lastAgentDecisionKeys = new Map<number, string>()
  private readonly agentActionBubbles = new Map<number, AgentActionBubbleState>()

  private camera: CameraState = { x: 16, y: 16, zoom: 1 }

  private isPanning = false
  private didDrag = false
  private isSpacePressed = false
  private panLastX = 0
  private panLastY = 0

  private removeInputListeners: (() => void) | null = null

  constructor(options: RendererOptions) {
    this.tileSize = options.tileSize ?? 24
    this.onTileClick = options.onTileClick
  }

  async mount(host: HTMLElement): Promise<void> {
    const app = new Application()
    await app.init({
      background: '#0f172a',
      resizeTo: host,
      antialias: true,
      preference: 'webgl',
    })

    this.app = app

    this.worldLayer.addChild(this.terrainLayer)
    this.worldLayer.addChild(this.roadLayer)
    this.worldLayer.addChild(this.buildingLayer)
    this.worldLayer.addChild(this.overlayLayer)
    this.worldLayer.addChild(this.bubbleLayer)
    app.stage.addChild(this.worldLayer)
    this.applyCamera()

    host.appendChild(app.canvas)

    this.removeInputListeners = this.setupInputListeners(app.canvas)
  }

  render(
    snapshot: SimSnapshot,
    selectedTile: Position | null,
    overlayMode: OverlayMode,
    selectedEntityDetails: EntityDetails | null = null,
  ): void {
    this.updateAgentActionBubbles(snapshot)
    this.drawTerrain(snapshot)
    this.drawRoads(snapshot)
    this.drawBuildings(snapshot)
    this.drawOverlay(snapshot, selectedTile, overlayMode)
    this.drawBubbles(snapshot, selectedTile, selectedEntityDetails)
  }

  destroy(): void {
    this.removeInputListeners?.()
    this.removeInputListeners = null
    this.lastAgentDecisionKeys.clear()
    this.agentActionBubbles.clear()

    if (this.app) {
      this.app.destroy(true)
      this.app = null
    }
  }

  private drawTerrain(snapshot: SimSnapshot): void {
    this.terrainLayer.clear()

    const { width, height, tiles } = snapshot.map
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const tile = tiles[y * width + x]
        const px = x * this.tileSize
        const py = y * this.tileSize

        this.terrainLayer.rect(px, py, this.tileSize, this.tileSize).fill(colorForTerrain(tile.terrain))
        this.terrainLayer
          .rect(px, py, this.tileSize, this.tileSize)
          .stroke({ color: 0x334155, width: 1, alpha: 0.25 })
      }
    }
  }

  private drawRoads(snapshot: SimSnapshot): void {
    this.roadLayer.clear()

    for (const road of snapshot.roads) {
      const px = road.x * this.tileSize + this.tileSize * 0.15
      const py = road.y * this.tileSize + this.tileSize * 0.15
      const size = this.tileSize * 0.7
      this.roadLayer.roundRect(px, py, size, size, 4).fill(0x9ca3af)
    }
  }

  private drawBuildings(snapshot: SimSnapshot): void {
    this.buildingLayer.clear()

    for (const building of snapshot.buildings) {
      const px = building.x * this.tileSize + this.tileSize * 0.1
      const py = building.y * this.tileSize + this.tileSize * 0.1
      const size = this.tileSize * 0.8
      this.buildingLayer.roundRect(px, py, size, size, 4).fill(colorForBuilding(building.kind))
    }

    for (const agent of snapshot.agents) {
      const px = agent.x * this.tileSize + this.tileSize * 0.5
      const py = agent.y * this.tileSize + this.tileSize * 0.5
      const radius = this.tileSize * 0.18
      this.buildingLayer.circle(px, py, radius).fill(colorForAgent(agent.kind))
    }
  }

  private drawOverlay(
    snapshot: SimSnapshot,
    selectedTile: Position | null,
    overlayMode: OverlayMode,
  ): void {
    this.overlayLayer.clear()

    if (overlayMode === 'queue') {
      for (const queue of snapshot.stopQueues) {
        if (queue.count <= 0) {
          continue
        }

        const alpha = clamp(queue.count / 30, 0.15, 0.75)
        const px = queue.x * this.tileSize
        const py = queue.y * this.tileSize
        this.overlayLayer.rect(px, py, this.tileSize, this.tileSize).fill({
          color: 0xef4444,
          alpha,
        })
      }
    }

    if (overlayMode === 'coverage') {
      for (const queue of snapshot.stopQueues) {
        const building = snapshot.buildings.find((item) => item.id === queue.id)
        if (building?.kind !== 'stop') {
          continue
        }

        const cx = queue.x * this.tileSize + this.tileSize * 0.5
        const cy = queue.y * this.tileSize + this.tileSize * 0.5
        this.overlayLayer.circle(cx, cy, this.tileSize * 3).fill({
          color: 0x22d3ee,
          alpha: 0.12,
        })
      }
    }

    if (!selectedTile) {
      return
    }

    this.overlayLayer
      .rect(
        selectedTile.x * this.tileSize,
        selectedTile.y * this.tileSize,
        this.tileSize,
        this.tileSize,
      )
      .stroke({ color: 0xfbbf24, width: 3, alpha: 1 })
  }

  private drawBubbles(
    snapshot: SimSnapshot,
    selectedTile: Position | null,
    selectedEntityDetails: EntityDetails | null,
  ): void {
    this.clearBubbleLayer()
    this.drawSelectedBubble(snapshot, selectedTile, selectedEntityDetails)
    this.drawAgentActionBubbles(snapshot)
  }

  private drawSelectedBubble(
    snapshot: SimSnapshot,
    selectedTile: Position | null,
    selectedEntityDetails: EntityDetails | null,
  ): void {
    if (!selectedTile) {
      return
    }

    const selectedAgent = snapshot.agents.find(
      (agent) => agent.x === selectedTile.x && agent.y === selectedTile.y,
    )
    const selectedBuilding = snapshot.buildings.find(
      (building) => building.x === selectedTile.x && building.y === selectedTile.y,
    )
    const selectedRoad = snapshot.roads.find(
      (road) => road.x === selectedTile.x && road.y === selectedTile.y,
    )

    let bubbleX = selectedTile.x * this.tileSize + this.tileSize * 0.5
    let bubbleY = selectedTile.y * this.tileSize + this.tileSize * 0.5
    const lines: string[] = []

    if (selectedAgent) {
      bubbleX = selectedAgent.x * this.tileSize + this.tileSize * 0.5
      bubbleY = selectedAgent.y * this.tileSize + this.tileSize * 0.5
      lines.push(`${labelForAgent(selectedAgent.kind)} #${selectedAgent.id}`)
      if (selectedEntityDetails?.entityId === selectedAgent.id) {
        lines.push(selectedEntityDetails.doing)
      } else {
        lines.push(selectedAgent.lastDecision || 'Idle')
      }
    } else if (selectedBuilding) {
      bubbleX = selectedBuilding.x * this.tileSize + this.tileSize * 0.5
      bubbleY = selectedBuilding.y * this.tileSize + this.tileSize * 0.5
      lines.push(`${labelForBuilding(selectedBuilding.kind)} #${selectedBuilding.id}`)
      lines.push(`Food ${selectedBuilding.food} | Upkeep ${selectedBuilding.upkeep}`)
    } else if (selectedRoad) {
      bubbleX = selectedRoad.x * this.tileSize + this.tileSize * 0.5
      bubbleY = selectedRoad.y * this.tileSize + this.tileSize * 0.5
      lines.push(`Road #${selectedRoad.id}`)
      lines.push(`Tile ${selectedTile.x},${selectedTile.y}`)
    } else {
      lines.push(`Tile ${selectedTile.x},${selectedTile.y}`)
      lines.push('Empty')
    }

    const normalized = lines.map((line) => truncateLine(line, 42))
    this.drawBubble(
      bubbleX,
      bubbleY - this.tileSize * 0.18,
      normalized,
      SELECTION_BUBBLE_PALETTE,
      this.tileSize * 7.8,
    )
  }

  private drawAgentActionBubbles(snapshot: SimSnapshot): void {
    let visible = 0

    for (const agent of snapshot.agents) {
      if (visible >= MAX_VISIBLE_AGENT_ACTION_BUBBLES) {
        break
      }

      const bubble = this.agentActionBubbles.get(agent.id)
      if (!bubble || bubble.expiresTick <= snapshot.tick) {
        continue
      }

      visible += 1
      this.drawBubble(
        agent.x * this.tileSize + this.tileSize * 0.5,
        agent.y * this.tileSize + this.tileSize * 0.25,
        [truncateLine(bubble.text, 32)],
        ACTION_BUBBLE_PALETTE,
        this.tileSize * 6.6,
      )
    }
  }

  private updateAgentActionBubbles(snapshot: SimSnapshot): void {
    const activeAgentIds = new Set<number>()

    for (const agent of snapshot.agents) {
      activeAgentIds.add(agent.id)
      const decisionKey = `${agent.lastDecision}::${agent.lastReason}`
      const previousDecisionKey = this.lastAgentDecisionKeys.get(agent.id)

      if (previousDecisionKey !== undefined && previousDecisionKey !== decisionKey) {
        const decisionText = agent.lastDecision.trim()
        if (decisionText.length > 0) {
          this.agentActionBubbles.set(agent.id, {
            text: decisionText,
            expiresTick: snapshot.tick + ACTION_BUBBLE_LIFETIME_TICKS,
          })
        }
      }

      this.lastAgentDecisionKeys.set(agent.id, decisionKey)
    }

    for (const id of Array.from(this.lastAgentDecisionKeys.keys())) {
      if (!activeAgentIds.has(id)) {
        this.lastAgentDecisionKeys.delete(id)
      }
    }

    for (const [id, bubble] of Array.from(this.agentActionBubbles.entries())) {
      if (!activeAgentIds.has(id) || bubble.expiresTick <= snapshot.tick) {
        this.agentActionBubbles.delete(id)
      }
    }
  }

  private clearBubbleLayer(): void {
    const children = this.bubbleLayer.removeChildren()
    for (const child of children) {
      child.destroy()
    }
  }

  private drawBubble(
    worldX: number,
    worldY: number,
    lines: string[],
    palette: BubblePalette,
    maxWidth: number,
  ): void {
    if (lines.length === 0) {
      return
    }

    const padding = Math.max(4, Math.floor(this.tileSize * 0.18))
    const fontSize = Math.max(10, Math.floor(this.tileSize * 0.42))
    const text = new Text({
      text: lines.join('\n'),
      style: {
        fill: palette.text,
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize,
        lineHeight: Math.round(fontSize * 1.22),
        wordWrap: true,
        wordWrapWidth: maxWidth - padding * 2,
      },
    })
    text.position.set(padding, padding)

    const width = Math.max(text.width + padding * 2, this.tileSize * 2.2)
    const height = text.height + padding * 2

    const background = new Graphics()
    background.roundRect(0, 0, width, height, 6).fill({ color: palette.background, alpha: 0.94 })
    background.roundRect(0, 0, width, height, 6).stroke({
      color: palette.border,
      width: 1.5,
      alpha: 1,
    })

    const container = new Container()
    container.addChild(background)
    container.addChild(text)
    container.position.set(worldX - width * 0.5, worldY - height - this.tileSize * 0.25)
    this.bubbleLayer.addChild(container)
  }

  private setupInputListeners(canvas: HTMLCanvasElement): () => void {
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()

      const rect = canvas.getBoundingClientRect()
      const screenX = event.clientX - rect.left
      const screenY = event.clientY - rect.top

      const worldXBefore = (screenX - this.camera.x) / this.camera.zoom
      const worldYBefore = (screenY - this.camera.y) / this.camera.zoom

      const zoomDirection = event.deltaY < 0 ? 1.1 : 0.9
      this.camera.zoom = clamp(this.camera.zoom * zoomDirection, 0.4, 3)
      this.camera.x = screenX - worldXBefore * this.camera.zoom
      this.camera.y = screenY - worldYBefore * this.camera.zoom
      this.applyCamera()
    }

    const onMouseDown = (event: MouseEvent) => {
      const panStart = event.button === 1 || (event.button === 0 && this.isSpacePressed)
      if (!panStart) {
        return
      }

      event.preventDefault()
      this.isPanning = true
      this.didDrag = false
      this.panLastX = event.clientX
      this.panLastY = event.clientY
    }

    const onMouseMove = (event: MouseEvent) => {
      if (!this.isPanning) {
        return
      }

      const dx = event.clientX - this.panLastX
      const dy = event.clientY - this.panLastY

      if (Math.abs(dx) + Math.abs(dy) > 2) {
        this.didDrag = true
      }

      this.panLastX = event.clientX
      this.panLastY = event.clientY
      this.camera.x += dx
      this.camera.y += dy
      this.applyCamera()
    }

    const onMouseUp = (event: MouseEvent) => {
      const wasPanning = this.isPanning
      this.isPanning = false

      if (event.button !== 0 || wasPanning || this.didDrag) {
        return
      }

      const tile = this.screenToTile(canvas, event.clientX, event.clientY)
      if (tile) {
        this.onTileClick(tile)
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        this.isSpacePressed = true
      }
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        this.isSpacePressed = false
      }
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }

  private screenToTile(
    canvas: HTMLCanvasElement,
    clientX: number,
    clientY: number,
  ): Position | null {
    const rect = canvas.getBoundingClientRect()
    const screenX = clientX - rect.left
    const screenY = clientY - rect.top

    const worldX = (screenX - this.camera.x) / this.camera.zoom
    const worldY = (screenY - this.camera.y) / this.camera.zoom

    if (worldX < 0 || worldY < 0) {
      return null
    }

    return {
      x: Math.floor(worldX / this.tileSize),
      y: Math.floor(worldY / this.tileSize),
    }
  }

  private applyCamera(): void {
    this.worldLayer.position.set(this.camera.x, this.camera.y)
    this.worldLayer.scale.set(this.camera.zoom)
  }
}

function colorForTerrain(terrain: 'grass' | 'hill' | 'water'): number {
  if (terrain === 'water') {
    return 0x0ea5e9
  }

  if (terrain === 'hill') {
    return 0x84cc16
  }

  return 0x22c55e
}

function colorForBuilding(
  kind: 'housing' | 'market' | 'warehouse' | 'depot' | 'foodSource' | 'stop',
): number {
  switch (kind) {
    case 'housing':
      return 0xfef3c7
    case 'market':
      return 0xf97316
    case 'warehouse':
      return 0x93c5fd
    case 'depot':
      return 0xa3a3a3
    case 'foodSource':
      return 0x65a30d
    case 'stop':
      return 0x38bdf8
    default:
      return 0xffffff
  }
}

function colorForAgent(kind: 'citizen' | 'courierBot' | 'minibus'): number {
  switch (kind) {
    case 'citizen':
      return 0xfef08a
    case 'courierBot':
      return 0x60a5fa
    case 'minibus':
      return 0xfca5a5
    default:
      return 0xffffff
  }
}

function labelForAgent(kind: 'citizen' | 'courierBot' | 'minibus'): string {
  switch (kind) {
    case 'citizen':
      return 'Citizen'
    case 'courierBot':
      return 'CourierBot'
    case 'minibus':
      return 'Minibus'
    default:
      return 'Agent'
  }
}

function labelForBuilding(
  kind: 'housing' | 'market' | 'warehouse' | 'depot' | 'foodSource' | 'stop',
): string {
  switch (kind) {
    case 'housing':
      return 'Housing'
    case 'market':
      return 'Market'
    case 'warehouse':
      return 'Warehouse'
    case 'depot':
      return 'Depot'
    case 'foodSource':
      return 'Food Source'
    case 'stop':
      return 'Stop'
    default:
      return 'Building'
  }
}

function truncateLine(line: string, maxChars: number): string {
  if (line.length <= maxChars) {
    return line
  }

  return `${line.slice(0, Math.max(0, maxChars - 3))}...`
}
