import { matchWordMute, noteContentForMute } from '../keywords.js'
import type { NoteLabel, UserLabel } from '../labels.js'
import type { Predicate } from './types.js'

export const noteHas =
  (...labels: NoteLabel[]): Predicate =>
  (ctx) =>
    labels.some((l) => ctx.noteLabels.has(l))

export const authorHas =
  (...labels: UserLabel[]): Predicate =>
  (ctx) =>
    labels.some((l) => ctx.authorLabels.has(l))

export const not =
  (p: Predicate): Predicate =>
  (ctx) =>
    !p(ctx)

export const loggedOut: Predicate = (ctx) => ctx.viewer.id === null
export const loggedIn: Predicate = (ctx) => ctx.viewer.id !== null
export const minor: Predicate = (ctx) => ctx.viewer.isMinor
export const showsSensitive: Predicate = (ctx) => ctx.viewer.showsSensitiveMedia

export const authorSuspended: Predicate = (ctx) => ctx.author.isSuspended
export const authorSilenced: Predicate = (ctx) => ctx.author.isSilenced

export const viewerBlocksAuthor: Predicate = (ctx) =>
  ctx.relationship.viewerBlocksAuthor
export const authorBlocksViewer: Predicate = (ctx) =>
  ctx.relationship.authorBlocksViewer
export const viewerMutesAuthor: Predicate = (ctx) =>
  ctx.relationship.viewerMutesAuthor
export const viewerMutesRenotes: Predicate = (ctx) =>
  ctx.relationship.viewerMutesRenotesFromAuthor
export const isRenote: Predicate = (ctx) =>
  ctx.note.renoteId !== null &&
  ctx.note.text === null &&
  ctx.note.files.length === 0

export const viewerMutesInstance: Predicate = (ctx) =>
  ctx.note.userHost !== null &&
  ctx.viewer.mutedInstances.some(
    (h) => h.toLowerCase() === ctx.note.userHost?.toLowerCase(),
  )

export const hardWordMuted: Predicate = (ctx) =>
  matchWordMute(noteContentForMute(ctx.note), ctx.viewer.hardMutedWords)
    .length > 0
export const wordMuted: Predicate = (ctx) =>
  matchWordMute(noteContentForMute(ctx.note), ctx.viewer.mutedWords).length > 0

/** Misskey の visibility による到達制御 */
export const notVisibleToViewer: Predicate = (ctx) => {
  const { note, viewer, relationship } = ctx
  switch (note.visibility) {
    case 'public':
    case 'home':
      return false
    case 'followers':
      return viewer.id === null || !relationship.viewerFollowsAuthor
    case 'specified':
      return viewer.id === null || !note.visibleUserIds.includes(viewer.id)
  }
}

export const hasSensitiveFile: Predicate = (ctx) =>
  ctx.note.files.some((f) => f.isSensitive)
export const hasMedia: Predicate = (ctx) => ctx.note.files.length > 0

export const ancillaryDropped: Predicate = (ctx) =>
  ctx.ancillaryDropped === true
