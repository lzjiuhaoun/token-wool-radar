/** 整页面板：标题栏 / 统计条 / 筛选条 / 分组网格，外加卡册视图。 */

import React, { useState } from 'react'
import { Card } from './Card.tsx'
import { Album } from './Album.tsx'
import type { Offer, RadarView } from './types.ts'
import { formatCountdown } from '../offers/convert.ts'
import type { ViewStore } from './store.ts'

export interface PanelProps {
  store: ViewStore
  view: RadarView | null
  status: 'loading' | 'ready' | 'error'
  error: string | null
  busy: string | null
  notice: { kind: 'ok' | 'error'; text: string } | null
  now: number
  t: (key: string, vars?: Record<string, string | number>) => string
}

const EMPTY_VIEW: RadarView = {
  snapshot: {
    fetchedAt: '',
    origin: 'error',
    serverNow: 0,
    nextRefreshAt: null,
    basis: { mix: '', ratio: '', usdCny: 0 },
    offers: [],
    ended: [],
    stats: { claimableCny: 0, liveCount: 0, endedCount: 0 },
    degraded: false,
    parseFailures: 0,
    parseTotal: 0,
  },
  claims: {},
  album: [],
  stats: { claimableCny: 0, claimedCnyThisPeriod: 0, collectedCount: 0, totalCount: 0, endedCount: 0, nextResetAt: null, nextRefreshAt: null },
}

type CadenceFilter = 'all' | 'daily' | 'weekly' | 'monthly' | 'other'
type PanelView = 'list' | 'album'

const GROUP_ORDER: Array<{ id: 'daily' | 'weekly' | 'monthly' | 'other'; titleKey: string }> = [
  { id: 'daily', titleKey: 'group.daily' },
  { id: 'weekly', titleKey: 'group.weekly' },
  { id: 'monthly', titleKey: 'group.monthly' },
  { id: 'other', titleKey: 'group.other' },
]

function groupOf(offer: Offer): 'daily' | 'weekly' | 'monthly' | 'other' {
  if (offer.kind === 'daily') return 'daily'
  if (offer.kind === 'weekly') return 'weekly'
  if (offer.kind === 'monthly') return 'monthly'
  return 'other'
}

function cny(value: number | null): string {
  if (value === null) return '—'
  return value % 1 === 0 ? `¥${value}` : `¥${value.toFixed(2)}`
}

export function Panel({ store, view, status, error, busy, notice, now, t }: PanelProps) {
  const [panelView, setPanelView] = useState<PanelView>('list')
  const [keyword, setKeyword] = useState('')
  const [cadence, setCadence] = useState<CadenceFilter>('all')
  const [onlyUnclaimed, setOnlyUnclaimed] = useState(false)

  const { snapshot, claims, album, stats } = view ?? EMPTY_VIEW
  const countdownTarget = stats.nextResetAt

  const filtered = snapshot.offers.filter((offer) => {
    if (cadence !== 'all') {
      const group = groupOf(offer)
      if (cadence === 'other' ? group !== 'other' : group !== cadence) return false
    }
    if (onlyUnclaimed && claims[offer.id]?.claimedThisPeriod === true) return false
    if (keyword.trim() !== '') {
      const needle = keyword.trim().toLowerCase()
      const haystack = `${offer.title} ${offer.provider} ${offer.tags.join(' ')}`.toLowerCase()
      if (!haystack.includes(needle)) return false
    }
    return true
  })

  const groups = GROUP_ORDER.map((group) => ({
    ...group,
    offers: filtered.filter((offer) => groupOf(offer) === group.id),
  })).filter((group) => group.offers.length > 0)

  return (
    <div className="twr-page">
      <header className="twr-titlebar">
        <div className="twr-title">
          <h1>{t('panel.title')}</h1>
          <p>{t('panel.subtitle')}</p>
        </div>
        <div className="twr-actions">
          <div className="twr-segmented" role="group" aria-label={t('view.switch')}>
            <button type="button" aria-pressed={panelView === 'list'} onClick={() => setPanelView('list')}>{t('view.list')}</button>
            <button type="button" aria-pressed={panelView === 'album'} onClick={() => setPanelView('album')}>{t('view.album')}</button>
          </div>
          <button type="button" className="twr-button" disabled={status === 'loading'} onClick={() => void store.load(true)}>
            <RefreshIcon />
            {t('action.refresh')}
          </button>
        </div>
      </header>

      {view !== null ? (
        <section className="twr-stats" aria-label={t('stats.title')}>
          <div className="twr-stat">
            <div className="twr-stat-label">{t('stats.claimable')}</div>
            <div className="twr-stat-value">{cny(stats.claimableCny)}</div>
            <div className="twr-stat-hint">{t('stats.claimableHint')}</div>
          </div>
          <div className="twr-stat">
            <div className="twr-stat-label">{t('stats.reset')}</div>
            <div className="twr-stat-value">{countdownTarget === null ? '—' : formatCountdown(countdownTarget, now)}</div>
            <div className="twr-stat-hint">{t('stats.resetHint')}</div>
          </div>
          <div className="twr-stat">
            <div className="twr-stat-label">{t('stats.album')}</div>
            <div className="twr-stat-value">{stats.collectedCount}/{stats.totalCount}</div>
            <div className="twr-stat-hint">{t('stats.albumHint', { ended: stats.endedCount })}</div>
          </div>
        </section>
      ) : null}

      {snapshot.origin === 'error' ? (
        <div className="twr-banner twr-error">{t('banner.error', { message: snapshot.error ?? error ?? '' })}</div>
      ) : null}
      {snapshot.origin !== 'error' && snapshot.degraded ? (
        <div className="twr-banner">{t('banner.degraded', { failed: snapshot.parseFailures, total: snapshot.parseTotal })}</div>
      ) : null}
      {snapshot.origin === 'cache' && error !== null ? (
        <div className="twr-banner">{t('banner.stale', { message: error })}</div>
      ) : null}
      {notice !== null ? (
        <div className={`twr-banner${notice.kind === 'error' ? ' twr-error' : ''}`}>{notice.text}</div>
      ) : null}

      {status === 'loading' ? (
        <div className="twr-skeleton" aria-hidden="true">
          <div /><div /><div /><div />
        </div>
      ) : panelView === 'album' ? (
        <Album view={view} t={t} />
      ) : (
        <>
          <section className="twr-filters">
            <label className="twr-search">
              <SearchIcon />
              <input
                type="search"
                value={keyword}
                placeholder={t('filter.search')}
                onChange={(event) => setKeyword(event.target.value)}
              />
            </label>
            <div className="twr-filters" style={{ marginTop: 0, gap: 6 }}>
              {(['all', 'daily', 'weekly', 'monthly', 'other'] as CadenceFilter[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  className="twr-chip"
                  aria-pressed={cadence === id}
                  onClick={() => setCadence(id)}
                >
                  {t(`filter.${id}`)}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="twr-switch"
              role="switch"
              aria-checked={onlyUnclaimed}
              onClick={() => setOnlyUnclaimed((value) => !value)}
            >
              <span className="twr-switch-track" />
              {t('filter.unclaimed')}
            </button>
          </section>

          {groups.length === 0 ? (
            <p className="twr-empty">{t('empty.list')}</p>
          ) : (
            groups.map((group) => (
              <section className="twr-group" key={group.id}>
                <h3 className="twr-group-title">
                  {t(group.titleKey)}
                  <span>{t('group.count', { count: group.offers.length })}</span>
                </h3>
                <div className="twr-grid">
                  {group.offers.map((offer) => (
                    <Card
                      key={offer.id}
                      offer={offer}
                      claim={claims[offer.id]}
                      now={now}
                      busy={busy === offer.id}
                      degraded={snapshot.degraded}
                      t={t}
                      onClaim={(offerId) => void store.claim(offerId)}
                      onUnclaim={(offerId) => void store.unclaim(offerId)}
                      onOpen={(url) => window.open(url, '_blank', 'noopener,noreferrer')}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </>
      )}

      <footer className="twr-empty" style={{ marginTop: 28 }}>
        {t('footer.source', { mix: snapshot.basis.mix, ratio: snapshot.basis.ratio, usd: snapshot.basis.usdCny })}
      </footer>
    </div>
  )
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
      <path d="M13.7 2.6v2.6h-2.6" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="7" cy="7" r="4.5" />
      <line x1="10.5" y1="10.5" x2="14" y2="14" />
    </svg>
  )
}
