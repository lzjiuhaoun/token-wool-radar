/** Agent 工具：list_free_tokens / check_offer_status，与面板共用 WoolService 同一方法。
 *  本地 defineTool 等价物：把作者 DSL 编译成注册表接受的 JSON Schema 子集
 *  （object 需显式 additionalProperties，required 为字符串数组，叶节点无 required）。 */

import type { WoolService, RadarView } from './claim/service.ts'

/* ── 作者 DSL ─────────────────────────────────────────── */

interface AuthorParameter {
  type: 'string' | 'number' | 'boolean'
  required?: true
  description?: string
  enum?: string[]
}

type AuthorParameters = Record<string, AuthorParameter>

type AuthorNode =
  | { type: 'object'; additionalProperties: false; properties: Record<string, AuthorNode> }
  | { type: 'object'; additionalProperties: false; properties: Record<string, AuthorNode & { required?: true }> }
  | { type: 'array'; items: AuthorNode }
  | { type: 'string' | 'number' | 'boolean'; enum?: (string | number)[] }
  | { oneOf: AuthorNode[] }

/* ── 编译 ─────────────────────────────────────────────── */

type CompiledNode = Record<string, unknown>

function compileNode(node: AuthorNode, path: string): CompiledNode {
  if ('oneOf' in node) {
    return { oneOf: node.oneOf.map((branch, index) => compileNode(branch, `${path}.oneOf[${index}]`)) }
  }
  if (node.type === 'object') {
    const properties: Record<string, CompiledNode> = {}
    const required: string[] = []
    for (const [key, value] of Object.entries(node.properties)) {
      const child = value as AuthorNode & { required?: true }
      if (child.required === true) required.push(key)
      properties[key] = compileNode(child, `${path}.${key}`)
    }
    const compiled: CompiledNode = { type: 'object', additionalProperties: false, properties }
    if (required.length > 0) compiled.required = required
    return compiled
  }
  if (node.type === 'array') {
    return { type: 'array', items: compileNode(node.items, `${path}.items`) }
  }
  const compiled: CompiledNode = { type: node.type }
  if (node.enum !== undefined) {
    if (node.enum.length === 0) throw new Error(`${path}.enum must be non-empty`)
    compiled.enum = [...node.enum]
  }
  return compiled
}

function compileParameters(spec: AuthorParameters): CompiledNode {
  const properties: Record<string, CompiledNode> = {}
  const required: string[] = []
  for (const [key, value] of Object.entries(spec)) {
    if (value.required === true) required.push(key)
    const compiled: CompiledNode = { type: value.type }
    if (value.description !== undefined) compiled.description = value.description
    if (value.enum !== undefined) compiled.enum = [...value.enum]
    properties[key] = compiled
  }
  const schema: CompiledNode = { type: 'object', properties }
  if (required.length > 0) schema.required = required
  return schema
}

/* ── 工具定义 ─────────────────────────────────────────── */

const LIST_DESCRIPTION =
  'List currently claimable free LLM credit and free API offers (羊毛), each converted to CNY at official prices. ' +
  'Returns the offer list plus claim state from the user’s local album. Filter by cadence, minimum CNY value, keyword, or unclaimed-only.'

const STATUS_DESCRIPTION =
  'Check one offer’s current status: whether it is live, its CNY value, its cadence, and whether the user has already claimed it in the current period.'

const OFFER_SCHEMA: AuthorNode = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    kind: { type: 'string', required: true, enum: ['daily', 'weekly', 'monthly', 'once', 'limited', 'free'] },
    provider: { type: 'string', required: true },
    title: { type: 'string', required: true },
    url: { type: 'string', required: true },
    label: { type: 'string', required: true },
    note: { type: 'string', required: true },
    // 未定价条目为 null：用 oneOf 表达可空数字
    yuan: { oneOf: [{ type: 'number' }, { type: 'null' }], required: true },
    counted: { type: 'boolean', required: true },
    endsAt: { type: 'string' },
    tags: { type: 'array', required: true, items: { type: 'string' } },
    claimedThisPeriod: { type: 'boolean', required: true },
    level: { type: 'string', enum: ['common', 'fine', 'rare', 'epic', 'legend'] },
  },
}

const LIST_OUTPUT: AuthorNode = {
  type: 'object',
  additionalProperties: false,
  properties: {
    source: { type: 'string', required: true },
    fetchedAt: { type: 'string', required: true },
    degraded: { type: 'boolean', required: true },
    stats: {
      type: 'object',
      additionalProperties: false,
      required: true,
      properties: {
        claimableCny: { type: 'number', required: true },
        liveCount: { type: 'number', required: true },
        endedCount: { type: 'number', required: true },
        nextResetAt: { type: 'number' },
      },
    },
    offers: { type: 'array', required: true, items: OFFER_SCHEMA },
  },
}

const STATUS_OUTPUT: AuthorNode = {
  type: 'object',
  additionalProperties: false,
  properties: {
    found: { type: 'boolean', required: true },
    offer: OFFER_SCHEMA,
    ended: { type: 'boolean' },
    error: { type: 'string' },
  },
}

interface ToolDefinition {
  name: string
  description: string
  parameters: CompiledNode
  output: {
    schema: CompiledNode
    render: (args: unknown, value: unknown) => Array<{ type: 'text'; text: string }>
  }
  execute: (args: Record<string, unknown>, exec: unknown) => Promise<unknown>
  presentCall: (args: Record<string, unknown>) => unknown
}

function textOutput(_args: unknown, value: unknown): Array<{ type: 'text'; text: string }> {
  return [{ type: 'text', text: JSON.stringify(value) }]
}

/** 一行 offer：只带已定义的字段（undefined 会被无损 JSON 检查拒绝）。 */
function offerRow(view: RadarView, offer: RadarView['snapshot']['offers'][number]): Record<string, unknown> {
  const claim = view.claims[offer.id]
  const row: Record<string, unknown> = {
    id: offer.id,
    kind: offer.kind,
    provider: offer.provider,
    title: offer.title,
    url: offer.url,
    label: offer.label,
    note: offer.note,
    yuan: offer.yuan,
    counted: offer.counted,
    tags: offer.tags,
    claimedThisPeriod: claim?.claimedThisPeriod ?? false,
  }
  if (offer.endsAt !== undefined) row.endsAt = offer.endsAt
  if (claim?.level != null) row.level = claim.level.id
  return row
}

/** 绝版条目行（同样只带已定义字段）。 */
function endedRow(view: RadarView, ended: RadarView['snapshot']['ended'][number]): Record<string, unknown> {
  const claim = view.claims[ended.id]
  const row: Record<string, unknown> = {
    id: ended.id,
    kind: ended.kind,
    provider: ended.provider,
    title: ended.provider,
    url: '',
    label: ended.face,
    note: '',
    yuan: null,
    counted: false,
    tags: [],
    claimedThisPeriod: claim?.claimedThisPeriod ?? false,
  }
  if (claim?.level != null) row.level = claim.level.id
  return row
}

export { compileNode, compileParameters }

export function registerTools(
  ctx: { tools?: { register: (definition: ToolDefinition, options?: unknown) => unknown } },
  service: WoolService,
): void {
  const tools = ctx.tools
  if (tools === undefined) return

  tools.register({
    name: 'list_free_tokens',
    description: LIST_DESCRIPTION,
    parameters: compileParameters({
      cadence: {
        type: 'string',
        description: 'Only offers of this cadence: daily, weekly, monthly, once, limited, or free.',
        enum: ['daily', 'weekly', 'monthly', 'once', 'limited', 'free'],
      },
      minAmount: {
        type: 'number',
        description: 'Only offers whose converted CNY value is at least this amount.',
      },
      keyword: {
        type: 'string',
        description: 'Case-insensitive keyword matched against title, provider, and tags.',
      },
      onlyUnclaimed: {
        type: 'boolean',
        description: 'Only offers not yet claimed in the current period.',
      },
    }),
    output: { schema: compileNode(LIST_OUTPUT, 'output'), render: textOutput },
    async execute(args) {
      const view = await service.view()
      const cadence = typeof args.cadence === 'string' ? args.cadence : undefined
      const minAmount = typeof args.minAmount === 'number' ? args.minAmount : undefined
      const keyword = typeof args.keyword === 'string' ? args.keyword.toLowerCase() : undefined
      const onlyUnclaimed = args.onlyUnclaimed === true
      const offers = view.snapshot.offers.filter((offer) => {
        if (cadence !== undefined && offer.kind !== cadence) return false
        if (minAmount !== undefined && (offer.yuan ?? 0) < minAmount) return false
        if (onlyUnclaimed && view.claims[offer.id]?.claimedThisPeriod === true) return false
        if (keyword !== undefined) {
          const haystack = `${offer.title} ${offer.provider} ${offer.tags.join(' ')}`.toLowerCase()
          if (!haystack.includes(keyword)) return false
        }
        return true
      })
      return {
        source: view.snapshot.origin === 'error' ? 'unavailable' : 'aihot.news/free-tokens',
        fetchedAt: view.snapshot.fetchedAt,
        degraded: view.snapshot.degraded,
        stats: {
          claimableCny: view.stats.claimableCny,
          liveCount: view.stats.totalCount,
          endedCount: view.stats.endedCount,
          nextResetAt: view.stats.nextResetAt,
        },
        offers: offers.map((offer) => offerRow(view, offer)),
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'List free token offers',
      kind: 'read',
      rawInput: typeof args.keyword === 'string' ? args.keyword : undefined,
    }),
  })

  tools.register({
    name: 'check_offer_status',
    description: STATUS_DESCRIPTION,
    parameters: compileParameters({
      offerId: {
        type: 'string',
        required: true,
        description: 'Exact offer id from list_free_tokens.',
      },
    }),
    output: { schema: compileNode(STATUS_OUTPUT, 'output'), render: textOutput },
    async execute(args) {
      const offerId = typeof args.offerId === 'string' ? args.offerId.trim() : ''
      if (offerId.length === 0) throw new Error('offerId must be a non-empty string')
      const view = await service.view()
      const offer = view.snapshot.offers.find((item) => item.id === offerId)
      if (offer === undefined) {
        const ended = view.snapshot.ended.find((item) => item.id === offerId)
        if (ended !== undefined) {
          return { found: true, ended: true, offer: endedRow(view, ended), error: 'offer has ended' }
        }
        return { found: false, error: `offer "${offerId}" was not found` }
      }
      return { found: true, ended: false, offer: offerRow(view, offer) }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'Check offer status',
      kind: 'read',
      rawInput: typeof args.offerId === 'string' ? args.offerId : undefined,
    }),
  })
}
