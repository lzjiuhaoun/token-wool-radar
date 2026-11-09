/** 卡册视图：已收集排序 + 虚线占位 + 进度。 */

import React from 'react'
import type { RadarView } from './types.ts'

export interface AlbumProps {
  view: RadarView
  t: (key: string, vars?: Record<string, string | number>) => string
}

const MAX_PLACEHOLDERS = 24

export function Album({ view, t }: AlbumProps) {
  const { album, stats } = view
  const collected = album.length
  const total = Math.max(stats.totalCount, collected)
  const missing = Math.max(0, total - collected)
  const placeholders = Math.min(missing, MAX_PLACEHOLDERS)
  const levels = { common: 0, fine: 0, rare: 0, epic: 0, legend: 0 }
  for (const entry of album) levels[entry.level?.id ?? 'common'] += 1

  return (
    <section>
      <div className="twr-album-head">
        <strong>{t('album.title')}</strong>
        <span className="twr-album-progress">{t('album.progress', { collected, total })}</span>
        <span className="twr-album-progress">
          {t('album.levels', { common: levels.common, fine: levels.fine, rare: levels.rare, epic: levels.epic, legend: levels.legend })}
        </span>
      </div>
      {collected === 0 ? <p className="twr-empty">{t('album.empty')}</p> : null}
      <div className="twr-album-grid">
        {album.map((entry) => (
          <div className={`twr-album-card${entry.level?.shiny === true ? ' twr-shiny' : ''}`} key={entry.offerId}>
            <span className="twr-album-face">{entry.face}</span>
            <span className="twr-album-provider">{entry.provider}</span>
            <span className="twr-album-level">
              {entry.level?.labelZh ?? ''}{entry.legacy ? ` · ${t('badge.legacy')}` : ''}
            </span>
          </div>
        ))}
        {Array.from({ length: placeholders }, (_, index) => (
          <div className="twr-album-empty" key={`empty-${index}`}>
            {t('album.placeholder')}
          </div>
        ))}
      </div>
      {missing > placeholders ? (
        <p className="twr-empty">{t('album.moreMissing', { count: missing - placeholders })}</p>
      ) : null}
    </section>
  )
}
