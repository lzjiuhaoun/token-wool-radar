/** 羊毛雷达 Host 半共有类型。上游数据结构以 2026-11-09 实测快照为准。 */

export type OfferKind = 'daily' | 'weekly' | 'monthly' | 'once' | 'limited' | 'free'

export interface OfferModel {
  slug: string
  name: string
  href: string
  score: number
}

/** 一条羊毛（上游 deal 归一化后的形态）。 */
export interface Offer {
  id: string
  kind: OfferKind
  title: string
  provider: string
  detail: string
  url: string
  /** official 等上游证据等级 */
  evidence: string
  appliesTo: string
  appliesToAll: boolean
  realName: boolean
  clientOnly: boolean
  studentOnly: boolean
  autoRenews: boolean
  tags: string[]
  validity?: string
  verifiedAt?: string
  label: string
  note: string
  face: string
  models: OfferModel[]
  /** 上游是否计入「今天还能领」统计 */
  counted: boolean
  /** 折算人民币；null = 上游未折价（不折钱） */
  yuan: number | null
  /** 活动截止时间（ISO）；缺失表示长期有效 */
  endsAt?: string
  /** 额外购买说明 */
  buys?: string
  /** 上游图标相对路径 */
  icon?: string
}

/** 已绝版条目（上游 ended 数组元素）。 */
export interface EndedOffer {
  id: string
  kind: OfferKind
  provider: string
  face: string
  icon?: string
  endedAt: string
}

export interface SnapshotBasis {
  mix: string
  ratio: string
  usdCny: number
}

export interface SnapshotStats {
  /** 今天还能领（未领取且计价的 counted 条目折算合计，四舍五入到分） */
  claimableCny: number
  /** 有效条目数 */
  liveCount: number
  /** 绝版条目数 */
  endedCount: number
}

export type SnapshotOrigin = 'live' | 'cache' | 'error'

/** 面板与工具消费的数据快照。 */
export interface Snapshot {
  fetchedAt: string
  origin: SnapshotOrigin
  /** 上游服务端时间（ms epoch）；缺失时为本地抓取时间 */
  serverNow: number
  /** 上游给出的下次刷新时间（ms epoch）；缺失为 null */
  nextRefreshAt: number | null
  basis: SnapshotBasis
  offers: Offer[]
  ended: EndedOffer[]
  stats: SnapshotStats
  /** 解析失败率超过 30% 时为 true：只保留原链接，不展示折算信息 */
  degraded: boolean
  /** 解析失败条数 / 总条数 */
  parseFailures: number
  parseTotal: number
  error?: string
}
