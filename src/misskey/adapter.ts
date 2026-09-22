/**
 * misskey-js の autogen 型と同じ形のオブジェクトを、misscore の入力型に変換する。
 * misskey-js に依存させないため、必要なフィールドだけを構造的に受け取る。
 */
import type { EnforcementAction } from '../enforcement.js'
import type { ReportInput } from '../triage.js'
import type {
  FileInput,
  Id,
  NoteInput,
  UserInput,
  ViewerInput,
} from '../types.js'

export interface ApiDriveFile {
  id: Id
  type: string
  isSensitive: boolean
  /** admin/drive/show-file のみ */
  maybeSensitive?: boolean
  maybePorn?: boolean
  md5?: string
}

export interface ApiNote {
  id: Id
  createdAt: string
  userId: Id
  user: { host: string | null }
  text: string | null
  cw?: string | null
  visibility: NoteInput['visibility']
  localOnly?: boolean
  replyId?: Id | null
  renoteId?: Id | null
  mentions?: Id[]
  visibleUserIds?: Id[]
  tags?: string[]
  files?: ApiDriveFile[]
  reactions: Record<string, number>
  renoteCount: number
  repliesCount: number
  poll?: { choices: { text: string }[] } | null
}

export interface ApiUserDetailed {
  id: Id
  createdAt: string
  host: string | null
  username: string
  name: string | null
  description: string | null
  isSuspended?: boolean
  isSilenced?: boolean
  isLocked?: boolean
  isBot?: boolean
  followersCount: number
  followingCount: number
  notesCount: number
  lastActiveDate?: string | null
  roles?: { id: Id }[]
}

export interface ApiAbuseUserReport {
  id: Id
  createdAt: string
  comment: string
  resolved: boolean
  reporterId: Id
  targetUserId: Id
  forwarded: boolean
  reporter: { host: string | null }
  targetUser: { host: string | null }
}

export function fromApiFile(f: ApiDriveFile): FileInput {
  const out: FileInput = { id: f.id, type: f.type, isSensitive: f.isSensitive }
  if (f.maybeSensitive !== undefined) out.maybeSensitive = f.maybeSensitive
  if (f.maybePorn !== undefined) out.maybePorn = f.maybePorn
  if (f.md5 !== undefined) out.md5 = f.md5
  return out
}

export function fromApiNote(n: ApiNote): NoteInput {
  return {
    id: n.id,
    createdAt: new Date(n.createdAt),
    userId: n.userId,
    userHost: n.user.host,
    text: n.text,
    cw: n.cw ?? null,
    visibility: n.visibility,
    localOnly: n.localOnly ?? false,
    replyId: n.replyId ?? null,
    renoteId: n.renoteId ?? null,
    mentions: n.mentions ?? [],
    visibleUserIds: n.visibleUserIds ?? [],
    tags: n.tags ?? [],
    files: (n.files ?? []).map(fromApiFile),
    reactions: n.reactions,
    renoteCount: n.renoteCount,
    repliesCount: n.repliesCount,
    pollChoices: n.poll?.choices.map((c) => c.text) ?? [],
  }
}

export function fromApiUser(u: ApiUserDetailed): UserInput {
  return {
    id: u.id,
    createdAt: new Date(u.createdAt),
    host: u.host,
    username: u.username,
    name: u.name,
    description: u.description,
    isSuspended: u.isSuspended ?? false,
    isSilenced: u.isSilenced ?? false,
    isLocked: u.isLocked ?? false,
    isBot: u.isBot ?? false,
    followersCount: u.followersCount,
    followingCount: u.followingCount,
    notesCount: u.notesCount,
    lastActiveDate:
      u.lastActiveDate == null ? null : new Date(u.lastActiveDate),
    roleIds: (u.roles ?? []).map((r) => r.id),
  }
}

export function fromApiReport(r: ApiAbuseUserReport): ReportInput {
  return {
    id: r.id,
    createdAt: new Date(r.createdAt),
    comment: r.comment,
    reporterId: r.reporterId,
    reporterHost: r.reporter.host,
    targetUserId: r.targetUserId,
    targetUserHost: r.targetUser.host,
    resolved: r.resolved,
    forwarded: r.forwarded,
  }
}

/** i (MeDetailed) と user_profile の設定から閲覧者を作る */
export function fromApiMe(
  me: {
    id: Id
    mutedWords?: ViewerInput['mutedWords']
    hardMutedWords?: ViewerInput['hardMutedWords']
    mutedInstances?: string[]
  },
  prefs: { showsSensitiveMedia?: boolean; isMinor?: boolean } = {},
): ViewerInput {
  return {
    id: me.id,
    showsSensitiveMedia: prefs.showsSensitiveMedia ?? false,
    isMinor: prefs.isMinor ?? false,
    mutedWords: me.mutedWords ?? [],
    hardMutedWords: me.hardMutedWords ?? [],
    mutedInstances: me.mutedInstances ?? [],
  }
}

export const LOGGED_OUT_VIEWER: ViewerInput = {
  id: null,
  showsSensitiveMedia: false,
  isMinor: false,
  mutedWords: [],
  hardMutedWords: [],
  mutedInstances: [],
}

/** Misskey API 呼び出し 1 件 (endpoint と params)。token は呼び出し側で付ける */
export interface ApiCall {
  endpoint: string
  params: Record<string, unknown>
}

export interface ActionMappingOptions {
  /** サイレンス用ロール (canPublicNote=false) の id */
  silenceRoleId?: string
  /** ラベル付与をモデレーションノートへの追記として記録する */
  recordLabelsInModerationNote?: boolean
}

/**
 * EnforcementAction を Misskey の admin API 呼び出しに写す。
 * ラベルは Misskey 側に保存先が無いので、既定ではモデレーションノートに追記する
 * (呼び出し側で既存ノートに連結すること)。
 */
export function toApiCalls(
  userId: Id,
  actions: readonly EnforcementAction[],
  now: Date,
  options: ActionMappingOptions = {},
): ApiCall[] {
  const calls: ApiCall[] = []
  for (const a of actions) {
    switch (a.kind) {
      case 'suspend':
        calls.push({ endpoint: 'admin/suspend-user', params: { userId } })
        break
      case 'silence':
        if (options.silenceRoleId === undefined) {
          calls.push({
            endpoint: 'admin/update-user-note',
            params: {
              userId,
              text: `[misscore] silence requested (no silenceRoleId configured)`,
            },
          })
          break
        }
        calls.push({
          endpoint: 'admin/roles/assign',
          params: {
            roleId: options.silenceRoleId,
            userId,
            expiresAt: a.ttlMs === null ? null : now.getTime() + a.ttlMs,
          },
        })
        break
      case 'deleteNote':
        calls.push({ endpoint: 'notes/delete', params: { noteId: a.noteId } })
        break
      case 'markSensitive':
        for (const fileId of a.fileIds) {
          calls.push({
            endpoint: 'drive/files/update',
            params: { fileId, isSensitive: true },
          })
        }
        break
      case 'requireReview':
        calls.push({
          endpoint: 'admin/update-user-note',
          params: { userId, text: `[misscore] review required: ${a.reason}` },
        })
        break
      case 'labelUser':
      case 'labelNote':
        if (options.recordLabelsInModerationNote !== false) {
          const target = a.kind === 'labelUser' ? 'user' : `note ${a.noteId}`
          calls.push({
            endpoint: 'admin/update-user-note',
            params: {
              userId,
              text: `[misscore] label ${a.label} on ${target}`,
            },
          })
        }
        break
    }
  }
  return calls
}
