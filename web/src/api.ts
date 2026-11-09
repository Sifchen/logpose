export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// fetch for our api, throws ApiError on anything that isn't 2xx
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new ApiError(response.status, errorText(body.detail) ?? response.statusText)
  }
  return response.status === 204 ? (undefined as T) : response.json()
}

// fastapi sends a string for our own errors and a list for validation errors
function errorText(detail: unknown): string | undefined {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg)
}

const send = <T>(method: string, path: string, body?: unknown) =>
  api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })

export const post = <T>(path: string, body?: unknown) => send<T>('POST', path, body)
export const patch = <T>(path: string, body: unknown) => send<T>('PATCH', path, body)
export const del = (path: string) => send<void>('DELETE', path)

export function query(params: Record<string, string | number | null | undefined>): string {
  const filled = Object.entries(params).filter(([, v]) => v !== '' && v != null)
  return filled.length ? '?' + new URLSearchParams(filled.map(([k, v]) => [k, String(v)])) : ''
}

export type User = { id: number; email: string }
export type CardSet = { id: number; code: string; name: string }
export type Location = { id: number; name: string }
export type Printing = {
  id: number
  card_number: string
  name: string
  set_code: string
  rarity: string
  variant: string
  language: string
  colors: string[]
  image_url: string | null
  trend_cents: number | null // null = no match we trust
}
export type PriceStatus = { updated_on: string | null; priced_printings: number }
export type Lot = {
  id: number
  quantity: number
  condition: Condition
  acquired_on: string
  unit_cost_cents: number | null
  note: string | null
  location: Location | null
  printing: Printing
}

export const CONDITIONS = ['NM', 'EX', 'GD', 'LP', 'PL', 'PO'] as const
export type Condition = (typeof CONDITIONS)[number]

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
export const euros = (cents: number) => eur.format(cents / 100)

// "2,50" or "2.50" -> 250, "" -> null, anything else -> undefined (invalid)
export function toCents(text: string): number | null | undefined {
  const t = text.trim()
  if (t === '') return null
  if (!/^\d+([.,]\d{1,2})?$/.test(t)) return undefined
  // done on the string so 0.29 doesn't turn into 28.999... cents
  const [whole, fraction = ''] = t.split(/[.,]/)
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}
