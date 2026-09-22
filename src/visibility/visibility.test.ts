import { describe, expect, it } from 'vitest'
import type { NoteLabel, UserLabel } from '../labels.js'
import { makeNote, makeRelationship, makeUser, makeViewer } from '../testing.js'
import { evaluate, validatePolicy } from './engine.js'
import {
  HOME_POLICY,
  MODERATOR_POLICY,
  policyForTimeline,
  RECOMMENDATIONS_POLICY,
} from './registry.js'
import type { Policy, VisibilityContext } from './types.js'

function ctx(over: Partial<VisibilityContext> = {}): VisibilityContext {
  return {
    note: makeNote(),
    author: makeUser(),
    viewer: makeViewer(),
    relationship: makeRelationship(),
    noteLabels: new Set<NoteLabel>(),
    authorLabels: new Set<UserLabel>(),
    ...over,
  }
}
const labels = <T extends string>(...l: T[]) => new Set<T>(l)

describe('engine', () => {
  const policy: Policy = {
    name: 't',
    rules: [
      {
        name: 'd',
        when: [(c) => c.note.text === 'bad'],
        appliesTo: 'everyone',
        action: { kind: 'drop', reason: 'spam' },
      },
      {
        name: 'i1',
        when: [(c) => c.note.cw !== null],
        appliesTo: 'everyone',
        action: { kind: 'interstitial', reason: 'nsfw' },
      },
      {
        name: 'i2',
        when: [(c) => c.note.cw !== null],
        appliesTo: 'everyone',
        action: { kind: 'interstitial', reason: 'gore' },
      },
    ],
  }
  it('allows when nothing matches', () => {
    expect(evaluate(policy, ctx())).toEqual({ action: 'allow' })
  })
  it('keeps the first interstitial only', () => {
    expect(evaluate(policy, ctx({ note: makeNote({ cw: 'x' }) }))).toEqual({
      action: 'interstitial',
      reason: 'nsfw',
      rule: 'i1',
    })
  })
  it('drop wins over interstitial', () => {
    expect(
      evaluate(policy, ctx({ note: makeNote({ text: 'bad', cw: 'x' }) })),
    ).toMatchObject({ action: 'drop', rule: 'd' })
  })
  it('validates ordering and names', () => {
    const bad: Policy = {
      name: 'b',
      rules: [
        policy.rules[1] as never,
        policy.rules[0] as never,
        policy.rules[0] as never,
      ],
    }
    expect(validatePolicy(bad)).toEqual([
      'terminal rule after restriction: d',
      'duplicate rule name: d',
      'terminal rule after restriction: d',
    ])
    expect(validatePolicy(HOME_POLICY)).toEqual([])
    expect(validatePolicy(RECOMMENDATIONS_POLICY)).toEqual([])
  })
})

describe('HOME_POLICY', () => {
  it('drops suspended author except for the author', () => {
    const c = ctx({ author: makeUser({ isSuspended: true }) })
    expect(evaluate(HOME_POLICY, c)).toMatchObject({
      action: 'drop',
      reason: 'author_suspended',
    })
    expect(
      evaluate(HOME_POLICY, {
        ...c,
        relationship: makeRelationship({ viewerIsAuthor: true }),
      }),
    ).toEqual({ action: 'allow' })
  })
  it('enforces note visibility', () => {
    const c = ctx({ note: makeNote({ visibility: 'followers' }) })
    expect(evaluate(HOME_POLICY, c)).toMatchObject({
      reason: 'not_visible_to_viewer',
    })
    expect(
      evaluate(HOME_POLICY, {
        ...c,
        relationship: makeRelationship({ viewerFollowsAuthor: true }),
      }),
    ).toEqual({ action: 'allow' })
    const s = ctx({
      note: makeNote({ visibility: 'specified', visibleUserIds: ['viewer'] }),
    })
    expect(evaluate(HOME_POLICY, s)).toEqual({ action: 'allow' })
    expect(
      evaluate(HOME_POLICY, { ...s, viewer: makeViewer({ id: null }) }),
    ).toMatchObject({ reason: 'not_visible_to_viewer' })
  })
  it('drops blocks and mutes for logged-in viewers only', () => {
    const rel = makeRelationship({ viewerBlocksAuthor: true })
    expect(evaluate(HOME_POLICY, ctx({ relationship: rel }))).toMatchObject({
      reason: 'viewer_blocks_author',
    })
    expect(
      evaluate(
        HOME_POLICY,
        ctx({ relationship: rel, viewer: makeViewer({ id: null }) }),
      ),
    ).toEqual({ action: 'allow' })
    expect(
      evaluate(
        HOME_POLICY,
        ctx({ relationship: makeRelationship({ authorBlocksViewer: true }) }),
      ),
    ).toMatchObject({ reason: 'author_blocks_viewer' })
    expect(
      evaluate(
        HOME_POLICY,
        ctx({ relationship: makeRelationship({ viewerMutesAuthor: true }) }),
      ),
    ).toMatchObject({ reason: 'viewer_mutes_author' })
  })
  it('drops pure renotes from renote-muted authors only', () => {
    const rel = makeRelationship({ viewerMutesRenotesFromAuthor: true })
    expect(
      evaluate(
        HOME_POLICY,
        ctx({
          relationship: rel,
          note: makeNote({ renoteId: 'r', text: null }),
        }),
      ),
    ).toMatchObject({ reason: 'viewer_mutes_renotes' })
    expect(
      evaluate(
        HOME_POLICY,
        ctx({
          relationship: rel,
          note: makeNote({ renoteId: 'r', text: 'quote' }),
        }),
      ),
    ).toEqual({ action: 'allow' })
  })
  it('drops muted instances', () => {
    const c = ctx({
      note: makeNote({ userHost: 'Bad.Example' }),
      viewer: makeViewer({ mutedInstances: ['bad.example'] }),
    })
    expect(evaluate(HOME_POLICY, c)).toMatchObject({
      reason: 'viewer_mutes_instance',
    })
  })
  it('hard word mute drops, soft word mute collapses', () => {
    const note = makeNote({ text: 'contains foo here' })
    expect(
      evaluate(
        HOME_POLICY,
        ctx({ note, viewer: makeViewer({ hardMutedWords: [['foo']] }) }),
      ),
    ).toMatchObject({ reason: 'hard_word_mute' })
    expect(
      evaluate(
        HOME_POLICY,
        ctx({ note, viewer: makeViewer({ mutedWords: [['foo']] }) }),
      ),
    ).toMatchObject({ action: 'interstitial', reason: 'word_mute' })
  })
  it('emergency label drops even for the author', () => {
    const c = ctx({
      noteLabels: labels<NoteLabel>('for_emergency_use_only'),
      relationship: makeRelationship({ viewerIsAuthor: true }),
    })
    expect(evaluate(HOME_POLICY, c)).toMatchObject({ reason: 'emergency' })
  })
  it('spam and prohibited words drop for non-authors', () => {
    expect(
      evaluate(HOME_POLICY, ctx({ noteLabels: labels<NoteLabel>('spam') })),
    ).toMatchObject({ reason: 'spam' })
    expect(
      evaluate(
        HOME_POLICY,
        ctx({ noteLabels: labels<NoteLabel>('prohibited_word') }),
      ),
    ).toMatchObject({ reason: 'prohibited_word' })
  })
  it('nsfw: interstitial for logged-in, drop for logged-out and minors', () => {
    const l = labels<NoteLabel>('nsfw_high_precision')
    expect(evaluate(HOME_POLICY, ctx({ noteLabels: l }))).toMatchObject({
      action: 'interstitial',
      reason: 'nsfw',
    })
    expect(
      evaluate(
        HOME_POLICY,
        ctx({
          noteLabels: l,
          viewer: makeViewer({ showsSensitiveMedia: true }),
        }),
      ),
    ).toEqual({ action: 'allow' })
    expect(
      evaluate(
        HOME_POLICY,
        ctx({ noteLabels: l, viewer: makeViewer({ id: null }) }),
      ),
    ).toMatchObject({ reason: 'nsfw_for_viewer' })
    expect(
      evaluate(
        HOME_POLICY,
        ctx({ noteLabels: l, viewer: makeViewer({ isMinor: true }) }),
      ),
    ).toMatchObject({ reason: 'nsfw_for_viewer' })
  })
  it('sensitive files collapse', () => {
    const note = makeNote({
      files: [{ id: 'f', type: 'image/png', isSensitive: true }],
    })
    expect(evaluate(HOME_POLICY, ctx({ note }))).toMatchObject({
      action: 'interstitial',
      reason: 'nsfw',
    })
  })
  it('ancillary drop propagates', () => {
    expect(
      evaluate(HOME_POLICY, ctx({ ancillaryDropped: true })),
    ).toMatchObject({ reason: 'ancillary_dropped' })
  })
  it('does not drop silenced authors or high-recall labels in-network', () => {
    expect(
      evaluate(HOME_POLICY, ctx({ author: makeUser({ isSilenced: true }) })),
    ).toEqual({ action: 'allow' })
    expect(
      evaluate(
        HOME_POLICY,
        ctx({ noteLabels: labels<NoteLabel>('spam_high_recall') }),
      ),
    ).toEqual({ action: 'allow' })
  })
})

describe('RECOMMENDATIONS_POLICY', () => {
  it('drops silenced authors unless followed', () => {
    const c = ctx({ author: makeUser({ isSilenced: true }) })
    expect(evaluate(RECOMMENDATIONS_POLICY, c)).toMatchObject({
      reason: 'author_silenced',
    })
    expect(
      evaluate(RECOMMENDATIONS_POLICY, {
        ...c,
        relationship: makeRelationship({ viewerFollowsAuthor: true }),
      }),
    ).toEqual({ action: 'allow' })
    expect(
      evaluate(RECOMMENDATIONS_POLICY, {
        ...c,
        viewer: makeViewer({ id: null }),
      }),
    ).toMatchObject({ reason: 'author_silenced' })
  })
  it('drops high-recall labels', () => {
    for (const l of [
      'spam_high_recall',
      'nsfw_high_recall',
      'do_not_amplify',
      'copypasta_spam',
    ] as NoteLabel[]) {
      expect(
        evaluate(RECOMMENDATIONS_POLICY, ctx({ noteLabels: labels(l) })),
      ).toMatchObject({ action: 'drop' })
    }
  })
  it('drops labeled authors; abusive only for non-followers', () => {
    expect(
      evaluate(
        RECOMMENDATIONS_POLICY,
        ctx({ authorLabels: labels<UserLabel>('spam_high_recall') }),
      ),
    ).toMatchObject({ reason: 'possibly_undesirable' })
    const abusive = ctx({
      authorLabels: labels<UserLabel>('abusive_high_recall'),
    })
    expect(evaluate(RECOMMENDATIONS_POLICY, abusive)).toMatchObject({
      action: 'drop',
    })
    expect(
      evaluate(RECOMMENDATIONS_POLICY, {
        ...abusive,
        relationship: makeRelationship({ viewerFollowsAuthor: true }),
      }),
    ).toEqual({ action: 'allow' })
  })
  it('sensitive words are hidden from non-followers', () => {
    const c = ctx({ noteLabels: labels<NoteLabel>('sensitive_word') })
    expect(evaluate(RECOMMENDATIONS_POLICY, c)).toMatchObject({
      action: 'drop',
    })
    expect(evaluate(HOME_POLICY, c)).toMatchObject({
      action: 'interstitial',
      reason: 'sensitive_word',
    })
  })
})

describe('MODERATOR_POLICY / policyForTimeline', () => {
  it('moderator sees everything', () => {
    expect(
      evaluate(
        MODERATOR_POLICY,
        ctx({ noteLabels: labels<NoteLabel>('spam') }),
      ),
    ).toEqual({ action: 'allow' })
  })
  it('maps timelines', () => {
    expect(policyForTimeline('home', false)).toBe(HOME_POLICY)
    expect(policyForTimeline('local', true)).toBe(RECOMMENDATIONS_POLICY)
    expect(policyForTimeline('social', true)).toBe(HOME_POLICY)
    expect(policyForTimeline('social', false)).toBe(RECOMMENDATIONS_POLICY)
  })
})
