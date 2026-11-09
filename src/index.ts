/** 羊毛雷达 Host 半：apply(ctx, config)。UI 面板与 Agent 工具共用 WoolService。 */

import type { WoolService } from './claim/service.ts'
import { WoolService as Service } from './claim/service.ts'
import { applyBridge } from './bridge.ts'
import { registerTools } from './tools.ts'

/** 可选服务缺失时插件保持不活跃，而不是抛错。 */
export const inject = ['connection', 'storageDomain', 'tools']

export function apply(ctx: {
  effect: (fn: () => unknown, label?: string) => unknown
  logger?: { warn: (message: string) => void }
  connection?: unknown
  storageDomain?: unknown
  tools?: unknown
}): void {
  const service: WoolService = new Service(ctx)
  let closing: Promise<void> | null = null
  ctx.effect(() => {
    // 存储域打开失败不应让整个插件激活失败：面板降级为只读
    service.open().catch((error: unknown) => {
      ctx.logger?.warn(`token-wool-radar: storage domain open failed: ${error instanceof Error ? error.message : String(error)}`)
    })
    return () => {
      closing ??= service.close()
    }
  }, 'token-wool-radar: storage domain')
  applyBridge(ctx as never, service)
  registerTools(ctx, service)
}
