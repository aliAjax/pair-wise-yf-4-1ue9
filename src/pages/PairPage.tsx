import { useEffect, useMemo, useState } from 'react'
import {
  GitMerge,
  Search,
  Hourglass,
  CheckCircle2,
  XCircle,
  Trash2,
  MapPin,
  ArrowLeftRight,
  Timer,
  Clock,
} from 'lucide-react'
import { useSceneStore } from '@/store/useSceneStore'
import {
  buildTimeline,
  countByStatus,
  PAIR_WINDOW_MS,
  type PairTimelineEntry,
} from '@/services/pairing'
import {
  formatTimestamp,
  getTimeOfDay,
  getWeatherIcon,
} from '@/utils/sceneHelpers'
import type { WindowScene, PairStatus } from '@/types'

type Filter = PairStatus | '全部'

const FILTERS: { key: Filter; icon: typeof Hourglass; label: string }[] = [
  { key: '待配对', icon: Hourglass, label: '待配对' },
  { key: '已完成', icon: CheckCircle2, label: '已完成' },
  { key: '已失效', icon: XCircle, label: '已失效' },
]

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function timeGap(a: WindowScene, b: WindowScene): string {
  const diff = Math.abs(new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  const minutes = Math.round(diff / 60000)
  return `相差 ${minutes} 分钟`
}

function SidePane({ scene, accent }: { scene: WindowScene; accent: boolean }) {
  return (
    <div
      className={`flex-1 rounded-xl border p-3 ${
        accent
          ? 'border-dusk-400/30 bg-dusk-400/10'
          : 'border-teal-800 bg-teal-900/50'
      }`}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="rounded-full bg-teal-800/70 px-2 py-0.5 text-[10px] text-mist-300">
          {scene.seatDirection}侧
        </span>
        {getWeatherIcon(scene.weather)}
      </div>
      <p className="text-xs leading-relaxed text-mist-300 line-clamp-3">
        {scene.note || '（无观察笔记）'}
      </p>
      {scene.signText && (
        <p className="mt-1.5 inline-block rounded bg-teal-800/60 px-1.5 py-0.5 text-[10px] text-mist-300">
          {scene.signText}
        </p>
      )}
      <p className="mt-2 text-[10px] text-mist-500">
        {formatTimestamp(scene.timestamp)} · {getTimeOfDay(scene.timestamp)}
      </p>
    </div>
  )
}

export default function PairPage() {
  const { scenes, loadAll, deleteScene, sweepPairs } = useSceneStore()
  const [filter, setFilter] = useState<Filter>('全部')
  const [search, setSearch] = useState('')
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // 每秒刷新倒计时；到点则固化失效状态
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
      sweepPairs()
    }, 1000)
    return () => clearInterval(timer)
  }, [sweepPairs])

  const counts = useMemo(() => countByStatus(scenes, now), [scenes, now])

  const entries = useMemo(() => {
    const list = buildTimeline(scenes, now, filter === '全部' ? null : filter)
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (e) =>
        e.left.routeName.toLowerCase().includes(q) ||
        e.left.segment.toLowerCase().includes(q) ||
        (e.right?.segment.toLowerCase().includes(q) ?? false),
    )
  }, [scenes, now, filter, search])

  return (
    <div className="min-h-screen bg-teal-950 font-serif text-mist-100">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-2 flex items-center gap-3">
          <GitMerge className="h-7 w-7 text-dusk-400" />
          <h1 className="text-3xl font-bold tracking-wide text-dusk-400">
            对向采样配对
          </h1>
        </div>
        <p className="mb-6 flex items-center gap-1.5 text-xs text-mist-400">
          <Timer className="h-3.5 w-3.5" />
          同一线路、同一区间的左右侧记录，保存时间相差 20 分钟内自动配对；超时记录保留留档
        </p>

        {/* 状态筛选 */}
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setFilter('全部')}
            className={`rounded-full px-3.5 py-1.5 text-xs transition-colors ${
              filter === '全部'
                ? 'bg-dusk-400 text-teal-950'
                : 'bg-teal-900 text-mist-300 hover:bg-teal-800'
            }`}
          >
            全部 {entries.length && filter === '全部' ? entries.length : ''}
          </button>
          {FILTERS.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs transition-colors ${
                filter === key
                  ? 'bg-dusk-400 text-teal-950'
                  : 'bg-teal-900 text-mist-300 hover:bg-teal-800'
              }`}
            >
              <Icon className="h-3 w-3" />
              {label}
              <span
                className={`rounded-full px-1.5 text-[10px] ${
                  filter === key ? 'bg-teal-950/20' : 'bg-teal-800 text-mist-400'
                }`}
              >
                {counts[key]}
              </span>
            </button>
          ))}
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索线路或区间..."
            className="w-full rounded-lg border border-teal-800 bg-teal-900/60 py-2.5 pl-10 pr-4 text-sm text-mist-100 placeholder:text-mist-500 focus:border-dusk-400 focus:outline-none"
          />
        </div>

        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-mist-400">
            <div className="mb-4 text-6xl opacity-30">🪟</div>
            <p className="text-lg">
              {scenes.length === 0
                ? '还没有记录，先去保存一段窗景'
                : '当前筛选下没有配对记录'}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {entries.map((entry) => (
              <TimelineCard
                key={entry.key}
                entry={entry}
                now={now}
                onDelete={deleteScene}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TimelineCard({
  entry,
  now,
  onDelete,
}: {
  entry: PairTimelineEntry
  now: number
  onDelete: (id: string) => void
}) {
  const { left, right, status } = entry

  const badge = {
    待配对: (
      <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-[10px] text-amber-300">
        <Hourglass className="h-3 w-3" />待配对
      </span>
    ),
    已完成: (
      <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] text-emerald-300">
        <CheckCircle2 className="h-3 w-3" />已完成
      </span>
    ),
    已失效: (
      <span className="flex items-center gap-1 rounded-full bg-mist-500/15 px-2.5 py-1 text-[10px] text-mist-400">
        <XCircle className="h-3 w-3" />已失效
      </span>
    ),
  }[status]

  return (
    <div className="rounded-2xl border border-teal-800 bg-teal-900/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-mist-200">
          <MapPin className="h-3.5 w-3.5 text-dusk-400" />
          <span className="font-semibold">{left.routeName}</span>
          <span className="text-teal-600">·</span>
          <span>{left.segment}</span>
        </div>
        {badge}
      </div>

      {status === '已完成' && right ? (
        <>
          <div className="flex items-stretch gap-2">
            <SidePane scene={left} accent={left.seatDirection === '左'} />
            <div className="flex items-center text-dusk-400/70">
              <ArrowLeftRight className="h-4 w-4" />
            </div>
            <SidePane scene={right} accent={right.seatDirection === '左'} />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="flex items-center gap-1 text-[10px] text-emerald-300/70">
              <Clock className="h-3 w-3" />
              {timeGap(left, right)}
            </span>
            <button
              onClick={() => onDelete(left.id)}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-mist-500 transition-colors hover:bg-red-900/30 hover:text-red-300"
              title="移除该侧，另一侧退回待配对"
            >
              <Trash2 className="h-3 w-3" />移除左侧
            </button>
          </div>
          <div className="mt-1 flex justify-end">
            <button
              onClick={() => onDelete(right.id)}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-mist-500 transition-colors hover:bg-red-900/30 hover:text-red-300"
              title="移除该侧，另一侧退回待配对"
            >
              <Trash2 className="h-3 w-3" />移除右侧
            </button>
          </div>
        </>
      ) : (
        <>
          <SidePane scene={left} accent={false} />
          <div className="mt-3 flex items-center justify-between">
            {status === '待配对' && left.pairExpiresAt ? (
              <span
                className={`flex items-center gap-1 text-[11px] ${
                  new Date(left.pairExpiresAt).getTime() - now < PAIR_WINDOW_MS / 4
                    ? 'text-red-300'
                    : 'text-amber-300/80'
                }`}
              >
                <Hourglass className="h-3 w-3" />
                等待对侧 · 剩余 {formatCountdown(
                  new Date(left.pairExpiresAt).getTime() - now,
                )}
              </span>
            ) : (
              <span className="text-[11px] text-mist-500">
                超过 20 分钟未配对，记录已留档
              </span>
            )}
            <button
              onClick={() => onDelete(left.id)}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-mist-500 transition-colors hover:bg-red-900/30 hover:text-red-300"
            >
              <Trash2 className="h-3 w-3" />移除
            </button>
          </div>
        </>
      )}
    </div>
  )
}
