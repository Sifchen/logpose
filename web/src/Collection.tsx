import { useState, type ReactNode } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  api,
  CONDITIONS,
  euros,
  query,
  type CardSet,
  type Location,
  type Lot,
  type PriceStatus,
} from './api.ts'
import CardDialog from './CardDialog.tsx'
import { CollectionGrid } from './Grid.tsx'
import LocationsDialog from './Locations.tsx'
import { PrintingLabel } from './LotForm.tsx'
import { groupByPrinting, sortGroups, summarise, type PrintingGroup, type SortKey } from './totals.ts'
import { useDebounced } from './useDebounced.ts'

const NO_FILTERS = { q: '', set_id: '', location_id: '', condition: '', language: '' }
type Filters = typeof NO_FILTERS
type Opened = { group: PrintingGroup; origin: DOMRect; lot?: Lot }

export default function Collection() {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [opened, setOpened] = useState<Opened | null>(null)
  const [managingLocations, setManagingLocations] = useState(false)
  const [view, setView] = useState<'grid' | 'table'>('grid')
  const [sort, setSort] = useState<SortKey>('worth')

  const q = useDebounced(filters.q.trim())
  const params = { ...filters, q: q.length >= 2 ? q : '' }
  const lots = useQuery({
    queryKey: ['lots', params],
    queryFn: () => api<Lot[]>('/api/lots' + query(params)),
    placeholderData: keepPreviousData, // keep the old rows while filtering
  })
  const sets = useQuery({ queryKey: ['sets'], queryFn: () => api<CardSet[]>('/api/sets'), staleTime: Infinity })
  const locations = useQuery({ queryKey: ['locations'], queryFn: () => api<Location[]>('/api/locations') })
  const prices = useQuery({ queryKey: ['prices'], queryFn: () => api<PriceStatus>('/api/prices/status') })

  const set = (key: keyof Filters) => (value: string) => setFilters((f) => ({ ...f, [key]: value }))
  const rows = lots.data ?? []
  const totals = summarise(rows)
  const groups = groupByPrinting(rows)

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-muted">
            {totals.copies} cards in {rows.length} lots · {totals.pricedCopies} priced
            {prices.data?.updated_on && ` · Cardmarket trend of ${prices.data.updated_on}`}
          </p>
        </div>
        <button className="btn" onClick={() => setManagingLocations(true)}>
          Locations
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Value" value={euros(totals.value)} />
        <Stat label="Paid" value={euros(totals.paid)} />
        <Stat
          label="Profit / loss"
          hint="lots with both a price paid and a market price"
          value={(totals.profit >= 0 ? '+' : '') + euros(totals.profit)}
          tone={totals.profit >= 0 ? 'text-ok' : 'text-danger'}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        <input
          className="input col-span-2"
          placeholder="Search name or number"
          value={filters.q}
          onChange={(e) => set('q')(e.target.value)}
        />
        <Select value={filters.set_id} onChange={set('set_id')} placeholder="All sets">
          {sets.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code}
            </option>
          ))}
        </Select>
        <Select value={filters.location_id} onChange={set('location_id')} placeholder="All locations">
          {locations.data?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
        <Select value={filters.condition} onChange={set('condition')} placeholder="Any condition">
          {CONDITIONS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Select value={filters.language} onChange={set('language')} placeholder="Any language">
          <option>EN</option>
          <option>JP</option>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1" role="group" aria-label="View">
          {(['grid', 'table'] as const).map((v) => (
            <button
              key={v}
              aria-pressed={view === v}
              className={`btn capitalize ${view === v ? 'border-focus text-focus' : ''}`}
              onClick={() => setView(v)}
            >
              {v}
            </button>
          ))}
        </div>
        {view === 'grid' && (
          <select
            className="input w-auto"
            aria-label="Sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="worth">Most valuable first</option>
            <option value="number">Set and number</option>
          </select>
        )}
      </div>

      {lots.error && <p className="text-danger">{lots.error.message}</p>}

      {view === 'grid' ? (
        <div className={lots.isPlaceholderData ? 'opacity-60' : ''}>
          <CollectionGrid
            groups={sortGroups(groups, sort)}
            ranked={sort === 'worth'}
            onOpen={(group, origin) => setOpened({ group, origin })}
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-panel border border-line-soft bg-surface">
          <table className="w-full text-sm">
            <thead className="eyebrow text-left">
              <tr className="border-b border-line-soft">
                <th className="p-3">Card</th>
                <th className="p-3 text-right">Qty</th>
                <th className="p-3">Cond.</th>
                <th className="p-3 text-right">Paid / card</th>
                <th className="p-3 text-right">Trend</th>
                <th className="p-3 text-right">Value</th>
                <th className="p-3">Location</th>
                <th className="p-3">Acquired</th>
              </tr>
            </thead>
            <tbody className={lots.isPlaceholderData ? 'opacity-60' : ''}>
              {rows.map((lot) => (
                <tr key={lot.id} className="border-b border-line-soft last:border-0 hover:bg-raised">
                  <td className="p-3">
                    <button
                      className="w-full text-left"
                      title="Edit lot"
                      onClick={(e) => {
                        // the card flies out of the row's image
                        const thumb = e.currentTarget.querySelector('img, div') ?? e.currentTarget
                        const group = groups.find((g) => g.printing.id === lot.printing.id)!
                        setOpened({ group, origin: thumb.getBoundingClientRect(), lot })
                      }}
                    >
                      <PrintingLabel printing={lot.printing} />
                    </button>
                  </td>
                  <td className="p-3 text-right font-mono">{lot.quantity}</td>
                  <td className="p-3 font-mono">{lot.condition}</td>
                  <td className="p-3 text-right font-mono">
                    {lot.unit_cost_cents == null ? '—' : euros(lot.unit_cost_cents)}
                  </td>
                  <td className="p-3 text-right font-mono">
                    {lot.printing.trend_cents == null ? '—' : euros(lot.printing.trend_cents)}
                  </td>
                  <td className="p-3 text-right font-mono font-semibold">
                    {lot.printing.trend_cents == null ? '—' : euros(lot.printing.trend_cents * lot.quantity)}
                  </td>
                  <td className="p-3 text-muted">{lot.location?.name ?? '—'}</td>
                  <td className="p-3 font-mono text-muted">{lot.acquired_on}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {lots.isSuccess && rows.length === 0 && (
        <p className="p-8 text-center text-muted">
          {Object.values(filters).some(Boolean)
            ? 'Nothing matches these filters.'
            : 'No cards yet. Add some on the Add cards screen.'}
        </p>
      )}

      {opened && <CardDialog {...opened} onClose={() => setOpened(null)} />}
      {managingLocations && <LocationsDialog onClose={() => setManagingLocations(false)} />}
    </div>
  )
}

function Stat({ label, value, hint, tone = '' }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-panel border border-line-soft bg-surface p-4" title={hint}>
      <div className="eyebrow">{label}</div>
      <div className={`mt-1 font-mono text-lg font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  )
}

function Select({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  children: ReactNode
}) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {children}
    </select>
  )
}
