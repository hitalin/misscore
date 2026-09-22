import type { Id, UserInput } from './types.js'

/**
 * agatha の RateBasedLabels と同じベイズ平滑化比率。
 *   ratio = (interaction + s) / (interaction + favs + s / prior)
 * interaction は受けた通報・ブロック等の件数、favs は受けた好意的反応の件数。
 * prior は母集団全体の interaction / (interaction + favs)。
 */
export function smoothedRatio(
  interaction: number,
  favs: number,
  prior: number,
  smoothing = 0.1,
): number {
  if (prior <= 0) return 0
  return (interaction + smoothing) / (interaction + favs + smoothing / prior)
}

export interface InteractionCounts {
  interaction: number
  favs: number
}

/** 母集団から prior を求める。1 ユーザーの寄与は capPerUser で頭打ちにする (capFeatureSum 相当) */
export function computePrior(
  population: Iterable<InteractionCounts>,
  capPerUser = 1000,
): number {
  let num = 0
  let den = 0
  for (const { interaction, favs } of population) {
    const total = interaction + favs
    if (total <= 0) continue
    const scale = total > capPerUser ? capPerUser / total : 1
    num += interaction * scale
    den += total * scale
  }
  return den === 0 ? 0 : num / den
}

export interface PageRankOptions {
  /** ジャンプ確率 α */
  alpha?: number
  /** 収束判定の L1 差分 */
  tolerance?: number
  maxIterations?: number
  /** テレポート分布。省略時は全ノード一様 */
  teleport?: ReadonlyMap<Id, number>
}

/**
 * user-cred-v2 と同じ形の PageRank。edges は follower -> followee。
 * dangling (フォロー 0) の質量はテレポート分布に従って再配分する。
 */
export function pagerank(
  nodes: Iterable<Id>,
  edges: Iterable<readonly [Id, Id]>,
  options: PageRankOptions = {},
): Map<Id, number> {
  const alpha = options.alpha ?? 0.2
  const tolerance = options.tolerance ?? 0.001
  const maxIterations = options.maxIterations ?? 50
  const ids = [...new Set(nodes)]
  if (ids.length === 0) return new Map()
  const index = new Map(ids.map((id, i) => [id, i]))
  const out: number[][] = ids.map(() => [])
  for (const [from, to] of edges) {
    const f = index.get(from)
    const t = index.get(to)
    if (f === undefined || t === undefined || f === t) continue
    out[f]?.push(t)
  }
  const teleport = new Float64Array(ids.length)
  if (options.teleport === undefined) {
    teleport.fill(1 / ids.length)
  } else {
    let sum = 0
    for (const [id, w] of options.teleport) {
      const i = index.get(id)
      if (i !== undefined && w > 0) {
        teleport[i] = w
        sum += w
      }
    }
    if (sum === 0) teleport.fill(1 / ids.length)
    else
      for (let i = 0; i < teleport.length; i++)
        teleport[i] = (teleport[i] ?? 0) / sum
  }
  let mass = new Float64Array(ids.length).fill(1 / ids.length)
  for (let iter = 0; iter < maxIterations; iter++) {
    const next = new Float64Array(ids.length)
    let missing = 0
    for (let i = 0; i < ids.length; i++) {
      const targets = out[i] ?? []
      const m = mass[i] ?? 0
      if (targets.length === 0) {
        missing += m
        continue
      }
      const share = ((1 - alpha) * m) / targets.length
      for (const t of targets) next[t] = (next[t] ?? 0) + share
    }
    let diff = 0
    for (let i = 0; i < ids.length; i++) {
      const p = teleport[i] ?? 0
      const v = (next[i] ?? 0) + p * alpha + p * missing * (1 - alpha)
      next[i] = v
      diff += Math.abs(v - (mass[i] ?? 0))
    }
    mass = next
    if (diff < tolerance) break
  }
  return new Map(ids.map((id, i) => [id, mass[i] ?? 0]))
}

/** user-cred-v2 の質量→スコア変換。0..100 にクランプ */
export function massToScore(mass: number): number {
  if (mass <= 0) return 0
  const s = 165.2 + 7.07 * Math.log(mass)
  return Math.min(100, Math.max(0, s))
}

export interface CredibilityOptions {
  /** この値以上なら高信頼 (自動処置の対象外) */
  highThreshold?: number
  /** PageRank が無いときの代替: この人数を超えるフォロワーなら高信頼 */
  followerFallback?: number
}

export interface Credibility {
  score: number
  isHigh: boolean
  /** 'pagerank' | 'heuristic' */
  basis: 'pagerank' | 'heuristic'
}

/**
 * 信頼度。PageRank のスコアがあればそれを、無ければアカウント年齢・
 * フォロワー・投稿数からの発見的スコアを使う。
 */
export function credibility(
  user: UserInput,
  now: Date,
  pagerankScore: number | undefined,
  options: CredibilityOptions = {},
): Credibility {
  const highThreshold = options.highThreshold ?? 54
  const followerFallback = options.followerFallback ?? 1000
  if (pagerankScore !== undefined) {
    return {
      score: pagerankScore,
      isHigh: pagerankScore >= highThreshold,
      basis: 'pagerank',
    }
  }
  const ageDays = Math.max(
    0,
    (now.getTime() - user.createdAt.getTime()) / (24 * 60 * 60 * 1000),
  )
  // 年齢 (最大 30 点)、フォロワー (最大 40 点)、投稿数 (最大 30 点) の対数加点
  const age = Math.min(30, 10 * Math.log10(1 + ageDays))
  const followers = Math.min(40, 13 * Math.log10(1 + user.followersCount))
  const notes = Math.min(30, 8 * Math.log10(1 + user.notesCount))
  const score = Math.round(age + followers + notes)
  return {
    score,
    isHigh: user.followersCount > followerFallback || score >= highThreshold,
    basis: 'heuristic',
  }
}
