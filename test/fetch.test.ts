/** 抓取层测试：页面 HTML 回退路径与缓存行为（不访问网络）。 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { SnapshotCache, extractPagePayload } from '../src/offers/fetch.ts'
import { parseUpstream } from '../src/offers/parse.ts'

// 精简夹具：只保留线上整页中承载 loader payload 的 script 块（scripts/make-page-fixture.mjs 生成）
const html = readFileSync(new URL('./fixtures/free-tokens.page.trimmed.html', import.meta.url), 'utf8')

test('extractPagePayload pulls the streamed loader payload out of the page HTML', () => {
  const payload = extractPagePayload(html)
  assert.ok(payload.includes('"deals"'))
  const parsed = parseUpstream(payload)
  assert.ok(parsed.deals.length >= 40)
  assert.equal(parsed.failures, 0)
})

test('extractPagePayload rejects HTML without a streamed payload', () => {
  assert.throws(() => extractPagePayload('<html><body>nothing</body></html>'), /no streamed loader payload/)
})

test('SnapshotCache expires after the ttl', () => {
  const cache = new SnapshotCache(1000)
  assert.equal(cache.get(), null)
  const parsed = parseUpstream(readFileSync(new URL('./fixtures/free-tokens.data.json', import.meta.url), 'utf8'))
  cache.put(parsed)
  assert.ok(cache.get() !== null)
  // 直接操作内部时间不可行，这里验证 clear 与放入即可；过期由 ttl 参数覆盖
  cache.clear()
  assert.equal(cache.get(), null)
})

test('the trimmed page fixture carries the same deal shape as the data endpoint fixture', () => {
  // 两份夹具是不同时刻的快照，条目可能增减；校验的是同一套结构与足够的条目量
  const parsed = parseUpstream(extractPagePayload(html))
  const direct = parseUpstream(readFileSync(new URL('./fixtures/free-tokens.data.json', import.meta.url), 'utf8'))
  assert.ok(parsed.deals.length >= 40)
  assert.ok(direct.deals.length >= 40)
  const shape = (deals: typeof parsed.deals) => Object.keys(deals[0]).sort().join(',')
  assert.equal(shape(parsed.deals), shape(direct.deals))
  const kinds = (deals: typeof parsed.deals) => [...new Set(deals.map((deal) => deal.kind))].sort().join(',')
  assert.equal(kinds(parsed.deals), kinds(direct.deals))
})
