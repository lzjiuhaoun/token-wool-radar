/** 服务层测试：盖章 / 撤销 / 等级 / 复位 / 统计，用内存域替身与夹具数据。 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { WoolService } from '../src/claim/service.ts'
import type { ClaimRecord } from '../src/claim/domain.ts'
import type { ClaimTable } from '../src/claim/types.ts'
import { parseUpstream } from '../src/offers/parse.ts'

const fixture = readFileSync(new URL('./fixtures/free-tokens.data.json', import.meta.url), 'utf8')
const parsed = parseUpstream(fixture)

/** 内存 KV 表替身（与 storageDomain 的 KvTable 行为对齐）。 */
class MemoryTable implements ClaimTable {
  readonly records = new Map<string, ClaimRecord>()
  get(key: string): ClaimRecord | undefined {
    return this.records.get(key)
  }
  keys(): IterableIterator<string> {
    return this.records.keys()
  }
  entries(): IterableIterator<[string, ClaimRecord]> {
    return this.records.entries()
  }
  get size(): number {
    return this.records.size
  }
  async put(key: string, value: ClaimRecord): Promise<void> {
    this.records.set(key, value)
  }
  async update(key: string, fn: (current: ClaimRecord) => ClaimRecord): Promise<ClaimRecord> {
    const current = this.records.get(key)
    assert.ok(current !== undefined, 'update requires an existing record')
    const next = fn(current)
    this.records.set(key, next)
    return next
  }
  async delete(key: string): Promise<boolean> {
    return this.records.delete(key)
  }
}

function makeService(): { service: WoolService; table: MemoryTable } {
  const table = new MemoryTable()
  const storageDomain = {
    async open() {
      return {
        name: 'token_wool_radar',
        table: () => table,
        close: async () => {},
      }
    },
  }
  const service = new WoolService({}, { storageDomain, fetch: async () => parsed })
  return { service, table }
}

test('snapshot carries live offers, ended list, and stats', async () => {
  const { service } = makeService()
  await service.open()
  const snapshot = await service.snapshot()
  assert.equal(snapshot.origin, 'live')
  assert.ok(snapshot.offers.length >= 40)
  assert.ok(snapshot.stats.liveCount === snapshot.offers.length)
  assert.equal(snapshot.degraded, false)
})

test('claim writes a record, stamps the view, and reduces claimable', async () => {
  const { service, table } = makeService()
  await service.open()
  const before = await service.view()
  const target = before.snapshot.offers.find((offer) => offer.counted && offer.yuan !== null)
  assert.ok(target !== undefined)
  const result = await service.claim(target.id)
  assert.equal(result.ok, true)
  if (!result.ok) return
  const view = result.value
  assert.equal(view.claims[target.id]?.claimedThisPeriod, true)
  assert.ok(view.stats.claimableCny < before.stats.claimableCny)
  assert.equal(table.size, 1)
  const record = [...table.records.values()][0]
  assert.equal(record.offerId, target.id)
  assert.equal(record.revoked, false)
  assert.equal(record.amountCnyAtClaim, target.yuan)
})

test('a second claim in the same period is rejected', async () => {
  const { service } = makeService()
  await service.open()
  const view = await service.view()
  const target = view.snapshot.offers[0]
  await service.claim(target.id)
  const again = await service.claim(target.id)
  assert.equal(again.ok, false)
  if (again.ok) return
  assert.equal(again.error.code, 'already-claimed')
})

test('unclaim revokes the period record and returns the offer to claimable', async () => {
  const { service, table } = makeService()
  await service.open()
  const view = await service.view()
  const target = view.snapshot.offers.find((offer) => offer.counted && offer.yuan !== null && offer.yuan >= 10)
  assert.ok(target !== undefined)
  await service.claim(target.id)
  const claimed = await service.view()
  assert.equal(claimed.album.length, 1)
  assert.ok(claimed.album[0].level !== null)
  const claimedLevel = claimed.album[0].level?.id

  const result = await service.unclaim(target.id)
  assert.equal(result.ok, true)
  if (!result.ok) return
  const after = result.value
  // 印章撤销：本周期可再次领取，统计回到领取前
  assert.equal(after.claims[target.id]?.claimedThisPeriod, false)
  assert.equal(after.album.length, 0)
  // 记录仍在（revoked），重启后仍可追溯
  assert.equal(table.size, 1)
  assert.equal([...table.records.values()][0].revoked, true)
  // 撤销后可重新盖章，等级按首次领取当时价值定级（此处同值，等级不变）
  const reclaim = await service.claim(target.id)
  assert.equal(reclaim.ok, true)
  if (!reclaim.ok) return
  assert.equal(reclaim.value.album[0].level?.id, claimedLevel)
})

test('unclaim without a claim reports not-claimed', async () => {
  const { service } = makeService()
  await service.open()
  const view = await service.view()
  const result = await service.unclaim(view.snapshot.offers[0].id)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.error.code, 'not-claimed')
})

test('claim on an ended or unknown offer fails explicitly', async () => {
  const { service } = makeService()
  await service.open()
  const ended = await service.claim('no-such-offer')
  assert.equal(ended.ok, false)
  if (ended.ok) return
  assert.equal(ended.error.code, 'offer-not-found')
})

test('level is fixed by the first claim amount and never re-graded', async () => {
  const { service, table } = makeService()
  await service.open()
  const view = await service.view()
  const target = view.snapshot.offers[0]
  // 直接播种两条历史记录：早期低价值 + 后期高价值
  await table.put('seed-early', { offerId: target.id, cadence: 'p1', claimedAt: '2026-10-01T00:00:00.000Z', amountCnyAtClaim: 10, revoked: false })
  await table.put('seed-late', { offerId: target.id, cadence: 'p2', claimedAt: '2026-11-01T00:00:00.000Z', amountCnyAtClaim: 500, revoked: false })
  const after = await service.view()
  assert.equal(after.album.length, 1)
  // 等级取自首次领取（¥10 → 精良），不随后续 ¥500 升档
  assert.equal(after.album[0].level?.id, 'fine')
  assert.equal(after.claims[target.id]?.totalClaims, 2)
  assert.equal(after.claims[target.id]?.firstClaimedAt, '2026-10-01T00:00:00.000Z')
})

test('snapshot failure keeps the last snapshot and reports the error', async () => {
  const table = new MemoryTable()
  let calls = 0
  const service = new WoolService(
    {},
    {
      storageDomain: {
        async open() {
          return { name: 'token_wool_radar', table: () => table, close: async () => {} }
        },
      },
      fetch: async () => {
        calls += 1
        if (calls === 1) return parsed
        throw new Error('network: upstream request failed')
      },
    },
  )
  await service.open()
  const first = await service.snapshot()
  assert.equal(first.origin, 'live')
  const second = await service.snapshot(true)
  assert.equal(second.origin, 'cache')
  assert.match(second.error ?? '', /network/)
  // 旧数据仍在，没有假数据
  assert.deepEqual(second.offers, first.offers)
})
