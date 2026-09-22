import { DAY_MS } from '../labels.js'
import { normalizeText } from './shared.js'
import type { Labeler, LabelerOutput } from './types.js'

/**
 * 連投とコピペの判定。作者の直近ノート (history) を見る。
 * - velocityWindowMs 内の投稿数が maxNotesPerWindow 以上 → spam_high_recall
 * - 正規化した本文が copypastaMinDuplicates 件以上一致 → copypasta_spam
 *   (botmaker 21711/21599 の重複文面クラスタ相当)
 */
export const velocityLabeler: Labeler = {
  id: 'velocity',
  run({ note, config, history }) {
    const out: LabelerOutput = { note: [], user: [] }
    const since = note.createdAt.getTime() - config.velocityWindowMs
    const recent = history.filter((n) => n.createdAt.getTime() >= since).length
    if (recent + 1 >= config.maxNotesPerWindow) {
      out.note.push({
        type: 'spam_high_recall',
        source: 'velocity',
        ttlMs: DAY_MS,
        reason: `${recent + 1} notes within ${config.velocityWindowMs}ms`,
      })
    }
    const body = normalizeText(note.text)
    if (body.length >= 10) {
      const dup = history.filter((n) => normalizeText(n.text) === body).length
      if (dup + 1 >= config.copypastaMinDuplicates) {
        out.note.push({
          type: 'copypasta_spam',
          source: 'velocity',
          ttlMs: 7 * DAY_MS,
          reason: `${dup + 1} notes share the same body`,
        })
      }
    }
    return out
  },
}
