import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  api,
  CONDITIONS,
  del,
  euros,
  patch,
  post,
  query,
  type Condition,
  type Location,
  type Lot,
  type Printing,
} from './api.ts'
import { clamp, DRAW_SPAN, FAN_MIN_SCALE, placeCard } from './fan.ts'
import { CardArt, ColorChips, Flip } from './Grid.tsx'
import { Field } from './LotForm.tsx'
import { groupByPrinting } from './totals.ts'
import { useDebounced } from './useDebounced.ts'

type Added = Record<number, { lot: Lot; count: number }> // per printing id

export default function Capture() {
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [language, setLanguage] = useState('EN')
  const [condition, setCondition] = useState<Condition>('NM')
  const [locationId, setLocationId] = useState('')
  // what got added on this visit, for the +N badge and undo
  const [added, setAdded] = useState<Added>({})

  // "OP01" matches the whole set, "Nami" every nami. same search as the collection filter
  const q = useDebounced(text.trim())
  const searching = q.length >= 2
  const locations = useQuery({ queryKey: ['locations'], queryFn: () => api<Location[]>('/api/locations') })
  const printings = useQuery({
    queryKey: ['printings', q, language],
    queryFn: () => api<Printing[]>('/api/printings' + query({ q, language, limit: 500 })),
    enabled: searching,
    placeholderData: keepPreviousData, // keep the old fan while the new one loads
  })
  const owned = useQuery({
    queryKey: ['lots', 'search', q],
    queryFn: () => api<Lot[]>('/api/lots' + query({ q, limit: 2000 })),
    enabled: searching,
    placeholderData: keepPreviousData,
  })
  const ownedCount = new Map(groupByPrinting(owned.data ?? []).map((g) => [g.printing.id, g.quantity]))

  const remember = (printingId: number, lot: Lot | null, step: number) =>
    setAdded((current) => {
      const next = { ...current }
      const count = (current[printingId]?.count ?? 0) + step
      if (lot && count > 0) next[printingId] = { lot, count }
      else delete next[printingId]
      return next
    })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['lots'] })

  // same scope so the clicks run one after another, in order
  const addOne = useMutation({
    scope: { id: 'capture' },
    mutationFn: (printing: Printing) =>
      post<Lot>('/api/lots/add-one', {
        printing_id: printing.id,
        condition,
        location_id: locationId ? Number(locationId) : null,
      }),
    onSuccess: (lot) => {
      remember(lot.printing.id, lot, +1)
      refresh()
    },
  })
  const removeOne = useMutation({
    scope: { id: 'capture' },
    mutationFn: (lot: Lot) =>
      lot.quantity > 1
        ? patch<Lot>(`/api/lots/${lot.id}`, { quantity: lot.quantity - 1 })
        : del(`/api/lots/${lot.id}`).then(() => null),
    onSuccess: (lot, old) => {
      remember(old.printing.id, lot, -1)
      refresh()
    },
  })
  const addedTotal = Object.values(added).reduce((sum, a) => sum + a.count, 0)
  const cards = searching ? printings.data : undefined

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="col-span-2">
          <Field label="Set or card">
            <input
              className="input"
              autoFocus
              placeholder="OP01, ST10, Nami…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Language">
          <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option>EN</option>
            <option>JP</option>
          </select>
        </Field>
        <Field label="Condition">
          <select className="input" value={condition} onChange={(e) => setCondition(e.target.value as Condition)}>
            {CONDITIONS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
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
      </div>

      {(addOne.error || removeOne.error || printings.error) && (
        <p role="alert" className="text-sm text-danger">
          {(addOne.error ?? removeOne.error ?? printings.error)?.message}
        </p>
      )}

      {!searching && (
        <p className="py-16 text-center text-muted">Type a set code like OP01, or a card name, to deal out the cards.</p>
      )}
      {cards?.length === 0 && <p className="py-16 text-center text-muted">No {language} cards match “{q}”.</p>}
      {cards && cards.length > 0 && (
        <div className={printings.isPlaceholderData ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <Fan
            key={`${cards[0].id}-${cards.length}`}
            printings={cards}
            ownedCount={ownedCount}
            added={added}
            // undo waits until the adds are done, the lot is still changing
            busy={addOne.isPending || removeOne.isPending}
            onAdd={(p) => addOne.mutate(p)}
            onRemove={(lot) => removeOne.mutate(lot)}
          />
        </div>
      )}

      <p className="text-center font-mono text-xs text-muted" aria-live="polite">
        {addedTotal > 0 && `${addedTotal} cards added this visit`}
      </p>
    </div>
  )
}

const STEP_PX = 70 // drag this far to move one card
const WHEEL_STEP = 60 // scroll this far to move one card

// click a side card to bring it to the front, click the front card to add it.
// swipe, drag, scroll or arrow keys to move through
function Fan({
  printings,
  ownedCount,
  added,
  busy,
  onAdd,
  onRemove,
}: {
  printings: Printing[]
  ownedCount: Map<number, number>
  added: Added
  busy: boolean
  onAdd: (p: Printing) => void
  onRemove: (lot: Lot) => void
}) {
  const count = printings.length
  const [lead, setLead] = useState(0)
  const [progress, setProgress] = useState(0) // how many cards we're dragged, can be 0.4
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ x: number; moved: boolean } | null>(null)
  const swallowClick = useRef(false) // a drag ends with a click, don't add a card then
  const deck = useRef<HTMLDivElement>(null)

  const step = (by: number) => setLead((l) => clamp(l + by, count))

  // native listener because react's onWheel is passive and can't stop the page from scrolling
  useEffect(() => {
    const el = deck.current
    if (!el) return
    let total = 0
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      total += Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (Math.abs(total) >= WHEEL_STEP) {
        setLead((l) => clamp(l + Math.sign(total), count))
        total = 0
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [count])

  const front = printings[lead]
  const mine = added[front.id]

  return (
    <div className="@container flex flex-col items-center gap-3">
      <div
        ref={deck}
        role="group"
        aria-label="Matching cards. Arrow keys move, Enter adds the front card"
        className="relative isolate w-full touch-pan-y select-none"
        style={
          {
            height: 'calc(var(--stack-lead) * 7 / 5 + 0.5rem)',
            // clamped so the outer cards never leave the box
            '--fan-reach': `min(var(--fan-reach-max), calc(50cqw - var(--stack-lead) * ${FAN_MIN_SCALE / 2} - 0.5rem))`,
          } as CSSProperties
        }
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault()
            step(e.key === 'ArrowLeft' ? -1 : 1)
          }
        }}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, moved: false }
          swallowClick.current = false
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          const dx = e.clientX - drag.current.x
          if (!drag.current.moved && Math.abs(dx) > 8) {
            drag.current.moved = true
            setDragging(true)
            // only capture once it's a real drag, otherwise a normal click wouldn't reach the card
            e.currentTarget.setPointerCapture(e.pointerId)
          }
          if (drag.current.moved) setProgress(clamp(lead - dx / STEP_PX, count) - lead)
        }}
        onPointerUp={() => {
          if (drag.current?.moved) {
            setLead(clamp(Math.round(lead + progress), count))
            swallowClick.current = true
          }
          drag.current = null
          setDragging(false)
          setProgress(0)
        }}
        onPointerCancel={() => {
          drag.current = null
          setDragging(false)
          setProgress(0)
        }}
        onDragStart={(e) => e.preventDefault()}
      >
        {printings.map((p, index) => {
          const offset = index - lead - progress
          if (Math.abs(offset) > DRAW_SPAN) return null
          const isFront = index === lead
          return (
            <button
              key={p.id}
              type="button"
              aria-label={
                isFront
                  ? `Add ${p.name}, ${p.card_number} ${p.variant}, ${ownedCount.get(p.id) ?? 0} owned`
                  : `Bring ${p.card_number} ${p.variant} forward`
              }
              onClick={() => {
                if (swallowClick.current) {
                  swallowClick.current = false
                  return
                }
                if (isFront) onAdd(p)
                else setLead(index)
              }}
              style={{
                ...placeCard(offset),
                // no transition while dragging so it follows the finger
                transition: dragging
                  ? 'none'
                  : 'transform var(--d-move) var(--ease-arrive), opacity var(--d-move) var(--ease-arrive)',
              }}
              className="group absolute top-1 left-1/2 ml-[calc(var(--stack-lead)/-2)] aspect-[5/7] w-(--stack-lead) origin-bottom rounded-tile"
            >
              <FanCard
                printing={p}
                isFront={isFront}
                owned={ownedCount.get(p.id) ?? 0}
                added={isFront ? mine?.count : undefined}
              />
            </button>
          )
        })}
      </div>

      <div aria-hidden="true" className="flex flex-col items-center gap-1 text-center">
        <p className="text-base leading-tight font-semibold">{front.name}</p>
        <p className="flex items-center gap-2 font-mono text-2xs font-semibold tracking-[0.06em] uppercase">
          <ColorChips colors={front.colors} />
          <span className="text-muted">{front.card_number}</span> · {front.language} {front.variant} ·{' '}
          {front.set_code}
        </p>
      </div>
      <p className="font-mono text-sm font-semibold tabular-nums">
        {front.trend_cents == null ? (
          <span className="text-2xs tracking-[0.06em] text-muted uppercase">no Cardmarket match</span>
        ) : (
          euros(front.trend_cents)
        )}
      </p>
      {mine && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onRemove(mine.lot)}
          className="rounded-chip border border-line px-3 py-1 font-mono text-2xs font-semibold text-muted transition-colors duration-(--d-quick) hover:border-focus hover:text-fg disabled:opacity-50"
        >
          − one
        </button>
      )}
      <p className="eyebrow">
        {lead + 1} / {count}
      </p>
    </div>
  )
}

// face down until the image is loaded, then it flips
function FanCard({
  printing,
  isFront,
  owned,
  added,
}: {
  printing: Printing
  isFront: boolean
  owned: number
  added?: number
}) {
  const [ready, setReady] = useState(false)
  const onReady = useCallback(() => setReady(true), [])
  return (
    <Flip up={ready}>
      <span
        className={`relative block h-full w-full overflow-hidden rounded-tile ${
          isFront
            ? 'border-2 border-focus transition-[filter] active:brightness-125'
            : 'border border-line-soft group-hover:border-focus'
        }`}
      >
        <CardArt printing={printing} lazy={false} priority={isFront} onReady={onReady} />
        {isFront && (
          <>
            <span className="absolute top-2 right-1.5 rounded-chip border border-line bg-ink/85 px-1.5 font-mono text-2xs font-semibold tabular-nums">
              ×{owned}
            </span>
            {added !== undefined && (
              // key = count so the animation plays on every click
              <span
                key={added}
                style={{ animation: 'stamp var(--d-quick) var(--ease-arrive)' }}
                className="absolute top-2 left-1.5 rounded-chip bg-focus px-1.5 font-mono text-2xs font-semibold text-sunk tabular-nums"
              >
                +{added}
              </span>
            )}
          </>
        )}
      </span>
    </Flip>
  )
}
