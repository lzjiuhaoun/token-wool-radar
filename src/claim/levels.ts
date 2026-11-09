/** 等级表（F4）：按首次领取当时的折算价值定级，已得不升不降。 */

export type WoolLevelId = 'common' | 'fine' | 'rare' | 'epic' | 'legend'

export interface WoolLevel {
  id: WoolLevelId
  /** 排序用（越大越高） */
  rank: number
  labelZh: string
  labelEn: string
  /** 闪卡描边 */
  shiny: boolean
}

const LEVELS: WoolLevel[] = [
  { id: 'common', rank: 0, labelZh: '普通', labelEn: 'Common', shiny: false },
  { id: 'fine', rank: 1, labelZh: '精良', labelEn: 'Fine', shiny: false },
  { id: 'rare', rank: 2, labelZh: '稀有', labelEn: 'Rare', shiny: false },
  { id: 'epic', rank: 3, labelZh: '史诗', labelEn: 'Epic', shiny: true },
  { id: 'legend', rank: 4, labelZh: '传说', labelEn: 'Legend', shiny: true },
]

/** 按领取当时价值定级；null（不折钱）按普通。 */
export function levelOfAmount(amountCny: number | null): WoolLevel {
  if (amountCny === null || amountCny < 10) return LEVELS[0]
  if (amountCny < 50) return LEVELS[1]
  if (amountCny < 200) return LEVELS[2]
  if (amountCny < 500) return LEVELS[3]
  return LEVELS[4]
}

export function levelRank(id: WoolLevelId): number {
  return LEVELS.find((level) => level.id === id)?.rank ?? 0
}

export { LEVELS }
