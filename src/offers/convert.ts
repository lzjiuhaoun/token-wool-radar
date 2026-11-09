/** 口径换算与时序：Asia/Shanghai 下的周期键、复位时间、剩余天数、展示格式化。 */

import type { Offer, OfferKind } from './types.ts'

export const DISPLAY_TIME_ZONE = 'Asia/Shanghai'

/** 折算口径说明（上游按其官方价换算后直接给出 yuan，这里只做展示层换算）。 */
export const CONVERSION_NOTE = {
  usdPerCny: 6.6713,
  tokenRatio: '7 : 2 : 1',
}

const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }

interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  weekday: number
}

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: DISPLAY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
  hour12: false,
})

/** 取某时刻在 Asia/Shanghai 下的日期部件。 */
export function zonedParts(at: number | Date): ZonedParts {
  const value = at instanceof Date ? at : new Date(at)
  const parts = partsFormatter.formatToParts(value)
  const map: Record<string, string> = {}
  for (const part of parts) map[part.type] = part.value
  const hour = Number(map.hour) % 24
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: WEEKDAY_INDEX[map.weekday] ?? 0,
  }
}

/** 由 Asia/Shanghai 的本地部件构造 UTC 时间戳（按 +08:00 固定偏移近似，含历史 DST 无关）。 */
function utcFromZoned(parts: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number }): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0) - 8 * 3600 * 1000
}

/** 该条目当前所处的领取周期键：同键表示同一轮领取。 */
export function cadenceKeyOf(kind: OfferKind, at: number | Date): string {
  const parts = zonedParts(at)
  const pad = (value: number) => String(value).padStart(2, '0')
  switch (kind) {
    case 'daily':
      return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
    case 'weekly': {
      // 以周一（本地零时）为周键，同周内任意一天同键
      const monday = zonedParts(utcFromZoned(parts) - parts.weekday * 86_400_000)
      return `W${monday.year}-${pad(monday.month)}-${pad(monday.day)}`
    }
    case 'monthly':
      return `${parts.year}-${pad(parts.month)}`
    default:
      return 'once'
  }
}

/** 下一轮复位时间（ms epoch）：每日 0 点、每周一 0 点、每月 1 日 0 点（Asia/Shanghai）；一次性条目返回 null。 */
export function nextResetAt(kind: OfferKind, at: number | Date): number | null {
  const parts = zonedParts(at)
  switch (kind) {
    case 'daily': {
      return utcFromZoned({ year: parts.year, month: parts.month, day: parts.day + 1 })
    }
    case 'weekly': {
      return utcFromZoned({ year: parts.year, month: parts.month, day: parts.day + (7 - parts.weekday) })
    }
    case 'monthly': {
      return utcFromZoned({ year: parts.year, month: parts.month + 1, day: 1 })
    }
    default:
      return null
  }
}

/** 剩余天数（按 Asia/Shanghai 的自然日计）；null = 无截止时间。 */
export function remainingDays(endsAt: string | undefined, at: number | Date): number | null {
  if (endsAt === undefined) return null
  const end = Date.parse(endsAt)
  if (!Number.isFinite(end)) return null
  const from = at instanceof Date ? at.getTime() : at
  const endParts = zonedParts(end)
  const nowParts = zonedParts(from)
  const endDay = utcFromZoned({ year: endParts.year, month: endParts.month, day: endParts.day })
  const nowDay = utcFromZoned({ year: nowParts.year, month: nowParts.month, day: nowParts.day })
  return Math.round((endDay - nowDay) / 86_400_000)
}

/** 是否已过期（按 Asia/Shanghai 的当天结束判断）。 */
export function isExpired(endsAt: string | undefined, at: number | Date): boolean {
  const days = remainingDays(endsAt, at)
  return days !== null && days < 0
}

/** H:MM 倒计时（到点触发一次拉取）。 */
export function formatCountdown(targetMs: number, nowMs: number): string {
  const diff = Math.max(0, targetMs - nowMs)
  const hours = Math.floor(diff / 3_600_000)
  const minutes = Math.floor((diff % 3_600_000) / 60_000)
  return `${hours}:${String(minutes).padStart(2, '0')}`
}

/** ¥ 金额展示：整数不带小数，否则两位。 */
export function formatCny(value: number | null): string {
  if (value === null) return '—'
  if (Number.isInteger(value)) return `¥${value}`
  return `¥${value.toFixed(2)}`
}

/** 核实日期展示（Asia/Shanghai 的 YYYY-MM-DD）；无法解析返回 null。 */
export function formatVerifiedAt(iso: string | undefined): string | null {
  if (iso === undefined) return null
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return null
  const parts = zonedParts(at)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
}

/** 条目折算金额（上游已按官方价折算）。 */
export function yuanOf(offer: Offer): number | null {
  return offer.yuan
}
