import type { UserInput } from '../types.js'
import type { LabelerConfig } from './types.js'

export function isNewAccount(
  user: UserInput,
  now: Date,
  config: Pick<LabelerConfig, 'newAccountMs'>,
): boolean {
  return now.getTime() - user.createdAt.getTime() < config.newAccountMs
}

/** コピペ判定用に本文を正規化する (空白・URL・メンションを潰す) */
export function normalizeText(text: string | null): string {
  if (text === null) return ''
  return text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/@[\w.-]+(@[\w.-]+)?/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}
