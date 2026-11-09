import { useEffect, useRef, useState } from 'react'
import { euros, type Lot } from './api.ts'
import { fromTile } from './fan.ts'
import { CardArt } from './Grid.tsx'
import { LotForm, PrintingLabel } from './LotForm.tsx'
import type { PrintingGroup } from './totals.ts'

const FLY_MS = 320
const FLIP_MS = 460 // same as --d-flip
const EASE = 'cubic-bezier(0.2, 0.7, 0.2, 1)' // same as --ease-arrive
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

// the outer div flies the card out of the tile, the inner one flips it.
// two elements so the two transforms don't overwrite each other
export default function CardDialog({
  group,
  origin,
  lot,
  onClose,
}: {
  group: PrintingGroup
  origin: DOMRect // the tile or table thumbnail that was clicked
  lot?: Lot // from a table row, open this lot's form right away
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const flyer = useRef<HTMLDivElement>(null)
  const leaving = useRef(false)
  const [turned, setTurned] = useState(false)
  // one lot goes straight to the form, more than one shows the list first
  const [editing, setEditing] = useState<Lot | null>(lot ?? (group.lots.length === 1 ? group.lots[0] : null))
  const p = group.printing

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal()
    const el = flyer.current
    const from = el && fromTile(origin, el.getBoundingClientRect())
    if (!el || !from || reducedMotion()) {
      setTurned(true)
      return
    }
    const flight = el.animate([{ transform: from }, { transform: 'none' }], { duration: FLY_MS, easing: EASE })
    // strict mode runs this twice and cancels the first one, that's fine
    flight.finished.then(() => setTurned(true), () => {})
    return () => flight.cancel()
  }, [origin])

  const leave = () => {
    if (leaving.current) return
    leaving.current = true
    const el = flyer.current
    const back = el && fromTile(origin, el.getBoundingClientRect())
    if (!el || !back || reducedMotion()) return onClose()
    setTurned(false)
    el.animate([{ transform: 'none' }, { transform: back }], { duration: FLIP_MS, easing: EASE, fill: 'forwards' })
      .finished.then(onClose, onClose)
  }

  return (
    <dialog
      ref={dialog}
      aria-label={`${p.card_number} ${p.name}`}
      // escape and clicking outside fly the card back first
      onCancel={(e) => {
        e.preventDefault()
        leave()
      }}
      onClick={(e) => e.target === e.currentTarget && leave()}
      className="h-[min(86vh,38rem)] w-[min(92vw,26rem)] overflow-visible bg-transparent p-0 text-fg backdrop:bg-black/70"
    >
      <div ref={flyer} className="h-full w-full perspective-[1200px]">
        <div
          className="relative h-full w-full transition-transform duration-(--d-flip) ease-arrive transform-3d"
          style={turned ? { transform: 'rotateY(180deg)' } : undefined}
        >
          {/* front */}
          <div
            aria-hidden="true"
            className="absolute inset-0 overflow-hidden rounded-tile border border-line bg-sunk shadow-2xl backface-hidden"
          >
            <CardArt printing={p} lazy={false} />
          </div>

          {/* back */}
          <div
            className="absolute inset-0 flex flex-col gap-4 overflow-y-auto overscroll-contain rounded-tile border border-line bg-ink p-5 shadow-2xl backface-hidden"
            style={{ transform: 'rotateY(180deg)' }}
          >
            <PrintingLabel printing={p} />
            <p className="font-mono text-xs text-muted tabular-nums">
              ×{group.quantity} owned
              {p.trend_cents != null && ` · ${euros(p.trend_cents)} each · ${euros(p.trend_cents * group.quantity)}`}
            </p>

            {editing ? (
              <LotForm
                key={editing.id}
                lot={editing}
                onDone={leave}
                onCancel={group.lots.length > 1 ? () => setEditing(null) : leave}
              />
            ) : (
              <>
                <p className="eyebrow">{group.lots.length} lots · pick one to edit</p>
                <ul className="space-y-1">
                  {group.lots.map((lot) => (
                    <li key={lot.id}>
                      <button
                        className="grid w-full grid-cols-[3rem_3rem_1fr_auto] gap-3 rounded-chip p-2 text-left font-mono text-sm hover:bg-raised"
                        onClick={() => setEditing(lot)}
                      >
                        <span className="font-semibold">×{lot.quantity}</span>
                        <span>{lot.condition}</span>
                        <span className="truncate text-muted">{lot.location?.name ?? 'Unfiled'}</span>
                        <span className="text-muted">{lot.acquired_on}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto flex justify-end">
                  <button className="btn" onClick={leave}>
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </dialog>
  )
}
