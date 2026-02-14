import * as Comlink from 'comlink'
import type {
  EntityDetails,
  InitConfig,
  SaveBlob,
  SimCommand,
  SimSnapshot,
  SimWorkerApi,
} from '@shared/types'

export class SimClient {
  private readonly worker: Worker
  private readonly api: Comlink.Remote<SimWorkerApi>

  constructor(worker: Worker, api: Comlink.Remote<SimWorkerApi>) {
    this.worker = worker
    this.api = api
  }

  async init(config: InitConfig): Promise<void> {
    await this.api.init(config)
  }

  async step(untilTick: number): Promise<void> {
    await this.api.step(untilTick)
  }

  async enqueueCommands(commands: SimCommand[]): Promise<void> {
    await this.api.enqueueCommands(commands)
  }

  async getSnapshot(): Promise<SimSnapshot> {
    return this.api.getSnapshot()
  }

  async onSnapshot(callback: (snapshot: SimSnapshot) => void): Promise<void> {
    await this.api.onSnapshot(Comlink.proxy(callback))
  }

  async save(): Promise<SaveBlob> {
    return this.api.save()
  }

  async load(blob: SaveBlob): Promise<void> {
    await this.api.load(blob)
  }

  async getEntityDetails(entityId: number): Promise<EntityDetails | null> {
    return this.api.getEntityDetails(entityId)
  }

  dispose(): void {
    this.worker.terminate()
  }
}

export function createSimClient(): SimClient {
  const worker = new Worker(new URL('../sim/worker.ts', import.meta.url), {
    type: 'module',
  })

  const api = Comlink.wrap<SimWorkerApi>(worker)
  return new SimClient(worker, api)
}
