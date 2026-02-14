import { Application, Container, Graphics } from 'pixi.js'
import { clamp } from '@shared/rng'
import type { OverlayMode, Position, SimSnapshot } from '@shared/types'

interface CameraState {
  x: number
  y: number
  zoom: number
}

interface RendererOptions {
  tileSize?: number
  onTileClick: (position: Position) => void
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
    app.stage.addChild(this.worldLayer)
    this.applyCamera()

    host.appendChild(app.canvas)

    this.removeInputListeners = this.setupInputListeners(app.canvas)
  }

  render(snapshot: SimSnapshot, selectedTile: Position | null, overlayMode: OverlayMode): void {
    this.drawTerrain(snapshot)
    this.drawRoads(snapshot)
    this.drawBuildings(snapshot)
    this.drawOverlay(snapshot, selectedTile, overlayMode)
  }

  destroy(): void {
    this.removeInputListeners?.()
    this.removeInputListeners = null

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
