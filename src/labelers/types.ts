import type { LabelEmission, NoteLabel, UserLabel } from '../labels.js'
import type { Id, NoteInput, UserInput } from '../types.js'

export interface LabelerConfig {
  /** meta.prohibitedWords */
  prohibitedWords: string[]
  /** meta.sensitiveWords */
  sensitiveWords: string[]
  /** 悪性と判定するドメイン (サフィックス一致) */
  maliciousDomains: string[]
  /** ロールポリシー mentionLimit */
  mentionLimit: number
  /** 「新規アカウント」とみなす作成からの経過時間 */
  newAccountMs: number
  /** 連投判定: windowMs 内に maxNotesPerWindow 件を超えたら spam_high_recall */
  velocityWindowMs: number
  maxNotesPerWindow: number
  /** コピペ判定: 履歴中に同一本文が minDuplicates 件以上 */
  copypastaMinDuplicates: number
  /** nsfw_high_precision とみなす maybePorn 相当の扱い。false なら high_recall 止まり */
  trustMaybePorn: boolean
}

export const DEFAULT_LABELER_CONFIG: LabelerConfig = {
  prohibitedWords: [],
  sensitiveWords: [],
  maliciousDomains: [],
  mentionLimit: 20,
  newAccountMs: 7 * 24 * 60 * 60 * 1000,
  velocityWindowMs: 60 * 1000,
  maxNotesPerWindow: 10,
  copypastaMinDuplicates: 3,
  trustMaybePorn: true,
}

export interface LabelContext {
  note: NoteInput
  author: UserInput
  now: Date
  config: LabelerConfig
  /** 作者の直近ノート (新しい順)。当該ノート自身は含めない */
  history: readonly NoteInput[]
  /** 作者がフォローしているユーザー id。不明なら undefined */
  authorFollowing?: ReadonlySet<Id>
}

export type NoteEmission = LabelEmission<NoteLabel> & { reason: string }
export type UserEmission = LabelEmission<UserLabel> & { reason: string }

export interface LabelerOutput {
  note: NoteEmission[]
  user: UserEmission[]
}

export interface Labeler {
  id: string
  run(ctx: LabelContext): LabelerOutput
}

export const EMPTY_OUTPUT: LabelerOutput = { note: [], user: [] }
