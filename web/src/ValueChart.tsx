import { useEffect, useRef, useState } from 'react'
import { euros } from './api.ts'
import { nearest, niceTicks } from './chart.ts'

export type ValuePoint = { day: string; value_cents: number }

const H = 200
const PAD = { left: 64, right: 12, top: 12, bottom: 28 }
const wholeEuros = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const dayLabel = (day: string) => new Date(day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

// drawn at the real pixel width so the text doesn't scale with it
export function ValueChart({ points }: { points: ValuePoint[] }) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)

  // always mounted so it gets measured before the data is there
  useEffect(() => {
    const el = box.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={box} className="relative">
      {points.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">No prices yet for the cards you own.</p>
      ) : (
        <Plot points={points} width={width} />
      )}
    </div>
  )
}

function Plot({ points, width }: { points: ValuePoint[]; width: number }) {
  const [active, setActive] = useState<number | null>(null)
  const values = points.map((p) => p.value_cents / 100)
  const ticks = niceTicks(Math.min(...values), Math.max(...values))
  const lo = ticks[0]
  const hi = ticks.at(-1)!
  const t0 = Date.parse(points[0].day)
  const t1 = Date.parse(points.at(-1)!.day)
  const plotW = width - PAD.left - PAD.right
  const x = (day: string) => (t1 === t0 ? PAD.left + plotW / 2 : PAD.left + ((Date.parse(day) - t0) / (t1 - t0)) * plotW)
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom)
  const xs = points.map((p) => x(p.day))
  const ys = values.map(y)
  const line = xs.map((px, i) => `${i ? 'L' : 'M'}${px},${ys[i]}`).join('')
  const area = `${line}L${xs.at(-1)},${H - PAD.bottom}L${xs[0]},${H - PAD.bottom}Z`
  const last = points.length - 1
  const shown = active ?? last

  return (
    <>
      <svg
        width={width}
        height={H}
        tabIndex={0}
        role="img"
        aria-label={`Collection value, ${dayLabel(points[0].day)} to ${dayLabel(points[last].day)}. Arrow keys read each day.`}
        className="block touch-pan-y outline-offset-4"
        onPointerMove={(e) => setActive(nearest(xs, e.clientX - e.currentTarget.getBoundingClientRect().left))}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(last)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
          e.preventDefault()
          setActive((i) => Math.min(last, Math.max(0, (i ?? last) + (e.key === 'ArrowLeft' ? -1 : 1))))
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--color-line-soft)" />
            <text x={PAD.left - 8} y={y(t)} dy="0.35em" textAnchor="end" className="fill-muted font-mono text-2xs">
              {wholeEuros.format(t)}
            </text>
          </g>
        ))}
        <text x={xs[0]} y={H - 8} textAnchor={points.length > 1 ? 'start' : 'middle'} className="fill-muted font-mono text-2xs">
          {dayLabel(points[0].day)}
        </text>
        {points.length > 1 && (
          <text x={xs[last]} y={H - 8} textAnchor="end" className="fill-muted font-mono text-2xs">
            {dayLabel(points[last].day)}
          </text>
        )}

        <path d={area} fill="var(--color-focus)" opacity={0.1} />
        <path d={line} fill="none" stroke="var(--color-focus)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {active !== null && (
          <line x1={xs[active]} x2={xs[active]} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--color-line)" />
        )}
        <circle cx={xs[shown]} cy={ys[shown]} r={4} fill="var(--color-focus)" stroke="var(--color-surface)" strokeWidth={2} />
      </svg>

      {active !== null && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-chip border border-line bg-ink px-2 py-1 whitespace-nowrap shadow-lg"
          style={{ left: Math.min(Math.max(xs[active], 60), width - 60) }}
        >
          <span className="font-mono text-sm font-semibold tabular-nums">{euros(points[active].value_cents)}</span>{' '}
          <span className="text-2xs text-muted">{dayLabel(points[active].day)}</span>
        </div>
      )}
      {/* for keyboard and screen reader users */}
      <p className="sr-only" aria-live="polite">
        {active !== null && `${dayLabel(points[active].day)}: ${euros(points[active].value_cents)}`}
      </p>

      {points.length === 1 && (
        <p className="mt-1 text-center text-2xs text-muted">
          Prices are fetched once a day, so the line grows by one point each day from here.
        </p>
      )}

      <table className="sr-only">
        <caption>Collection value by day</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.day}>
              <th scope="row">{p.day}</th>
              <td>{euros(p.value_cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
