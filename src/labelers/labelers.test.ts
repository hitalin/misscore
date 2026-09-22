import { describe, expect, it } from 'vitest'
import { makeNote, makeUser, NOW } from '../testing.js'
import { DEFAULT_LABELER_CONFIG, runLabelers } from './index.js'
import type { LabelContext, LabelerConfig } from './types.js'

function ctx(
  over: Partial<LabelContext> = {},
  config: Partial<LabelerConfig> = {},
): LabelContext {
  return {
    note: makeNote(),
    author: makeUser(),
    now: NOW,
    history: [],
    config: { ...DEFAULT_LABELER_CONFIG, ...config },
    ...over,
  }
}

const types = (c: LabelContext) => runLabelers(c).note.map((e) => e.type)

describe('keywordLabeler', () => {
  it('labels prohibited and sensitive words', () => {
    const c = ctx(
      { note: makeNote({ text: 'buy pills', cw: 'lewd' }) },
      { prohibitedWords: ['pills'], sensitiveWords: ['lewd'] },
    )
    expect(types(c)).toEqual(['prohibited_word', 'sensitive_word'])
  })
  it('checks poll choices too', () => {
    const c = ctx(
      { note: makeNote({ text: 'vote', pollChoices: ['spam word'] }) },
      { prohibitedWords: ['spam word'] },
    )
    expect(types(c)).toContain('prohibited_word')
  })
})

describe('mediaLabeler', () => {
  it('maps maybePorn to high precision and recall', () => {
    const c = ctx({
      note: makeNote({
        files: [
          { id: 'f', type: 'image/png', isSensitive: false, maybePorn: true },
        ],
      }),
    })
    expect(types(c)).toEqual(['nsfw_high_precision', 'nsfw_high_recall'])
  })
  it('maps maybeSensitive to recall only', () => {
    const c = ctx({
      note: makeNote({
        files: [
          {
            id: 'f',
            type: 'image/png',
            isSensitive: false,
            maybeSensitive: true,
          },
        ],
      }),
    })
    expect(types(c)).toEqual(['nsfw_high_recall'])
  })
  it('respects trustMaybePorn=false', () => {
    const c = ctx(
      {
        note: makeNote({
          files: [
            { id: 'f', type: 'image/png', isSensitive: false, maybePorn: true },
          ],
        }),
      },
      { trustMaybePorn: false },
    )
    expect(types(c)).toEqual(['nsfw_high_recall'])
  })
})

describe('mentionLabeler', () => {
  it('labels over-limit mentions', () => {
    const c = ctx(
      { note: makeNote({ mentions: ['a', 'b', 'c'] }) },
      { mentionLimit: 2 },
    )
    expect(types(c)).toContain('mention_spam')
  })
  it('flags new account mentioning strangers with a url', () => {
    const c = ctx({
      note: makeNote({ text: 'hi https://x.test', mentions: ['stranger'] }),
      author: makeUser({ createdAt: NOW }),
      authorFollowing: new Set(['friend']),
    })
    expect(types(c)).toContain('spam_high_recall')
  })
  it('does not flag when mentioning followed users', () => {
    const c = ctx({
      note: makeNote({ text: 'hi https://x.test', mentions: ['friend'] }),
      author: makeUser({ createdAt: NOW }),
      authorFollowing: new Set(['friend']),
    })
    expect(types(c)).not.toContain('spam_high_recall')
  })
  it('does not flag old accounts', () => {
    const c = ctx({
      note: makeNote({ text: 'hi https://x.test', mentions: ['stranger'] }),
      authorFollowing: new Set(),
    })
    expect(types(c)).not.toContain('spam_high_recall')
  })
})

describe('urlLabeler', () => {
  it('labels malicious domains incl. subdomains', () => {
    const c = ctx(
      { note: makeNote({ text: 'go https://a.bad.example/p' }) },
      { maliciousDomains: ['bad.example'] },
    )
    expect(types(c)).toEqual(['malicious_url', 'do_not_amplify'])
  })
})

describe('velocityLabeler', () => {
  it('labels burst posting', () => {
    const history = Array.from({ length: 9 }, (_, i) =>
      makeNote({ id: `h${i}`, createdAt: new Date(NOW.getTime() - i * 1000) }),
    )
    const c = ctx({ history }, { maxNotesPerWindow: 10 })
    expect(types(c)).toContain('spam_high_recall')
  })
  it('ignores old history', () => {
    const history = Array.from({ length: 9 }, (_, i) =>
      makeNote({
        id: `h${i}`,
        createdAt: new Date(NOW.getTime() - 3_600_000 - i),
      }),
    )
    const c = ctx({ history }, { maxNotesPerWindow: 10 })
    expect(types(c)).not.toContain('spam_high_recall')
  })
  it('labels copypasta ignoring urls and mentions', () => {
    const body = 'check this amazing offer'
    const history = [
      makeNote({
        id: 'h1',
        text: `@a ${body} https://1.test`,
        createdAt: new Date(0),
      }),
      makeNote({
        id: 'h2',
        text: `@b ${body}  https://2.test`,
        createdAt: new Date(0),
      }),
    ]
    const c = ctx({
      note: makeNote({ text: `${body} https://3.test` }),
      history,
    })
    expect(types(c)).toContain('copypasta_spam')
  })
  it('ignores short bodies', () => {
    const history = [
      makeNote({ text: 'ok', createdAt: new Date(0) }),
      makeNote({ text: 'ok', createdAt: new Date(0) }),
    ]
    const c = ctx({ note: makeNote({ text: 'ok' }), history })
    expect(types(c)).not.toContain('copypasta_spam')
  })
})
