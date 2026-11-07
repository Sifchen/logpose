import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, post, type User } from './api.ts'
import Collection from './Collection.tsx'
import Login from './Login.tsx'

export default function App() {
  const queryClient = useQueryClient()
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

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-line-soft bg-ink px-6 py-3">
        <span className="text-lg font-black tracking-wide">Logpose</span>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted">{me.data.email}</span>
          <button className="btn" onClick={() => logout.mutate()}>
            Sign out
          </button>
        </div>
      </header>
      <main>
        <Collection />
      </main>
    </div>
  )
}
