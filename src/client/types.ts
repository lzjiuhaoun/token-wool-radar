/** Client 半共享类型（与 Host 半的 RadarView 对应，JSON 线格式）。 */

export interface OfferModel {
  slug: string
  name: string
  href: string
  score: number
}

export interface Offer {
  id: string
  kind: 'daily' | 'weekly' | 'monthly' | 'once' | 'limited' | 'free'
  title: string
  provider: string
  detail: string
  url: string
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
  counted: boolean
  yuan: number | null
  endsAt?: string
  buys?: string
  icon?: string
}

export interface EndedOffer {
  id: string
  kind: string
  provider: string
  face: string
  icon?: string
  endedAt: string
}

export interface ClaimState {
  offerId: string
  claimedThisPeriod: boolean
  claimedAt?: string
  firstClaimedAt?: string
  totalClaims: number
  claimedCny: number
  level: { id: 'common' | 'fine' | 'rare' | 'epic' | 'legend'; rank: number; labelZh: string; labelEn: string; shiny: boolean } | null
  legacy: boolean
}

export interface AlbumEntry {
  offerId: string
  provider: string
  title: string
  face: string
  icon?: string
  kind: string
  level: ClaimState['level']
  firstClaimedAt: string
  totalClaims: number
  legacy: boolean
}

export interface ViewStats {
  claimableCny: number
  claimedCnyThisPeriod: number
  collectedCount: number
  totalCount: number
  endedCount: number
  nextResetAt: number | null
  nextRefreshAt: number | null
}

export interface Snapshot {
  fetchedAt: string
  origin: 'live' | 'cache' | 'error'
  serverNow: number
  nextRefreshAt: number | null
  basis: { mix: string; ratio: string; usdCny: number }
  offers: Offer[]
  ended: EndedOffer[]
  stats: { claimableCny: number; liveCount: number; endedCount: number }
  degraded: boolean
  parseFailures: number
  parseTotal: number
  error?: string
}

export interface RadarView {
  snapshot: Snapshot
  claims: Record<string, ClaimState>
  album: AlbumEntry[]
  stats: ViewStats
}
