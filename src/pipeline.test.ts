import { describe, expect, it } from 'vitest'
import { DEFAULT_LABELER_CONFIG } from './labelers/index.js'
import { judgeNote } from './pipeline.js'
import { makeNote, makeUser, NOW } from './testing.js'

const low = { score: 10, isHigh: false, basis: 'heuristic' as const }

describe('judgeNote', () => {
  it('labels, aggregates and decides in one pass', () => {
    const r = judgeNote({
      note: makeNote({
        text: 'buy pills now',
        files: [{ id: 'f', type: 'image/png', isSensitive: false }],
      }),
      author: makeUser(),
      now: NOW,
      config: { ...DEFAULT_LABELER_CONFIG, prohibitedWords: ['pills'] },
      history: [],
      userLabels: [],
      credibility: low,
    })
    expect(r.noteLabels.map((l) => l.type)).toEqual(['prohibited_word'])
    expect(r.decision.ruleId).toBe('prohibited_word_delete')
  })
  it('promotes repeated spam to a user label and silences', () => {
    const body = 'check this amazing offer right now'
    const history = Array.from({ length: 3 }, (_, i) => ({
      note: makeNote({
        id: `h${i}`,
        text: body,
        createdAt: new Date(NOW.getTime() - 3_600_000 * (i + 1)),
      }),
      labels: [],
    }))
    const r = judgeNote({
      note: makeNote({ text: body }),
      author: makeUser(),
      now: NOW,
      config: DEFAULT_LABELER_CONFIG,
      history,
      userLabels: [],
      credibility: low,
    })
    expect(r.noteLabels.map((l) => l.type)).toEqual(['copypasta_spam'])
    // history had no labels, so aggregation needs 3 matching: only the current note matches → no user label yet
    expect(r.userLabels).toEqual([])
    expect(r.decision.ruleId).toBe('default')
  })
  it('aggregates when history already carries labels', () => {
    const body = 'check this amazing offer right now'
    const mk = (id: string) => ({
      note: makeNote({
        id,
        text: body,
        createdAt: new Date(NOW.getTime() - 60_000),
      }),
      labels: [
        {
          type: 'copypasta_spam' as const,
          source: 't',
          createdAt: NOW,
          expiresAt: null,
        },
      ],
    })
    const r = judgeNote({
      note: makeNote({ text: body }),
      author: makeUser(),
      now: NOW,
      config: DEFAULT_LABELER_CONFIG,
      history: [mk('a'), mk('b')],
      userLabels: [],
      credibility: low,
    })
    expect(r.userLabels.map((l) => l.type)).toEqual(['spam_high_recall'])
    expect(r.decision.outcome).toMatchObject({
      kind: 'act',
      actions: [{ kind: 'silence' }],
    })
  })
  it('sends high-credibility users to review', () => {
    const r = judgeNote({
      note: makeNote({ text: 'buy pills' }),
      author: makeUser(),
      now: NOW,
      config: { ...DEFAULT_LABELER_CONFIG, prohibitedWords: ['pills'] },
      history: [],
      userLabels: [],
      credibility: { score: 90, isHigh: true, basis: 'pagerank' },
    })
    expect(r.decision.ruleId).toBe('high_credibility_review')
  })
})
