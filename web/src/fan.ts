import type { CSSProperties } from 'react'

export const FAN_MIN_SCALE = 0.62
// cards drawn on each side. past ~5 they're piled up anyway, and every drawn
// card loads its image
export const DRAW_SPAN = 8

const SOFTNESS = 1.35 // how fast the fan spreads out
const MAX_TILT = 10 // degrees
const MIN_OPACITY = 0.35 // faded cards are still clickable, so keep them visible

// offset = distance to the front card, negative is left. tanh never goes past 1,
// so 4 cards and 150 cards take the same width. it's a float while dragging
export function placeCard(offset: number): CSSProperties {
  const spread = Math.tanh(Math.abs(offset) / SOFTNESS)
  const side = Math.sign(offset)
  const scale = 1 - (1 - FAN_MIN_SCALE) * spread
  return {
    transform: `translateX(calc(var(--fan-reach) * ${side * spread})) scale(${scale}) rotate(${side * spread * MAX_TILT}deg)`,
    opacity: Math.max(MIN_OPACITY, 1 - Math.abs(offset) * 0.15),
    // closer cards cover the ones behind them
    zIndex: 1000 - Math.round(Math.abs(offset) * 10),
  }
}

export const clamp = (index: number, count: number) => Math.min(count - 1, Math.max(0, index))

// transform that puts the card exactly over the tile, animate from this to
// `none` and it flies out of the tile. null if one of them is hidden
export function fromTile(tile: DOMRect, card: DOMRect): string | null {
  if (!tile.width || !card.width) return null
  const dx = tile.left + tile.width / 2 - (card.left + card.width / 2)
  const dy = tile.top + tile.height / 2 - (card.top + card.height / 2)
  return `translate(${dx}px, ${dy}px) scale(${tile.width / card.width})`
}
