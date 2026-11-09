// round axis values (steps of 1, 2 or 5 x 10^n) for min..max.
// never a step below 1 so the euro labels don't repeat
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    // only one value, give it some room above and below
    const pad = Math.max(1, Math.abs(min) * 0.1)
    min -= pad
    max += pad
  }
  const raw = (max - min) / count
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw)!)
  const ticks = []
  for (let t = Math.floor(min / step) * step; t < max + step; t += step) ticks.push(t)
  return ticks
}

// where the crosshair snaps to
export function nearest(xs: number[], px: number): number {
  let best = 0
  for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - px) < Math.abs(xs[best] - px)) best = i
  return best
}
