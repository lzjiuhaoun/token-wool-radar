/** 桥路由测试：GET/POST 经 connection.fetch 路由打到同一服务方法。 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { applyBridge } from '../src/bridge.ts'
import { WoolService } from '../src/claim/service.ts'
import { parseUpstream } from '../src/offers/parse.ts'

const fixture = readFileSync(new URL('./fixtures/free-tokens.data.json', import.meta.url), 'utf8')
const parsed = parseUpstream(fixture)

function makeService(): WoolService {
  const records = new Map<string, unknown>()
  const table = {
    get: (key: string) => records.get(key) as never,
    keys: () => records.keys(),
    entries: () => records.entries(),
    get size() {
      return records.size
    },
    put: async (key: string, value: unknown) => {
      records.set(key, value)
    },
    update: async (key: string, fn: (current: never) => never) => {
      const next = fn(records.get(key) as never)
      records.set(key, next)
      return next
    },
    delete: async (key: string) => records.delete(key),
  }
  return new WoolService(
    {},
    {
      storageDomain: {
        async open() {
          return { name: 'token_wool_radar', table: () => table, close: async () => {} }
        },
      },
      fetch: async () => parsed,
    },
  )
}

function registerRoute(service: WoolService) {
  let handler: ((request: Request) => Promise<Response>) | null = null
  const ctx = {
    effect: (fn: () => unknown) => fn(),
    connection: {
      fetch: {
        register: (route: { fetch: (request: Request) => Promise<Response> }) => {
          handler = route.fetch
          return () => {}
        },
      },
    },
  }
  applyBridge(ctx as never, service)
  assert.ok(handler !== null, 'route handler registered')
  return handler!
}

async function readJson(response: Response): Promise<Record<string, never>> {
  return (await response.json()) as Record<string, never>
}

test('GET returns the full view', async () => {
  const service = makeService()
  await service.open()
  const handler = registerRoute(service)
  const response = await handler(new Request('http://local/api/token-wool-radar'))
  assert.equal(response.status, 200)
  const body = (await response.json()) as { ok: boolean; view: { snapshot: { offers: unknown[] }; stats: { totalCount: number } } }
  assert.equal(body.ok, true)
  assert.ok(body.view.snapshot.offers.length >= 40)
  assert.equal(body.view.stats.totalCount, body.view.snapshot.offers.length)
})

test('POST claim stamps and returns the updated view', async () => {
  const service = makeService()
  await service.open()
  const handler = registerRoute(service)
  const before = (await readJson(await handler(new Request('http://local/api/token-wool-radar')))) as never as {
    view: { snapshot: { offers: Array<{ id: string }> } }
  }
  const offerId = before.view.snapshot.offers[0].id
  const response = await handler(
    new Request('http://local/api/token-wool-radar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'claim', offerId }),
    }),
  )
  assert.equal(response.status, 200)
  const body = (await response.json()) as { ok: boolean; view: { claims: Record<string, { claimedThisPeriod: boolean }> } }
  assert.equal(body.ok, true)
  assert.equal(body.view.claims[offerId]?.claimedThisPeriod, true)

  // 重复盖章返回 409 与稳定错误码
  const again = await handler(
    new Request('http://local/api/token-wool-radar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'claim', offerId }),
    }),
  )
  assert.equal(again.status, 409)
  const error = (await again.json()) as { ok: boolean; error: { code: string } }
  assert.equal(error.ok, false)
  assert.equal(error.error.code, 'already-claimed')
})

test('POST unclaim undoes the stamp', async () => {
  const service = makeService()
  await service.open()
  const handler = registerRoute(service)
  const before = (await response_view(handler)) as { snapshot: { offers: Array<{ id: string }> } }
  const offerId = before.snapshot.offers[1].id
  await post(handler, { action: 'claim', offerId })
  const after = (await response_view(handler, { action: 'unclaim', offerId })) as {
    claims: Record<string, { claimedThisPeriod: boolean }>
  }
  assert.equal(after.claims[offerId]?.claimedThisPeriod, false)
})

test('POST refresh bypasses the cache', async () => {
  const service = makeService()
  await service.open()
  const handler = registerRoute(service)
  const response = await post(handler, { action: 'refresh' })
  assert.equal(response.status, 200)
})

test('POST claim without offerId is a 400', async () => {
  const service = makeService()
  await service.open()
  const handler = registerRoute(service)
  const response = await post(handler, { action: 'claim' })
  assert.equal(response.status, 400)
})

async function post(handler: (request: Request) => Promise<Response>, body: unknown): Promise<Response> {
  return handler(
    new Request('http://local/api/token-wool-radar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

async function response_view(handler: (request: Request) => Promise<Response>, body?: unknown): Promise<never> {
  const response = body === undefined ? await handler(new Request('http://local/api/token-wool-radar')) : await post(handler, body)
  const payload = (await response.json()) as { view: never }
  return payload.view
}
