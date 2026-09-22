/** Misskey entity id (aid / aidx など、API から得た文字列をそのまま使う) */
export type Id = string

export type NoteVisibility = 'public' | 'home' | 'followers' | 'specified'

export interface FileInput {
  id: Id
  /** MIME type */
  type: string
  isSensitive: boolean
  /** admin/drive/show-file でのみ取得できる推定値 */
  maybeSensitive?: boolean
  maybePorn?: boolean
  md5?: string
}

export interface NoteInput {
  id: Id
  createdAt: Date
  userId: Id
  /** 作者の host。ローカルなら null */
  userHost: string | null
  text: string | null
  cw: string | null
  visibility: NoteVisibility
  localOnly: boolean
  replyId: Id | null
  renoteId: Id | null
  /** メンション先ユーザー id */
  mentions: Id[]
  visibleUserIds: Id[]
  tags: string[]
  files: FileInput[]
  reactions: Record<string, number>
  renoteCount: number
  repliesCount: number
  pollChoices: string[]
}

export interface UserInput {
  id: Id
  createdAt: Date
  host: string | null
  username: string
  name: string | null
  description: string | null
  isSuspended: boolean
  /** ロールポリシー canPublicNote=false 相当 */
  isSilenced: boolean
  isLocked: boolean
  isBot: boolean
  followersCount: number
  followingCount: number
  notesCount: number
  lastActiveDate: Date | null
  roleIds: Id[]
}

/** 閲覧者。id が null ならログアウト状態 */
export interface ViewerInput {
  id: Id | null
  /** クライアント設定 nsfw: 'ignore' 相当。センシティブメディアをそのまま表示するか */
  showsSensitiveMedia: boolean
  /** 未成年、または年齢未申告として扱うか */
  isMinor: boolean
  /** user_profile.mutedWords 相当 */
  mutedWords: KeywordFilter[]
  /** user_profile.hardMutedWords 相当 */
  hardMutedWords: KeywordFilter[]
  /** user_profile.mutedInstances 相当 */
  mutedInstances: string[]
}

/**
 * Misskey のワードミュート形式。
 * 配列は AND 条件、文字列は "/pattern/flags" の正規表現。
 */
export type KeywordFilter = string[] | string

/** 閲覧者と作者の関係。ログアウト時はすべて false */
export interface Relationship {
  viewerIsAuthor: boolean
  viewerFollowsAuthor: boolean
  authorFollowsViewer: boolean
  viewerBlocksAuthor: boolean
  authorBlocksViewer: boolean
  viewerMutesAuthor: boolean
  viewerMutesRenotesFromAuthor: boolean
}

export const NO_RELATIONSHIP: Relationship = {
  viewerIsAuthor: false,
  viewerFollowsAuthor: false,
  authorFollowsViewer: false,
  viewerBlocksAuthor: false,
  authorBlocksViewer: false,
  viewerMutesAuthor: false,
  viewerMutesRenotesFromAuthor: false,
}
