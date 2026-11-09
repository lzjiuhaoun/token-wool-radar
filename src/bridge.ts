/** Client→Host 桥：经 ctx.connection.fetch.register 注册鉴权 HTTP 路由，Client 用同源 fetch 调用。 */

import type { WoolService } from './claim/service.ts'

export const API_PATH = '/api/token-wool-radar'

interface JsonBody {
  action?: string
  offerId?: string
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

async function readJson(request: Request): Promise<JsonBody> {
  if (request.method === 'GET') return {}
  try {
    const body = (await request.json()) as unknown
    if (typeof body !== 'object' || body === null) return {}
    return body as JsonBody
  } catch {
    return {}
  }
}

/**
 * 路由协议：
 * - GET  → { ok, view }
 * - POST { action: 'claim' | 'unclaim', offerId } → { ok, view } 或 { ok:false, error }
 * - POST { action: 'refresh' } → { ok, view }
 */
export function applyBridge(ctx: { effect: (fn: () => unknown, label?: string) => unknown; connection?: { fetch: { register: (route: unknown) => unknown } } }, service: WoolService): void {
  const connection = ctx.connection
  if (connection === undefined) throw new Error('token-wool-radar: connection service is unavailable')
  ctx.effect(() => connection.fetch.register({
    path: API_PATH,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    fetch: async (request: Request) => {
      const body = await readJson(request)
      const action = body.action ?? 'view'
      try {
        if (action === 'claim') {
          if (typeof body.offerId !== 'string' || body.offerId.length === 0) {
            return json({ ok: false, error: { code: 'bad-request', message: 'claim requires offerId' } }, 400)
          }
          const result = await service.claim(body.offerId)
          return result.ok ? json({ ok: true, view: result.value }) : json({ ok: false, error: result.error }, 409)
        }
        if (action === 'unclaim') {
          if (typeof body.offerId !== 'string' || body.offerId.length === 0) {
            return json({ ok: false, error: { code: 'bad-request', message: 'unclaim requires offerId' } }, 400)
          }
          const result = await service.unclaim(body.offerId)
          return result.ok ? json({ ok: true, view: result.value }) : json({ ok: false, error: result.error }, 409)
        }
        if (action === 'refresh') {
          const result = await service.refresh()
          return json({ ok: true, view: result.value })
        }
        const view = await service.view()
        return json({ ok: true, view })
      } catch (error) {
        return json({ ok: false, error: { code: 'internal', message: error instanceof Error ? error.message : String(error) } }, 500)
      }
    },
  }), 'token-wool-radar: api route')
}
