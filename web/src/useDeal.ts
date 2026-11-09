import { useEffect, useState } from 'react'

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

// how many tiles are flipped so far, one more every stepMs
export function useDeal(total: number, stepMs = 40): number {
  const [dealt, setDealt] = useState(() => (reducedMotion() ? Infinity : 0))
  useEffect(() => {
    if (dealt >= total) return
    const id = setTimeout(() => setDealt((d) => d + 1), stepMs)
    return () => clearTimeout(id)
  }, [dealt, total, stepMs])
  return dealt
}
