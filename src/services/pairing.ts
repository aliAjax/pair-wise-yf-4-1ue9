import type { WindowScene, SeatDirection, PairOutcome } from '@/types'

/** 对向采样允许的配对时间窗口：保存时间相差 20 分钟以内 */
export const PAIR_WINDOW_MS = 20 * 60 * 1000

const opposite = (d: SeatDirection): SeatDirection => (d === '左' ? '右' : '左')

/**
* 将已到超时时刻的「待配对」记录标记为「已失效」。
* 失效记录保留，但永不再参与配对。
*/
export function sweepExpired(scenes: WindowScene[], now: number = Date.now()): WindowScene[] {
  let changed = false
  const next = scenes.map((s) => {
    if (
      s.pairStatus === '待配对' &&
      s.pairExpiresAt !== null &&
      new Date(s.pairExpiresAt).getTime() <= now
    ) {
      changed = true
      return { ...s, pairStatus: '已失效' as const, pairExpiresAt: null }
    }
    return s
  })
  return changed ? next : scenes
}

/**
* 一条新记录入库时尝试对向配对：
* 同线路、同区间、座位方向相反、对方为「待配对」、
* 双方保存时间相差 20 分钟以内；满足多条时取最早保存的一条（FIFO）。
* 同侧重复提交不会挤掉已有待配对记录——它们各自排队。
* 找不到匹配时，新记录进入待配对。
*/
export function ingestScene(
  scenes: WindowScene[],
  incoming: WindowScene,
  now: number = Date.now(),
): { scenes: WindowScene[]; outcome: PairOutcome } {
  const swept = sweepExpired(scenes, now)
  const incomingTime = new Date(incoming.timestamp).getTime()

  const candidates = swept
    .filter(
      (s) =>
        s.pairStatus === '待配对' &&
        s.routeName === incoming.routeName &&
        s.segment === incoming.segment &&
        s.seatDirection === opposite(incoming.seatDirection) &&
        Math.abs(new Date(s.timestamp).getTime() - incomingTime) <= PAIR_WINDOW_MS,
    )
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  const mate = candidates[0]

  if (!mate) {
    const waiting: WindowScene = {
      ...incoming,
      pairStatus: '待配对',
      pairId: null,
      pairExpiresAt: new Date(incomingTime + PAIR_WINDOW_MS).toISOString(),
    }
    return {
      scenes: [...swept, waiting],
      outcome: { sceneId: incoming.id, status: '待配对', pairedWithId: null },
    }
  }

  const paired: WindowScene = {
    ...incoming,
    pairStatus: '已完成',
    pairId: mate.id,
    pairExpiresAt: null,
  }
  const updatedMate: WindowScene = {
    ...mate,
    pairStatus: '已完成',
    pairId: incoming.id,
    pairExpiresAt: null,
  }

  return {
    scenes: swept.map((s) => (s.id === mate.id ? updatedMate : s)).concat(paired),
    outcome: { sceneId: incoming.id, status: '已完成', pairedWithId: mate.id },
  }
}

/**
* 移除一条记录：
* - 移除「已完成」配对的一侧时，另一方退回「待配对」，并获得新的 20 分钟等待窗口；
* - 移除待配对 / 已失效记录时，其余记录不受影响。
*/
export function removeScene(
  scenes: WindowScene[],
  id: string,
  now: number = Date.now(),
): WindowScene[] {
  const target = scenes.find((s) => s.id === id)
  return scenes
    .filter((s) => s.id !== id)
    .map((s) => {
      if (target && target.pairStatus === '已完成' && s.id === target.pairId) {
        return {
          ...s,
          pairStatus: '待配对' as const,
          pairId: null,
          pairExpiresAt: new Date(now + PAIR_WINDOW_MS).toISOString(),
        }
      }
      return s
    })
}

/** 兼容旧数据：补齐配对字段 */
export function normalize(scene: Partial<WindowScene>): WindowScene {
  const fallbackTime = Date.now()
  return {
    id: scene.id ?? crypto.randomUUID(),
    routeName: scene.routeName ?? '',
    segment: scene.segment ?? '',
    seatDirection: scene.seatDirection ?? '左',
    timestamp: scene.timestamp ?? new Date(fallbackTime).toISOString(),
    weather: scene.weather ?? '晴',
    signText: scene.signText ?? '',
    treeDensity: scene.treeDensity ?? '适中',
    pedestrianStatus: scene.pedestrianStatus ?? '稀少',
    note: scene.note ?? '',
    pairStatus: scene.pairStatus ?? '待配对',
    pairId: scene.pairId ?? null,
    pairExpiresAt:
      scene.pairExpiresAt ??
      new Date(new Date(scene.timestamp ?? fallbackTime).getTime() + PAIR_WINDOW_MS).toISOString(),
  }
}

export interface PairTimelineEntry {
  key: string
  status: WindowScene['pairStatus']
  /** 已完成：两侧记录；其余：单条记录 */
  left: WindowScene
  right: WindowScene | null
  /** 时间线排序时刻（已完成取较晚一侧，其余取该记录保存时间） */
  sortTime: number
}

/**
* 把记录归并为时间线条目：已配对的两条合成一条，待配对/已失效各成一条。
* statusFilter 为 null 时返回全部。
*/
export function buildTimeline(
  scenes: WindowScene[],
  now: number = Date.now(),
  statusFilter: WindowScene['pairStatus'] | null = null,
): PairTimelineEntry[] {
  const view = sweepExpired(scenes, now)
  const entries: PairTimelineEntry[] = []
  const consumed = new Set<string>()

  for (const s of view) {
    if (consumed.has(s.id)) continue
    if (s.pairStatus === '已完成' && s.pairId) {
      const mate = view.find((m) => m.id === s.pairId)
      if (mate) {
        consumed.add(s.id)
        consumed.add(mate.id)
        const left = s.seatDirection === '左' ? s : mate
        const right = s.seatDirection === '左' ? mate : s
        entries.push({
          key: s.id,
          status: '已完成',
          left,
          right,
          sortTime: Math.max(
            new Date(s.timestamp).getTime(),
            new Date(mate.timestamp).getTime(),
          ),
        })
        continue
      }
    }
    consumed.add(s.id)
    entries.push({
      key: s.id,
      status: s.pairStatus,
      left: s,
      right: null,
      sortTime: new Date(s.timestamp).getTime(),
    })
  }

  return entries
    .filter((e) => statusFilter === null || e.status === statusFilter)
    .sort((a, b) => b.sortTime - a.sortTime)
}

/** 各状态条目计数（基于失效扫描后的视图） */
export function countByStatus(
  scenes: WindowScene[],
  now: number = Date.now(),
): Record<WindowScene['pairStatus'], number> {
  const counts: Record<WindowScene['pairStatus'], number> = {
    待配对: 0,
    已完成: 0,
    已失效: 0,
  }
  for (const e of buildTimeline(scenes, now, null)) {
    counts[e.status] += 1
  }
  return counts
}
