import { useState, type ReactNode } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, CONDITIONS, euros, query, type CardSet, type Location, type Lot } from './api.ts'
import LocationsDialog from './Locations.tsx'
import LotDialog, { PrintingLabel } from './LotDialog.tsx'
import { useDebounced } from './useDebounced.ts'

const NO_FILTERS = { q: '', set_id: '', location_id: '', condition: '', language: '' }
type Filters = typeof NO_FILTERS

export default function Collection() {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [editing, setEditing] = useState<Lot | 'new' | null>(null)
  const [managingLocations, setManagingLocations] = useState(false)

  const q = useDebounced(filters.q.trim())
  const params = { ...filters, q: q.length >= 2 ? q : '' }
  const lots = useQuery({
    queryKey: ['lots', params],
    queryFn: () => api<Lot[]>('/api/lots' + query(params)),
    placeholderData: keepPreviousData, // keep the old rows while filtering
  })
  const sets = useQuery({ queryKey: ['sets'], queryFn: () => api<CardSet[]>('/api/sets'), staleTime: Infinity })
  const locations = useQuery({ queryKey: ['locations'], queryFn: () => api<Location[]>('/api/locations') })

  const set = (key: keyof Filters) => (value: string) => setFilters((f) => ({ ...f, [key]: value }))
  const rows = lots.data ?? []
  const copies = rows.reduce((sum, lot) => sum + lot.quantity, 0)
  const cost = rows.reduce((sum, lot) => sum + (lot.unit_cost_cents ?? 0) * lot.quantity, 0)

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Collection</h1>
          <p className="font-mono text-sm text-muted">
            {copies} cards · {rows.length} lots · paid {euros(cost)}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => setManagingLocations(true)}>
            Locations
          </button>
          <button className="btn-primary" onClick={() => setEditing('new')}>
            Add cards
          </button>
        </div>
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

      {lots.error && <p className="text-danger">{lots.error.message}</p>}

      <div className="overflow-x-auto rounded-xl border border-line-soft bg-ink">
        <table className="w-full text-sm">
          <thead className="text-left text-xs tracking-widest text-muted uppercase">
            <tr className="border-b border-line-soft">
              <th className="p-3">Card</th>
              <th className="p-3 text-right">Qty</th>
              <th className="p-3">Cond.</th>
              <th className="p-3 text-right">Paid / card</th>
              <th className="p-3">Location</th>
              <th className="p-3">Acquired</th>
            </tr>
          </thead>
          <tbody className={lots.isPlaceholderData ? 'opacity-60' : ''}>
            {rows.map((lot) => (
              <tr key={lot.id} className="border-b border-line-soft last:border-0 hover:bg-surface">
                <td className="p-3">
                  <button className="w-full text-left" title="Edit lot" onClick={() => setEditing(lot)}>
                    <PrintingLabel printing={lot.printing} />
                  </button>
                </td>
                <td className="p-3 text-right font-mono">{lot.quantity}</td>
                <td className="p-3 font-mono">{lot.condition}</td>
                <td className="p-3 text-right font-mono">
                  {lot.unit_cost_cents == null ? '—' : euros(lot.unit_cost_cents)}
                </td>
                <td className="p-3 text-muted">{lot.location?.name ?? '—'}</td>
                <td className="p-3 font-mono text-muted">{lot.acquired_on}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {lots.isSuccess && rows.length === 0 && (
          <p className="p-8 text-center text-muted">
            {Object.values(filters).some(Boolean) ? 'Nothing matches these filters.' : 'No cards yet. Add your first ones.'}
          </p>
        )}
      </div>

      {editing && <LotDialog lot={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {managingLocations && <LocationsDialog onClose={() => setManagingLocations(false)} />}
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
