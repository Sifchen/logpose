import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, euros, query, type Lot, type PriceStatus } from './api.ts'
import CardDialog from './CardDialog.tsx'
import { CardTile } from './Grid.tsx'
import { groupByPrinting, sortGroups, summarise, type PrintingGroup } from './totals.ts'
import { useDeal } from './useDeal.ts'
import { ValueChart, type ValuePoint } from './ValueChart.tsx'

const RANGES = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 }
type Range = keyof typeof RANGES
type Opened = { group: PrintingGroup; origin: DOMRect }

export default function Home({ onNavigate }: { onNavigate: (to: 'collection' | 'capture') => void }) {
  const [range, setRange] = useState<Range>('30d')
  const [opened, setOpened] = useState<Opened | null>(null)

  const lots = useQuery({ queryKey: ['lots', 'all'], queryFn: () => api<Lot[]>('/api/lots' + query({ limit: 2000 })) })
  const history = useQuery({
    queryKey: ['lots', 'history', range], // under 'lots' so saving a lot refreshes it too
    queryFn: () => api<ValuePoint[]>('/api/portfolio/history' + query({ days: RANGES[range] })),
    placeholderData: keepPreviousData, // keep the old line while the next one loads
  })
  const prices = useQuery({ queryKey: ['prices'], queryFn: () => api<PriceStatus>('/api/prices/status') })

  const rows = lots.data ?? []
  const totals = summarise(rows)
  const groups = groupByPrinting(rows) // newest first because the lots are
  const open = (group: PrintingGroup, origin: DOMRect) => setOpened({ group, origin })

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="sr-only">Home</h1>

      <section className="border-b border-line pb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Collection value</p>
            <p className="mt-1 font-mono text-5xl font-semibold">{euros(totals.value)}</p>
            <p className="mt-2 font-mono text-xs text-muted tabular-nums">
              <span className={totals.profit >= 0 ? 'text-ok' : 'text-danger'}>
                {(totals.profit >= 0 ? '+' : '') + euros(totals.profit)}
              </span>{' '}
              on {euros(totals.paid)} paid · {totals.pricedCopies} of {totals.copies} copies priced
              {prices.data?.updated_on && ` · Cardmarket trend of ${prices.data.updated_on}`}
            </p>
          </div>
          <div className="flex gap-1" role="group" aria-label="Time range">
            {(Object.keys(RANGES) as Range[]).map((r) => (
              <button
                key={r}
                aria-pressed={range === r}
                className={`btn font-mono ${range === r ? 'border-focus text-focus' : ''}`}
                onClick={() => setRange(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 rounded-panel border border-line-soft bg-surface p-4">
          <ValueChart points={history.data ?? []} />
        </div>
      </section>

      {lots.isSuccess && rows.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-muted">No cards yet.</p>
          <button className="btn-primary mt-4" onClick={() => onNavigate('capture')}>
            Add cards
          </button>
        </div>
      )}

      {lots.isSuccess && rows.length > 0 && (
        <Attention
          unpriced={totals.copies - totals.pricedCopies}
          unfiled={rows.filter((lot) => !lot.location).length}
          onOpen={() => onNavigate('collection')}
        />
      )}

      <TileRow
        title="Worth the most"
        groups={sortGroups(groups, 'worth')
          .filter((g) => g.value != null)
          .slice(0, 6)}
        onOpen={open}
      />
      <TileRow title="Added lately" groups={groups.slice(0, 6)} onOpen={open} />

      {opened && <CardDialog {...opened} onClose={() => setOpened(null)} />}
    </div>
  )
}

function Attention({ unpriced, unfiled, onOpen }: { unpriced: number; unfiled: number; onOpen: () => void }) {
  const items = [
    { count: unpriced, label: 'owned copies with no price' },
    { count: unfiled, label: 'lots not filed in a location' },
  ].filter((item) => item.count > 0)

  if (items.length === 0) {
    return <p className="border-b border-line py-6 text-sm text-muted">Nothing needs attention.</p>
  }
  return (
    <section className="grid gap-3 border-b border-line py-6 sm:grid-cols-2">
      {items.map((item) => (
        <button
          key={item.label}
          onClick={onOpen}
          className="rounded-panel border border-line bg-surface p-4 text-left transition-colors duration-(--d-quick) hover:bg-raised"
        >
          <p className="font-mono text-2xl font-semibold tabular-nums">{item.count}</p>
          <p className="mt-1 text-sm text-muted">{item.label}</p>
        </button>
      ))}
    </section>
  )
}

function TileRow({
  title,
  groups,
  onOpen,
}: {
  title: string
  groups: PrintingGroup[]
  onOpen: (group: PrintingGroup, tile: DOMRect) => void
}) {
  const dealt = useDeal(groups.length)
  if (groups.length === 0) return null
  return (
    <section className="border-b border-line py-6 last:border-b-0">
      <h2 className="font-display text-lg font-bold tracking-[0.08em] uppercase">{title}</h2>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {groups.map((group, index) => (
          <li key={group.printing.id}>
            <CardTile
              printing={group.printing}
              count={group.quantity}
              dealt={index < dealt}
              onClick={(tile) => onOpen(group, tile)}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
