import assert from 'node:assert'
import type { WindowScene } from '../src/types'
import { admit, removeScene, reconcile, PAIR_WINDOW_MS } from '../src/services/pairingEngine'
import type { PairEntry } from '../src/types'

let seq = 0
function makeScene(over: Partial<WindowScene> = {}): WindowScene {
  seq += 1
  return {
    id: `s${seq}`,
    routeName: '10路',
    segment: 'A站-B站',
    seatDirection: '左',
    timestamp: new Date(0).toISOString(),
    weather: '晴',
    signText: '',
    treeDensity: '适中',
    pedestrianStatus: '稀少',
    note: '',
    ...over,
  }
}

function at(ms: number): string {
  return new Date(ms).toISOString()
}

const T0 = 1_000_000_000_000
const MIN = 60_000

let passed = 0
function test(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`✓ ${name}`)
}

test('同线路同区间对向 20 分钟内自动配对', () => {
  const left = makeScene({ seatDirection: '左', timestamp: at(T0) })
  let scenes = [left]
  let entries: PairEntry[] = []
  let r = admit(entries, scenes, left, left.timestamp, T0)
  entries = r.entries
  assert.equal(r.status, 'pending')

  const right = makeScene({ seatDirection: '右', timestamp: at(T0 + 10 * MIN) })
  scenes = [...scenes, right]
  r = admit(entries, scenes, right, at(T0 + 10 * MIN), T0 + 10 * MIN)
  entries = r.entries
  assert.equal(r.status, 'completed')
  const le = entries.find((e) => e.sceneId === left.id)!
  const re = entries.find((e) => e.sceneId === right.id)!
  assert.equal(le.status, 'completed')
  assert.equal(le.partnerId, right.id)
  assert.equal(re.partnerId, left.id)
  assert.equal(le.pairId, re.pairId)
})

test('相差超过 20 分钟不配对，先保存者失效并保留', () => {
  const left = makeScene({ seatDirection: '左', timestamp: at(T0) })
  let entries = admit([], [left], left, left.timestamp, T0).entries
  const scenes = [left]
  // 21 分钟后，左已失效
  entries = reconcile(entries, scenes, at(T0 + 21 * MIN))
  assert.equal(entries.find((e) => e.sceneId === left.id)!.status, 'expired')

  const right = makeScene({ seatDirection: '右', timestamp: at(T0 + 21 * MIN) })
  const all = [...scenes, right]
  const r = admit(entries, all, right, right.timestamp, T0 + 21 * MIN)
  assert.equal(r.status, 'pending')
  assert.equal(r.entries.find((e) => e.sceneId === left.id)!.status, 'expired')
  assert.equal(r.entries.find((e) => e.sceneId === right.id)!.status, 'pending')
})

test('恰好 20 分钟边界内可以配对，超出则不能', () => {
  const left = makeScene({ seatDirection: '左', timestamp: at(T0) })
  let entries = admit([], [left], left, left.timestamp, T0).entries
  const scenes = [left]
  const right = makeScene({ seatDirection: '右', timestamp: at(T0 + PAIR_WINDOW_MS) })
  const all = [...scenes, right]
  const r = admit(entries, all, right, right.timestamp, T0 + PAIR_WINDOW_MS)
  assert.equal(r.status, 'completed')
  entries = r.entries

  // 再来一组，差 1ms 超出；此时左也已超过待配对有效窗而失效
  const l2 = makeScene({ id: 'l2', seatDirection: '左', timestamp: at(T0) })
  const r2 = makeScene({ id: 'r2', seatDirection: '右', timestamp: at(T0 + PAIR_WINDOW_MS + 1) })
  const e2init = admit([], [l2], l2, l2.timestamp, T0).entries
  const out = admit(e2init, [l2, r2], r2, r2.timestamp, T0 + PAIR_WINDOW_MS + 1)
  assert.equal(out.status, 'pending')
  assert.equal(out.entries.find((x) => x.sceneId === 'l2')!.status, 'expired')
})

test('同侧重复提交不挤掉已有待配对，对向到来时先配最早的', () => {
  const left1 = makeScene({ seatDirection: '左', timestamp: at(T0) })
  let entries = admit([], [left1], left1, left1.timestamp, T0).entries
  let scenes = [left1]
  const left2 = makeScene({ seatDirection: '左', timestamp: at(T0 + 2 * MIN) })
  scenes = [...scenes, left2]
  entries = admit(entries, scenes, left2, left2.timestamp, T0 + 2 * MIN).entries
  assert.equal(entries.find((e) => e.sceneId === left1.id)!.status, 'pending')
  assert.equal(entries.find((e) => e.sceneId === left2.id)!.status, 'pending')

  const right = makeScene({ seatDirection: '右', timestamp: at(T0 + 5 * MIN) })
  scenes = [...scenes, right]
  entries = admit(entries, scenes, right, right.timestamp, T0 + 5 * MIN).entries
  assert.equal(entries.find((e) => e.sceneId === left1.id)!.status, 'completed')
  assert.equal(entries.find((e) => e.sceneId === left1.id)!.partnerId, right.id)
  assert.equal(entries.find((e) => e.sceneId === left2.id)!.status, 'pending')
})

test('移除已配对的一侧，另一方退回待配对并重开 20 分钟窗', () => {
  const left = makeScene({ seatDirection: '左', timestamp: at(T0) })
  const right = makeScene({ seatDirection: '右', timestamp: at(T0 + 15 * MIN) })
  let entries = admit([], [left], left, left.timestamp, T0).entries
  entries = admit(entries, [left, right], right, right.timestamp, T0 + 15 * MIN).entries
  assert.equal(entries.find((e) => e.sceneId === left.id)!.status, 'completed')

  // 距左保存已 35 分钟（若用旧窗口本应失效），删除右 → 左退回待配对应仍有效
  const now = T0 + 35 * MIN
  entries = removeScene(entries, [left], right.id, at(now))
  const le = entries.find((e) => e.sceneId === left.id)!
  assert.equal(le.status, 'pending')
  assert.equal(le.partnerId, null)
  assert.equal(new Date(le.since).getTime(), now)

  // 再过 19 分钟，新的右侧到来（与左保存时间相差很远，但退回后重新开窗）
  const right2 = makeScene({ seatDirection: '右', timestamp: at(now + 19 * MIN) })
  const r = admit(entries, [left, right2], right2, right2.timestamp, now + 19 * MIN)
  // 保存时间相差超过 20 分钟，仍不应配对（时间差条件必须满足）
  assert.equal(r.status, 'pending')

  // 改为相差 5 分钟的对向：不可行（时间戳客观相差太远），因此验证退回后超时失效
  const after = reconcile(r.entries, [left, right2], at(now + 21 * MIN))
  assert.equal(after.find((e) => e.sceneId === left.id)!.status, 'expired')
})

test('退回待配对方若队列中有其他合格对向，立即重新配对', () => {
  const left = makeScene({ seatDirection: '左', timestamp: at(T0) })
  const right1 = makeScene({ seatDirection: '右', timestamp: at(T0 + 5 * MIN) })
  const right2 = makeScene({ seatDirection: '右', timestamp: at(T0 + 6 * MIN) })
  const scenes = [left, right1, right2]
  let entries = admit([], [left], left, left.timestamp, T0).entries
  entries = admit(entries, [left, right1], right1, right1.timestamp, T0 + 5 * MIN).entries
  // right2 同侧重复，排队等待
  entries = admit(entries, scenes, right2, right2.timestamp, T0 + 6 * MIN).entries
  assert.equal(entries.find((e) => e.sceneId === right2.id)!.status, 'pending')

  // 删除 right1，left 退回，应立即与 right2 配上（时间差 6 分钟）
  entries = removeScene(entries, [left, right2], right1.id, at(T0 + 8 * MIN))
  assert.equal(entries.find((e) => e.sceneId === left.id)!.partnerId, right2.id)
  assert.equal(entries.find((e) => e.sceneId === right2.id)!.status, 'completed')
})

test('不同线路或不同区间不配对', () => {
  const left = makeScene({ routeName: '10路', segment: 'A-B', seatDirection: '左', timestamp: at(T0) })
  const right = makeScene({ routeName: '20路', segment: 'A-B', seatDirection: '右', timestamp: at(T0 + 5 * MIN) })
  const r1 = admit(
    admit([], [left], left, left.timestamp, T0).entries,
    [left, right], right, right.timestamp, T0 + 5 * MIN,
  )
  assert.equal(r1.status, 'pending')

  const rightSeg = makeScene({ routeName: '10路', segment: 'C-D', seatDirection: '右', timestamp: at(T0 + 5 * MIN) })
  const r2 = admit(
    admit([], [left], left, left.timestamp, T0).entries,
    [left, rightSeg], rightSeg, rightSeg.timestamp, T0 + 5 * MIN,
  )
  assert.equal(r2.status, 'pending')
})

test('刷新 reconcile 后状态保持不变（幂等）', () => {
  const left = makeScene({ seatDirection: '左', timestamp: at(T0) })
  const right = makeScene({ seatDirection: '右', timestamp: at(T0 + 10 * MIN) })
  const expiredLeft = makeScene({ id: 'e1', seatDirection: '左', timestamp: at(T0 - 60 * MIN) })
  const scenes = [left, right, expiredLeft]

  // 模拟只有原始场景、无任何配对数据时加载（历史数据重建）
  let entries = reconcile([], scenes, at(T0 + 15 * MIN))
  const snap = JSON.stringify(entries)
  assert.equal(entries.find((e) => e.sceneId === left.id)!.status, 'completed')
  assert.equal(entries.find((e) => e.sceneId === right.id)!.status, 'completed')
  assert.equal(entries.find((e) => e.sceneId === 'e1')!.status, 'expired')

  // 再次刷新：结果完全一致
  entries = reconcile(entries, scenes, at(T0 + 16 * MIN))
  assert.equal(JSON.stringify(entries), snap)
})

test('删除单条待配对/失效记录不影响其他记录', () => {
  const left = makeScene({ seatDirection: '左', timestamp: at(T0) })
  const other = makeScene({ id: 'o1', routeName: '99路', segment: 'Z-Z', seatDirection: '右', timestamp: at(T0) })
  let entries = admit([], [left], left, left.timestamp, T0).entries
  entries = admit(entries, [left, other], other, other.timestamp, T0).entries
  entries = removeScene(entries, [left], other.id, at(T0 + 1 * MIN))
  assert.equal(entries.length, 1)
  assert.equal(entries[0].sceneId, left.id)
  assert.equal(entries[0].status, 'pending')
})

console.log(`\n${passed} 个测试全部通过`)
