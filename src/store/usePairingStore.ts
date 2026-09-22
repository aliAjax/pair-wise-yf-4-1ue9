import { create } from 'zustand'
import type { WindowScene, PairEntry, PairStatus } from '@/types'
import {
  getAllPairEntries,
  saveAllPairEntries,
} from '@/services/storage'
import { admit, removeScene, reconcile } from '@/services/pairingEngine'

interface PairingState {
  entries: PairEntry[]
  /** 保存新窗景后驱动配对，返回该记录当前的配对状态 */
  admitScene: (scene: WindowScene, allScenes: WindowScene[]) => PairStatus
  /** 移除窗景，另一方按规则退回待配对 */
  sceneRemoved: (removedId: string, remainingScenes: WindowScene[]) => void
  /** 加载/刷新：依据全部窗景校正并持久化状态 */
  loadPairings: (scenes: WindowScene[]) => void
}

export const usePairingStore = create<PairingState>((set, get) => ({
  entries: getAllPairEntries(),

  admitScene: (scene, allScenes) => {
    const nowIso = new Date().toISOString()
    const result = admit(get().entries, allScenes, scene, nowIso, Date.parse(nowIso))
    saveAllPairEntries(result.entries)
    set({ entries: result.entries })
    return result.status
  },

  sceneRemoved: (removedId, remainingScenes) => {
    const nowIso = new Date().toISOString()
    const entries = removeScene(get().entries, remainingScenes, removedId, nowIso)
    saveAllPairEntries(entries)
    set({ entries })
  },

  loadPairings: (scenes) => {
    const entries = reconcile(get().entries, scenes, new Date().toISOString())
    if (JSON.stringify(entries) === JSON.stringify(get().entries)) return
    saveAllPairEntries(entries)
    set({ entries })
  },
}))
