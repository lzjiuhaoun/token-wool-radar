/** Client 半入口：注册 locale、侧栏入口、main 整页面板与 composer dock 摘要行。 */

import React from 'react'
import { Panel } from './Panel.tsx'
import { StatsDock } from './StatsDock.tsx'
import { ViewStore, useViewStore, useNow } from './store.ts'
import css from './theme.css'

const NS = 'tokenWoolRadar'
/** 侧栏入口 id 与 main 面板 key 一致。 */
const PANEL_ID = 'token-wool-radar'

const zh = {
  'panel.title': '羊毛雷达',
  'panel.subtitle': '能免费领的大模型额度，按官方价折成人民币',
  'panel.iconLabel': '羊毛雷达',
  'view.switch': '视图切换',
  'view.list': '列表',
  'view.album': '卡册',
  'action.refresh': '刷新',
  'stats.title': '统计',
  'stats.claimable': '今天还能领',
  'stats.claimableHint': '未领取且已计价条目折算合计',
  'stats.reset': '下次重置',
  'stats.resetHint': '每日 0 点 / 每周一 / 每月 1 日',
  'stats.album': '卡册',
  'stats.albumHint': '另有 {ended} 条已绝版',
  'banner.error': '数据获取失败：{message}（保留上次数据，未展示假数据）',
  'banner.degraded': '上游解析失败 {failed}/{total} 条，已降级为仅展示原链接',
  'banner.stale': '刷新失败，当前为缓存数据：{message}',
  'filter.search': '搜索厂商、标题或标签',
  'filter.all': '全部',
  'filter.daily': '每天',
  'filter.weekly': '每周',
  'filter.monthly': '每月',
  'filter.other': '其他',
  'filter.unclaimed': '只看未领',
  'group.daily': '每天都能领',
  'group.weekly': '每周都能领',
  'group.monthly': '每月都能领',
  'group.other': '其他福利',
  'group.count': '{count} 条',
  'empty.list': '没有符合筛选条件的条目',
  'card.goClaim': '去领',
  'card.stamp': '盖章',
  'card.claimed': '已领',
  'card.claimTitle': '标记为已领取',
  'card.unclaimTitle': '撤销本次领取',
  'card.stampMark': '已领',
  'card.moreTags': '+{count}',
  'card.expiry': '{days} 天后截止',
  'card.noValue': '不折钱',
  'card.degradedNote': '上游数据解析异常，暂只提供官方原链接',
  'card.degradedValue': '折算暂不可用',
  'card.verified': '核实于 {date}',
  'badge.legacy': '绝版',
  'album.title': '我的卡册',
  'album.progress': '已收集 {collected}/{total}',
  'album.levels': '普通 {common} · 精良 {fine} · 稀有 {rare} · 史诗 {epic} · 传说 {legend}',
  'album.empty': '还没有收集到任何羊毛，去列表里盖章吧',
  'album.placeholder': '未收集',
  'album.moreMissing': '还有 {count} 个空位未显示',
  'dock.label': '羊毛',
  'dock.reset': '重置 {time}',
  'dock.album': '卡册 {collected}/{total}',
  'dock.open': '打开羊毛雷达',
  'dock.unavailable': '羊毛雷达：数据暂不可用',
  'footer.source': '数据来源 aihot.news/free-tokens（个人非商业使用）；折算口径：{mix}，Token {ratio}，汇率 {usd}',
}

const en = {
  'panel.title': 'Token wool radar',
  'panel.subtitle': 'Free LLM credits and free API offers, converted to CNY at official prices',
  'panel.iconLabel': 'Token wool radar',
  'view.switch': 'View',
  'view.list': 'List',
  'view.album': 'Album',
  'action.refresh': 'Refresh',
  'stats.title': 'Stats',
  'stats.claimable': 'Claimable today',
  'stats.claimableHint': 'Converted total of unclaimed, priced offers',
  'stats.reset': 'Next reset',
  'stats.resetHint': 'Daily 00:00 / Monday / 1st of month',
  'stats.album': 'Album',
  'stats.albumHint': '{ended} more ended',
  'banner.error': 'Data fetch failed: {message} (keeping previous data; no fabricated values)',
  'banner.degraded': 'Upstream parse failed for {failed}/{total} entries; degraded to links only',
  'banner.stale': 'Refresh failed, showing cached data: {message}',
  'filter.search': 'Search provider, title, or tags',
  'filter.all': 'All',
  'filter.daily': 'Daily',
  'filter.weekly': 'Weekly',
  'filter.monthly': 'Monthly',
  'filter.other': 'Other',
  'filter.unclaimed': 'Unclaimed only',
  'group.daily': 'Every day',
  'group.weekly': 'Every week',
  'group.monthly': 'Every month',
  'group.other': 'Other offers',
  'group.count': '{count} offers',
  'empty.list': 'No offer matches the current filters',
  'card.goClaim': 'Claim',
  'card.stamp': 'Stamp',
  'card.claimed': 'Claimed',
  'card.claimTitle': 'Mark as claimed',
  'card.unclaimTitle': 'Undo this claim',
  'card.stampMark': 'Claimed',
  'card.moreTags': '+{count}',
  'card.expiry': '{days} days left',
  'card.noValue': 'No price',
  'card.degradedNote': 'Upstream parsing failed; only the official link is available for now',
  'card.degradedValue': 'Conversion unavailable',
  'card.verified': 'Verified {date}',
  'badge.legacy': 'Legacy',
  'album.title': 'My album',
  'album.progress': 'Collected {collected}/{total}',
  'album.levels': 'Common {common} · Fine {fine} · Rare {rare} · Epic {epic} · Legend {legend}',
  'album.empty': 'Nothing collected yet — stamp an offer in the list',
  'album.placeholder': 'Empty',
  'album.moreMissing': '{count} more empty slots not shown',
  'dock.label': 'Wool',
  'dock.reset': 'Reset {time}',
  'dock.album': 'Album {collected}/{total}',
  'dock.open': 'Open token wool radar',
  'dock.unavailable': 'Token wool radar: data unavailable',
  'footer.source': 'Source aihot.news/free-tokens (personal, non-commercial use); conversion: {mix}, token {ratio}, rate {usd}',
}

type Translate = (key: string, vars?: Record<string, string | number>) => string

function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (vars === undefined) return text
  let out = text
  for (const [name, value] of Object.entries(vars)) out = out.replaceAll(`{${name}}`, String(value))
  return out
}

/** main 面板组件：把 store 状态与本地时钟喂给 Panel。 */
function PanelEntry({ store, t }: { store: ViewStore; t: Translate }) {
  const state = useViewStore(store)
  const now = useNow()
  return (
    <Panel
      store={store}
      view={state.view}
      status={state.status}
      error={state.error}
      busy={state.busy}
      notice={state.notice}
      now={now}
      t={t}
    />
  )
}

/** dock 组件：摘要行 + 点击回面板。 */
function DockEntry({ store, onOpen, t }: { store: ViewStore; onOpen: () => void; t: Translate }) {
  const state = useViewStore(store)
  const now = useNow()
  if (state.view === null) return null
  return <StatsDock view={state.view} now={now} t={t} onOpen={onOpen} />
}

/** 侧栏入口图标。 */
function PanelIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="10" cy="10" r="4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <line x1="10" y1="10" x2="10" y2="2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="13.6" cy="6.6" r="1.5" fill="currentColor" />
    </svg>
  )
}

interface ClientContext {
  effect: (fn: () => unknown, label?: string) => unknown
  locale: {
    register: (ns: string, dicts: Record<string, Record<string, string>>) => unknown
    bind: (ns: string) => (key: string) => string
  }
  slots: {
    inject: (key: string, callback: () => unknown) => unknown
    register: (options: Record<string, unknown>, component: unknown) => unknown
  }
  layout?: { selectPanel: (panelId: string | null) => void }
}

export const inject = ['slots', 'locale', 'layout']

export function apply(ctx: ClientContext) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'token-wool-radar: dictionaries')
  const bound = ctx.locale.bind(NS)
  const t: Translate = (key, vars) => interpolate(bound(key), vars)

  const store = new ViewStore()

  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'token-wool-radar'
    tag.dataset.pluginCss = 'token-wool-radar/theme.css'
    tag.textContent = css
    document.head.appendChild(tag)
    return () => {
      tag.remove()
    }
  }, 'token-wool-radar: styles')

  ctx.slots.inject('main', () =>
    ctx.slots.register(
      {
        name: 'main',
        key: PANEL_ID,
        locale: NS,
        inject: () => ({ store }),
      },
      PanelEntry,
    ),
  )

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 5,
        label: () => t('panel.iconLabel'),
        locale: NS,
      },
      PanelIcon,
    ),
  )

  ctx.slots.inject('conversation.composer.dock', () =>
    ctx.slots.register(
      {
        name: 'conversation.composer.dock',
        id: PANEL_ID,
        order: 5,
        locale: NS,
        inject: () => ({
          store,
          onOpen: () => ctx.layout?.selectPanel(PANEL_ID),
        }),
      },
      DockEntry,
    ),
  )
}
