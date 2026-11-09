/** 口径与时序测试：Asia/Shanghai 周期键、复位时间、剩余天数、倒计时。 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cadenceKeyOf, formatCountdown, formatCny, nextResetAt, remainingDays, zonedParts } from '../src/offers/convert.ts'

// 2026-11-09 是周一；11:00 +08 = 03:00 UTC
const monday = Date.UTC(2026, 10, 9, 3, 0, 0)

test('zonedParts reads Asia/Shanghai local fields', () => {
  const parts = zonedParts(monday)
  assert.equal(parts.year, 2026)
  assert.equal(parts.month, 11)
  assert.equal(parts.day, 9)
  assert.equal(parts.hour, 11)
  assert.equal(parts.weekday, 0)
})

test('cadenceKeyOf keys daily by local date, weekly by Monday, monthly by month', () => {
  assert.equal(cadenceKeyOf('daily', monday), '2026-11-09')
  assert.equal(cadenceKeyOf('monthly', monday), '2026-11')
  assert.equal(cadenceKeyOf('once', monday), 'once')
  assert.equal(cadenceKeyOf('limited', monday), 'once')
  const weekly = cadenceKeyOf('weekly', monday)
  assert.equal(weekly, 'W2026-11-09')
  // 同一周内的另一天共享周键；下周一换键
  assert.equal(cadenceKeyOf('weekly', monday + 3 * 86_400_000), weekly)
  assert.notEqual(cadenceKeyOf('weekly', monday + 7 * 86_400_000), weekly)
})

test('nextResetAt lands on local midnight, next Monday, and next month', () => {
  const daily = nextResetAt('daily', monday)!
  assert.equal(zonedParts(daily).day, 10)
  assert.equal(zonedParts(daily).hour, 0)
  const weekly = nextResetAt('weekly', monday)!
  assert.equal(zonedParts(weekly).weekday, 0)
  assert.equal(zonedParts(weekly).day, 16)
  const monthly = nextResetAt('monthly', monday)!
  assert.equal(zonedParts(monthly).month, 12)
  assert.equal(zonedParts(monthly).day, 1)
  assert.equal(nextResetAt('once', monday), null)
  assert.equal(nextResetAt('free', monday), null)
})

test('remainingDays counts natural days in Asia/Shanghai', () => {
  // 截止时间为上海时间 2026-11-12 00:00，从 11-09 11:00 起算 3 天
  const endsAt = new Date(Date.UTC(2026, 10, 11, 16, 0, 0)).toISOString()
  assert.equal(remainingDays(endsAt, monday), 3)
  assert.equal(remainingDays(undefined, monday), null)
})

test('formatCountdown formats H:MM and clamps at zero', () => {
  assert.equal(formatCountdown(monday + 3 * 3_600_000 + 14 * 60_000, monday), '3:14')
  assert.equal(formatCountdown(monday - 5_000, monday), '0:00')
})

test('formatCny drops trailing decimals for integers', () => {
  assert.equal(formatCny(200), '¥200')
  assert.equal(formatCny(33.3565), '¥33.36')
  assert.equal(formatCny(null), '—')
})
