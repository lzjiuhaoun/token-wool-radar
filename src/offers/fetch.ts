/** 上游抓取：浏览器 UA、8s 超时、2 次指数退避、429 尊重 Retry-After、10 分钟内存缓存。 */

import { parseUpstream, type ParsedUpstream } from './parse.ts'

const UPSTREAM_URL = 'https://aihot.news/free-tokens.data'
const UPSTREAM_PAGE_URL = 'https://aihot.news/free-tokens'
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const TIMEOUT_MS = 8000
const MAX_ATTEMPTS = 3
const CACHE_TTL_MS = 10 * 60 * 1000

export interface FetchOutcome {
  parsed: ParsedUpstream
  /** 本次抓取是否走了缓存 */
  fromCache: boolean
}

export class UpstreamError extends Error {
  readonly code: 'network' | 'http' | 'parse' | 'empty'
  constructor(code: UpstreamError['code'], message: string) {
    super(message)
    this.code = code
  }
}

interface CacheEntry {
  at: number
  parsed: ParsedUpstream
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function retryAfterMs(response: Response): number | null {
  const header = response.headers.get('retry-after')
  if (header === null) return null
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 60_000)
  const date = Date.parse(header)
  if (Number.isFinite(date)) return Math.max(0, Math.min(date - Date.now(), 60_000))
  return null
}

async function fetchOnce(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': BROWSER_UA, accept: '*/*', 'accept-language': 'zh-CN,zh;q=0.9' },
      signal: controller.signal,
    })
    if (response.status === 429) {
      const wait = retryAfterMs(response)
      throw new UpstreamError('http', `upstream rate-limited (429)${wait === null ? '' : `; retry after ${wait}ms`}`)
    }
    if (!response.ok) throw new UpstreamError('http', `upstream responded ${response.status}`)
    return await response.text()
  } catch (error) {
    if (error instanceof UpstreamError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new UpstreamError('network', `upstream request timed out after ${TIMEOUT_MS}ms`)
    }
    throw new UpstreamError('network', `upstream request failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    clearTimeout(timer)
  }
}

/** 带退避的抓取；主路径是 .data 端点，失败时回退页面 HTML 内嵌 payload。 */
export async function fetchUpstream(): Promise<ParsedUpstream> {
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const text = await fetchOnce(UPSTREAM_URL)
      const parsed = parseUpstream(text)
      if (parsed.deals.length === 0) throw new UpstreamError('empty', 'upstream payload normalized to zero deals')
      return parsed
    } catch (error) {
      lastError = error
      if (error instanceof UpstreamError && error.code === 'parse') throw error
      const wait = error instanceof UpstreamError && error.code === 'http' && /429/.test(error.message) ? 2000 * (attempt + 1) : 500 * 2 ** attempt
      if (attempt < MAX_ATTEMPTS - 1) await sleep(wait)
    }
  }
  // 主路径失败：尝试页面 HTML（SSR 内嵌同一份 turbo-stream）
  try {
    const text = await fetchOnce(UPSTREAM_PAGE_URL)
    const payload = extractPagePayload(text)
    const parsed = parseUpstream(payload)
    if (parsed.deals.length === 0) throw new UpstreamError('empty', 'page payload normalized to zero deals')
    return parsed
  } catch (error) {
    if (error instanceof UpstreamError && error.code === 'parse') throw error
    throw error instanceof UpstreamError ? error : new UpstreamError('network', String(error instanceof Error ? error.message : error))
  }
  void lastError
}

/** 从页面 HTML 中提取 streamController.enqueue("...") 的 turbo-stream payload。 */
export function extractPagePayload(html: string): string {
  const matches = [...html.matchAll(/streamController\.enqueue\("((?:[^"\\]|\\.)*)"\)/g)]
  if (matches.length === 0) throw new UpstreamError('parse', 'page HTML carries no streamed loader payload')
  let best = ''
  for (const match of matches) {
    let chunk: string
    try {
      chunk = JSON.parse(`"${match[1]}"`) as string
    } catch {
      continue
    }
    if (chunk.includes('"deals"') && chunk.length > best.length) best = chunk
  }
  if (best === '') throw new UpstreamError('parse', 'page HTML carries no deals payload')
  return best
}

/** 10 分钟内存缓存；force  bypass 缓存（手动刷新）。 */
export class SnapshotCache {
  private entry: CacheEntry | null = null

  private readonly ttlMs: number

  constructor(ttlMs: number = CACHE_TTL_MS) {
    this.ttlMs = ttlMs
  }

  get(): ParsedUpstream | null {
    if (this.entry === null) return null
    if (Date.now() - this.entry.at > this.ttlMs) {
      this.entry = null
      return null
    }
    return this.entry.parsed
  }

  put(parsed: ParsedUpstream): void {
    this.entry = { at: Date.now(), parsed }
  }

  clear(): void {
    this.entry = null
  }
}
