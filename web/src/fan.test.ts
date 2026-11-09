import { expect, it } from 'vitest'
import { clamp, fromTile, placeCard } from './fan.ts'

const box = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height }) as DOMRect

it('puts the open card over the tile it came from', () => {
  // 100x140 tile at (0,0), open card is 400x560 centered at (500,400)
  expect(fromTile(box(0, 0, 100, 140), box(300, 120, 400, 560))).toBe('translate(-450px, -330px) scale(0.25)')
})

it('skips the flight when a box is hidden', () => {
  expect(fromTile(box(0, 0, 0, 0), box(300, 120, 400, 560))).toBeNull()
})

const shift = (offset: number) => Number(/\* (-?[\d.e-]+)\)/.exec(String(placeCard(offset).transform))![1])

it('puts the lead in the middle, full size, on top', () => {
  const lead = placeCard(0)
  expect(lead.transform).toContain('scale(1)')
  expect(lead.opacity).toBe(1)
  expect(Number(lead.zIndex)).toBeGreaterThan(Number(placeCard(1).zIndex))
})

it('fans both ways and never past the reach, however far', () => {
  expect(shift(-3)).toBeCloseTo(-shift(3))
  expect(shift(1)).toBeLessThan(shift(2))
  expect(shift(150)).toBeLessThanOrEqual(1)
})

it('keeps far cards visible and nearer cards on top', () => {
  expect(placeCard(150).opacity).toBe(0.35)
  expect(Number(placeCard(2).zIndex)).toBeGreaterThan(Number(placeCard(3).zIndex))
})

it('clamps the lead to the deck', () => {
  expect(clamp(-1, 5)).toBe(0)
  expect(clamp(9, 5)).toBe(4)
})
