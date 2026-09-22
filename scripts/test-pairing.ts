import {
  ingestScene,
  removeScene,
  sweepExpired,
  buildTimeline,
  countByStatus,
  PAIR_WINDOW_MS,
} from '@/services/pairing'
import type { WindowScene } from '@/types'

let passed = 0
let failed = 0
function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++
    console.log(`  ✓ ${msg}`)
  } else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}

let seq = 0
function makeScene(
  overrides: Partial<WindowScene> & Pick<WindowScene, 'routeName' | 'segment' | 'seatDirection' | 'timestamp'>,
): WindowScene {
  seq++
  return {
    id: `s${seq}`,
    weather: '晴',
    signText: '',
    treeDensity: '适中',
    pedestrianStatus: '稀少',
    note: '',
    pairStatus: '待配对',
    pairId: null,
    pairExpiresAt: null,
    ...overrides,
  }
}

const T0 = new Date('2026-09-22T10:00:00').getTime()
const iso = (offsetMin: number) => new Date(T0 + offsetMin * 60000).toISOString()

console.log('1. 先保存一侧 → 待配对；对侧 20 分钟内 → 自动完成')
{
  let scenes: WindowScene[] = []
  const left = makeScene({ routeName: '38路', segment: 'A-B', seatDirection: '左', timestamp: iso(0) })
  const r1 = ingestScene(scenes, left, T0)
  scenes = r1.scenes
  assert(r1.outcome.status === '待配对', '先保存的左侧进入待配对')
  assert(scenes[0].pairExpiresAt === iso(20), '失效时刻 = 保存时间 + 20 分钟')

  const right = makeScene({ routeName: '38路', segment: 'A-B', seatDirection: '右', timestamp: iso(15) })
  const r2 = ingestScene(scenes, right, T0 + 15 * 60000)
  scenes = r2.scenes
  assert(r2.outcome.status === '已完成' && r2.outcome.pairedWithId === left.id, '对侧 15 分钟后配对成功')
  assert(scenes.every((s) => s.pairStatus === '已完成'), '两侧都为已完成')
  assert(scenes[0].pairId === right.id && scenes[1].pairId === left.id, 'pairId 互相指向')
}

console.log('2. 超过 20 分钟 → 待配对失效并保留；迟到的对侧不再与它配对')
{
  let scenes: WindowScene[] = []
  const left = makeScene({ routeName: '38路', segment: 'A-B', seatDirection: '左', timestamp: iso(0) })
  scenes = ingestScene(scenes, left, T0).scenes

  const right = makeScene({ routeName: '38路', segment: 'A-B', seatDirection: '右', timestamp: iso(25) })
  const r = ingestScene(scenes, right, T0 + 25 * 60000)
  scenes = r.scenes
  const l = scenes.find((s) => s.id === left.id)!
  assert(l.pairStatus === '已失效' && l.pairExpiresAt === null, '超时的左侧标记为已失效并保留')
  assert(r.outcome.status === '待配对', '25 分钟后的对侧不与失效记录配对，自己进入待配对')
}

console.log('3. 同侧重复提交不挤掉已有待配对（FIFO，各自独立排队）')
{
  let scenes: WindowScene[] = []
  const l1 = makeScene({ routeName: '1路', segment: 'X-Y', seatDirection: '左', timestamp: iso(0) })
  const l2 = makeScene({ routeName: '1路', segment: 'X-Y', seatDirection: '左', timestamp: iso(2) })
  scenes = ingestScene(scenes, l1, T0).scenes
  scenes = ingestScene(scenes, l2, T0 + 2 * 60000).scenes
  assert(scenes.every((s) => s.pairStatus === '待配对'), '两条同侧记录都保留为待配对')

  const r = makeScene({ routeName: '1路', segment: 'X-Y', seatDirection: '右', timestamp: iso(5) })
  scenes = ingestScene(scenes, r, T0 + 5 * 60000).scenes
  const first = scenes.find((s) => s.id === l1.id)!
  const second = scenes.find((s) => s.id === l2.id)!
  assert(first.pairStatus === '已完成', '最早的待配对记录先配对（FIFO）')
  assert(second.pairStatus === '待配对', '后到的同侧记录不被挤掉，继续等待')
}

console.log('4. 不同线路或区间不配对')
{
  let scenes: WindowScene[] = []
  const a = makeScene({ routeName: '1路', segment: 'X', seatDirection: '左', timestamp: iso(0) })
  const b = makeScene({ routeName: '2路', segment: 'X', seatDirection: '右', timestamp: iso(1) })
  const c = makeScene({ routeName: '1路', segment: 'Z', seatDirection: '右', timestamp: iso(1) })
  scenes = ingestScene(scenes, a, T0).scenes
  scenes = ingestScene(scenes, b, T0 + 60000).scenes
  scenes = ingestScene(scenes, c, T0 + 60000).scenes
  assert(scenes.every((s) => s.pairStatus === '待配对'), '不同线路 / 不同区间不配对')
}

console.log('5. 移除已配对的一侧 → 另一方退回待配对（新 20 分钟窗口）')
{
  let scenes: WindowScene[] = []
  const left = makeScene({ routeName: '7路', segment: 'C-D', seatDirection: '左', timestamp: iso(0) })
  const right = makeScene({ routeName: '7路', segment: 'C-D', seatDirection: '右', timestamp: iso(5) })
  scenes = ingestScene(scenes, left, T0).scenes
  scenes = ingestScene(scenes, right, T0 + 5 * 60000).scenes

  const revertAt = T0 + 60 * 60000 // 一小时后才移除
  scenes = removeScene(scenes, right.id, revertAt)
  const l = scenes.find((s) => s.id === left.id)!
  assert(scenes.length === 1, '右侧被移除')
  assert(l.pairStatus === '待配对' && l.pairId === null, '另一方退回待配对，清空 pairId')
  assert(
    l.pairExpiresAt === new Date(revertAt + PAIR_WINDOW_MS).toISOString(),
    '退回后获得新的 20 分钟窗口（而不是沿用早已超时的旧窗口）',
  )
}

console.log('6. 移除待配对 / 已失效记录不影响其他记录；刷新后状态不变（纯函数+持久化字段）')
{
  let scenes: WindowScene[] = []
  const a = makeScene({ routeName: '9路', segment: 'P', seatDirection: '左', timestamp: iso(0) })
  const b = makeScene({ routeName: '9路', segment: 'Q', seatDirection: '右', timestamp: iso(1) })
  scenes = ingestScene(scenes, a, T0).scenes
  scenes = ingestScene(scenes, b, T0 + 60000).scenes
  scenes = removeScene(scenes, a.id, T0 + 60000)
  assert(scenes[0].id === b.id && scenes[0].pairStatus === '待配对', '移除待配对记录不影响他人')

  // 模拟刷新：扫描到点的待配对
  const refreshed = sweepExpired(scenes, T0 + 30 * 60000)
  assert(refreshed[0].pairStatus === '已失效', '刷新后超时记录为已失效')
  const again = sweepExpired(refreshed, T0 + 60 * 60000)
  assert(again === refreshed, '已失效状态刷新后保持不变')
}

console.log('7. 时间线归并与筛选')
{
  let scenes: WindowScene[] = []
  const l1 = makeScene({ routeName: 'R', segment: 's1', seatDirection: '左', timestamp: iso(0) })
  const r1 = makeScene({ routeName: 'R', segment: 's1', seatDirection: '右', timestamp: iso(3) })
  const l2 = makeScene({ routeName: 'R', segment: 's2', seatDirection: '左', timestamp: iso(0) })
  scenes = ingestScene(scenes, l1, T0).scenes
  scenes = ingestScene(scenes, r1, T0 + 3 * 60000).scenes
  scenes = ingestScene(scenes, l2, T0).scenes
  // s2 的左侧超时
  scenes = sweepExpired(scenes, T0 + 25 * 60000)

  const all = buildTimeline(scenes, T0 + 25 * 60000)
  assert(all.length === 2, '已配对两条合为一条 + 失效一条 = 2 个条目')
  const paired = all.find((e) => e.status === '已完成')!
  assert(paired.left!.seatDirection === '左' && paired.right!.seatDirection === '右', '已完成条目左右侧归位')

  const counts = countByStatus(scenes, T0 + 25 * 60000)
  assert(counts.已完成 === 1 && counts.待配对 === 0 && counts.已失效 === 1, '状态计数正确')
  assert(buildTimeline(scenes, T0 + 25 * 60000, '待配对').length === 0, '筛选待配对为空')
  assert(buildTimeline(scenes, T0 + 25 * 60000, '已失效').length === 1, '筛选已失效为 1')
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`)
if (failed > 0) process.exit(1)
