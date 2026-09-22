import { describe, expect, it } from 'vitest'
import {
  computePrior,
  credibility,
  massToScore,
  pagerank,
  smoothedRatio,
} from './credibility.js'
import { makeUser, NOW } from './testing.js'

describe('smoothedRatio', () => {
  it('approaches interaction/(interaction+favs) with many samples', () => {
    expect(smoothedRatio(500, 500, 0.1)).toBeCloseTo(0.5, 2)
  })
  it('shrinks toward prior with few samples', () => {
    const r = smoothedRatio(1, 0, 0.01)
    expect(r).toBeLessThan(0.2)
    expect(r).toBeGreaterThan(0.01)
  })
  it('returns 0 when prior is 0', () => {
    expect(smoothedRatio(5, 5, 0)).toBe(0)
  })
})

describe('computePrior', () => {
  it('computes population ratio with per-user cap', () => {
    const prior = computePrior(
      [
        { interaction: 1, favs: 9 },
        { interaction: 2000, favs: 0 },
      ],
      1000,
    )
    // second user is capped to 1000 total → 1000 interactions
    expect(prior).toBeCloseTo(1001 / 1010, 5)
  })
  it('returns 0 for empty population', () => {
    expect(computePrior([])).toBe(0)
  })
})

describe('pagerank', () => {
  it('sums to one and ranks the hub highest', () => {
    const nodes = ['a', 'b', 'c', 'd']
    const edges: [string, string][] = [
      ['a', 'd'],
      ['b', 'd'],
      ['c', 'd'],
      ['d', 'a'],
    ]
    const mass = pagerank(nodes, edges)
    const total = [...mass.values()].reduce((x, y) => x + y, 0)
    expect(total).toBeCloseTo(1, 6)
    const d = mass.get('d') ?? 0
    for (const n of ['a', 'b', 'c']) expect(d).toBeGreaterThan(mass.get(n) ?? 0)
  })
  it('honours teleport distribution', () => {
    const mass = pagerank(['a', 'b'], [], {
      teleport: new Map([['a', 1]]),
    })
    expect(mass.get('a') ?? 0).toBeGreaterThan(mass.get('b') ?? 0)
  })
  it('handles empty graph', () => {
    expect(pagerank([], []).size).toBe(0)
  })
})

describe('massToScore', () => {
  it('clamps to 0..100', () => {
    expect(massToScore(0)).toBe(0)
    expect(massToScore(1)).toBe(100)
    expect(massToScore(1e-8)).toBeGreaterThan(0)
    expect(massToScore(1e-8)).toBeLessThan(100)
  })
})

describe('credibility', () => {
  it('uses pagerank score when given', () => {
    const c = credibility(makeUser(), NOW, 60)
    expect(c).toEqual({ score: 60, isHigh: true, basis: 'pagerank' })
  })
  it('falls back to heuristic', () => {
    const fresh = credibility(
      makeUser({ createdAt: NOW, followersCount: 0, notesCount: 0 }),
      NOW,
      undefined,
    )
    expect(fresh.score).toBe(0)
    expect(fresh.isHigh).toBe(false)
    const old = credibility(
      makeUser({
        createdAt: new Date('2020-01-01T00:00:00Z'),
        followersCount: 500,
        notesCount: 20000,
      }),
      NOW,
      undefined,
    )
    expect(old.score).toBeGreaterThan(fresh.score)
    expect(old.isHigh).toBe(true)
  })
  it('treats many followers as high', () => {
    const c = credibility(
      makeUser({ createdAt: NOW, followersCount: 5000, notesCount: 0 }),
      NOW,
      undefined,
    )
    expect(c.isHigh).toBe(true)
  })
})
