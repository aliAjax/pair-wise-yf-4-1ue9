import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeftRight,
  Hourglass,
  TimerOff,
  Trash2,
  Clock,
  MapPin,
  CornerDownRight,
} from 'lucide-react'
import { useSceneStore } from '@/store/useSceneStore'
import { usePairingStore } from '@/store/usePairingStore'
import { PAIR_WINDOW_MS } from '@/services/pairingEngine'
import {
  formatTimestamp,
  getTimeOfDay,
  getWeatherIcon,
  getTreeIcon,
  getPedestrianIcon,
} from '@/utils/sceneHelpers'
import type { PairEntry, PairStatus, WindowScene } from '@/types'

type FilterKey = PairStatus | 'all'

interface PairViewItem {
  key: string
  status: PairStatus
  /** 时间线排序依据（取该组中最晚的保存时间） */
  sortTs: number
  scenes: { scene: WindowScene; entry: PairEntry }[]
}

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待配对' },
  { key: 'completed', label: '已完成' },
  { key: 'expired', label: '已失效' },
]

function remainingMs(entry: PairEntry, nowMs: number): number {
  return Math.max(0, new Date(entry.since).getTime() + PAIR_WINDOW_MS - nowMs)
}

function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}分${String(s).padStart(2, '0')}秒`
}

function SceneBlock({
  scene,
  onRemove,
}: {
  scene: WindowScene
  onRemove?: (id: string) => void
}) {
  return (
    <div className="flex-1 rounded-lg border border-teal-800 bg-teal-950/60 p-3">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {getWeatherIcon(scene.weather)}
          <span className="rounded bg-dusk-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-dusk-300">
            {scene.seatDirection}侧
          </span>
          <span className="text-xs font-semibold text-mist-100">{scene.segment}</span>
        </div>
        {onRemove && (
          <button
            onClick={() => onRemove(scene.id)}
            title="移除该记录"
            className="shrink-0 text-mist-500 transition-colors hover:text-red-300"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="mb-1 flex items-center gap-1 text-mist-400">
        <MapPin className="w-3 h-3" />
        <span className="text-[11px]">{scene.routeName}</span>
        <span className="text-teal-700">·</span>
        <Clock className="w-3 h-3" />
        <span className="text-[11px]">{formatTimestamp(scene.timestamp)}</span>
      </div>
      {scene.note && <p className="text-[11px] text-mist-400 line-clamp-1">{scene.note}</p>}
      <div className="mt-1.5 flex items-center gap-1.5">
        {getTreeIcon(scene.treeDensity)}
        {getPedestrianIcon(scene.pedestrianStatus)}
        {scene.signText && (
          <span className="rounded bg-teal-800/60 px-1.5 py-0.5 text-[10px] text-mist-300">
            {scene.signText}
          </span>
        )}
      </div>
    </div>
  )
}

export default function PairingPage() {
  const { scenes, loadAll, deleteScene } = useSceneStore()
  const { entries, loadPairings } = usePairingStore()
  const [filter, setFilter] = useState<FilterKey>('all')
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    loadAll()
  }, [loadAll])

  useEffect(() => {
    const displayTimer = setInterval(() => setNow(Date.now()), 1000)
    // 定期校正：待配对超时后持久化为已失效
    const sweepTimer = setInterval(() => loadPairings(useSceneStore.getState().scenes), 3000)
    return () => {
      clearInterval(displayTimer)
      clearInterval(sweepTimer)
    }
  }, [loadPairings])

  const sceneMap = useMemo(() => new Map(scenes.map((s) => [s.id, s])), [scenes])

  const items = useMemo<PairViewItem[]>(() => {
    const groups = new Map<string, { status: PairStatus; rows: { scene: WindowScene; entry: PairEntry }[] }>()

    for (const entry of entries) {
      const scene = sceneMap.get(entry.sceneId)
      if (!scene) continue
      const groupKey =
        entry.status === 'completed' && entry.pairId ? `pair:${entry.pairId}` : `single:${entry.sceneId}`
      if (!groups.has(groupKey)) groups.set(groupKey, { status: entry.status, rows: [] })
      groups.get(groupKey)!.rows.push({ scene, entry })
    }

    const result: PairViewItem[] = []
    for (const [key, group] of groups) {
      // 已完成组按两侧排序（左在前），单记录组自然只有一项
      group.rows.sort((a, b) =>
        a.scene.seatDirection === b.scene.seatDirection ? 0 : a.scene.seatDirection === '左' ? -1 : 1
      )
      result.push({
        key,
        status: group.status,
        sortTs: Math.max(...group.rows.map((r) => new Date(r.scene.timestamp).getTime())),
        scenes: group.rows,
      })
    }
    return result.sort((a, b) => b.sortTs - a.sortTs)
  }, [entries, sceneMap])

  const counts = useMemo(() => {
    const c: Record<PairStatus, number> = { pending: 0, completed: 0, expired: 0 }
    for (const entry of entries) c[entry.status] += 1
    return c
  }, [entries])

  const visibleItems = filter === 'all' ? items : items.filter((i) => i.status === filter)

  return (
    <div className="min-h-screen bg-teal-950 font-serif text-mist-100">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-2 flex items-center gap-2">
          <ArrowLeftRight className="w-7 h-7 text-dusk-400" />
          <h1 className="text-3xl font-bold tracking-wide text-dusk-400">对向采样配对</h1>
        </div>
        <p className="mb-6 text-xs leading-relaxed text-mist-500">
          同一线路、同一区间的左右侧窗景，保存时间相差 20 分钟以内自动配对。
          先保存的一侧进入待配对；超时未配上则失效保留；移除已配对的一侧，另一方退回待配对。
        </p>

        <div className="mb-6 flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = filter === f.key
            const count = f.key === 'all' ? entries.length : counts[f.key]
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-3.5 py-1.5 text-xs transition-colors ${
                  active ? 'bg-dusk-400 text-teal-950' : 'bg-teal-900 text-mist-300 hover:bg-teal-800'
                }`}
              >
                {f.label}
                <span className={`ml-1.5 ${active ? 'text-teal-800' : 'text-mist-500'}`}>{count}</span>
              </button>
            )
          })}
        </div>

        {visibleItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-mist-400">
            <div className="mb-4 text-6xl opacity-300">🪟</div>
            <p className="text-lg">
              {filter === 'all' ? '暂无窗景记录，先去保存一条对向观察吧' : '当前筛选下没有记录'}
            </p>
          </div>
        ) : (
          <div className="relative pl-8">
            <div className="absolute left-3 top-0 bottom-0 w-px bg-teal-800" />
            <div className="space-y-5">
              {visibleItems.map((item) => {
                const dotColor =
                  item.status === 'completed'
                    ? 'bg-dusk-400'
                    : item.status === 'pending'
                      ? 'bg-mist-300 animate-pulse'
                      : 'bg-mist-500'
                return (
                  <div key={item.key} className="relative flex gap-4">
                    <div className={`absolute -left-5 top-1 h-2.5 w-2.5 rounded-full ring-4 ring-teal-950 ${dotColor}`} />
                    <div className="w-20 shrink-0 pt-0.5 text-right">
                      <p className="text-xs text-dusk-400">
                        {formatTimestamp(new Date(item.sortTs).toISOString())}
                      </p>
                      <p className="mt-0.5 text-[10px] text-mist-500">
                        {getTimeOfDay(new Date(item.sortTs).toISOString())}
                      </p>
                    </div>

                    <div className="flex-1">
                      {item.status === 'completed' ? (
                        <div className="rounded-xl border border-dusk-400/30 bg-teal-900/50 p-3">
                          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-dusk-300">
                            <ArrowLeftRight className="w-3.5 h-3.5" />
                            配对完成
                            <span className="ml-auto flex items-center gap-1 text-[10px] font-normal text-mist-500">
                              <MapPin className="w-3 h-3" />
                              {item.scenes[0].scene.routeName} · {item.scenes[0].scene.segment}
                            </span>
                          </div>
                          <div className="flex items-stretch gap-2">
                            {item.scenes.map(({ scene }) => (
                              <SceneBlock key={scene.id} scene={scene} onRemove={deleteScene} />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div
                          className={`rounded-xl border p-3 ${
                            item.status === 'pending'
                              ? 'border-mist-400/30 bg-teal-900/50'
                              : 'border-teal-800 bg-teal-900/30 opacity-70'
                          }`}
                        >
                          {item.scenes.map(({ scene, entry }) => (
                            <div key={scene.id}>
                              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold">
                                {item.status === 'pending' ? (
                                  <>
                                    <Hourglass className="w-3.5 h-3.5 text-mist-300" />
                                    <span className="text-mist-200">待配对 · 等待对向侧记录</span>
                                    <span className="ml-auto rounded-full bg-mist-400/10 px-2 py-0.5 font-mono text-[10px] text-mist-300">
                                      剩余 {formatCountdown(remainingMs(entry, now))}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <TimerOff className="w-3.5 h-3.5 text-mist-500" />
                                    <span className="text-mist-500">已失效 · 20 分钟内未配上，记录保留</span>
                                  </>
                                )}
                              </div>
                              <div className="flex items-start gap-2">
                                <SceneBlock scene={scene} onRemove={deleteScene} />
                              </div>
                              {item.status === 'pending' && (
                                <p className="mt-2 flex items-center gap-1 text-[10px] text-mist-500">
                                  <CornerDownRight className="w-3 h-3" />
                                  保存同线路同区间另一侧的窗景即可自动完成配对；同侧重提不会顶替本记录
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
