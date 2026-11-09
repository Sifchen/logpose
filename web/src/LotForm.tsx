import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, CONDITIONS, del, patch, toCents, type Condition, type Location, type Lot, type Printing } from './api.ts'

export function PrintingLabel({ printing }: { printing: Printing }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {printing.image_url ? (
        <img src={printing.image_url} alt="" loading="lazy" className="h-14 w-10 shrink-0 rounded object-cover" />
      ) : (
        <div className="h-14 w-10 shrink-0 rounded bg-raised" />
      )}
      <div className="min-w-0">
        <div className="truncate font-semibold">{printing.name}</div>
        <div className="font-mono text-xs text-muted">
          {printing.card_number} · {printing.set_code} · {printing.language} · {printing.variant} ·{' '}
          {printing.rarity}
        </div>
      </div>
    </div>
  )
}

export function LotForm({ lot, onDone, onCancel }: { lot: Lot; onDone: () => void; onCancel: () => void }) {
  const queryClient = useQueryClient()
  const locations = useQuery({ queryKey: ['locations'], queryFn: () => api<Location[]>('/api/locations') })

  const [quantity, setQuantity] = useState(String(lot.quantity))
  const [condition, setCondition] = useState<Condition>(lot.condition)
  const [cost, setCost] = useState(lot.unit_cost_cents != null ? (lot.unit_cost_cents / 100).toFixed(2) : '')
  const [acquiredOn, setAcquiredOn] = useState(lot.acquired_on)
  const [locationId, setLocationId] = useState(lot.location ? String(lot.location.id) : '')
  const [note, setNote] = useState(lot.note ?? '')

  const cents = toCents(cost)
  const done = () => {
    queryClient.invalidateQueries({ queryKey: ['lots'] })
    onDone()
  }

  const save = useMutation({
    mutationFn: () =>
      patch(`/api/lots/${lot.id}`, {
        quantity: Number(quantity),
        condition,
        unit_cost_cents: cents,
        acquired_on: acquiredOn,
        location_id: locationId ? Number(locationId) : null,
        note: note.trim() || null,
      }),
    onSuccess: done,
  })
  const remove = useMutation({ mutationFn: () => del(`/api/lots/${lot.id}`), onSuccess: done })

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate()
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantity">
          <input className="input" type="number" min={1} max={10000} required value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </Field>
        <Field label="Condition">
          <select className="input" value={condition} onChange={(e) => setCondition(e.target.value as Condition)}>
            {CONDITIONS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Price per card (€)">
          <input className="input" inputMode="decimal" placeholder="unknown" value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>
        <Field label="Acquired on">
          <input className="input" type="date" required value={acquiredOn} onChange={(e) => setAcquiredOn(e.target.value)} />
        </Field>
        <Field label="Location">
          <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">Unfiled</option>
            {locations.data?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note">
          <input className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>

      {cents === undefined && <p className="text-sm text-danger">Price must look like 2,50.</p>}
      {(save.error || remove.error) && (
        <p role="alert" className="text-sm text-danger">
          {(save.error ?? remove.error)?.message}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn border-danger text-danger"
          disabled={remove.isPending}
          onClick={() => confirm('Delete this lot?') && remove.mutate()}
        >
          Delete
        </button>
        <span className="flex-1" />
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn-primary" disabled={save.isPending || cents === undefined}>
          Save
        </button>
      </div>
    </form>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="eyebrow">{label}</span>
      {children}
    </label>
  )
}
