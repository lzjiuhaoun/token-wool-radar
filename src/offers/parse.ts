/** 上游（aihot.news）数据结构解析：React Router turbo-stream 解码 + deal 归一化。 */

import type { EndedOffer, Offer, OfferKind, OfferModel, SnapshotBasis } from './types.ts'

/** turbo-stream 负数字面量（React Router 编码约定；-5 = undefined 已实测确认）。 */
const TURBO_SPECIAL = new Map<number, unknown>([
  [-5, undefined],
  [-1, undefined],
  [-2, null],
  [-3, Number.NaN],
  [-4, -0],
])

interface TurboCache {
  readonly arr: unknown[]
  readonly cache: Map<number, unknown>
}

function resolveIndex(state: TurboCache, index: number): unknown {
  if (index < 0) {
    if (TURBO_SPECIAL.has(index)) return TURBO_SPECIAL.get(index)
    throw new Error(`turbo-stream: unknown negative reference ${index}`)
  }
  if (state.cache.has(index)) return state.cache.get(index)
  const decoded = decodeValue(state, state.arr[index])
  state.cache.set(index, decoded)
  return decoded
}

function decodeValue(state: TurboCache, value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === 'number' && item >= 0 ? resolveIndex(state, item) : item))
  }
  const out: Record<string, unknown> = {}
  for (const [rawKey, ref] of Object.entries(value)) {
    if (!rawKey.startsWith('_')) {
      // 非 turbo-stream 键：按字面量保留（容错，正常不会出现）
      out[rawKey] = ref
      continue
    }
    const key = resolveIndex(state, Number(rawKey.slice(1)))
    out[String(key)] = resolveIndex(state, ref as number)
  }
  return out
}

/** 解码一段 turbo-stream 文本（`/free-tokens.data` 响应体或页面内嵌 payload）。 */
export function decodeTurboStream(text: string): unknown {
  const arr: unknown = JSON.parse(text)
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('turbo-stream: payload is not a non-empty array')
  return decodeValue({ arr, cache: new Map() }, arr[0])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`deal field ${field} must be a string`)
  return value
}

function bool(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`deal field ${field} must be a boolean`)
  return value
}

function num(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`deal field ${field} must be a finite number`)
  return value
}

function strArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`deal field ${field} must be an array`)
  return value.map((item, index) => {
    if (typeof item !== 'string') throw new Error(`deal field ${field}[${index}] must be a string`)
    return item
  })
}

const KINDS = new Set(['daily', 'weekly', 'monthly', 'once', 'limited', 'free'])

function kindOf(value: unknown): OfferKind {
  const kind = str(value, 'kind')
  if (!KINDS.has(kind)) throw new Error(`deal kind "${kind}" is unknown`)
  return kind as OfferKind
}

function modelsOf(value: unknown): OfferModel[] {
  if (!Array.isArray(value)) throw new Error('deal field models must be an array')
  const out: OfferModel[] = []
  for (const item of value) {
    if (!isRecord(item)) throw new Error('deal model entry must be an object')
    out.push({
      slug: str(item.slug, 'models[].slug'),
      name: str(item.name, 'models[].name'),
      href: str(item.href, 'models[].href'),
      score: num(item.score, 'models[].score'),
    })
  }
  return out
}

/** 把一条上游 deal 归一化为 Offer；字段缺失或类型不符时抛错（计入失败率）。 */
export function normalizeDeal(raw: unknown): Offer {
  if (!isRecord(raw)) throw new Error('deal must be an object')
  const offer: Offer = {
    id: str(raw.id, 'id'),
    kind: kindOf(raw.kind),
    title: str(raw.title, 'title'),
    provider: str(raw.provider, 'provider'),
    detail: str(raw.detail, 'detail'),
    url: str(raw.url, 'url'),
    evidence: str(raw.evidence, 'evidence'),
    appliesTo: str(raw.appliesTo, 'appliesTo'),
    appliesToAll: raw.appliesToAll === undefined ? false : bool(raw.appliesToAll, 'appliesToAll'),
    realName: bool(raw.realName, 'realName'),
    clientOnly: bool(raw.clientOnly, 'clientOnly'),
    studentOnly: bool(raw.studentOnly, 'studentOnly'),
    autoRenews: bool(raw.autoRenews, 'autoRenews'),
    tags: strArray(raw.tags, 'tags'),
    validity: raw.validity === undefined ? undefined : str(raw.validity, 'validity'),
    verifiedAt: raw.verifiedAt === undefined ? undefined : str(raw.verifiedAt, 'verifiedAt'),
    label: str(raw.label, 'label'),
    note: str(raw.note, 'note'),
    face: str(raw.face, 'face'),
    models: modelsOf(raw.models),
    counted: bool(raw.counted, 'counted'),
    yuan: raw.yuan === null || raw.yuan === undefined ? null : num(raw.yuan, 'yuan'),
    endsAt: raw.endsAt === undefined || raw.endsAt === null ? undefined : str(raw.endsAt, 'endsAt'),
    buys: raw.buys === undefined ? undefined : str(raw.buys, 'buys'),
    icon: raw.icon === undefined || raw.icon === null ? undefined : str(raw.icon, 'icon'),
  }
  return offer
}

function normalizeEnded(raw: unknown): EndedOffer {
  if (!isRecord(raw)) throw new Error('ended entry must be an object')
  return {
    id: str(raw.id, 'ended.id'),
    kind: kindOf(raw.kind),
    provider: str(raw.provider, 'ended.provider'),
    face: str(raw.face, 'ended.face'),
    icon: raw.icon === undefined || raw.icon === null ? undefined : str(raw.icon, 'ended.icon'),
    endedAt: str(raw.endedAt, 'ended.endedAt'),
  }
}

export interface ParsedUpstream {
  deals: Offer[]
  ended: EndedOffer[]
  basis: SnapshotBasis
  serverNow: number
  expiresAt: number | null
  /** 归一化失败的 deal 条数 */
  failures: number
  /** 归一化尝试的 deal 总条数 */
  total: number
}

/** 从 turbo-stream 根对象中定位 free-tokens 数据段（页面内嵌与 .data 端点两种形态）。 */
function locateFreeTokens(root: unknown): Record<string, unknown> {
  if (!isRecord(root)) throw new Error('turbo-stream root must be an object')
  const loader = isRecord(root.loaderData) ? root.loaderData : undefined
  const direct = root['free-tokens']
  if (loader !== undefined && isRecord(loader['free-tokens'])) return loader['free-tokens'] as Record<string, unknown>
  if (isRecord(direct) && isRecord(direct.data)) return direct.data as Record<string, unknown>
  if (isRecord(direct)) return direct
  throw new Error('turbo-stream root carries no free-tokens data')
}

/** 解析上游响应文本；单条 deal 归一化失败不中断整体，只累计失败率。 */
export function parseUpstream(text: string): ParsedUpstream {
  const root = decodeTurboStream(text)
  const data = locateFreeTokens(root)
  const rawDeals = Array.isArray(data.deals) ? data.deals : []
  const rawEnded = Array.isArray(data.ended) ? data.ended : []
  if (rawDeals.length === 0) throw new Error('upstream payload carries no deals')

  const deals: Offer[] = []
  let failures = 0
  for (const raw of rawDeals) {
    try {
      deals.push(normalizeDeal(raw))
    } catch {
      failures += 1
    }
  }
  const ended: EndedOffer[] = []
  for (const raw of rawEnded) {
    try {
      ended.push(normalizeEnded(raw))
    } catch {
      failures += 1
    }
  }

  const basis: SnapshotBasis = {
    mix: isRecord(data.basis) && typeof data.basis.mix === 'string' ? data.basis.mix : '',
    ratio: isRecord(data.basis) && typeof data.basis.ratio === 'string' ? data.basis.ratio : '',
    usdCny: isRecord(data.basis) && typeof data.basis.usdCny === 'number' ? data.basis.usdCny : 0,
  }
  const serverNow = typeof data.serverNow === 'number' && Number.isFinite(data.serverNow) ? data.serverNow : Date.now()
  const expiresAt = typeof data.expiresAt === 'number' && Number.isFinite(data.expiresAt) ? data.expiresAt : null

  return { deals, ended, basis, serverNow, expiresAt, failures, total: rawDeals.length + rawEnded.length }
}
