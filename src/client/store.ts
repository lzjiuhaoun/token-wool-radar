/** Client 半数据存储：同源 fetch 打 Host 桥，30s 轮询，动作后整视图刷新。 */

import React from 'react'
import type { RadarView } from './types.ts'

const API_PATH = '/api/token-wool-radar'
const POLL_MS = 30_000

export interface ViewState {
  status: 'loading' | 'ready' | 'error'
  view: RadarView | null
  error: string | null
  /** 最近一次动作的结果提示 */
  notice: { kind: 'ok' | 'error'; text: string } | null
  busy: string | null
}

async function readView(init?: RequestInit): Promise<RadarView> {
  const response = await fetch(API_PATH, init)
  const body = (await response.json()) as { ok: boolean; view?: RadarView; error?: { code: string; message: string } }
  if (!body.ok || body.view === undefined) {
    throw new Error(body.error?.message ?? `request failed with ${response.status}`)
  }
  return body.view
}

export class ViewStore {
  private state: ViewState = { status: 'loading', view: null, error: null, notice: null, busy: null }
  private listeners = new Set<() => void>()
  private poller: ReturnType<typeof setInterval> | null = null
  private seq = 0

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    if (this.listeners.size === 1) this.start()
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.stop()
    }
  }

  getSnapshot = (): ViewState => this.state

  private emit(): void {
    for (const listener of this.listeners) listener()
  }

  private set(patch: Partial<ViewState>): void {
    this.state = { ...this.state, ...patch }
    this.emit()
  }

  private start(): void {
    if (this.poller !== null) return
    void this.load()
    this.poller = setInterval(() => {
      if (this.state.busy === null) void this.load()
    }, POLL_MS)
  }

  private stop(): void {
    if (this.poller !== null) clearInterval(this.poller)
    this.poller = null
  }

  /** 拉取视图；force 走 Host 手动刷新（绕过缓存）。 */
  async load(force = false): Promise<void> {
    const current = ++this.seq
    try {
      const view = await readView(force ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'refresh' }) } : undefined)
      if (current !== this.seq) return
      this.set({ status: 'ready', view, error: null })
    } catch (error) {
      if (current !== this.seq) return
      const message = error instanceof Error ? error.message : String(error)
      // 保留旧数据，只报错（不出现假数据）
      this.set({ status: this.state.view === null ? 'error' : 'ready', error: message })
    }
  }

  async claim(offerId: string): Promise<void> {
    await this.mutate('claim', offerId, '已盖章')
  }

  async unclaim(offerId: string): Promise<void> {
    await this.mutate('unclaim', offerId, '已撤销')
  }

  private async mutate(action: 'claim' | 'unclaim', offerId: string, successText: string): Promise<void> {
    const current = ++this.seq
    this.set({ busy: offerId, notice: null })
    try {
      const view = await readView({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, offerId }),
      })
      if (current !== this.seq) return
      this.set({ status: 'ready', view, busy: null, notice: { kind: 'ok', text: successText } })
    } catch (error) {
      if (current !== this.seq) return
      const message = error instanceof Error ? error.message : String(error)
      this.set({ busy: null, notice: { kind: 'error', text: message } })
    }
  }
}

export function useViewStore(store: ViewStore): ViewState {
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

/** 本地时钟：驱动倒计时每秒重渲染。 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
