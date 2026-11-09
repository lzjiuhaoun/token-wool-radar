/** 羊毛雷达核心服务：一个实现，两个调用方（面板经 HTTP 桥、Agent 经工具）。 */

import { cadenceKeyOf, isExpired, nextResetAt, yuanOf } from '../offers/convert.ts'
import { SnapshotCache, UpstreamError, fetchUpstream } from '../offers/fetch.ts'
import { parseUpstream } from '../offers/parse.ts'
import type { Offer, Snapshot } from '../offers/types.ts'
import { claimDomainSpec, claimRecordKey, type ClaimRecord } from './domain.ts'
import type { ClaimDomain, ClaimTable, StorageDomainFacility } from './types.ts'
import { levelOfAmount, type WoolLevel, type WoolLevelId } from './levels.ts'

export interface ClaimState {
  offerId: string
  /** 当前周期已领取且未撤销 */
  claimedThisPeriod: boolean
  claimedAt?: string
  /** 历史首次（未撤销）领取时间 */
  firstClaimedAt?: string
  /** 累计有效领取轮数 */
  totalClaims: number
  /** 当前周期累计领取价值 */
  claimedCny: number
  level: WoolLevel | null
  /** 绝版：条目已结束且有领取历史 */
  legacy: boolean
}

export interface AlbumEntry {
  offerId: string
  provider: string
  title: string
  face: string
  icon?: string
  kind: Offer['kind']
  level: WoolLevel
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

export interface RadarView {
  snapshot: Snapshot
  claims: Record<string, ClaimState>
  album: AlbumEntry[]
  stats: ViewStats
}

export type ServiceResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } }

const ok = <T>(value: T): ServiceResult<T> => ({ ok: true, value })
const fail = (code: string, message: string): ServiceResult<never> => ({ ok: false, error: { code, message } })

export interface WoolServiceOptions {
  storageDomain?: StorageDomainFacility
  /** 注入抓取函数（测试用） */
  fetch?: () => Promise<ReturnType<typeof parseUpstream>>
}

export class WoolService {
  private readonly cache = new SnapshotCache()
  private domain: ClaimDomain | null = null
  private openFailed = false
  private lastSnapshot: Snapshot | null = null
  private readonly fetchFn: WoolServiceOptions['fetch']
  private readonly ctx: unknown
  private storageDomain: StorageDomainFacility | undefined

  constructor(ctx: unknown, options: WoolServiceOptions = {}) {
    this.ctx = ctx
    this.fetchFn = options.fetch ?? (async () => fetchUpstream())
    if (options.storageDomain !== undefined) this.storageDomain = options.storageDomain
  }

  /** 打开存储域；插件卸载时由 ctx.effect 清理调用 close()。 */
  async open(): Promise<void> {
    const facility = this.storageDomain ?? (this.ctx as { storageDomain?: StorageDomainFacility }).storageDomain
    if (facility === undefined) throw new Error('token-wool-radar: storageDomain service is unavailable')
    this.domain = (await facility.open(claimDomainSpec)) as unknown as ClaimDomain
  }

  /** 懒打开：effect 期打开失败（竟态）时，写入前再试一次。 */
  private async ensureDomain(): Promise<ClaimDomain | null> {
    if (this.domain !== null) return this.domain
    if (this.openFailed) return null
    try {
      await this.open()
    } catch {
      this.openFailed = true
      return null
    }
    return this.domain
  }

  async close(): Promise<void> {
    await this.domain?.close()
    this.domain = null
  }

  private table(): ClaimTable | null {
    return this.domain?.table('claims') ?? null
  }

  private async tableForWrite(): Promise<ClaimTable | null> {
    if (this.domain !== null) return this.domain.table('claims')
    const domain = await this.ensureDomain()
    return domain?.table('claims') ?? null
  }

  private allRecords(): ClaimRecord[] {
    const table = this.table()
    if (table === null) return []
    return [...table.entries()].map(([, record]) => record)
  }

  /** 拉取快照：10 分钟缓存优先；force 绕过缓存（手动刷新）。 */
  async snapshot(force = false): Promise<Snapshot> {
    const now = Date.now()
    if (!force) {
      const cached = this.cache.get()
      if (cached !== null) return this.assemble(cached, now, 'cache')
      if (this.lastSnapshot !== null) return this.lastSnapshot
    }
    try {
      const parsed = await this.fetchFn()
      this.cache.put(parsed)
      const snapshot = this.assemble(parsed, now, 'live')
      this.lastSnapshot = snapshot
      return snapshot
    } catch (error) {
      const message = error instanceof UpstreamError ? `${error.code}: ${error.message}` : `unexpected: ${String(error)}`
      if (this.lastSnapshot !== null) return { ...this.lastSnapshot, origin: 'cache', error: message }
      return {
        fetchedAt: new Date(now).toISOString(),
        origin: 'error',
        serverNow: now,
        nextRefreshAt: null,
        basis: { mix: '', ratio: '', usdCny: 0 },
        offers: [],
        ended: [],
        stats: { claimableCny: 0, liveCount: 0, endedCount: 0 },
        degraded: false,
        parseFailures: 0,
        parseTotal: 0,
        error: message,
      }
    }
  }

  private assemble(parsed: ReturnType<typeof parseUpstream>, now: number, origin: Snapshot['origin']): Snapshot {
    const failureRate = parsed.total === 0 ? 1 : parsed.failures / parsed.total
    const degraded = failureRate > 0.3
    const offers = parsed.deals.filter((offer) => !isExpired(offer.endsAt, now))
    return {
      fetchedAt: new Date(now).toISOString(),
      origin,
      serverNow: parsed.serverNow,
      nextRefreshAt: parsed.expiresAt,
      basis: parsed.basis,
      offers,
      ended: parsed.ended,
      stats: { claimableCny: 0, liveCount: offers.length, endedCount: parsed.ended.length },
      degraded,
      parseFailures: parsed.failures,
      parseTotal: parsed.total,
    }
  }

  /** 汇总视图：快照 + 领取状态 + 卡册 + 统计。 */
  async view(force = false): Promise<RadarView> {
    const snapshot = await this.snapshot(force)
    const claims = this.claimStates(snapshot)
    const album = this.album(snapshot, claims)
    const stats = this.viewStats(snapshot, claims, album)
    return { snapshot, claims, album, stats }
  }

  private claimStates(snapshot: Snapshot): Record<string, ClaimState> {
    const now = Date.now()
    const out: Record<string, ClaimState> = {}
    const records = this.allRecords()
    const byOffer = new Map<string, ClaimRecord[]>()
    for (const record of records) {
      const list = byOffer.get(record.offerId) ?? []
      list.push(record)
      byOffer.set(record.offerId, list)
    }
    const live = new Map<string, Offer>()
    for (const offer of snapshot.offers) live.set(offer.id, offer)
    for (const [offerId, list] of byOffer) {
      const offer = live.get(offerId)
      const cadence = offer === undefined ? 'once' : cadenceKeyOf(offer.kind, now)
      const current = list.filter((record) => record.cadence === cadence && !record.revoked)
      const active = list.filter((record) => !record.revoked)
      const sorted = [...active].sort((a, b) => Date.parse(a.claimedAt) - Date.parse(b.claimedAt))
      const first = sorted[0]
      out[offerId] = {
        offerId,
        claimedThisPeriod: current.length > 0,
        claimedAt: current[0]?.claimedAt,
        firstClaimedAt: first?.claimedAt,
        totalClaims: active.length,
        claimedCny: current.reduce((sum, record) => sum + (record.amountCnyAtClaim ?? 0), 0),
        level: first === undefined ? null : levelOfAmount(first.amountCnyAtClaim),
        // 绝版：条目已不在有效清单（已结束或上游下架）
        legacy: offer === undefined,
      }
    }
    return out
  }

  private album(snapshot: Snapshot, claims: Record<string, ClaimState>): AlbumEntry[] {
    const byId = new Map<string, Offer>()
    for (const offer of snapshot.offers) byId.set(offer.id, offer)
    const out: AlbumEntry[] = []
    for (const [offerId, state] of Object.entries(claims)) {
      if (state.firstClaimedAt === undefined || state.level === null) continue
      const offer = byId.get(offerId)
      out.push({
        offerId,
        provider: offer?.provider ?? offerId,
        title: offer?.title ?? offerId,
        face: offer?.face ?? '',
        icon: offer?.icon,
        kind: offer?.kind ?? 'once',
        level: state.level,
        firstClaimedAt: state.firstClaimedAt,
        totalClaims: state.totalClaims,
        legacy: state.legacy,
      })
    }
    return out.sort((a, b) => b.level.rank - a.level.rank || Date.parse(a.firstClaimedAt) - Date.parse(b.firstClaimedAt))
  }

  private viewStats(snapshot: Snapshot, claims: Record<string, ClaimState>, album: AlbumEntry[]): ViewStats {
    const now = Date.now()
    let claimableCny = 0
    let claimedCnyThisPeriod = 0
    let nextReset: number | null = null
    for (const offer of snapshot.offers) {
      const state = claims[offer.id]
      const claimed = state?.claimedThisPeriod === true
      const yuan = yuanOf(offer)
      if (claimed) {
        claimedCnyThisPeriod += state?.claimedCny ?? yuan ?? 0
        continue
      }
      if (offer.counted && yuan !== null) claimableCny += yuan
      const reset = nextResetAt(offer.kind, now)
      if (reset !== null && (nextReset === null || reset < nextReset)) nextReset = reset
    }
    return {
      claimableCny: Math.round(claimableCny * 100) / 100,
      claimedCnyThisPeriod: Math.round(claimedCnyThisPeriod * 100) / 100,
      collectedCount: album.length,
      totalCount: snapshot.offers.length,
      endedCount: snapshot.ended.length,
      nextResetAt: nextReset,
      nextRefreshAt: snapshot.nextRefreshAt,
    }
  }

  /** 盖章：写入 (条目, 当前周期) 领取记录。 */
  async claim(offerId: string): Promise<ServiceResult<RadarView>> {
    const snapshot = await this.snapshot()
    const offer = snapshot.offers.find((item) => item.id === offerId)
    if (offer === undefined) {
      const ended = snapshot.ended.find((item) => item.id === offerId)
      if (ended !== undefined) return fail('offer-ended', `offer "${offerId}" has ended and can no longer be claimed`)
      return fail('offer-not-found', `offer "${offerId}" was not found in the current snapshot`)
    }
    if (isExpired(offer.endsAt, Date.now())) return fail('offer-ended', `offer "${offerId}" expired`)
    const table = await this.tableForWrite()
    if (table === null) return fail('storage-unavailable', 'claim storage domain is not open')
    const cadence = cadenceKeyOf(offer.kind, Date.now())
    const key = claimRecordKey(offerId, cadence)
    const existing = table.get(key)
    if (existing !== undefined && !existing.revoked) return fail('already-claimed', `offer "${offerId}" is already claimed in period ${cadence}`)
    const record: ClaimRecord = {
      offerId,
      cadence,
      claimedAt: new Date().toISOString(),
      amountCnyAtClaim: yuanOf(offer),
      revoked: false,
    }
    await table.put(key, record)
    return ok(await this.view())
  }

  /** 撤销：只置当前周期记录 revoked，历史与等级保留。 */
  async unclaim(offerId: string): Promise<ServiceResult<RadarView>> {
    const snapshot = await this.snapshot()
    const offer = snapshot.offers.find((item) => item.id === offerId)
    const kind = offer?.kind ?? 'once'
    const table = await this.tableForWrite()
    if (table === null) return fail('storage-unavailable', 'claim storage domain is not open')
    const cadence = cadenceKeyOf(kind, Date.now())
    const key = claimRecordKey(offerId, cadence)
    const existing = table.get(key)
    if (existing === undefined) return fail('not-claimed', `offer "${offerId}" has no claim in period ${cadence}`)
    if (existing.revoked) return ok(await this.view())
    await table.update(key, (current) => ({ ...current, revoked: true }))
    return ok(await this.view())
  }

  /** 手动刷新：绕过缓存重新抓取。 */
  async refresh(): Promise<ServiceResult<RadarView>> {
    this.cache.clear()
    return ok(await this.view(true))
  }

  /** 当前等级分布（卡册用）。 */
  levelSummary(album: AlbumEntry[]): Record<WoolLevelId, number> {
    const out: Record<WoolLevelId, number> = { common: 0, fine: 0, rare: 0, epic: 0, legend: 0 }
    for (const entry of album) out[entry.level.id] += 1
    return out
  }
}
