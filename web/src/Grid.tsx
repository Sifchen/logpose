import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { euros, type Printing } from './api.ts'
import type { PrintingGroup } from './totals.ts'
import { useDeal } from './useDeal.ts'

const GAME_COLORS: Record<string, string> = {
  red: 'var(--color-game-red)',
  green: 'var(--color-game-green)',
  blue: 'var(--color-game-blue)',
  purple: 'var(--color-game-purple)',
  yellow: 'var(--color-game-yellow)',
  black: 'var(--color-game-black)',
}

export function ColorChips({ colors }: { colors: string[] }) {
  return (
    <span aria-hidden="true" className="flex shrink-0 gap-[3px]">
      {colors.map((c) => (
        <span
          key={c}
          className="size-2.5 rounded-[3px] border border-ink/70"
          style={{ background: GAME_COLORS[c.toLowerCase()] ?? 'var(--color-muted)' }}
        />
      ))}
    </span>
  )
}

// onReady fires once there's something to show, the image or the placeholder
export function CardArt({
  printing,
  alt = '',
  lazy = true,
  priority = false,
  onReady,
}: {
  printing: Printing
  alt?: string
  lazy?: boolean // false if it's always on screen, like in the fan
  priority?: boolean // load this one first
  onReady?: () => void
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!printing.image_url) onReady?.()
  }, [printing.image_url, onReady])

  return printing.image_url && !failed ? (
    <img
      src={printing.image_url}
      alt={alt}
      loading={lazy ? 'lazy' : 'eager'}
      fetchPriority={priority ? 'high' : 'auto'}
      draggable={false}
      // cached images can be done before react attaches onLoad
      ref={(img) => {
        if (img?.complete && img.naturalWidth > 0) onReady?.()
      }}
      onLoad={onReady}
      onError={() => {
        setFailed(true)
        onReady?.()
      }}
      className="h-full w-full object-cover"
    />
  ) : (
    <span className="flex h-full w-full flex-col items-center justify-center gap-2 bg-sunk">
      <span className="eyebrow">No image yet</span>
      <span className="font-mono text-2xs text-muted">{printing.card_number}</span>
    </span>
  )
}

// not used inside tiles, a link inside a button is invalid html
export function CardmarketPrice({ printing }: { printing: Printing }) {
  const link = 'underline decoration-dotted underline-offset-2 transition-colors duration-(--d-quick) hover:text-focus'
  return printing.trend_cents == null ? (
    <a
      href={printing.cardmarket_url}
      target="_blank"
      rel="noopener noreferrer"
      title="No trusted match yet: search Cardmarket for this card"
      className={`text-2xs tracking-[0.06em] text-muted uppercase ${link}`}
    >
      no match ↗
    </a>
  ) : (
    <a
      href={printing.cardmarket_url}
      target="_blank"
      rel="noopener noreferrer"
      title="Open on Cardmarket"
      className={`tabular-nums ${link}`}
    >
      {euros(printing.trend_cents)}
    </a>
  )
}

// perspective outside, rotation in the middle, two faces with backface-hidden
export function Flip({ up, children }: { up: boolean; children: ReactNode }) {
  return (
    <span className="block h-full w-full perspective-[900px]">
      <span
        className="relative block h-full w-full transition-transform duration-(--d-flip) ease-arrive transform-3d"
        style={up ? undefined : { transform: 'rotateY(180deg)' }}
      >
        <span className="absolute inset-0 backface-hidden">{children}</span>
        <span
          aria-hidden="true"
          className="absolute inset-0 overflow-hidden rounded-tile border border-line-soft bg-sunk backface-hidden"
          style={{ transform: 'rotateY(180deg)' }}
        >
          <span className="absolute inset-1 rounded-[3px] border border-line" />
          <span className="absolute inset-0 grid place-items-center font-display text-2xs font-bold tracking-[0.22em] text-muted/60">
            LOG POSE
          </span>
        </span>
      </span>
    </span>
  )
}

export function CardTile({
  printing,
  count,
  rank,
  dealt,
  onClick,
}: {
  printing: Printing
  count: number
  rank?: number
  dealt: boolean
  onClick: (tile: DOMRect) => void
}) {
  const [ready, setReady] = useState(false)
  const onReady = useCallback(() => setReady(true), [])
  const price = printing.trend_cents == null ? 'no Cardmarket match' : `${euros(printing.trend_cents)} each`
  return (
    <button
      type="button"
      onClick={(e) => onClick(e.currentTarget.getBoundingClientRect())}
      // aria-label replaces the content, so it needs everything that's on the tile
      aria-label={`${printing.name}, ${printing.card_number}, ${printing.language}, ${count} owned, ${price}`}
      className="block aspect-[5/7] w-full text-left transition-[translate] duration-(--d-move) ease-arrive hover:-translate-y-1 motion-reduce:hover:translate-y-0"
    >
      {/* face down until it's its turn and the image is loaded */}
      <Flip up={dealt && ready}>
        <span className="flex h-full w-full flex-col overflow-hidden rounded-tile border border-line-soft bg-surface transition-[border-color] duration-(--d-quick) hover:border-line">
          <span className="relative flex min-h-0 flex-1">
            <CardArt printing={printing} alt={printing.name} onReady={onReady} />
            {rank !== undefined && (
              <span className="absolute top-1.5 left-1.5 rounded-chip bg-sunk/80 px-1 font-mono text-2xs font-semibold text-muted">
                #{rank}
              </span>
            )}
            <span className="absolute top-1.5 right-1.5 rounded-chip border border-line bg-ink/80 px-1.5 font-mono text-2xs font-semibold tabular-nums">
              ×{count}
            </span>
          </span>
          <span className="flex items-center gap-1.5 border-t border-line-soft bg-ink px-1.5 py-1">
            <ColorChips colors={printing.colors} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-2xs text-muted tabular-nums">
                {printing.card_number} · {printing.language}
                {printing.variant !== 'base' && ` · ${printing.variant}`}
              </span>
              {printing.trend_cents == null ? (
                <span className="block font-mono text-2xs tracking-[0.06em] text-muted uppercase">no match</span>
              ) : (
                <span className="block font-mono text-xs font-semibold tabular-nums">{euros(printing.trend_cents)}</span>
              )}
            </span>
          </span>
        </span>
      </Flip>
    </button>
  )
}

// passes the tile's position on click so the card can fly out of it
export function CollectionGrid({
  groups,
  ranked,
  onOpen,
}: {
  groups: PrintingGroup[]
  ranked: boolean // show #1, #2... when sorted by worth
  onOpen: (group: PrintingGroup, tile: DOMRect) => void
}) {
  const dealt = useDeal(groups.length)
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {groups.map((group, index) => (
        <li key={group.printing.id}>
          <CardTile
            printing={group.printing}
            count={group.quantity}
            rank={ranked && group.value != null ? index + 1 : undefined}
            dealt={index < dealt}
            onClick={(tile) => onOpen(group, tile)}
          />
        </li>
      ))}
    </ul>
  )
}
