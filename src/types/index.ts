export type SeatDirection = '左' | '右'

export type Weather = '晴' | '多云' | '阴' | '小雨' | '大雨' | '雪' | '雾'

export type TreeDensity = '稀疏' | '适中' | '茂密'

export type PedestrianStatus = '稀少' | '零星' | '密集'

/** 对向采样配对状态：等待对侧 / 已完成配对 / 超时失效（记录保留） */
export type PairStatus = '待配对' | '已完成' | '已失效'

export interface WindowScene {
  id: string
  routeName: string
  segment: string
  seatDirection: SeatDirection
  timestamp: string
  weather: Weather
  signText: string
  treeDensity: TreeDensity
  pedestrianStatus: PedestrianStatus
  note: string
  /** 配对状态 */
  pairStatus: PairStatus
  /** 已完成配对时，另一侧记录的 id */
  pairId: string | null
  /** 待配对记录的失效时刻（ISO）；其余状态为 null */
  pairExpiresAt: string | null
}

export interface SceneFormData {
  routeName: string
  segment: string
  seatDirection: SeatDirection
  weather: Weather
  signText: string
  treeDensity: TreeDensity
  pedestrianStatus: PedestrianStatus
  note: string
}

/** 一次保存产生的配对结果，用于界面反馈 */
export interface PairOutcome {
  sceneId: string
  status: PairStatus
  pairedWithId: string | null
}
