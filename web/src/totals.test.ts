import { expect, it } from 'vitest'
import type { Lot } from './api.ts'
import { summarise } from './totals.ts'

const lot = (quantity: number, cost: number | null, trend: number | null) =>
  ({ quantity, unit_cost_cents: cost, printing: { trend_cents: trend } }) as Lot

it('adds up value, paid and profit, skipping what is unknown', () => {
  const totals = summarise([
    lot(2, 100, 250), // bought for 1 €, now 2.50 €
    lot(1, null, 1000), // price paid unknown, counts for value but not profit
    lot(3, 50, null), // no market price, counts for paid but not value
  ])
  expect(totals).toEqual({ copies: 6, pricedCopies: 3, value: 1500, paid: 350, profit: 300 })
})

it('is all zero for an empty collection', () => {
  expect(summarise([])).toEqual({ copies: 0, pricedCopies: 0, value: 0, paid: 0, profit: 0 })
})
