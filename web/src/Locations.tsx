import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, del, post, type Location } from './api.ts'

export default function LocationsDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal()
  }, [])

  const queryClient = useQueryClient()
  const locations = useQuery({ queryKey: ['locations'], queryFn: () => api<Location[]>('/api/locations') })
  const [name, setName] = useState('')

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['locations'] })
    queryClient.invalidateQueries({ queryKey: ['lots'] }) // lots show the location name
  }
  const add = useMutation({
    mutationFn: () => post('/api/locations', { name }),
    onSuccess: () => {
      setName('')
      refresh()
    },
  })
  const remove = useMutation({ mutationFn: (id: number) => del(`/api/locations/${id}`), onSuccess: refresh })

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-full max-w-sm rounded-xl border border-line bg-ink p-6 text-fg backdrop:bg-black/70"
    >
      <h2 className="mb-1 text-xl font-bold">Locations</h2>
      <p className="mb-4 text-sm text-muted">Binders, boxes, deck boxes. Deleting one keeps its cards.</p>

      <ul className="mb-4 divide-y divide-line-soft">
        {locations.data?.map((l) => (
          <li key={l.id} className="flex items-center justify-between py-2">
            <span>{l.name}</span>
            <button className="text-sm text-muted hover:text-danger" onClick={() => remove.mutate(l.id)}>
              Remove
            </button>
          </li>
        ))}
        {locations.data?.length === 0 && <li className="py-2 text-sm text-muted">None yet.</li>}
      </ul>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          add.mutate()
        }}
      >
        <input
          className="input"
          placeholder="e.g. Red binder"
          maxLength={60}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button className="btn-primary shrink-0" disabled={add.isPending}>
          Add
        </button>
      </form>
      {add.error && <p className="mt-2 text-sm text-danger">{add.error.message}</p>}

      <div className="mt-6 flex justify-end">
        <button className="btn" onClick={() => ref.current?.close()}>
          Done
        </button>
      </div>
    </dialog>
  )
}
