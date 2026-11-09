/** Host 半冒烟：对构建产物 dist/index.js 调用 apply，断言桥路由与工具注册。 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const host = await import('../dist/index.js')

test('dist/index.js exports the apply/inject plugin contract', () => {
  assert.equal(typeof host.apply, 'function')
  assert.deepEqual(host.inject, ['connection', 'storageDomain', 'tools'])
})

test('apply registers the authenticated api route and both tools', async () => {
  const routes: unknown[] = []
  const tools: Array<{ name: string }> = []
  let opened = 0
  const ctx = {
    effect: (fn: () => unknown) => fn(),
    logger: { warn: () => {} },
    connection: {
      fetch: {
        register: (route: unknown) => {
          routes.push(route)
          return () => {}
        },
      },
    },
    storageDomain: {
      open: async (spec: { name: string }) => {
        opened += 1
        assert.equal(spec.name, 'token_wool_radar')
        return {
          name: spec.name,
          table: () => ({
            get: () => undefined,
            keys: () => [][Symbol.iterator](),
            entries: () => [][Symbol.iterator](),
            get size() {
              return 0
            },
            put: async () => {},
            update: async () => ({}),
            delete: async () => false,
          }),
          close: async () => {},
        }
      },
    },
    tools: {
      register: (definition: { name: string }) => {
        tools.push(definition)
        return () => {}
      },
    },
  }
  host.apply(ctx)
  // 存储域打开是异步的，等一个宏任务
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(opened, 1)
  assert.equal(routes.length, 1)
  const route = routes[0] as { path: string; methods: string[] }
  assert.equal(route.path, '/api/token-wool-radar')
  assert.deepEqual([...route.methods].sort(), ['GET', 'POST'])
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ['check_offer_status', 'list_free_tokens'])
})

test('the built bundle references no external module imports', () => {
  const source = readFileSync(new URL('../dist/index.js', import.meta.url), 'utf8')
  // Host 半不打 bundle 外部依赖：除了 node: 内置，不应出现 import 语句
  const imports = [...source.matchAll(/import\s[^'"]*from\s+['"]([^'"]+)['"]/g)].map((match) => match[1])
  for (const specifier of imports) {
    assert.ok(specifier.startsWith('node:'), `unexpected import ${specifier}`)
  }
})
