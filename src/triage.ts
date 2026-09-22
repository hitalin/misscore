import type { Credibility } from './credibility.js'
import { isKeyWordIncluded } from './keywords.js'
import type { NoteLabel, UserLabel } from './labels.js'
import type { Id } from './types.js'

/** admin/abuse-user-reports の 1 件 */
export interface ReportInput {
  id: Id
  createdAt: Date
  comment: string
  reporterId: Id
  reporterHost: string | null
  targetUserId: Id
  targetUserHost: string | null
  resolved: boolean
  forwarded: boolean
}

export interface ReporterProfile {
  credibility: Credibility
  isSuspended: boolean
  /** 過去の通報が accept / reject された件数 */
  priorAccepted: number
  priorRejected: number
}

export interface TargetProfile {
  isSuspended: boolean
  isSilenced: boolean
  credibility: Credibility
  labels: ReadonlySet<UserLabel>
  /** 対象の最近のノートに付いたラベル (集合) */
  recentNoteLabels: ReadonlySet<NoteLabel>
  /** agatha 相当: 受けた通報 / (通報 + 好意的反応) の平滑化比率 (0..1)。不明なら undefined */
  reportsPerFav?: number
  /** 同じ対象への未解決通報の数と、通報者のユニーク数 */
  openReports: number
  distinctReporters: number
}

export interface TriageInput {
  report: ReportInput
  reporter: ReporterProfile
  target: TargetProfile
  /** コメント中で重み付けするキーワード (meta.prohibitedWords など) */
  urgentKeywords?: string[]
  now: Date
}

export type Recommendation = 'accept' | 'reject' | 'review'

export interface TriageResult {
  /** 0..100。高いほど先に見る */
  priority: number
  recommendation: Recommendation
  /** 判定に効いた要因 (加点順) */
  reasons: string[]
}

/** 通報者の過去実績をベイズ平滑化した信頼度 (0..1)。実績なしは 0.5 */
export function reporterReliability(
  p: ReporterProfile,
  prior = 0.5,
  s = 2,
): number {
  return (p.priorAccepted + prior * s) / (p.priorAccepted + p.priorRejected + s)
}

const SPAM_LABELS: readonly NoteLabel[] = [
  'spam',
  'spam_high_recall',
  'copypasta_spam',
  'mention_spam',
  'malicious_url',
  'prohibited_word',
]

/**
 * 通報のトリアージ。Misskey の通報には category が無いので、
 * 通報者の実績・対象の信号・件数・コメントから優先度と推奨処理を出す。
 */
export function triage(input: TriageInput): TriageResult {
  const { report, reporter, target } = input
  const reasons: string[] = []
  let score = 0

  if (target.isSuspended) {
    return {
      priority: 0,
      recommendation: 'reject',
      reasons: ['target already suspended'],
    }
  }
  if (reporter.isSuspended) {
    return {
      priority: 5,
      recommendation: 'reject',
      reasons: ['reporter is suspended'],
    }
  }

  const reliability = reporterReliability(reporter)
  score += Math.round(reliability * 20)
  reasons.push(`reporter reliability ${reliability.toFixed(2)}`)
  if (reporter.credibility.isHigh) {
    score += 10
    reasons.push('reporter has high credibility')
  }

  const distinct = Math.max(1, target.distinctReporters)
  const crowd = Math.min(25, Math.round(12 * Math.log2(distinct)))
  if (crowd > 0) {
    score += crowd
    reasons.push(`${distinct} distinct reporters`)
  }

  if (
    target.labels.has('spam_high_recall') ||
    target.labels.has('compromised')
  ) {
    score += 20
    reasons.push('target has spam/compromised label')
  }
  if (target.labels.has('abusive_high_recall')) {
    score += 15
    reasons.push('target has abusive label')
  }
  const spamNotes = SPAM_LABELS.filter((l) => target.recentNoteLabels.has(l))
  if (spamNotes.length > 0) {
    score += 15
    reasons.push(`recent notes labeled ${spamNotes.join(',')}`)
  }
  if (target.reportsPerFav !== undefined && target.reportsPerFav >= 0.5) {
    score += 15
    reasons.push(`reports/fav ratio ${target.reportsPerFav.toFixed(2)}`)
  }
  if (
    input.urgentKeywords !== undefined &&
    isKeyWordIncluded(report.comment, input.urgentKeywords)
  ) {
    score += 15
    reasons.push('comment matches urgent keywords')
  }
  if (report.reporterHost !== null && report.targetUserHost !== null) {
    score -= 10
    reasons.push('remote-to-remote report')
  }
  if (target.credibility.isHigh) {
    score -= 15
    reasons.push('target has high credibility')
  }

  const priority = Math.max(0, Math.min(100, score))
  let recommendation: Recommendation = 'review'
  if (target.credibility.isHigh) {
    recommendation = 'review'
  } else if (priority >= 60) {
    recommendation = 'accept'
  } else if (priority < 15 && reliability < 0.3) {
    recommendation = 'reject'
  }
  return { priority, recommendation, reasons }
}
