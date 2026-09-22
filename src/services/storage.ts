import type { WindowScene, PairEntry } from '@/types'

const STORAGE_KEY = 'bus_window_scenes'
const PAIRS_KEY = 'bus_window_pairs'

export function getAllScenes(): WindowScene[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as WindowScene[]
  } catch {
    return []
  }
}

export function saveScene(scene: WindowScene): void {
  const scenes = getAllScenes()
  scenes.push(scene)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scenes))
}

export function deleteScene(id: string): void {
  const scenes = getAllScenes().filter((s) => s.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scenes))
}

export function getScenesByRoute(routeName: string): WindowScene[] {
  return getAllScenes()
    .filter((s) => s.routeName === routeName)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

export function getAllRouteNames(): string[] {
  const scenes = getAllScenes()
  const routeSet = new Set(scenes.map((s) => s.routeName))
  return Array.from(routeSet).sort()
}

export function getRandomScene(): WindowScene | null {
  const scenes = getAllScenes()
  if (scenes.length === 0) return null
  return scenes[Math.floor(Math.random() * scenes.length)]
}

export function getAllPairEntries(): PairEntry[] {
  try {
    const raw = localStorage.getItem(PAIRS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as PairEntry[]
  } catch {
    return []
  }
}

export function saveAllPairEntries(entries: PairEntry[]): void {
  localStorage.setItem(PAIRS_KEY, JSON.stringify(entries))
}
