import type { Lot, Printing } from './api.ts'

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

export type PrintingGroup = {
  printing: Printing
  lots: Lot[]
  quantity: number
  value: number | null // null = no price, not 0
}

// one entry per printing, for the grid tiles
export function groupByPrinting(lots: Lot[]): PrintingGroup[] {
  const groups = new Map<number, PrintingGroup>()
  for (const lot of lots) {
    let group = groups.get(lot.printing.id)
    if (!group) {
      group = { printing: lot.printing, lots: [], quantity: 0, value: null }
      groups.set(lot.printing.id, group)
    }
    group.lots.push(lot)
    group.quantity += lot.quantity
  }
  for (const group of groups.values()) {
    const trend = group.printing.trend_cents
    group.value = trend == null ? null : trend * group.quantity
  }
  return [...groups.values()]
}

export type SortKey = 'worth' | 'number'

export function sortGroups(groups: PrintingGroup[], by: SortKey): PrintingGroup[] {
  const byWorth = (a: PrintingGroup, b: PrintingGroup) => (b.value ?? -1) - (a.value ?? -1)
  const byNumber = (a: PrintingGroup, b: PrintingGroup) =>
    a.printing.set_code.localeCompare(b.printing.set_code) ||
    a.printing.card_number.localeCompare(b.printing.card_number) ||
    a.printing.id - b.printing.id
  return [...groups].sort(by === 'worth' ? byWorth : byNumber)
}
