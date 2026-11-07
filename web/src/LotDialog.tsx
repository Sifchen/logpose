import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  api,
  CONDITIONS,
  del,
  patch,
  post,
  query,
  toCents,
  type Condition,
  type Location,
  type Lot,
  type Printing,
} from './api.ts'
import { useDebounced } from './useDebounced.ts'

// add a new lot (lot = null) or edit one
export default function LotDialog({ lot, onClose }: { lot: Lot | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  // showModal() gives focus trapping, escape and a backdrop for free.
  // the open check is for strict mode, it runs effects twice
  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal()
  }, [])

  const [printing, setPrinting] = useState<Printing | null>(lot?.printing ?? null)

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-full max-w-xl rounded-xl border border-line bg-ink p-6 text-fg backdrop:bg-black/70"
    >
      <h2 className="mb-4 text-xl font-bold">{lot ? 'Edit lot' : 'Add cards'}</h2>
      {printing ? (
        <LotForm
          lot={lot}
          printing={printing}
          onChangePrinting={lot ? undefined : () => setPrinting(null)}
          onDone={() => ref.current?.close()}
        />
      ) : (
        <PrintingPicker onPick={setPrinting} onCancel={() => ref.current?.close()} />
      )}
    </dialog>
  )
}

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

function PrintingPicker({ onPick, onCancel }: { onPick: (p: Printing) => void; onCancel: () => void }) {
  const [text, setText] = useState('')
  const q = useDebounced(text.trim())
  const results = useQuery({
    queryKey: ['printings', q],
    queryFn: () => api<Printing[]>('/api/printings' + query({ q })),
    enabled: q.length >= 2,
  })

  return (
    <div className="space-y-3">
      <input
        className="input"
        autoFocus
        placeholder="Card name or number, e.g. Nami or OP01-016"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <ul className="max-h-96 space-y-1 overflow-y-auto">
        {results.data?.map((p) => (
          <li key={p.id}>
            <button className="w-full rounded-md p-2 text-left hover:bg-raised" onClick={() => onPick(p)}>
              <PrintingLabel printing={p} />
            </button>
          </li>
        ))}
        {results.data?.length === 0 && <li className="p-2 text-sm text-muted">No card found.</li>}
      </ul>
      <div className="flex justify-end">
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function LotForm({
  lot,
  printing,
  onChangePrinting,
  onDone,
}: {
  lot: Lot | null
  printing: Printing
  onChangePrinting?: () => void
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const locations = useQuery({ queryKey: ['locations'], queryFn: () => api<Location[]>('/api/locations') })

  const [quantity, setQuantity] = useState(String(lot?.quantity ?? 1))
  const [condition, setCondition] = useState<Condition>(lot?.condition ?? 'NM')
  const [cost, setCost] = useState(lot?.unit_cost_cents != null ? (lot.unit_cost_cents / 100).toFixed(2) : '')
  // sv-SE gives YYYY-MM-DD in local time, toISOString() would be UTC
  const [acquiredOn, setAcquiredOn] = useState(() => lot?.acquired_on ?? new Date().toLocaleDateString('sv-SE'))
  const [locationId, setLocationId] = useState(lot?.location ? String(lot.location.id) : '')
  const [note, setNote] = useState(lot?.note ?? '')

  const cents = toCents(cost)
  const done = () => {
    queryClient.invalidateQueries({ queryKey: ['lots'] })
    onDone()
  }

  const save = useMutation({
    mutationFn: () => {
      const body = {
        quantity: Number(quantity),
        condition,
        unit_cost_cents: cents,
        acquired_on: acquiredOn,
        location_id: locationId ? Number(locationId) : null,
        note: note.trim() || null,
      }
      return lot ? patch(`/api/lots/${lot.id}`, body) : post('/api/lots', { ...body, printing_id: printing.id })
    },
    onSuccess: done,
  })
  const remove = useMutation({ mutationFn: () => del(`/api/lots/${lot!.id}`), onSuccess: done })

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate()
      }}
    >
      <div className="flex items-center justify-between gap-3 rounded-md bg-surface p-2">
        <PrintingLabel printing={printing} />
        {onChangePrinting && (
          <button type="button" className="btn shrink-0" onClick={onChangePrinting}>
            Change
          </button>
        )}
      </div>

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
            <option value="">—</option>
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
        {lot && (
          <button
            type="button"
            className="btn border-danger text-danger"
            disabled={remove.isPending}
            onClick={() => confirm('Delete this lot?') && remove.mutate()}
          >
            Delete
          </button>
        )}
        <span className="flex-1" />
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button className="btn-primary" disabled={save.isPending || cents === undefined}>
          {lot ? 'Save' : 'Add to collection'}
        </button>
      </div>
    </form>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold tracking-widest text-muted uppercase">{label}</span>
      {children}
    </label>
  )
}
