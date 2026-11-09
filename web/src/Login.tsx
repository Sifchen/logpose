import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { post, type User } from './api.ts'
import Brand from './Brand.tsx'

export default function Login() {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const login = useMutation({
    mutationFn: () => post<User>('/api/auth/login', { email, password }),
    // the response is the user, so put it straight into the "me" cache
    onSuccess: (user) => queryClient.setQueryData(['me'], user),
  })

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <form
        className="w-full max-w-sm space-y-4 rounded-panel border border-line-soft bg-surface p-8"
        onSubmit={(event) => {
          event.preventDefault()
          login.mutate()
        }}
      >
        <h1 className="sr-only">Log Pose</h1>
        <Brand />
        <p className="text-sm text-muted">Your One Piece TCG collection.</p>

        <label className="block space-y-1">
          <span className="eyebrow">Email</span>
          <input
            className="input"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span className="eyebrow">Password</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {login.error && (
          <p role="alert" className="text-sm text-danger">
            {login.error.message}
          </p>
        )}

        <button className="btn-primary w-full" disabled={login.isPending}>
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
