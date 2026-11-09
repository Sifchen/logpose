import { expect, it } from 'vitest'
import type { Lot, Printing } from './api.ts'
import { groupByPrinting, sortGroups, summarise } from './totals.ts'

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

const printing = (id: number, card_number: string, trend: number | null) =>
  ({ id, card_number, set_code: 'OP-01', trend_cents: trend }) as Printing
const lotOf = (p: Printing, quantity: number) => ({ quantity, printing: p }) as Lot

it('groups lots into one entry per printing', () => {
  const nami = printing(1, 'OP01-016', 200)
  const luffy = printing(2, 'OP01-024', null)
  const groups = groupByPrinting([lotOf(nami, 2), lotOf(luffy, 1), lotOf(nami, 3)])
  expect(groups.map((g) => [g.printing.id, g.lots.length, g.quantity, g.value])).toEqual([
    [1, 2, 5, 1000],
    [2, 1, 1, null], // no price, unknown not 0
  ])
})

it('sorts by worth with unpriced last, or by card number', () => {
  const groups = groupByPrinting([
    lotOf(printing(1, 'OP01-001', null), 1),
    lotOf(printing(2, 'OP01-003', 0), 1),
    lotOf(printing(3, 'OP01-002', 500), 1),
  ])
  expect(sortGroups(groups, 'worth').map((g) => g.printing.id)).toEqual([3, 2, 1])
  expect(sortGroups(groups, 'number').map((g) => g.printing.id)).toEqual([1, 3, 2])
})
