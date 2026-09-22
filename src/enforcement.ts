import type { Credibility } from './credibility.js'
import type { NoteLabel, UserLabel } from './labels.js'
import { DAY_MS } from './labels.js'
import type { Id, UserInput } from './types.js'

/** Misskey で実行できる処置 */
export type EnforcementAction =
  | { kind: 'labelUser'; label: UserLabel; ttlMs: number | null }
  | { kind: 'labelNote'; noteId: Id; label: NoteLabel; ttlMs: number | null }
  /** canPublicNote=false のロールを付与する */
  | { kind: 'silence'; ttlMs: number | null }
  | { kind: 'suspend' }
  | { kind: 'deleteNote'; noteId: Id }
  | { kind: 'markSensitive'; fileIds: Id[] }
  /** 人手レビューへ回す (admin/update-user-note や通知に使う) */
  | { kind: 'requireReview'; reason: string }

/** dedup 用の処置クラス。大きいほど重い。同クラス以下の再処置は重複とみなす */
export function actionClass(action: EnforcementAction): number {
  switch (action.kind) {
    case 'labelUser':
    case 'labelNote':
    case 'markSensitive':
      return 1
    case 'requireReview':
      return 2
    case 'silence':
    case 'deleteNote':
      return 3
    case 'suspend':
      return 4
  }
}

export interface EnforcementContext {
  user: UserInput
  userLabels: ReadonlySet<UserLabel>
  /** 対象ノート (あれば) とそのラベル */
  note?: { id: Id; labels: ReadonlySet<NoteLabel>; fileIds: Id[] }
  credibility: Credibility
  /** 未解決の通報数と通報者のユニーク数 */
  reports?: { open: number; distinctReporters: number }
  now: Date
}

export type Outcome =
  | { kind: 'skip'; reason: string }
  | { kind: 'act'; actions: EnforcementAction[] }

export interface EnforcementRule {
  id: string
  when: (ctx: EnforcementContext) => boolean
  outcome: Outcome | ((ctx: EnforcementContext) => Outcome)
}

export interface Decision {
  ruleId: string
  outcome: Outcome
}

/** 上から順に評価し、最初に一致したルールで決める。末尾に必ず既定ルールを置く */
export function decide(
  rules: readonly EnforcementRule[],
  ctx: EnforcementContext,
): Decision {
  for (const rule of rules) {
    if (!rule.when(ctx)) continue
    const outcome =
      typeof rule.outcome === 'function' ? rule.outcome(ctx) : rule.outcome
    return { ruleId: rule.id, outcome }
  }
  throw new Error('no enforcement rule matched; add a default rule')
}

const has =
  (...labels: UserLabel[]) =>
  (ctx: EnforcementContext) =>
    labels.some((l) => ctx.userLabels.has(l))
const noteHas =
  (...labels: NoteLabel[]) =>
  (ctx: EnforcementContext) =>
    ctx.note !== undefined && labels.some((l) => ctx.note?.labels.has(l))

/**
 * 既定のルール。abuse-enforcement-service の enforcement_user.yaml の順序を写している。
 * allowlist → 高信頼はレビュー → 凍結済み → ラベル別 → 既定 skip
 */
export const DEFAULT_ENFORCEMENT_RULES: readonly EnforcementRule[] = [
  {
    id: 'allowlisted',
    when: has('allowlisted'),
    outcome: { kind: 'skip', reason: 'user is allowlisted' },
  },
  {
    id: 'already_suspended',
    when: (c) => c.user.isSuspended,
    outcome: { kind: 'skip', reason: 'already suspended' },
  },
  {
    id: 'high_credibility_review',
    when: (c) =>
      c.credibility.isHigh &&
      (has(
        'spam_high_recall',
        'abusive_high_recall',
        'compromised',
        'nsfw_high_precision',
      )(c) ||
        noteHas('spam', 'prohibited_word', 'malicious_url')(c)),
    outcome: {
      kind: 'act',
      actions: [
        { kind: 'requireReview', reason: 'high credibility user flagged' },
      ],
    },
  },
  {
    id: 'compromised_suspend',
    when: has('compromised'),
    outcome: { kind: 'act', actions: [{ kind: 'suspend' }] },
  },
  {
    id: 'prohibited_word_delete',
    when: noteHas('prohibited_word'),
    outcome: (c) => ({
      kind: 'act',
      actions: [
        { kind: 'deleteNote', noteId: c.note?.id ?? '' },
        { kind: 'labelUser', label: 'spam_high_recall', ttlMs: 7 * DAY_MS },
      ],
    }),
  },
  {
    id: 'spam_note_delete',
    when: (c) => noteHas('spam', 'malicious_url')(c),
    outcome: (c) => ({
      kind: 'act',
      actions: [
        { kind: 'deleteNote', noteId: c.note?.id ?? '' },
        { kind: 'labelUser', label: 'spam_high_recall', ttlMs: 30 * DAY_MS },
      ],
    }),
  },
  {
    id: 'spam_user_silence',
    when: (c) => has('spam_high_recall')(c) && !c.user.isSilenced,
    outcome: { kind: 'act', actions: [{ kind: 'silence', ttlMs: 7 * DAY_MS }] },
  },
  {
    id: 'abusive_review',
    when: has('abusive_high_recall'),
    outcome: {
      kind: 'act',
      actions: [{ kind: 'requireReview', reason: 'abusive_high_recall' }],
    },
  },
  {
    id: 'nsfw_note_mark_sensitive',
    when: (c) =>
      noteHas('nsfw_high_precision')(c) && (c.note?.fileIds.length ?? 0) > 0,
    outcome: (c) => ({
      kind: 'act',
      actions: [{ kind: 'markSensitive', fileIds: c.note?.fileIds ?? [] }],
    }),
  },
  {
    id: 'reported_by_many_review',
    when: (c) => (c.reports?.distinctReporters ?? 0) >= 3,
    outcome: (c) => ({
      kind: 'act',
      actions: [
        {
          kind: 'requireReview',
          reason: `${c.reports?.distinctReporters ?? 0} distinct reporters`,
        },
      ],
    }),
  },
  {
    id: 'default',
    when: () => true,
    outcome: { kind: 'skip', reason: 'no rule matched' },
  },
]

export interface EnforcerOptions {
  rules?: readonly EnforcementRule[]
  /** 24 時間あたりの処置上限 (0 なら無制限) */
  maxEnforcementsPerDay?: number
  /** dedup の保持時間 */
  dedupTtlMs?: number
  /** 実行せず決定だけ返す */
  dryRun?: boolean
}

export interface EnforcerResult {
  decision: Decision
  /** dedup / 上限で削られた後、実際に実行すべき処置 */
  actions: EnforcementAction[]
  skippedBy?: 'dedup' | 'daily_cap'
}

/**
 * abuse-enforcement-service の process 相当。
 * 決定 → dedup (同クラス以下は重複) → 日次上限 → 実行対象を返す。
 * 状態はメモリ上に持つ。永続化したければ dedup / window を外に出す。
 */
export class Enforcer {
  private readonly rules: readonly EnforcementRule[]
  private readonly maxPerDay: number
  private readonly dedupTtlMs: number
  private readonly dedup = new Map<Id, { klass: number; expiresAt: number }>()
  private readonly window: number[] = []

  constructor(options: EnforcerOptions = {}) {
    this.rules = options.rules ?? DEFAULT_ENFORCEMENT_RULES
    this.maxPerDay = options.maxEnforcementsPerDay ?? 0
    this.dedupTtlMs = options.dedupTtlMs ?? DAY_MS
  }

  run(ctx: EnforcementContext): EnforcerResult {
    const decision = decide(this.rules, ctx)
    if (decision.outcome.kind === 'skip') return { decision, actions: [] }
    const nowMs = ctx.now.getTime()
    const klass = Math.max(...decision.outcome.actions.map(actionClass))
    const prev = this.dedup.get(ctx.user.id)
    if (prev !== undefined && prev.expiresAt > nowMs && klass <= prev.klass) {
      return { decision, actions: [], skippedBy: 'dedup' }
    }
    this.pruneWindow(nowMs)
    if (this.maxPerDay > 0 && this.window.length >= this.maxPerDay) {
      return { decision, actions: [], skippedBy: 'daily_cap' }
    }
    this.dedup.set(ctx.user.id, { klass, expiresAt: nowMs + this.dedupTtlMs })
    this.window.push(nowMs)
    return { decision, actions: decision.outcome.actions }
  }

  private pruneWindow(nowMs: number): void {
    const cutoff = nowMs - DAY_MS
    while (this.window.length > 0 && (this.window[0] ?? 0) < cutoff)
      this.window.shift()
  }
}
