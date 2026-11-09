import { expect, it } from 'vitest'
import { nearest, niceTicks } from './chart.ts'

it('picks round ticks that cover the data', () => {
  // 638 in ~4 steps = steps of 200
  expect(niceTicks(8312, 8950)).toEqual([8200, 8400, 8600, 8800, 9000])
  // ~24 per step rounds up to 50
  expect(niceTicks(0, 95)).toEqual([0, 50, 100])
})

it('gives a single value room around it', () => {
  const ticks = niceTicks(500, 500)
  expect(ticks[0]).toBeLessThan(500)
  expect(ticks.at(-1)).toBeGreaterThan(500)
})

it('never steps below one euro', () => {
  expect(niceTicks(2, 3)).toEqual([2, 3])
})

it('snaps to the closest point', () => {
  expect(nearest([0, 100, 200], 140)).toBe(1)
  expect(nearest([0, 100, 200], 999)).toBe(2)
})
