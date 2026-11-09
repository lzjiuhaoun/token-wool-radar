/** 上游解析测试：以线上快照为夹具（无网络用例走夹具）。 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { decodeTurboStream, normalizeDeal, parseUpstream } from '../src/offers/parse.ts'

const fixture = readFileSync(new URL('./fixtures/free-tokens.data.json', import.meta.url), 'utf8')

test('decodeTurboStream resolves the deduplicated reference graph', () => {
  const root = decodeTurboStream(fixture) as Record<string, unknown>
  assert.ok(root['free-tokens'] !== undefined)
  const data = (root['free-tokens'] as { data: Record<string, unknown> }).data
  assert.ok(Array.isArray(data.deals))
  assert.equal(typeof data.serverNow, 'number')
  assert.equal(typeof data.expiresAt, 'number')
  assert.equal(typeof data.basis, 'object')
})

test('parseUpstream normalizes every live deal from the fixture', () => {
  const parsed = parseUpstream(fixture)
  assert.ok(parsed.deals.length >= 40, `expected a full list, got ${parsed.deals.length}`)
  assert.equal(parsed.failures, 0)
  assert.ok(parsed.serverNow > 1_700_000_000_000)
  for (const deal of parsed.deals) {
    assert.ok(deal.id.length > 0)
    assert.ok(deal.title.length > 0)
    assert.ok(deal.url.startsWith('http'))
    assert.ok(Array.isArray(deal.tags))
    assert.ok(typeof deal.counted === 'boolean')
    assert.ok(deal.yuan === null || Number.isFinite(deal.yuan))
    if (deal.endsAt !== undefined) assert.ok(!Number.isNaN(Date.parse(deal.endsAt)))
  }
})

test('parseUpstream computes the counted yuan total matching the upstream stat', () => {
  const parsed = parseUpstream(fixture)
  const total = parsed.deals.filter((deal) => deal.counted).reduce((sum, deal) => sum + (deal.yuan ?? 0), 0)
  // 线上「今天还能领」统计 = 计价值条目合计（快照时刻约为 ¥201）
  assert.ok(total > 100 && total < 400, `unexpected total ${total}`)
})

test('parseUpstream counts a malformed deal as a failure without dropping the rest', () => {
  const arr = JSON.parse(fixture) as unknown[]
  // deals 引用数组：长度 > 20 且首元素为数字索引
  const dealsRef = arr.find(
    (value) => Array.isArray(value) && value.length > 20 && value.every((item) => typeof item === 'number'),
  ) as number[]
  assert.ok(dealsRef !== undefined, 'fixture carries a deals reference array')
  // 把第一个 deal 替换成 null：归一化失败但不影响其余条目
  arr[dealsRef[0]] = null
  const parsed = parseUpstream(JSON.stringify(arr))
  assert.equal(parsed.failures, 1)
  assert.ok(parsed.deals.length >= 40)
  assert.equal(parsed.total, parsed.deals.length + 1 + parsed.ended.length)
})

test('normalizeDeal rejects a deal missing required fields', () => {
  assert.throws(() => normalizeDeal({ id: 'x' }), /deal field kind must be a string/)
  assert.throws(() => normalizeDeal({ id: 'x', kind: 'nope' }), /unknown/)
})

test('parseUpstream rejects a payload without deals', () => {
  assert.throws(() => parseUpstream('[{"_1":2},"nothing"]'), /no free-tokens data|no deals/)
})
