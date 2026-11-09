export default function Brand() {
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" className="size-[30px] shrink-0">
        <circle cx="20" cy="20" r="16.5" stroke="var(--color-line)" strokeWidth="1.5" />
        <g stroke="var(--color-line)" strokeWidth="1.5" strokeLinecap="round">
          <line x1="20" y1="3.5" x2="20" y2="6.5" />
          <line x1="36.5" y1="20" x2="33.5" y2="20" />
          <line x1="20" y1="36.5" x2="20" y2="33.5" />
          <line x1="3.5" y1="20" x2="6.5" y2="20" />
        </g>
        <path d="M20 7 L23.5 20 L20 20 Z" fill="var(--color-focus)" />
        <path d="M20 7 L16.5 20 L20 20 Z" fill="var(--color-focus)" opacity="0.7" />
        <path d="M20 33 L23.5 20 L20 20 Z" fill="var(--color-muted)" />
        <path d="M20 33 L16.5 20 L20 20 Z" fill="var(--color-muted)" opacity="0.7" />
        <circle cx="20" cy="20" r="2" fill="var(--color-fg)" />
      </svg>
      <p className="font-display text-[22px] leading-none font-bold tracking-[0.02em] uppercase">Log Pose</p>
    </div>
  )
}
