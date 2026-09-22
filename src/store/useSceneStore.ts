import { create } from 'zustand'
import type { WindowScene, SceneFormData, PairOutcome } from '@/types'
import {
  getAllScenes,
  replaceAllScenes,
  getScenesByRoute,
  getAllRouteNames,
  getRandomScene,
} from '@/services/storage'
import { ingestScene, removeScene, sweepExpired } from '@/services/pairing'

interface SceneState {
  scenes: WindowScene[]
  routeNames: string[]
  currentRouteScenes: WindowScene[]
  selectedRoute: string
  randomScene: WindowScene | null

  loadAll: () => void
  saveScene: (data: SceneFormData) => PairOutcome
  deleteScene: (id: string) => void
  selectRoute: (routeName: string) => void
  refreshRandom: () => void
  /** 扫描并固化超时的待配对记录（已失效但保留） */
  sweepPairs: () => void
}

export const useSceneStore = create<SceneState>((set, get) => ({
  scenes: [],
  routeNames: [],
  currentRouteScenes: [],
  selectedRoute: '',
  randomScene: null,

  loadAll: () => {
    const stored = getAllScenes()
    const swept = sweepExpired(stored)
    if (swept !== stored) replaceAllScenes(swept)
    const routeNames = getAllRouteNames()
    set((state) => ({
      scenes: swept,
      routeNames,
      currentRouteScenes: state.selectedRoute
        ? getScenesByRoute(state.selectedRoute)
        : state.currentRouteScenes,
    }))
  },

  saveScene: (data: SceneFormData) => {
    const scene: WindowScene = {
      ...data,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      pairStatus: '待配对',
      pairId: null,
      pairExpiresAt: null,
    }
    const { scenes: next, outcome } = ingestScene(get().scenes, scene)
    replaceAllScenes(next)
    const routeNames = getAllRouteNames()
    set((state) => ({
      scenes: next,
      routeNames,
      currentRouteScenes: state.selectedRoute
        ? getScenesByRoute(state.selectedRoute)
        : [],
    }))
    return outcome
  },

  deleteScene: (id: string) => {
    const next = removeScene(get().scenes, id)
    replaceAllScenes(next)
    const routeNames = getAllRouteNames()
    set((state) => ({
      scenes: next,
      routeNames,
      currentRouteScenes: state.selectedRoute
        ? getScenesByRoute(state.selectedRoute)
        : [],
    }))
  },

  selectRoute: (routeName: string) => {
    const currentRouteScenes = routeName ? getScenesByRoute(routeName) : []
    set({ selectedRoute: routeName, currentRouteScenes })
  },

  refreshRandom: () => {
    const randomScene = getRandomScene()
    set({ randomScene })
  },

  sweepPairs: () => {
    const swept = sweepExpired(get().scenes)
    if (swept === get().scenes) return
    replaceAllScenes(swept)
    set((state) => ({
      scenes: swept,
      currentRouteScenes: state.selectedRoute
        ? getScenesByRoute(state.selectedRoute)
        : state.currentRouteScenes,
    }))
  },
}))
