/** 领取域运行时的最小接口（与 @deepseek-ai/dsh-storage-domain 的 Domain/KvTable 对应）。 */

import type { ClaimRecord } from './domain.ts'

export interface ClaimTable {
  get(key: string): ClaimRecord | undefined
  keys(): IterableIterator<string>
  entries(): IterableIterator<[string, ClaimRecord]>
  get size(): number
  put(key: string, value: ClaimRecord): Promise<unknown>
  update(key: string, fn: (current: ClaimRecord) => ClaimRecord): Promise<ClaimRecord>
  delete(key: string): Promise<boolean>
}

export interface ClaimDomain {
  readonly name: string
  table(name: 'claims'): ClaimTable
  close(): Promise<void>
}

export interface StorageDomainFacility {
  open<S>(spec: S): Promise<{
    readonly name: string
    table(name: 'claims'): ClaimTable
    close(): Promise<void>
  }>
}
