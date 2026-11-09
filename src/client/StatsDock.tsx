/** composer dock 摘要行：羊毛 ¥201 · 刷新 13:14，点击打开面板。 */

import React from 'react'
import type { RadarView } from './types.ts'
import { formatCountdown } from '../offers/convert.ts'

export interface StatsDockProps {
  view: RadarView
  now: number
  t: (key: string, vars?: Record<string, string | number>) => string
  onOpen: () => void
}

export function StatsDock({ view, now, t, onOpen }: StatsDockProps) {
  const { stats, snapshot } = view
  if (snapshot.origin === 'error') {
    return (
      <button type="button" className="twr-dock" onClick={onOpen}>
        <RadarGlyph />
        <span>{t('dock.unavailable')}</span>
      </button>
    )
  }
  const amount = stats.claimableCny % 1 === 0 ? String(stats.claimableCny) : stats.claimableCny.toFixed(2)
  const countdown = stats.nextResetAt === null ? null : formatCountdown(stats.nextResetAt, now)
  return (
    <button type="button" className="twr-dock" onClick={onOpen} title={t('dock.open')}>
      <RadarGlyph />
      <span>{t('dock.label')}</span>
      <span className="twr-dock-value">¥{amount}</span>
      {countdown === null ? null : <span>· {t('dock.reset', { time: countdown })}</span>}
      <span>· {t('dock.album', { collected: stats.collectedCount, total: stats.totalCount })}</span>
    </button>
  )
}

function RadarGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="8" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <line x1="8" y1="8" x2="8" y2="2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
