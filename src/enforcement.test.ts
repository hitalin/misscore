import { describe, expect, it } from 'vitest'
import type { EnforcementContext } from './enforcement.js'
import {
  actionClass,
  DEFAULT_ENFORCEMENT_RULES,
  decide,
  Enforcer,
} from './enforcement.js'
import type { NoteLabel, UserLabel } from './labels.js'
import { DAY_MS } from './labels.js'
import { makeUser, NOW } from './testing.js'

function ctx(over: Partial<EnforcementContext> = {}): EnforcementContext {
  return {
    user: makeUser(),
    userLabels: new Set<UserLabel>(),
    credibility: { score: 20, isHigh: false, basis: 'heuristic' },
    now: NOW,
    ...over,
  }
}
const ul = (...l: UserLabel[]) => new Set(l)
const note = (...l: NoteLabel[]) => ({
  id: 'n1',
  labels: new Set(l),
  fileIds: ['f1'],
})

describe('decide (default rules)', () => {
  it('skips allowlisted and suspended users first', () => {
    expect(
      decide(
        DEFAULT_ENFORCEMENT_RULES,
        ctx({ userLabels: ul('allowlisted', 'compromised') }),
      ).ruleId,
    ).toBe('allowlisted')
    expect(
      decide(
        DEFAULT_ENFORCEMENT_RULES,
        ctx({
          user: makeUser({ isSuspended: true }),
          userLabels: ul('compromised'),
        }),
      ).ruleId,
    ).toBe('already_suspended')
  })
  it('routes high-credibility users to review instead of auto action', () => {
    const d = decide(
      DEFAULT_ENFORCEMENT_RULES,
      ctx({
        userLabels: ul('spam_high_recall'),
        credibility: { score: 80, isHigh: true, basis: 'pagerank' },
      }),
    )
    expect(d.ruleId).toBe('high_credibility_review')
    expect(d.outcome).toMatchObject({
      kind: 'act',
      actions: [{ kind: 'requireReview' }],
    })
  })
  it('suspends compromised accounts', () => {
    expect(
      decide(DEFAULT_ENFORCEMENT_RULES, ctx({ userLabels: ul('compromised') }))
        .outcome,
    ).toEqual({ kind: 'act', actions: [{ kind: 'suspend' }] })
  })
  it('deletes prohibited-word notes and labels the user', () => {
    const d = decide(
      DEFAULT_ENFORCEMENT_RULES,
      ctx({ note: note('prohibited_word') }),
    )
    expect(d.ruleId).toBe('prohibited_word_delete')
    expect(d.outcome).toEqual({
      kind: 'act',
      actions: [
        { kind: 'deleteNote', noteId: 'n1' },
        { kind: 'labelUser', label: 'spam_high_recall', ttlMs: 7 * DAY_MS },
      ],
    })
  })
  it('silences spam-labeled users once', () => {
    expect(
      decide(
        DEFAULT_ENFORCEMENT_RULES,
        ctx({ userLabels: ul('spam_high_recall') }),
      ).outcome,
    ).toEqual({
      kind: 'act',
      actions: [{ kind: 'silence', ttlMs: 7 * DAY_MS }],
    })
    expect(
      decide(
        DEFAULT_ENFORCEMENT_RULES,
        ctx({
          userLabels: ul('spam_high_recall'),
          user: makeUser({ isSilenced: true }),
        }),
      ).ruleId,
    ).toBe('default')
  })
  it('marks nsfw files sensitive', () => {
    expect(
      decide(
        DEFAULT_ENFORCEMENT_RULES,
        ctx({ note: note('nsfw_high_precision') }),
      ).outcome,
    ).toEqual({
      kind: 'act',
      actions: [{ kind: 'markSensitive', fileIds: ['f1'] }],
    })
  })
  it('asks review when many distinct reporters', () => {
    expect(
      decide(
        DEFAULT_ENFORCEMENT_RULES,
        ctx({ reports: { open: 5, distinctReporters: 3 } }),
      ).ruleId,
    ).toBe('reported_by_many_review')
    expect(
      decide(
        DEFAULT_ENFORCEMENT_RULES,
        ctx({ reports: { open: 5, distinctReporters: 1 } }),
      ).ruleId,
    ).toBe('default')
  })
  it('throws without a default rule', () => {
    expect(() => decide([], ctx())).toThrow()
  })
})

describe('Enforcer', () => {
  it('dedups same-or-lower class within ttl, lets heavier through', () => {
    const e = new Enforcer()
    const first = e.run(ctx({ userLabels: ul('spam_high_recall') }))
    expect(first.actions).toHaveLength(1)
    const again = e.run(ctx({ userLabels: ul('spam_high_recall') }))
    expect(again.skippedBy).toBe('dedup')
    const heavier = e.run(ctx({ userLabels: ul('compromised') }))
    expect(heavier.actions).toEqual([{ kind: 'suspend' }])
    expect(actionClass({ kind: 'suspend' })).toBeGreaterThan(
      actionClass({ kind: 'silence', ttlMs: null }),
    )
  })
  it('expires dedup entries', () => {
    const e = new Enforcer({ dedupTtlMs: 1000 })
    e.run(ctx({ userLabels: ul('spam_high_recall') }))
    const later = e.run(
      ctx({
        userLabels: ul('spam_high_recall'),
        now: new Date(NOW.getTime() + 2000),
      }),
    )
    expect(later.actions).toHaveLength(1)
  })
  it('applies the daily cap', () => {
    const e = new Enforcer({ maxEnforcementsPerDay: 1 })
    expect(
      e.run(ctx({ user: makeUser({ id: 'a' }), userLabels: ul('compromised') }))
        .actions,
    ).toHaveLength(1)
    expect(
      e.run(ctx({ user: makeUser({ id: 'b' }), userLabels: ul('compromised') }))
        .skippedBy,
    ).toBe('daily_cap')
    const tomorrow = new Date(NOW.getTime() + DAY_MS + 1)
    expect(
      e.run(
        ctx({
          user: makeUser({ id: 'c' }),
          userLabels: ul('compromised'),
          now: tomorrow,
        }),
      ).actions,
    ).toHaveLength(1)
  })
  it('does not count skips', () => {
    const e = new Enforcer({ maxEnforcementsPerDay: 1 })
    expect(e.run(ctx()).actions).toEqual([])
    expect(e.run(ctx({ userLabels: ul('compromised') })).actions).toHaveLength(
      1,
    )
  })
})
