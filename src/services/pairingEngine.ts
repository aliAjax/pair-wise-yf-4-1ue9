import type { WindowScene, PairEntry, PairStatus, SeatDirection } from '../types'

/** 配对有效窗：保存时间相差 20 分钟以内 */
export const PAIR_WINDOW_MS = 20 * 60 * 1000

export function oppositeSide(side: SeatDirection): SeatDirection {
  return side === '左' ? '右' : '左'
}

function sceneMapOf(scenes: WindowScene[]): Map<string, WindowScene> {
  return new Map(scenes.map((s) => [s.id, s]))
}

function tsOf(iso: string): number {
  return new Date(iso).getTime()
}

function sameGroup(a: WindowScene, b: WindowScene): boolean {
  return a.routeName === b.routeName && a.segment === b.segment
}

/** 将超过 20 分钟仍未配对的记录标记为失效（失效后保留但不再参与配对） */
export function sweepExpired(entries: PairEntry[], nowMs: number): PairEntry[] {
  return entries.map((e) =>
    e.status === 'pending' && nowMs - tsOf(e.since) > PAIR_WINDOW_MS
      ? { ...e, status: 'expired' as PairStatus }
      : e
  )
}

/**
 * 在待配对队列中按 FIFO 查找可与 incoming 配对的候选：
 * 同线路同区间、对向侧、保存时间相差不超过 20 分钟，且候选自身仍在有效窗内。
 */
function findCandidate(
  entries: PairEntry[],
  sceneMap: Map<string, WindowScene>,
  incoming: WindowScene,
  nowMs: number,
): PairEntry | null {
  const incomingTs = tsOf(incoming.timestamp)
  const candidates = entries.filter((e) => {
    if (e.status !== 'pending') return false
    if (nowMs - tsOf(e.since) > PAIR_WINDOW_MS) return false
    const candidateScene = sceneMap.get(e.sceneId)
    if (!candidateScene) return false
    if (!sameGroup(candidateScene, incoming)) return false
    if (candidateScene.seatDirection !== oppositeSide(incoming.seatDirection)) return false
    if (Math.abs(tsOf(candidateScene.timestamp) - incomingTs) > PAIR_WINDOW_MS) return false
    return true
  })
  candidates.sort((a, b) => tsOf(a.since) - tsOf(b.since))
  return candidates[0] ?? null
}

function pairTogether(
  entries: PairEntry[],
  firstId: string,
  secondId: string,
): PairEntry[] {
  const pairId = crypto.randomUUID()
  return entries.map((e) => {
    if (e.sceneId !== firstId && e.sceneId !== secondId) return e
    const partnerId = e.sceneId === firstId ? secondId : firstId
    return { ...e, status: 'completed' as PairStatus, partnerId, pairId }
  })
}

export interface AdmitResult {
  entries: PairEntry[]
  status: PairStatus
}

/**
 * 一条新保存的记录进入配对流程：
 * 先清理已超时的待配对记录，再尝试与队列中最早的合格对向记录配对；
 * 配对成功则双方完成，否则本条记录以 since 为起点进入待配对。
 * 同侧重提只作为新的排队者，不会挤掉队列中已有的待配对记录。
 */
export function admit(
  entries: PairEntry[],
  scenes: WindowScene[],
  scene: WindowScene,
  sinceIso: string,
  nowMs: number,
): AdmitResult {
  const sceneMap = sceneMapOf(scenes)
  let next = sweepExpired(entries, nowMs)
  const candidate = findCandidate(next, sceneMap, scene, nowMs)

  const entry: PairEntry = {
    sceneId: scene.id,
    partnerId: null,
    pairId: null,
    status: 'pending',
    since: sinceIso,
  }
  next = [...next, entry]

  if (candidate) {
    next = pairTogether(next, candidate.sceneId, scene.id)
  }
  const saved = next.find((e) => e.sceneId === scene.id)
  return { entries: next, status: saved ? saved.status : 'pending' }
}

/**
 * 移除一条记录：
 * - 已配对的一方被移除时，另一方退回待配对，并以当前时刻重新获得 20 分钟有效窗；
 * - 退回后立即尝试与队列中其他合格的对向记录配对。
 */
export function removeScene(
  entries: PairEntry[],
  remainingScenes: WindowScene[],
  removedId: string,
  nowIso: string,
): PairEntry[] {
  const nowMs = tsOf(nowIso)
  const sceneMap = sceneMapOf(remainingScenes)

  let survivorId: string | null = null
  let next = entries
    .filter((e) => e.sceneId !== removedId)
    .map((e) => {
      if (e.partnerId === removedId) {
        survivorId = e.sceneId
        return {
          ...e,
          status: 'pending' as PairStatus,
          partnerId: null,
          pairId: null,
          since: nowIso,
          reopenedAt: nowIso,
        }
      }
      return e
    })

  next = sweepExpired(next, nowMs)

  if (survivorId) {
    const survivorEntry = next.find((e) => e.sceneId === survivorId)
    const survivorScene = survivorId ? sceneMap.get(survivorId) : undefined
    if (survivorEntry && survivorEntry.status === 'pending' && survivorScene) {
      const candidate = findCandidate(next, sceneMap, survivorScene, nowMs)
      if (candidate) {
        next = pairTogether(next, candidate.sceneId, survivorScene.id)
      }
    }
  }

  return next
}

/**
 * 依据全部窗景记录校正配对状态（加载/刷新时调用）：
 * - 丢弃对应记录已不存在的配对条目；已完成但配对方缺失的记录退回待配对；
 * - 按保存时间顺序重放此前未纳入的记录，重建当时的配对与失效结果；
 * - 最后按当前时刻超时清理。幂等，刷新后状态保持不变。
 */
export function reconcile(
  entries: PairEntry[],
  scenes: WindowScene[],
  nowIso: string,
): PairEntry[] {
  const nowMs = tsOf(nowIso)
  const sceneMap = sceneMapOf(scenes)

  const resetIds = new Set<string>()
  let next = entries
    .filter((e) => sceneMap.has(e.sceneId))
    .map((e) => {
      const partnerMissing =
        e.status === 'completed' && (!e.partnerId || !sceneMap.has(e.partnerId))
      if (partnerMissing) {
        resetIds.add(e.sceneId)
        // 仅首次发现配对方缺失时重开一次 20 分钟窗，之后保持稳定
        if (e.reopenedAt) {
          return { ...e, status: 'pending' as PairStatus, partnerId: null, pairId: null }
        }
        return {
          ...e,
          status: 'pending' as PairStatus,
          partnerId: null,
          pairId: null,
          since: nowIso,
          reopenedAt: nowIso,
        }
      }
      return e
    })

  // 重放缺失记录：以各自保存时刻为虚拟时钟，保证时间线上的配对结果可被重建
  const known = new Set(next.map((e) => e.sceneId))
  const missing = scenes
    .filter((s) => !known.has(s.id))
    .sort((a, b) => tsOf(a.timestamp) - tsOf(b.timestamp))

  for (const scene of missing) {
    const virtualMs = tsOf(scene.timestamp)
    next = sweepExpired(next, virtualMs)
    const candidate = findCandidate(next, sceneMap, scene, virtualMs)
    const entry: PairEntry = {
      sceneId: scene.id,
      partnerId: null,
      pairId: null,
      status: 'pending',
      since: scene.timestamp,
    }
    next = [...next, entry]
    if (candidate) {
      next = pairTogether(next, candidate.sceneId, scene.id)
    }
  }

  // 退回待配对的记录（配对方缺失）尝试与队列中合格的对向记录重新配对
  for (const id of resetIds) {
    const entry = next.find((e) => e.sceneId === id)
    const scene = sceneMap.get(id)
    if (entry && entry.status === 'pending' && scene) {
      const candidate = findCandidate(next, sceneMap, scene, nowMs)
      if (candidate) {
        next = pairTogether(next, candidate.sceneId, scene.id)
      }
    }
  }

  return sweepExpired(next, nowMs)
}
