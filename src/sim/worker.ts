import { expose } from 'comlink'
import type { SimWorkerApi } from '@shared/types'
import { SimEngine } from '@sim/engine'

const engine = new SimEngine()

const api: SimWorkerApi = {
  init(config) {
    engine.init(config)
  },
  step(untilTick) {
    engine.step(untilTick)
  },
  enqueueCommands(commands) {
    engine.enqueueCommands(commands)
  },
  getSnapshot() {
    return engine.getSnapshot()
  },
  save() {
    return engine.save()
  },
  load(blob) {
    engine.load(blob)
  },
  onSnapshot(callback) {
    engine.onSnapshot(callback)
  },
  getEntityDetails(entityId) {
    return engine.getEntityDetails(entityId)
  },
}

expose(api)
