/** 领取记录存储域：本地声明（不 import 官方包），经 ctx.storageDomain.open 打开。 */

/** 域名须匹配 /^[a-z][a-z0-9_]*$/（dsh-storage 的 UNIT_NAME_RE）。 */
export const DOMAIN_NAME = 'token_wool_radar'
export const DOMAIN_VERSION = 1

/** 一条领取记录：(条目, 周期) 为粒度；撤销只置 revoked，历史保留。 */
export interface ClaimRecord {
  offerId: string
  /** 领取周期键（convert.ts 的 cadenceKeyOf） */
  cadence: string
  claimedAt: string
  /** 领取当时的价值（折算 CNY）；null = 不折钱条目 */
  amountCnyAtClaim: number | null
  revoked: boolean
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 记录校验器：storageDomain 只调用 valueSchema.parse()。
 * 本地手写校验，避免给插件包引入 zod 依赖。
 */
export const claimRecordSchema = {
  parse(raw: unknown): ClaimRecord {
    if (!isRecordObject(raw)) throw new Error('claim record must be an object')
    const offerId = raw.offerId
    if (typeof offerId !== 'string' || offerId.length === 0) throw new Error('claim record offerId must be a non-empty string')
    const cadence = raw.cadence
    if (typeof cadence !== 'string' || cadence.length === 0) throw new Error('claim record cadence must be a non-empty string')
    const claimedAt = raw.claimedAt
    if (typeof claimedAt !== 'string' || Number.isNaN(Date.parse(claimedAt))) {
      throw new Error('claim record claimedAt must be an ISO timestamp')
    }
    const amount = raw.amountCnyAtClaim
    if (amount !== null && (typeof amount !== 'number' || !Number.isFinite(amount))) {
      throw new Error('claim record amountCnyAtClaim must be a finite number or null')
    }
    const revoked = raw.revoked
    if (typeof revoked !== 'boolean') throw new Error('claim record revoked must be a boolean')
    return { offerId, cadence, claimedAt, amountCnyAtClaim: amount, revoked }
  },
}

/** per-record 布局：键须匹配 [a-zA-Z0-9_-]+；附加短哈希避免清洗后碰撞。 */
export function claimRecordKey(offerId: string, cadence: string): string {
  const safe = `${offerId}-${cadence}`.replace(/[^a-zA-Z0-9_-]/g, '_')
  let hash = 0x811c9dc5
  for (let i = 0; i < safe.length; i += 1) {
    hash ^= safe.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  const suffix = hash.toString(36).slice(0, 6)
  return `${safe.slice(0, 96)}-${suffix}`
}

/** 域声明（本地字面量；open() 不校验名称，但遵循 UNIT_NAME_RE 约定）。 */
export const claimDomainSpec = {
  name: DOMAIN_NAME,
  version: DOMAIN_VERSION,
  layout: 'per-record' as const,
  tables: { claims: { valueSchema: claimRecordSchema } },
}
