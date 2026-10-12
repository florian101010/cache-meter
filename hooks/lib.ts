// Pure helpers of cache-meter: no `$`, so the tests call them directly.

import type { CacheInfo, Limit, Usage4 } from '../types'

export const HOUR = 3_600_000
export const FIVE_MIN = 300_000

export type TtlSource = 'eingestellt' | 'gemeldet' | 'angenommen'
export type Ttl = { ms: number; label: string; source: TtlSource }

/**
 * The cache's lifetime. Nothing in the API reports it per request, so:
 * a fixed setting wins; else what Claude Code reported on a model switch;
 * else 60m, dropping to 5m once a subscription window is used up (overage).
 */
export function resolveTtl(setting: string | undefined, reported: '5m' | '1h' | null, limits: readonly Limit[]): Ttl {
  if (setting === '60m') return { ms: HOUR, label: '60m', source: 'eingestellt' }
  if (setting === '5m') return { ms: FIVE_MIN, label: '5m', source: 'eingestellt' }
  if (reported === '1h') return { ms: HOUR, label: '60m', source: 'gemeldet' }
  if (reported === '5m') return { ms: FIVE_MIN, label: '5m', source: 'gemeldet' }
  const isOver = limits.some(l => l.percentUsed >= 100)

  return isOver
    ? { ms: FIVE_MIN, label: '5m', source: 'angenommen' }
    : { ms: HOUR, label: '60m', source: 'angenommen' }
}

/** Share of the request's input the cache served: read ÷ (new + read + written), whole percent. */
export function hitPct(u: Usage4): number | null {
  const all = u.input + u.read + u.write

  return all === 0 ? null : Math.round((u.read / all) * 100)
}

export type CacheStatus = { kind: 'empty' } | { kind: 'expired' } | { kind: 'warm'; remaining: number }

export function cacheStatus(cache: CacheInfo | null, now: number, ttlMs: number): CacheStatus {
  if (cache === null) return { kind: 'empty' }
  const remaining = cache.lastAt + ttlMs - now

  return remaining > 0 ? { kind: 'warm', remaining } : { kind: 'expired' }
}

/** `60m` down to `1m`, then `45s`. */
export function remainingLabel(ms: number): string {
  return ms >= 60_000 ? `${Math.ceil(ms / 60_000)}m` : `${Math.max(1, Math.ceil(ms / 1000))}s`
}

/** How many of `cells` are lit for the time left; a warm cache lights at least one. */
export function litCells(remaining: number, ttlMs: number, cells: number): number {
  if (remaining <= 0 || cells <= 0) return 0

  return Math.min(cells, Math.max(1, Math.ceil((remaining / ttlMs) * cells)))
}

export type Forecast = { icon: string; color: string }

// Single-width symbols, not emoji, so the row lines up in every terminal font
// (the lesson of the token-weather sample mod). Scaled to the auto-compact point.
const FORECAST: readonly { upTo: number; icon: string; color: string }[] = [
  { upTo: 25, icon: '☀', color: 'yellow' },
  { upTo: 50, icon: '☁', color: 'cyan' },
  { upTo: 75, icon: '☂', color: 'blue' },
  { upTo: 90, icon: '☇', color: 'magenta' },
  { upTo: Infinity, icon: '↯', color: 'red' },
]

export function forecast(percent: number, autoCompactPct: number | null): Forecast {
  const scale = autoCompactPct && autoCompactPct > 0 ? autoCompactPct : 100
  const share = (percent / scale) * 100
  const band = FORECAST.find(f => share < f.upTo) ?? { icon: '↯', color: 'red' }

  return { icon: band.icon, color: band.color }
}

const BARS = '▁▂▃▄▅▆▇█'

/** Block-character chart, scaled to the largest value shown. */
export function sparkline(values: readonly number[]): string {
  const top = Math.max(1, ...values)

  return values.map(v => BARS[Math.min(BARS.length - 1, Math.floor((v / top) * (BARS.length - 1)))]).join('')
}

export function short(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`

  return String(Math.round(n))
}

export function hhmm(ms: number): string {
  const d = new Date(ms)

  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Cells of each segment of a stacked bar whose full width stands for `top` tokens. */
export function stack(u: Usage4, top: number, width: number): { read: number; write: number; input: number } {
  if (top <= 0 || width <= 0) return { read: 0, write: 0, input: 0 }
  const cell = (n: number) => (n > 0 ? Math.max(1, Math.round((n / top) * width)) : 0)

  return { read: cell(u.read), write: cell(u.write), input: cell(u.input) }
}

/** `/keepwarm` argument → milliseconds of warming; `null` turns it off, `undefined` is unreadable. */
export function parseKeepWarm(args: string): number | null | undefined {
  const a = args.trim().toLowerCase()
  if (a === '') return 2 * HOUR
  if (a === 'aus' || a === 'off' || a === '0') return null
  const m = /^(\d{1,2})\s*(h|m|min)?$/.exec(a)
  if (!m) return undefined
  const n = Number.parseInt(m[1] ?? '', 10)
  const ms = m[2] === 'm' || m[2] === 'min' ? n * 60_000 : n * HOUR
  if (ms < 10 * 60_000 || ms > 8 * HOUR) return undefined

  return ms
}

/** When to ping: once less than this share of the TTL is left (10 min of 60m, 51 s of 5m). */
export const PING_SHARE = 0.17

export const ZERO: Usage4 = { input: 0, read: 0, write: 0, output: 0 }

export function add(a: Usage4, b: Usage4): Usage4 {
  return { input: a.input + b.input, read: a.read + b.read, write: a.write + b.write, output: a.output + b.output }
}
