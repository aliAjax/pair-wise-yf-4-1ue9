export type SeatDirection = '左' | '右'

export type Weather = '晴' | '多云' | '阴' | '小雨' | '大雨' | '雪' | '雾'

export type TreeDensity = '稀疏' | '适中' | '茂密'

export type PedestrianStatus = '稀少' | '零星' | '密集'

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

export type PairStatus = 'pending' | 'completed' | 'expired'

export interface PairEntry {
  sceneId: string
  partnerId: string | null
  pairId: string | null
  status: PairStatus
  /** 进入当前“待配对”状态的时刻（ISO），20 分钟有效窗以此为起点 */
  since: string
  /** 退回待配对时重开有效窗的时刻；未发生过退回则为空 */
  reopenedAt?: string
}
