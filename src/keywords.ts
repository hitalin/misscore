import type { KeywordFilter, NoteInput } from './types.js'

const REGEX_FORM = /^\/(.+)\/(.*)$/

/**
 * Misskey の UtilityService.isKeyWordIncluded と同じ判定。
 * "/pattern/flags" は正規表現、それ以外はスペース区切りの全語一致 (AND)。
 */
export function isKeyWordIncluded(
  text: string,
  keyWords: readonly string[],
): boolean {
  if (keyWords.length === 0 || text === '') return false
  return keyWords.some((keyword) => {
    const m = keyword.match(REGEX_FORM)
    if (m?.[1] !== undefined) {
      try {
        return new RegExp(m[1], m[2]).test(text)
      } catch {
        return false
      }
    }
    return keyword
      .split(' ')
      .filter((w) => w !== '')
      .every((w) => text.includes(w))
  })
}

/**
 * Misskey の check-word-mute と同じ判定。
 * 配列は全語一致 (AND)、文字列は正規表現。一致したフィルタを返す。
 */
export function matchWordMute(
  text: string,
  filters: readonly KeywordFilter[],
): KeywordFilter[] {
  if (text === '') return []
  return filters.filter((filter) => {
    if (Array.isArray(filter)) {
      const words = filter.filter((w) => w !== '')
      return words.length > 0 && words.every((w) => text.includes(w))
    }
    const m = filter.match(REGEX_FORM)
    if (m?.[1] === undefined) return false
    try {
      return new RegExp(m[1], m[2]).test(text)
    } catch {
      return false
    }
  })
}

/** NoteCreateService.concatNoteContentsForKeyWordCheck 相当 */
export function noteContentForKeywordCheck(note: NoteInput): string {
  return [note.cw ?? '', note.text ?? '', ...note.pollChoices]
    .filter((s) => s !== '')
    .join('\n')
}

/** ワードミュート判定に使う本文 (cw + text) */
export function noteContentForMute(note: NoteInput): string {
  return `${note.cw ?? ''}\n${note.text ?? ''}`.trim()
}

const URL_RE = /https?:\/\/[^\s<>"'()]+/g

export function extractUrls(text: string | null): URL[] {
  if (text === null) return []
  const urls: URL[] = []
  for (const m of text.matchAll(URL_RE)) {
    try {
      urls.push(new URL(m[0]))
    } catch {
      // 不正な URL は無視
    }
  }
  return urls
}

/** UtilityService.isBlockedHost 系と同じサフィックス一致 (サブドメインも一致) */
export function hostMatches(
  host: string,
  patterns: readonly string[],
): boolean {
  const target = `.${host.toLowerCase()}`
  return patterns.some((p) => target.endsWith(`.${p.toLowerCase()}`))
}
