/** Client 半冒烟：加载构建产物 dist/client.js，断言槽位注册并用 react-dom 渲染面板。 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as jsxRuntime from 'react/jsx-runtime'
import type { RadarView } from '../src/client/types.ts'

interface Registration {
  key: string
  options: Record<string, unknown>
  component: unknown
}

function loadClientBundle(): { apply: (ctx: unknown) => void; inject: string[]; registrations: Registration[] } {
  const code = readFileSync(new URL('../dist/client.js', import.meta.url), 'utf8')
  let loaded: { factory: (require: (id: string) => unknown) => { apply: (ctx: unknown) => void; inject: string[] } } | null = null
  const window = {
    __ModuleLoader__: {
      load: (module: typeof loaded) => {
        loaded = module
      },
    },
  }
  const requireStub = (id: string): unknown => {
    if (id === 'react') return React
    if (id === 'react/jsx-runtime') return jsxRuntime
    throw new Error(`unexpected require("${id}")`)
  }
  // 浏览器全局最小替身：样式注入只用 createElement/head.appendChild/remove
  const documentStub = {
    createElement: () => ({ dataset: {}, remove: () => {} }),
    head: { appendChild: () => {} },
  }
  const hadDocument = 'document' in globalThis
  ;(globalThis as { document?: unknown }).document = documentStub
  try {
    const run = new Function('window', 'require', code)
    run(window, requireStub)
    assert.ok(loaded !== null, 'bundle registered a module factory')
    const exported = loaded!.factory(requireStub)
    const registrations: Registration[] = []
    const ctx = {
      effect: (fn: () => unknown) => fn(),
      locale: {
        register: () => () => {},
        bind: () => (key: string) => key,
      },
      slots: {
        inject: (key: string, callback: () => unknown) => {
          const registration = callback() as { options: Record<string, unknown>; component: unknown }
          registrations.push({ key, options: registration.options, component: registration.component })
          return () => {}
        },
        register: (options: Record<string, unknown>, component: unknown) => ({ options, component }),
      },
      layout: { selectPanel: () => {} },
    }
    exported.apply(ctx)
    return { apply: exported.apply, inject: exported.inject, registrations }
  } finally {
    if (!hadDocument) delete (globalThis as { document?: unknown }).document
  }
}

const MOCK_VIEW: RadarView = {
  snapshot: {
    fetchedAt: new Date().toISOString(),
    origin: 'live',
    serverNow: Date.now(),
    nextRefreshAt: Date.now() + 3_600_000,
    basis: { mix: '一般用量', ratio: '7 : 2 : 1', usdCny: 6.6713 },
    offers: [
      {
        id: 'demo-daily-200',
        kind: 'daily',
        title: '演示：每天签到领 200 额度',
        provider: '演示厂商',
        detail: 'detail',
        url: 'https://example.com',
        evidence: 'official',
        appliesTo: 'all',
        appliesToAll: true,
        realName: false,
        clientOnly: true,
        studentOnly: false,
        autoRenews: false,
        tags: ['需登录', '不含 Pro', 'A', 'B', 'C', 'D', 'E'],
        validity: '30 天',
        verifiedAt: '2026-11-08T10:02:34.025Z',
        label: '200 额度',
        note: '每天 · 不折钱',
        face: '200额度',
        models: [],
        counted: true,
        yuan: 33.3565,
        endsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        icon: '/api/img-proxy?u=x',
      },
      {
        id: 'demo-once-20',
        kind: 'once',
        title: '演示：新用户 20 元',
        provider: '另一厂商',
        detail: 'detail',
        url: 'https://example.com',
        evidence: 'official',
        appliesTo: 'all',
        appliesToAll: true,
        realName: false,
        clientOnly: false,
        studentOnly: false,
        autoRenews: false,
        tags: [],
        label: '¥20',
        note: '一次性',
        face: '¥20',
        models: [],
        counted: true,
        yuan: 20,
      },
    ],
    ended: [],
    stats: { claimableCny: 0, liveCount: 2, endedCount: 0 },
    degraded: false,
    parseFailures: 0,
    parseTotal: 2,
  },
  claims: {
    'demo-daily-200': {
      offerId: 'demo-daily-200',
      claimedThisPeriod: true,
      claimedAt: new Date().toISOString(),
      firstClaimedAt: new Date().toISOString(),
      totalClaims: 1,
      claimedCny: 33.3565,
      level: { id: 'fine', rank: 1, labelZh: '精良', labelEn: 'Fine', shiny: false },
      legacy: false,
    },
  },
  album: [
    {
      offerId: 'demo-daily-200',
      provider: '演示厂商',
      title: '演示：每天签到领 200 额度',
      face: '200额度',
      kind: 'daily',
      level: { id: 'fine', rank: 1, labelZh: '精良', labelEn: 'Fine', shiny: false },
      firstClaimedAt: new Date().toISOString(),
      totalClaims: 1,
      legacy: false,
    },
  ],
  stats: { claimableCny: 20, claimedCnyThisPeriod: 33.36, collectedCount: 1, totalCount: 2, endedCount: 0, nextResetAt: Date.now() + 7_200_000, nextRefreshAt: Date.now() + 3_600_000 },
}

function fakeStore() {
  const state = { status: 'ready' as const, view: MOCK_VIEW, error: null, notice: null, busy: null }
  return {
    subscribe: () => () => {},
    getSnapshot: () => state,
    load: async () => {},
    claim: async () => {},
    unclaim: async () => {},
  }
}

test('the bundle registers main, sidebar.panellist, and composer dock with one shared id', () => {
  const { inject, registrations } = loadClientBundle()
  assert.deepEqual(inject, ['slots', 'locale', 'layout'])
  const byKey = new Map(registrations.map((registration) => [registration.key, registration]))
  assert.ok(byKey.has('main'), 'main panel registered')
  assert.ok(byKey.has('sidebar.panellist'), 'sidebar entry registered')
  assert.ok(byKey.has('conversation.composer.dock'), 'dock entry registered')
  const main = byKey.get('main')!
  const sidebar = byKey.get('sidebar.panellist')!
  assert.equal(main.options.key, 'token-wool-radar')
  assert.equal(sidebar.options.id, 'token-wool-radar')
  assert.equal(typeof sidebar.options.label, 'function')
  assert.equal((sidebar.options.label as () => string)(), 'panel.iconLabel')
})

test('the main panel renders the four-layer structure without crashing', () => {
  const { registrations } = loadClientBundle()
  const main = registrations.find((registration) => registration.key === 'main')!
  const store = fakeStore()
  const t = (key: string) => key
  const html = renderToStaticMarkup(React.createElement(main.component as React.ComponentType<{ store: unknown; t: unknown }>, { store, t }))
  assert.ok(html.includes('twr-page'), 'page root')
  assert.ok(html.includes('twr-stats'), 'stats bar')
  assert.ok(html.includes('twr-filters'), 'filter bar')
  assert.ok(html.includes('twr-group'), 'group grid')
  assert.ok(html.includes('演示：每天签到领 200 额度'), 'offer title')
  assert.ok(html.includes('twr-stamp'), 'claimed stamp')
  assert.ok(html.includes('card.moreTags'), 'collapsed extra tags')
  assert.ok(html.includes('card.verified'), 'verified date on the card')
})

test('the dock entry renders a summary line', () => {
  const { registrations } = loadClientBundle()
  const dock = registrations.find((registration) => registration.key === 'conversation.composer.dock')!
  const store = fakeStore()
  const t = (key: string) => key
  const html = renderToStaticMarkup(
    React.createElement(dock.component as React.ComponentType<{ store: unknown; onOpen: () => void; t: unknown }>, { store, onOpen: () => {}, t }),
  )
  assert.ok(html.includes('twr-dock'), 'dock row')
  assert.ok(html.includes('¥20'), 'claimable amount')
})

test('a degraded snapshot renders links only, without converted values', () => {
  const { registrations } = loadClientBundle()
  const main = registrations.find((registration) => registration.key === 'main')!
  const degradedView: RadarView = {
    ...MOCK_VIEW,
    snapshot: { ...MOCK_VIEW.snapshot, degraded: true },
  }
  const store = {
    subscribe: () => () => {},
    getSnapshot: () => ({ status: 'ready' as const, view: degradedView, error: null, notice: null, busy: null }),
    load: async () => {},
    claim: async () => {},
    unclaim: async () => {},
  }
  const html = renderToStaticMarkup(React.createElement(main.component as React.ComponentType<{ store: unknown; t: unknown }>, { store, t: (key: string) => key }))
  assert.ok(html.includes('card.degradedNote'), 'degraded hint on the card')
  assert.ok(html.includes('card.degradedValue'), 'conversion marked unavailable')
  assert.ok(!html.includes('twr-card-face'), 'face value hidden')
  assert.ok(html.includes('banner.degraded'), 'degraded banner')
})
