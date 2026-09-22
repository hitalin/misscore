import { describe, expect, it } from 'vitest'
import { activeTypes, DAY_MS, isActive, materialize } from './labels.js'

const now = new Date('2026-09-23T00:00:00Z')

describe('materialize', () => {
  it('sets expiresAt from ttl', () => {
    const l = materialize({ type: 'spam', source: 'x', ttlMs: DAY_MS }, now)
    expect(l.expiresAt?.getTime()).toBe(now.getTime() + DAY_MS)
    expect(l.createdAt).toBe(now)
  })
  it('keeps null ttl as permanent', () => {
    const l = materialize({ type: 'spam', source: 'x', ttlMs: null }, now)
    expect(l.expiresAt).toBeNull()
    expect(isActive(l, new Date(now.getTime() + 100 * DAY_MS))).toBe(true)
  })
})

describe('activeTypes', () => {
  it('drops expired labels', () => {
    const labels = [
      materialize({ type: 'spam', source: 'x', ttlMs: DAY_MS }, now),
      materialize({ type: 'nsfw_high_recall', source: 'x', ttlMs: null }, now),
    ]
    const later = new Date(now.getTime() + 2 * DAY_MS)
    expect([...activeTypes(labels, later)]).toEqual(['nsfw_high_recall'])
    expect(activeTypes(labels, now).has('spam')).toBe(true)
  })
  it('treats expiry instant as expired', () => {
    const l = materialize({ type: 'spam', source: 'x', ttlMs: DAY_MS }, now)
    expect(isActive(l, new Date(now.getTime() + DAY_MS))).toBe(false)
  })
})
