import { describe, expect, it } from 'vitest'
import { query, toCents } from './api.ts'

describe('toCents', () => {
  it.each([
    ['2,50', 250],
    ['2.5', 250],
    ['0.29', 29], // parseFloat * 100 would give 28.999...
    ['12', 1200],
    [' 3,07 ', 307],
  ])('reads %s as %i cents', (input, cents) => {
    expect(toCents(input)).toBe(cents)
  })

  it('treats empty as unknown and junk as invalid', () => {
    expect(toCents('')).toBeNull()
    expect(toCents('abc')).toBeUndefined()
    expect(toCents('-1')).toBeUndefined()
    expect(toCents('1.005')).toBeUndefined()
  })
})

describe('query', () => {
  it('keeps only filled params', () => {
    expect(query({ q: 'nami', set_id: '', location_id: null })).toBe('?q=nami')
    expect(query({ q: '' })).toBe('')
  })
})
