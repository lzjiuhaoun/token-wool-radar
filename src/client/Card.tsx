/** 单张羊毛卡片：artwork + 条件标签 + 去领 + 盖章/撤销。 */

import React from 'react'
import type { ClaimState, Offer } from './types.ts'
import { formatVerifiedAt, remainingDays } from '../offers/convert.ts'

export interface CardProps {
  offer: Offer
  claim?: ClaimState
  now: number
  busy: boolean
  /** 解析失败率超限：只保留原链接与提示，不展示折算信息 */
  degraded: boolean
  t: (key: string, vars?: Record<string, string | number>) => string
  onClaim: (offerId: string) => void
  onUnclaim: (offerId: string) => void
  onOpen: (url: string) => void
}

const MAX_TAGS = 6

function iconUrl(icon: string | undefined): string | null {
  if (icon === undefined || icon === '') return null
  if (icon.startsWith('http')) return icon
  return `https://aihot.news${icon}`
}

export function Card({ offer, claim, now, busy, degraded, t, onClaim, onUnclaim, onOpen }: CardProps) {
  const claimed = claim?.claimedThisPeriod === true
  const shiny = claim?.level?.shiny === true
  const days = remainingDays(offer.endsAt, now)
  const tags = offer.tags.slice(0, MAX_TAGS)
  const extraTags = offer.tags.length - tags.length
  const verified = formatVerifiedAt(offer.verifiedAt)

  return (
    <article className={`twr-card${claimed ? ' twr-claimed' : ''}${shiny ? ' twr-shiny' : ''}`} data-offer-id={offer.id}>
      <div className="twr-card-art">
        {degraded ? null : <span className="twr-card-face">{offer.face}</span>}
        {claim?.legacy === true ? <span className="twr-legacy">{t('badge.legacy')}</span> : null}
        <span className="twr-card-icon">
          {iconUrl(offer.icon) === null ? <RadarDot /> : <img src={iconUrl(offer.icon) ?? ''} alt="" loading="lazy" />}
        </span>
      </div>
      <div className="twr-card-body">
        <span className="twr-card-provider">{offer.provider}</span>
        <h4 className="twr-card-title">{offer.title}</h4>
        {degraded ? (
          <span className="twr-card-note">{t('card.degradedNote')}</span>
        ) : (
          <>
            <span className="twr-card-note">{offer.note}</span>
            {offer.tags.length > 0 ? (
              <div className="twr-card-tags">
                {tags.map((tag) => (
                  <span className="twr-tag" key={tag}>{tag}</span>
                ))}
                {extraTags > 0 ? <span className="twr-tag">{t('card.moreTags', { count: extraTags })}</span> : null}
              </div>
            ) : null}
            {days !== null ? <span className="twr-expiry">{t('card.expiry', { days })}</span> : null}
          </>
        )}
        <div className="twr-card-foot">
          {degraded ? (
            <span className="twr-card-note">{t('card.degradedValue')}</span>
          ) : (
            <span className="twr-card-yuan">{offer.yuan === null ? t('card.noValue') : `¥${offer.yuan % 1 === 0 ? offer.yuan : offer.yuan.toFixed(2)}`}</span>
          )}
          <div className="twr-card-buttons">
            <button type="button" className="twr-mini" onClick={() => onOpen(offer.url)}>{t('card.goClaim')}</button>
            {claimed ? (
              <button
                type="button"
                className="twr-mini"
                disabled={busy}
                title={t('card.unclaimTitle')}
                onClick={() => onUnclaim(offer.id)}
              >
                {t('card.claimed')}
              </button>
            ) : (
              <button
                type="button"
                className="twr-mini twr-primary"
                disabled={busy}
                title={t('card.claimTitle')}
                onClick={() => onClaim(offer.id)}
              >
                {t('card.stamp')}
              </button>
            )}
          </div>
        </div>
        {verified !== null ? <span className="twr-card-verified">{t('card.verified', { date: verified })}</span> : null}
      </div>
      {claimed ? (
        <button
          type="button"
          className="twr-stamp"
          title={t('card.unclaimTitle')}
          aria-label={t('card.unclaimTitle')}
          disabled={busy}
          onClick={() => onUnclaim(offer.id)}
        >
          {t('card.stampMark')}
        </button>
      ) : null}
    </article>
  )
}

function RadarDot() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
      <circle cx="10" cy="10" r="8" fill="none" stroke="#2f7fbf" strokeWidth="1.5" />
      <circle cx="10" cy="10" r="3.5" fill="none" stroke="#2f7fbf" strokeWidth="1.5" />
      <line x1="10" y1="10" x2="10" y2="2.5" stroke="#b98a1e" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
