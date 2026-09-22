import type {
  NoteInput,
  Relationship,
  UserInput,
  ViewerInput,
} from './types.js'
import { NO_RELATIONSHIP } from './types.js'

/** テスト用のフィクスチャ生成。ライブラリ利用者も雛形として使える */
export const NOW = new Date('2026-09-23T00:00:00Z')

export function makeNote(over: Partial<NoteInput> = {}): NoteInput {
  return {
    id: 'note1',
    createdAt: NOW,
    userId: 'author',
    userHost: null,
    text: 'hello',
    cw: null,
    visibility: 'public',
    localOnly: false,
    replyId: null,
    renoteId: null,
    mentions: [],
    visibleUserIds: [],
    tags: [],
    files: [],
    reactions: {},
    renoteCount: 0,
    repliesCount: 0,
    pollChoices: [],
    ...over,
  }
}

export function makeUser(over: Partial<UserInput> = {}): UserInput {
  return {
    id: 'author',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    host: null,
    username: 'author',
    name: null,
    description: null,
    isSuspended: false,
    isSilenced: false,
    isLocked: false,
    isBot: false,
    followersCount: 10,
    followingCount: 10,
    notesCount: 100,
    lastActiveDate: NOW,
    roleIds: [],
    ...over,
  }
}

export function makeViewer(over: Partial<ViewerInput> = {}): ViewerInput {
  return {
    id: 'viewer',
    showsSensitiveMedia: false,
    isMinor: false,
    mutedWords: [],
    hardMutedWords: [],
    mutedInstances: [],
    ...over,
  }
}

export function makeRelationship(
  over: Partial<Relationship> = {},
): Relationship {
  return { ...NO_RELATIONSHIP, ...over }
}
