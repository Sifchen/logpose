import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, post, type User } from './api.ts'
import Capture from './Capture.tsx'
import Collection from './Collection.tsx'
import Login from './Login.tsx'
import Brand from './Brand.tsx'

// only two screens so no router yet, add one when screens need their own urls
const SCREENS = { collection: 'Collection', capture: 'Add cards' } as const
type Screen = keyof typeof SCREENS

export default function App() {
  const queryClient = useQueryClient()
  const [screen, setScreen] = useState<Screen>('collection')
  // the server decides if we're logged in, we never guess
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/api/auth/me') })

  const logout = useMutation({
    mutationFn: () => post<void>('/api/auth/logout'),
    // forget everything cached for this user
    onSuccess: () => {
      queryClient.clear()
      queryClient.setQueryData(['me'], null)
    },
  })

  if (me.isPending) return null
  if (me.error instanceof ApiError && me.error.status === 401) return <Login />
  if (me.error) return <p className="p-6 text-danger">{me.error.message}</p>
  if (!me.data) return <Login />

  const nav = (Object.keys(SCREENS) as Screen[]).map((s) => (
    <button
      key={s}
      aria-current={screen === s ? 'page' : undefined}
      onClick={() => setScreen(s)}
      className={`grid h-9 grid-cols-[2px_1fr] items-center gap-3 rounded-chip pr-3 text-left text-sm transition-colors duration-(--d-quick) ${
        screen === s ? 'bg-raised font-semibold text-fg' : 'text-muted hover:bg-raised hover:text-fg'
      }`}
    >
      <span aria-hidden="true" className={`h-[18px] rounded-sm ${screen === s ? 'bg-focus' : ''}`} />
      {SCREENS[s]}
    </button>
  ))

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line-soft bg-sunk p-4 lg:flex">
        <div className="border-b border-line-soft pb-4">
          <Brand />
        </div>
        <nav className="flex flex-col gap-0.5 pt-4" aria-label="Main navigation">
          {nav}
        </nav>
        <div className="mt-auto space-y-2 border-t border-line-soft pt-4">
          <p className="truncate px-1.5 text-sm">{me.data.email}</p>
          <button className="btn w-full text-left" onClick={() => logout.mutate()}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <p className="font-display text-lg font-black tracking-[0.06em] uppercase">{SCREENS[screen]}</p>
          {/* no sidebar below lg, so the nav goes up here */}
          <nav className="ml-auto flex gap-1 lg:hidden" aria-label="Main navigation">
            {nav}
          </nav>
        </header>
        <main className="flex-1 p-4 sm:p-6">{screen === 'collection' ? <Collection /> : <Capture />}</main>
      </div>
    </div>
  )
}
