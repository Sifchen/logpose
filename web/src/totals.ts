import type { Lot } from './api.ts'

// unknown prices stay unknown, they never count as 0
export function summarise(lots: Lot[]) {
  let copies = 0
  let pricedCopies = 0
  let value = 0
  let paid = 0
  let profit = 0
  for (const { quantity, unit_cost_cents: cost, printing } of lots) {
    const trend = printing.trend_cents
    copies += quantity
    if (trend != null) {
      pricedCopies += quantity
      value += trend * quantity
    }
    if (cost != null) paid += cost * quantity
    // only when both are known, a card with no price paid isn't pure profit
    if (trend != null && cost != null) profit += (trend - cost) * quantity
  }
  return { copies, pricedCopies, value, paid, profit }
}
