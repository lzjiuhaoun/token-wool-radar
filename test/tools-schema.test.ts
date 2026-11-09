/** 工具 schema 编译测试：保证注册表接受的 JSON Schema 子集（安装期失败在测试期暴露）。 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compileNode, compileParameters } from '../src/tools.ts'
import { readFileSync } from 'node:fs'
import { parseUpstream } from '../src/offers/parse.ts'

const fixture = readFileSync(new URL('./fixtures/free-tokens.data.json', import.meta.url), 'utf8')
const parsed = parseUpstream(fixture)

/** 复刻 dsh-tools 的 enforced subset 断言（parameters 根不要求 additionalProperties）。 */
function assertSupported(node: Record<string, unknown>, path = 'schema', requireAdditional = true): void {
  const type = node.type
  assert.ok(type !== undefined, `${path} must declare a type`)
  if (type === 'object') {
    if (requireAdditional) {
      assert.equal(typeof node.additionalProperties, 'boolean', `${path}.additionalProperties must be boolean`)
    }
    if (node.required !== undefined) {
      assert.ok(Array.isArray(node.required) && node.required.every((name) => typeof name === 'string'), `${path}.required must be an array of strings`)
      for (const name of node.required as string[]) {
        assert.ok(node.properties !== undefined && name in (node.properties as object), `${path}.required names an unknown property ${name}`)
      }
    }
    const properties = (node.properties ?? {}) as Record<string, Record<string, unknown>>
    for (const [key, child] of Object.entries(properties)) {
      assert.ok(!('required' in child), `${path}.properties.${key} must not carry required`)
      assertSupported(child, `${path}.properties.${key}`)
    }
    return
  }
  if (type === 'array') {
    assert.ok(node.items !== undefined, `${path}.items is required`)
    assertSupported(node.items as Record<string, unknown>, `${path}.items`)
    return
  }
  assert.ok(['string', 'number', 'integer', 'boolean', 'null'].includes(type as string), `${path}.type unsupported`)
  assert.ok(!('required' in node), `${path} must not carry required`)
}

test('compiled parameters are an object schema without leaf required keys', () => {
  const schema = compileParameters({
    offerId: { type: 'string', required: true, description: 'id' },
    minAmount: { type: 'number', description: 'min' },
    onlyUnclaimed: { type: 'boolean' },
  })
  assertSupported(schema, 'schema', false)
  assert.deepEqual(schema.required, ['offerId'])
  assert.equal(schema.properties.offerId.type, 'string')
  assert.equal(schema.properties.offerId.description, 'id')
  assert.ok(!('required' in (schema.properties.offerId as object)))
})

test('compiled output schemas satisfy the enforced subset', () => {
  const offer = {
    type: 'object' as const,
    additionalProperties: false as const,
    properties: {
      id: { type: 'string' as const, required: true as const },
      tags: { type: 'array' as const, required: true as const, items: { type: 'string' as const } },
      yuan: { type: 'number' as const },
      kind: { type: 'string' as const, enum: ['daily', 'once'] },
    },
  }
  const schema = compileNode({
    type: 'object',
    additionalProperties: false,
    properties: {
      found: { type: 'boolean', required: true },
      offers: { type: 'array', required: true, items: offer },
    },
  }, 'output')
  assertSupported(schema)
  assert.deepEqual(schema.required, ['found', 'offers'])
  assert.equal(schema.properties.offers.items.required[0], 'id')
  assert.equal(schema.properties.offers.items.properties.kind.enum[0], 'daily')
})

test('fixture parses so the tool tests have live data', () => {
  assert.ok(parsed.deals.length >= 40)
})

test('tool outputs are lossless JSON (no undefined / NaN / Infinity)', async () => {
  const { WoolService } = await import('../src/claim/service.ts')
  const service = new WoolService(
    {},
    {
      storageDomain: {
        async open() {
          return {
            name: 'token_wool_radar',
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
      fetch: async () => parsed,
    },
  )
  await service.open()
  const tools: Array<{ name: string; execute: (args: Record<string, unknown>, exec: unknown) => Promise<unknown> }> = []
  const { registerTools } = await import('../src/tools.ts')
  registerTools({ tools: { register: (definition: never) => tools.push(definition) } } as never, service)
  assert.equal(tools.length, 2)

  /** 复刻无损 JSON 判定：对象/数组内不允许 undefined、NaN、Infinity。 */
  function assertLossless(value: unknown, path = 'value'): void {
    if (value === undefined) throw new Error(`${path} is undefined`)
    if (typeof value === 'number') {
      assert.ok(Number.isFinite(value), `${path} is not finite`)
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertLossless(item, `${path}[${index}]`))
      return
    }
    if (typeof value === 'object' && value !== null) {
      for (const [key, child] of Object.entries(value)) assertLossless(child, `${path}.${key}`)
    }
  }

  /** 按编译产物校验结果值（复刻宿主对工具输出的校验）。 */
  function assertConforms(value: unknown, schema: Record<string, unknown>, path = 'value'): void {
    if (Array.isArray(schema.oneOf)) {
      const branches = schema.oneOf as Array<Record<string, unknown>>
      const matched = branches.filter((branch) => {
        try {
          assertConforms(value, branch, path)
          return true
        } catch {
          return false
        }
      })
      assert.equal(matched.length, 1, `${path} must match exactly one oneOf branch`)
      return
    }
    const type = schema.type as string
    if (type === 'object') {
      assert.ok(typeof value === 'object' && value !== null && !Array.isArray(value), `${path} must be an object`)
      const record = value as Record<string, unknown>
      for (const name of (schema.required as string[] | undefined) ?? []) {
        assert.ok(name in record, `${path}.${name} is required`)
      }
      if (schema.additionalProperties === false) {
        const declared = Object.keys((schema.properties ?? {}) as object)
        for (const key of Object.keys(record)) assert.ok(declared.includes(key), `${path}.${key} is not declared`)
      }
      const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>
      for (const [key, child] of Object.entries(properties)) {
        if (key in record) assertConforms(record[key], child, `${path}.${key}`)
      }
      return
    }
    if (type === 'array') {
      assert.ok(Array.isArray(value), `${path} must be an array`)
      ;(value as unknown[]).forEach((item, index) => assertConforms(item, schema.items as Record<string, unknown>, `${path}[${index}]`))
      return
    }
    if (type === 'null') {
      assert.equal(value, null, `${path} must be null`)
      return
    }
    if (type === 'string') {
      assert.equal(typeof value, 'string', `${path} must be a string`)
      if (schema.enum !== undefined) assert.ok((schema.enum as string[]).includes(value as string), `${path} not in enum`)
      return
    }
    if (type === 'number' || type === 'integer') {
      assert.equal(typeof value, 'number', `${path} must be a number`)
      return
    }
    if (type === 'boolean') {
      assert.equal(typeof value, 'boolean', `${path} must be a boolean`)
      return
    }
    throw new Error(`${path}: unsupported schema type ${type}`)
  }

  const list = tools.find((tool) => tool.name === 'list_free_tokens')!
  const listValue = (await list.execute({}, undefined)) as { offers: Array<Record<string, unknown>> }
  assertLossless(listValue)
  assertConforms(listValue, (list as unknown as { output: { schema: Record<string, unknown> } }).output.schema)
  assert.ok(listValue.offers.length >= 40)
  // 有元数据的字段确实出现，没有的字段被安全省略
  assert.ok(listValue.offers.some((offer) => offer.endsAt !== undefined))
  assert.ok(listValue.offers.some((offer) => offer.level === undefined))
  // 未定价条目 yuan 为 null，且通过 oneOf 校验
  assert.ok(listValue.offers.some((offer) => offer.yuan === null))
  assert.ok(listValue.offers.some((offer) => typeof offer.yuan === 'number'))

  const status = tools.find((tool) => tool.name === 'check_offer_status')!
  const found = (await status.execute({ offerId: parsed.deals[0].id }, undefined)) as Record<string, unknown>
  assertLossless(found)
  assertConforms(found, (status as unknown as { output: { schema: Record<string, unknown> } }).output.schema)
  assert.equal(found.found, true)
  const missing = (await status.execute({ offerId: 'nope' }, undefined)) as Record<string, unknown>
  assertLossless(missing)
  assertConforms(missing, (status as unknown as { output: { schema: Record<string, unknown> } }).output.schema)
  assert.equal(missing.found, false)
})
