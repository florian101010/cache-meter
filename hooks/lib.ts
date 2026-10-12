// Pure helpers of cache-meter: no `$`, so the tests call them directly.

import type { CacheInfo, Limit, Usage4 } from '../types'

export const HOUR = 3_600_000
export const FIVE_MIN = 300_000

export type Ttl = { ms: number; label: string; source: string }

/** The mod's own option, then Claude Code's documented controls, then what can be inferred. */
export type TtlInputs = {
  setting: string | undefined
  force5m: boolean
  envTtl: string | null
  settingTtl: string | null
  enable1h: boolean
  reported: '5m' | '1h' | null
  limits: readonly Limit[]
}

const fixed = (v: string | null | undefined): '5m' | '1h' | null => (v === '5m' || v === '1h' ? v : null)
const of = (v: '5m' | '1h', source: string): Ttl =>
  v === '1h' ? { ms: HOUR, label: '60m', source } : { ms: FIVE_MIN, label: '5m', source }

/**
 * The main conversation's cache lifetime. The API reports it per request only as the split of
 * cache writes, which no mod event carries, so it is resolved here. Order after the mod's own option
 * is Claude Code's (code.claude.com/docs/en/prompt-caching § Choose the TTL yourself):
 * FORCE_PROMPT_CACHING_5M, CLAUDE_CODE_PROMPT_CACHE_TTL, promptCacheTtl, ENABLE_PROMPT_CACHING_1H,
 * then the default: one hour on a subscription within plan usage, five minutes once usage credits
 * are drawn (taken as a rate-limit window at 100 % or more). What a model switch reported comes
 * after the overage rule, since it can go stale.
 */
export function resolveTtl(i: TtlInputs): Ttl {
  if (i.setting === '60m') return of('1h', 'Einstellung cache-meter')
  if (i.setting === '5m') return of('5m', 'Einstellung cache-meter')
  if (i.force5m) return of('5m', 'FORCE_PROMPT_CACHING_5M')
  const env = fixed(i.envTtl)
  if (env) return of(env, 'CLAUDE_CODE_PROMPT_CACHE_TTL')
  const setting = fixed(i.settingTtl)
  if (setting) return of(setting, 'promptCacheTtl')
  if (i.enable1h) return of('1h', 'ENABLE_PROMPT_CACHING_1H')
  if (i.limits.some(l => l.percentUsed >= 100)) return of('5m', 'angenommen: Abo-Limit erreicht')
  if (i.reported) return of(i.reported, 'gemeldet beim Modellwechsel')

  return of('1h', 'angenommen: Abo')
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
  const m = /^(\d{1,3})\s*(h|m|min)?$/.exec(a)
  if (!m) return undefined
  const n = Number.parseInt(m[1] ?? '', 10)
  const ms = m[2] === 'm' || m[2] === 'min' ? n * 60_000 : n * HOUR
  if (ms < 10 * 60_000 || ms > 8 * HOUR) return undefined

  return ms
}

/** When to ping: once this share of the TTL or less is left (≈ 10 min of 60m). */
export const PING_SHARE = 0.17

/** Most pings one /keepwarm run makes (8 h at one ping per ≈ 50 min is about ten). */
export const MAX_PINGS = 12

/** A ping counts as a hit when it read at least this share of the context from the cache. */
export const PING_HIT_SHARE = 0.5

/** A ping that writes this share of what it read or more missed part of the cache (cache-tax's rule). */
export const PING_WRITE_SHARE = 0.1

/** A main request that finds the cache expired and writes at least this much counts as a cold rewrite. */
export const COLD_MIN = 10_000

/** `1h12m`, `45m`, `30s`. */
export function duration(ms: number): string {
  const m = Math.floor(ms / 60_000)
  if (m >= 60) return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
  if (m >= 1) return `${m}m`

  return `${Math.max(0, Math.round(ms / 1000))}s`
}

export const ZERO: Usage4 = { input: 0, read: 0, write: 0, output: 0 }

export function add(a: Usage4, b: Usage4): Usage4 {
  return { input: a.input + b.input, read: a.read + b.read, write: a.write + b.write, output: a.output + b.output }
}
