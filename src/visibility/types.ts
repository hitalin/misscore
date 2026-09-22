import type { NoteLabel, UserLabel } from '../labels.js'
import type {
  NoteInput,
  Relationship,
  UserInput,
  ViewerInput,
} from '../types.js'

/** ルールが誰に適用されるか (x-algorithm の Audience) */
export type Audience = 'everyone' | 'exceptAuthor' | 'exceptAuthorAndFollowers'

export type DropReason =
  | 'author_suspended'
  | 'author_silenced'
  | 'not_visible_to_viewer'
  | 'viewer_blocks_author'
  | 'author_blocks_viewer'
  | 'viewer_mutes_author'
  | 'viewer_mutes_renotes'
  | 'viewer_mutes_instance'
  | 'hard_word_mute'
  | 'spam'
  | 'prohibited_word'
  | 'emergency'
  | 'legal_takedown'
  | 'nsfw_for_viewer'
  | 'possibly_undesirable'
  | 'ancillary_dropped'
  | 'unresolved'

export type InterstitialReason =
  | 'nsfw'
  | 'gore'
  | 'word_mute'
  | 'sensitive_word'

export type Action =
  | { kind: 'drop'; reason: DropReason }
  | { kind: 'interstitial'; reason: InterstitialReason }

export interface VisibilityContext {
  note: NoteInput
  author: UserInput
  viewer: ViewerInput
  relationship: Relationship
  noteLabels: ReadonlySet<NoteLabel>
  authorLabels: ReadonlySet<UserLabel>
  /** 返信元・引用元・リノート元のいずれかが drop されたか */
  ancillaryDropped?: boolean
}

export type Predicate = (ctx: VisibilityContext) => boolean

export interface RuleClause {
  name: string
  /** すべて真のとき適用 (AND) */
  when: readonly Predicate[]
  appliesTo: Audience
  action: Action
}

export interface Policy {
  name: string
  rules: readonly RuleClause[]
}

export type Verdict =
  | { action: 'allow' }
  | { action: 'drop'; reason: DropReason; rule: string }
  | { action: 'interstitial'; reason: InterstitialReason; rule: string }
