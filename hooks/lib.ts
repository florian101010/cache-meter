// Pure helpers of cache-meter: no `$`, so the tests call them directly.

import type { CafeState } from './cafe'
import type { CacheInfo, ContextMap, Limit, LimitStart, ToolResults, Usage4 } from '../types'

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
  if (i.setting === '60m') return of('1h', 'cache-meter option')
  if (i.setting === '5m') return of('5m', 'cache-meter option')
  if (i.force5m) return of('5m', 'FORCE_PROMPT_CACHING_5M')
  const fromVariable = fixed(i.envTtl)
  if (fromVariable) return of(fromVariable, 'CLAUDE_CODE_PROMPT_CACHE_TTL')
  const setting = fixed(i.settingTtl)
  if (setting) return of(setting, 'promptCacheTtl')
  if (i.enable1h) return of('1h', 'ENABLE_PROMPT_CACHING_1H')
  if (i.limits.some(l => l.percentUsed >= 100)) return of('5m', 'assumed: plan limit reached')
  if (i.reported) return of(i.reported, 'reported on model switch')

  return of('1h', 'assumed: subscription')
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

// Single-width symbols, not emoji, so the row lines up in every terminal font.
// Scaled to the auto-compact point.
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


/** `/keepwarm` argument → milliseconds of warming; `null` turns it off, `undefined` is unreadable. */
export function parseKeepWarm(args: string): number | null | undefined {
  const a = args.trim().toLowerCase()
  if (a === '') return 2 * HOUR
  if (a === 'off' || a === '0') return null
  const m = /^(\d{1,3})\s*(h|m|min)?$/.exec(a)
  if (!m) return undefined
  const n = Number.parseInt(m[1] ?? '', 10)
  const ms = m[2] === 'm' || m[2] === 'min' ? n * 60_000 : n * HOUR
  if (ms < 10 * 60_000 || ms > 8 * HOUR) return undefined

  return ms
}

/**
 * `/keepwarm` arguments: a fixed run (`2h`, `30m`, nothing = 2h), `auto` with an optional break length
 * (`auto`, `auto 3h`; 2h when left out), or `off`. Undefined = unreadable.
 */
export function parseKeepCommand(args: string): { mode: 'run' | 'auto'; ms: number } | { mode: 'off' } | undefined {
  const a = args.trim().toLowerCase()
  const auto = /^auto(?:\s+(.*))?$/.exec(a)
  if (auto) {
    const ms = parseKeepWarm(auto[1] ?? '')
    return typeof ms === 'number' ? { mode: 'auto', ms } : undefined
  }
  const ms = parseKeepWarm(a)
  if (ms === undefined) return undefined

  return ms === null ? { mode: 'off' } : { mode: 'run', ms }
}

/** A length for the person: `2h`, `45m`, `1h 30m`. */
export function durationLabel(ms: number): string {
  const min = Math.round(ms / 60_000)
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}m`

  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** When to ping: once this share of the TTL or less is left (≈ 10 min of 60m). */
export const PING_SHARE = 0.17

/** Most pings one /keepwarm run makes (8 h at one ping per ≈ 50 min is about ten). */
export const MAX_PINGS = 12

/** A ping counts as a hit when it read at least this share of the context from the cache. */
export const PING_HIT_SHARE = 0.5

/** A ping that writes this share of what it read or more missed part of the cache. */
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

// ---------------------------------------------------------------------------------------------
// Drawing helpers for the pane: tall digits and colored cells for a Raster (reference › Elements:
// "Raster … cells"; types: RasterProps.cells = base64 of little-endian u32 triplets
// [codePoint, foreground, background], 0x01000000 = the terminal's default color).

/** Three-row block digits for the countdown, three columns each. */
const TALL: Readonly<Record<string, readonly [string, string, string]>> = {
  '0': ['█▀█', '█ █', '▀▀▀'],
  '1': ['▀█ ', ' █ ', '▀▀▀'],
  '2': ['▀▀█', '█▀▀', '▀▀▀'],
  '3': ['▀▀█', ' ▀█', '▀▀▀'],
  '4': ['█ █', '▀▀█', '  ▀'],
  '5': ['█▀▀', '▀▀█', '▀▀▀'],
  '6': ['█▀▀', '█▀█', '▀▀▀'],
  '7': ['▀▀█', '  █', '  ▀'],
  '8': ['█▀█', '█▀█', '▀▀▀'],
  '9': ['█▀█', '▀▀█', '▀▀▀'],
  '-': ['   ', '━━━', '   '],
}

/** `tall('58')` → three rows that draw 58 in block digits; unknown characters are skipped. */
export function tall(text: string): [string, string, string] {
  const glyphs = [...text].map(c => TALL[c]).filter((g): g is readonly [string, string, string] => g !== undefined)
  const row = (i: 0 | 1 | 2) => glyphs.map(g => g[i]).join(' ')

  return [row(0), row(1), row(2)]
}

export const DEFAULT_COLOR = 0x01000000

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Standard padded base64, without relying on a global the environment may not have. */
export function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? B64[n & 63]! : '='
  }

  return out
}

export type Cell = readonly [codePoint: number, fg: number, bg: number]

/** Packs cells as a Raster's `cells` string. */
export function rasterCells(cells: readonly Cell[]): string {
  const words = new Uint32Array(cells.length * 3)
  cells.forEach(([cp, fg, bg], i) => {
    words[i * 3] = cp
    words[i * 3 + 1] = fg
    words[i * 3 + 2] = bg
  })
  const bytes = new Uint8Array(words.length * 4)
  words.forEach((w, i) => {
    bytes[i * 4] = w & 255
    bytes[i * 4 + 1] = (w >>> 8) & 255
    bytes[i * 4 + 2] = (w >>> 16) & 255
    bytes[i * 4 + 3] = (w >>> 24) & 255
  })

  return base64(bytes)
}

/** Fill colors of the meters, as 0xRRGGBB (the terminal may round them to its palette, gallery › Raster). */
export const FILL = {
  warm: 0x40c070,
  low: 0xf0b030,
  cold: 0xe05060,
  context: 0x7088f0,
} as const

/** Colors of the request columns by hit rate: the same thresholds as the hit rate's text color. */
export const HEALTH = { good: 0x40c070, fair: 0xf0b030, poor: 0xe05060 } as const

export const TRACK = 0x45475a

/** A marker on a meter: the cell it sits on, its Raster color and the theme key the text bar uses. */
export type Mark = { at: number; color: number; theme: string }

/** A run of same-role characters of a meter; `role` is the index of a mark for a marker cell. */
export type Run = { text: string; role: 'fill' | 'track' | number }

/** Left-to-right partial blocks, 1/8 to 7/8 of a cell. */
const EIGHTHS = ['▏', '▎', '▍', '▌', '▋', '▊', '▉']

/** The cell a fraction (0…1) of a `width`-cell meter falls on. */
export function markAt(fraction: number, width: number): number {
  return Math.max(0, Math.min(width - 1, Math.round(fraction * width)))
}

/**
 * A one-row meter as runs: `fraction` of `width` cells filled, to an eighth of a cell, the rest a
 * dim track, markers drawn over both. One solid fill color, not a gradient: the terminal rounds
 * Raster colors to a smaller palette (gallery › Raster), which turned a gradient into bands.
 */
export function meterRuns(width: number, fraction: number, marks: readonly Mark[] = []): Run[] {
  const filled = Math.max(0, Math.min(1, fraction)) * width
  let full = Math.floor(filled)
  let part = Math.round((filled - full) * 8)
  if (part === 8) {
    full += 1
    part = 0
  }
  const runs: Run[] = []
  const push = (ch: string, role: Run['role']) => {
    const last = runs[runs.length - 1]
    if (last !== undefined && last.role === role) last.text += ch
    else runs.push({ text: ch, role })
  }
  for (let i = 0; i < width; i++) {
    const mark = marks.findIndex(m => m.at === i)
    if (mark >= 0) push('┃', mark)
    else if (i < full) push('█', 'fill')
    else if (i === full && part > 0) push(EIGHTHS[part - 1]!, 'fill')
    else push('░', 'track')
  }

  return runs
}

/** The meter's runs as Raster cells. */
export function meterCells(runs: readonly Run[], fill: number, marks: readonly Mark[] = []): Cell[] {
  return runs.flatMap(r =>
    [...r.text].map((ch): Cell => [
      ch.codePointAt(0)!,
      r.role === 'fill' ? fill : r.role === 'track' ? TRACK : (marks[r.role]?.color ?? TRACK),
      DEFAULT_COLOR,
    ]),
  )
}

/** Bottom-up partial blocks, 1/8 to 8/8 of a cell. */
const LEVELS = [0x2581, 0x2582, 0x2583, 0x2584, 0x2585, 0x2586, 0x2587, 0x2588]

/** One column of the request chart: its height as a share (0…1) and its color. */
export type Column = { share: number; color: number }

/**
 * A column chart `rows` tall, row-major from the top: one two-cell column per value, newest at the
 * right edge, heights to an eighth of a cell; any share above zero shows at least an eighth. Slots
 * without a value, and the bottom row under a zero, show a dim baseline.
 */
export function columnCells(values: readonly Column[], width: number, rows: number): Cell[] {
  const slots = Math.floor(width / 2)
  const shown = values.slice(-slots)
  const offset = slots - shown.length
  const cells: Cell[] = []
  for (let r = 0; r < rows; r++) {
    const fromBottom = rows - 1 - r
    for (let x = 0; x < width; x++) {
      const v = x < slots * 2 ? shown[Math.floor(x / 2) - offset] : undefined
      const levels = v === undefined ? 0 : v.share > 0 ? Math.max(1, Math.round(Math.min(1, v.share) * rows * 8)) : 0
      const level = Math.max(0, Math.min(8, levels - fromBottom * 8))
      if (level > 0 && v !== undefined) cells.push([LEVELS[level - 1]!, v.color, DEFAULT_COLOR])
      else if (fromBottom === 0) cells.push([LEVELS[0]!, TRACK, DEFAULT_COLOR])
      else cells.push([0x20, DEFAULT_COLOR, DEFAULT_COLOR])
    }
  }

  return cells
}

/**
 * Cache-read price as a multiple of the base input price, by model: 0.05× on Opus 5.5 and Sonnet
 * 5.5, 0.025× on Fable 5.1 and Mythos 5.1, 0.1× elsewhere. Source and how to keep these current:
 * CONTRIBUTING.md › Prices (pricing › Prompt caching, checked 2026-10-12).
 */
export function readMultiplier(model: string): number {
  if (/(opus|sonnet)-5-5/.test(model)) return 0.05
  if (/(fable|mythos)-5-1/.test(model)) return 0.025

  return 0.1
}

/** Cache-write price as a multiple of the base input price: 2× for a one-hour write, 1.25× for five minutes. */
export function writeMultiplier(ttlMs: number): number {
  return ttlMs >= HOUR ? 2 : 1.25
}

/**
 * The share of the input cost the cache saved, in percent, against sending every input token
 * uncached: negative when writing cost more than reading saved. Null before any input.
 */
export function cacheSaving(u: Usage4, readMult: number, writeMult: number): number | null {
  const all = u.input + u.read + u.write
  if (all === 0) return null
  const paid = u.input + u.read * readMult + u.write * writeMult

  return Math.round((1 - paid / all) * 100)
}

/** Right-aligns `text` in `width` columns. */
export function right(text: string, width: number): string {
  return text.length >= width ? text : ' '.repeat(width - text.length) + text
}

/** The parts of `$.session.usage`'s breakdown a context map reads (types: SessionContextBreakdown). */
export type BreakdownLike = {
  categories: readonly { name: string; tokens: number; kind: string }[]
  memoryFiles: readonly { path: string; tokens: number }[]
  mcpTools: readonly { name: string; serverName: string; tokens: number; isLoaded: boolean }[]
  agents: readonly { agentType: string; tokens: number }[]
  skills?: { totalSkills: number; includedSkills: number; tokens: number }
}

const heaviest = <T extends { tokens: number }>(items: readonly T[]): T[] =>
  [...items].filter(i => i.tokens > 0).sort((a, b) => b.tokens - a.tokens)

/** The heaviest shares of the context, from a breakdown: categories in use, memory files, MCP servers, agents, skills. */
export function contextMapOf(b: BreakdownLike, detail: ContextMap['detail'], at: number): ContextMap {
  // Loaded MCP tools summed per server (a plain record: the directory's scan reads Map.set like the shell's set).
  const servers: Record<string, { tokens: number; tools: number; toolNames: string[] }> = {}
  for (const tool of b.mcpTools) {
    if (!tool.isLoaded) continue
    const sum = servers[tool.serverName] ?? { tokens: 0, tools: 0, toolNames: [] }
    servers[tool.serverName] = { tokens: sum.tokens + tool.tokens, tools: sum.tools + 1, toolNames: [...sum.toolNames, tool.name] }
  }

  return {
    detail,
    at,
    categories: heaviest(b.categories.filter(c => c.kind === 'used')).map(c => ({ name: c.name, tokens: c.tokens })),
    // Kept home-shortened: other loaded mods can read this state (types: $.state).
    memoryFiles: heaviest(b.memoryFiles).map(f => ({ name: homePath(f.path), tokens: f.tokens })),
    mcpServers: heaviest(Object.entries(servers).map(([name, sum]) => ({ name, ...sum }))),
    deferredMcpTools: b.mcpTools.filter(t => !t.isLoaded).length,
    agents: heaviest(b.agents).map(a => ({ name: a.agentType, tokens: a.tokens })),
    skills: b.skills ? { total: b.skills.totalSkills, included: b.skills.includedSkills, tokens: b.skills.tokens } : null,
  }
}

/** A request that ended normally: its answer was complete, or it stopped to run tools. */
export function isNormalStop(reason: string | null): boolean {
  return reason === null || reason === 'end_turn' || reason === 'tool_use'
}

const STOP_LABELS: Readonly<Record<string, string>> = {
  max_tokens: 'output limit',
  model_context_window_exceeded: 'context full',
  compaction: 'compaction',
  refusal: 'refusal',
  pause_turn: 'paused',
  stop_sequence: 'stop sequence',
}

/** The stop reason in words (types: TurnStopReason). */
export function stopLabel(reason: string): string {
  return STOP_LABELS[reason] ?? reason
}

const ERROR_LABELS: Readonly<Record<string, string>> = {
  rate_limit: 'rate limit',
  overloaded: 'overloaded',
  max_output_tokens: 'output limit',
  server_error: 'server error',
  billing_error: 'billing',
  authentication_failed: 'authentication',
  invalid_request: 'invalid request',
  model_not_found: 'model not found',
}

/** The error a turn ended on, in words (types: SDKAssistantMessageError). */
export function errorLabel(error: string): string {
  return ERROR_LABELS[error] ?? error.replace(/_/g, ' ')
}

/** `{ a: 2, b: 1 }` → `a 2× · b 1×`, largest first; '' when empty. */
export function tally(counts: Readonly<Record<string, number>>, label: (key: string) => string = k => k): string {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${label(k)} ${n}×`)
    .join(' · ')
}

/** Adds one to `key`. */
export function bump(counts: Readonly<Record<string, number>>, key: string): Record<string, number> {
  return { ...counts, [key]: (counts[key] ?? 0) + 1 }
}

/** Calls of this session to any of a server's tools (wire names, as the context breakdown lists them). */
export function serverCalls(toolNames: readonly string[], calls: Readonly<Record<string, number>>): number {
  return toolNames.reduce((sum, name) => sum + (calls[name] ?? 0), 0)
}

/** At least this long between the first reading of a limit window and a forecast from it. */
export const FORECAST_MIN_MS = 10 * 60_000

/**
 * When a plan limit reaches 100 % at the pace since its first reading in this window, or null:
 * too early, no rise, no known reset time, or not before the window resets.
 */
export function limitForecast(
  start: { at: number; pct: number } | undefined,
  pct: number,
  now: number,
  resetsAt?: string,
): number | null {
  if (start === undefined || now - start.at < FORECAST_MIN_MS || pct <= start.pct || pct >= 100) return null
  const perMs = (pct - start.pct) / (now - start.at)
  const at = now + (100 - pct) / perMs
  // Without a reset time the window may free up first: no forecast rather than a wrong one.
  const reset = resetsAt === undefined ? Number.NaN : Date.parse(resetsAt)

  return !Number.isNaN(reset) && at < reset ? at : null
}

/** The line under an answer: what the turn cost and how well it hit the cache. Cost only when known. */
export function turnLine(u: Usage4, requests: number, usd: number | null, isPlan: boolean): string {
  const hit = hitPct(u)
  const cost = usd === null || usd < 0.005 ? '' : `${isPlan ? '≈ ' : ''}$${usd.toFixed(2)} ${isPlan ? 'API value' : 'spent'} · `
  const parts = [`${requests} request${requests === 1 ? '' : 's'}`, hit === null ? '' : `${hit}% from cache`, u.write >= 1000 ? `${short(u.write)} written to cache` : '']

  return `◉ Cache Meter · ${cost}${parts.filter(Boolean).join(' · ')}`
}

/** Two reset times of one limit window: under a minute apart (a reading may move by seconds). */
export function isSameReset(a: string, b: string): boolean {
  return Math.abs(Date.parse(a) - Date.parse(b)) < 60_000
}

/** Whether a limit window was already warned about: the same kind, and the same reset within a minute. */
export function isWarnedWindow(warned: readonly { kind: string; resetsAt: string }[], kind: string, resetsAt: string): boolean {
  return warned.some(w => w.kind === kind && isSameReset(w.resetsAt, resetsAt))
}

/**
 * Where each plan limit's pace starts: its first reading, renewed when the window reset (the
 * percentage fell, or the reset time moved), so the forecast does not die after the first reset.
 */
export function nextLimitStarts(
  prev: Readonly<Record<string, LimitStart>>,
  limits: readonly Limit[],
  now: number,
): Record<string, LimitStart> {
  const next: Record<string, LimitStart> = {}
  for (const l of limits) {
    const old = prev[l.kind]
    const resetsAt = l.resetsAt ?? null
    // A reset time that moves by a minute or more is a new window; under a minute, the same one read again.
    const isMoved = old?.resetsAt != null && resetsAt !== null && !isSameReset(resetsAt, old.resetsAt)
    const isNewWindow = old === undefined || l.percentUsed < old.pct || isMoved
    next[l.kind] = isNewWindow ? { at: now, pct: l.percentUsed, resetsAt } : old
  }

  return next
}

/**
 * A main request that re-wrote the cache although it was warm by the clock: something early in the
 * prompt changed (model, effort, tool definitions; prompt-caching › Actions that invalidate the cache –
 * editing CLAUDE.md is not one), or the real TTL is shorter than assumed. Not after a known cold point (start, /compact, a switch).
 */
export function isUnexpectedWrite(wasCold: boolean, hadCache: boolean, u: Usage4): boolean {
  return !wasCold && hadCache && u.write >= COLD_MIN && u.read < u.write
}

/** The note at a model switch while the cache is warm: what Claude Code estimates the switch re-writes. */
export function switchNote(tokens: number, usd: number, isKnownPrice: boolean, remainingMs: number | null): string {
  // 'catalog' (list price) and 'configured' (the organization's modelPricing) are known prices; 'default'
  // means the target model was unknown and a default tier was assumed (types: PreModelSwitch pricing).
  const price = `≈ $${usd.toFixed(2)}${isKnownPrice ? '' : ' (estimate)'}`
  const warm = remainingMs === null ? '' : ` · cache warm ${remainingLabel(remainingMs)} more`

  return `Model switch re-writes ${short(tokens)} tokens to the cache (${price})${warm} – after it expires, switching adds nothing`
}

/**
 * Whether changing effort keeps the cache on this model: on Opus 5.5, Sonnet 5.5, Haiku 5.5 and
 * Fable 5.1 with an API key or a subscription it does (prompt-caching › Changing effort level).
 */
export function effortKeepsCache(model: string): boolean {
  return /(opus|sonnet|haiku)-5-5|fable-5-1/.test(model)
}

/** What changed between two main requests that splits the cache: a model or an effort that does not keep it. */
export function requestChange(
  prev: { model: string; effort?: string | number } | null,
  next: { model: string; effort?: string | number },
): string | null {
  if (prev === null) return null
  if (prev.model !== next.model) return `model ${prev.model} → ${next.model}`
  if (prev.effort !== next.effort && prev.effort !== undefined && next.effort !== undefined && !effortKeepsCache(next.model)) {
    return `effort ${prev.effort} → ${next.effort}`
  }

  return null
}

/** MCP tools loaded before and after: how many came and went. */
export function toolDiff(before: readonly string[], after: readonly string[]): { added: number; removed: number } {
  const was = new Set(before)
  const is = new Set(after)

  return { added: [...is].filter(n => !was.has(n)).length, removed: [...was].filter(n => !is.has(n)).length }
}

/**
 * Why a warm cache was re-written, from what is observable: the model, an effort that splits the
 * cache, a pause longer than the real TTL, the tool set (only without tool search), an effort change on a model that keeps the
 * cache only with an API key or a subscription. The rest is named, not guessed
 * (prompt-caching › Actions that invalidate the cache).
 */
export function breakCause(i: {
  change: string | null
  effortOnly: string | null
  tools: { added: number; removed: number } | null
  idleMs: number | null
  ttlMs: number
}): string {
  if (i.change !== null) return `${i.change} – each splits the cache`
  if (i.idleMs !== null && i.idleMs >= FIVE_MIN && i.ttlMs > FIVE_MIN) {
    return `after ${duration(i.idleMs)} idle: the real TTL is likely 5m, not ${duration(i.ttlMs)} (option cacheTtl)`
  }
  if (i.tools !== null && (i.tools.added > 0 || i.tools.removed > 0)) {
    return `tool set changed (+${i.tools.added} / −${i.tools.removed} MCP tools)`
  }
  if (i.effortOnly !== null) return `${i.effortOnly} – keeps the cache on this model only with an API key or a subscription`

  return 'not observable here: fast mode turned on, a code-intelligence plugin (LSP tool), a tool deny rule, or removed images'
}

/** The expiry notification's text. */
export function expiryText(remainingMs: number, tokens: number): string {
  return `Prompt cache expires in ${remainingLabel(remainingMs)} – the next prompt would re-write ${short(tokens)} tokens. Type /keepwarm to keep it.`
}

/** A subagent's name in the Health tab: its type and task, else its id. */
export function agentLabel(entry: { type?: string; description?: string } | undefined, id: string): string {
  if (entry === undefined) return cleanLabel(id.slice(0, 12))
  const what = entry.description?.trim() ?? ''

  return cleanLabel(what === '' ? entry.type ?? id.slice(0, 12) : `${entry.type ?? 'agent'}: ${what}`)
}

/** A size in tokens, estimated from characters (÷ 4) – an estimate, labelled as one wherever it is drawn. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** A home directory as `~`, so paths stay short and screenshots show no user name. */
export function homePath(path: string): string {
  return path
    .replace(/^\/(?:Users|home|var\/home|export\/home)\/+[^/]+(?=\/|$)/, '~')
    .replace(/^\/volume\d+\/(?:homes|@home)\/[^/]+(?=\/|$)/, '~')
    .replace(/^\/root(?=\/|$)/, '~')
    .replace(/^\/mnt\/[a-z]\/Users\/[^/]+(?=\/|$)/i, '~')
    .replace(/^[A-Za-z]:[\\/]Users[\\/][^\\/]+(?=[\\/]|$)/i, '~')
}

/** The tools whose `file_path` / `notebook_path` is a file on disk (types: claude-code-tools). */
const FILE_TOOLS = new Set(['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

/** How credentials begin (GitHub, OpenAI/Stripe, Slack, AWS, Google, GitLab, Hugging Face, npm, PyPI, DigitalOcean, Shopify, Tailscale, Docker, Linear, Vault, age): never shown in a label. */
const SECRET_PREFIXES = 'gh[poursa]_|github_pat_|sk-|sk_|rk_(?:live|test)_|xox[abprs]-|xapp-|akia|asia|aiza|ya29\\.|glpat-|glrt-|glptt-|hf_|npm_|pypi-|dop_v1_|shpat_|tskey-|dckr_pat_|lin_api_|hvs\\.|age-secret-key-'
/** The same prefixes anywhere after a separator ("backup-ghp_…"), or a long run of letters and digits
 * mixed, as tokens and keys are: a path part like that is shown as "…" – masking a harmless name is the
 * cheaper mistake. */
const SECRET_INSIDE = new RegExp(`(^|[^A-Za-z0-9])(${SECRET_PREFIXES})`, 'i')

/** True for a path part that may hold a credential. */
export function isSecretLikePart(part: string): boolean {
  if (SECRET_INSIDE.test(part)) return true
  // base64 and dotted tokens too: + = . do not end a run.
  return (part.match(/[A-Za-z0-9_+=.-]{32,}/g) ?? []).some(run => /[A-Za-z]/.test(run) && /\d/.test(run))
}

/** A label as it is stored and shown: one line, no control characters, at most 80 characters (the end kept). */
export function cleanLabel(label: string): string {
  // Control characters, line breaks, and the invisible ones that could reorder or hide text (bidi, zero width).
  const one = label.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, ' ')

  return one.length > 80 ? `…${one.slice(-79)}` : one
}

/**
 * A tool call's label: the tool, plus for the file tools the home-shortened path and for Bash only the
 * program name – a command's arguments, a URL or a token never become part of it.
 */
export function toolLabel(tool: string, input: Readonly<Record<string, unknown>>): string {
  const path = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : null
  if (path !== null && FILE_TOOLS.has(tool)) {
    // A path, not a URL: anything with a scheme gives just the tool; a query or fragment is cut off.
    if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(path)) return tool

    // A path segment that may hold a credential (a file named after a token) is shown as "…".
    const shown = homePath(path.split(/[?#]/)[0] ?? '')
      .split(/([\\/])/)
      .map(part => (isSecretLikePart(part) ? '…' : part))
      .join('')

    return cleanLabel(`${tool} ${shown}`)
  }
  if (tool === 'Bash' && typeof input.command === 'string') {
    // Words are split where bash splits them – space, tab, newline – not on every Unicode space: a
    // no-break space inside an assignment's value must not end the value. Plain VAR=value prefixes go;
    // the first word left must look like a program name, else just "Bash": never a guess.
    const rest = input.command.replace(/^[ \t\n]+/, '').replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"$`\\]*"|'[^']*'|[A-Za-z0-9_.,:/@%+=-]*)[ \t\n]+)*/, '')
    const program = rest.split(/[ \t\n]+/)[0] ?? ''
    // A home directory itself is no program name (it would show the user name). The whole first word must
    // be a plain path – no $, quotes, ; | & or a leading - anywhere in it – before its last part is shown.
    if (homePath(program) === '~' || !/^[A-Za-z0-9_.+~/][A-Za-z0-9_.+~/-]*$/.test(program)) return tool
    const name = program.split('/').pop() ?? ''
    const isProgram = /^[A-Za-z0-9_.+][A-Za-z0-9_.+-]*$/.test(name) && name.length <= 32 && !isSecretLikePart(name) && !/\d{8}/.test(name)

    return isProgram ? `${tool} ${name}` : tool
  }

  return tool
}

/** Adds one tool result to the tally: per tool, and the five largest single results. */
export function addToolResult(prev: ToolResults, tool: string, label: string, tokens: number, at: number): ToolResults {
  const sum = prev.byTool[tool] ?? { count: 0, tokens: 0 }

  return {
    byTool: { ...prev.byTool, [tool]: { count: sum.count + 1, tokens: sum.tokens + tokens } },
    largest: [...prev.largest, { label, tokens, at }].sort((a, b) => b.tokens - a.tokens).slice(0, 5),
    since: prev.since,
  }
}

/**
 * Prompts until auto-compact at the pace of the last turns: the context sizes after each turn since the
 * last drop (a compaction), at least two rises. Null when auto-compact is off or unknown, or no pace.
 */
export function compactForecast(history: readonly number[], autoCompactPct: number | null, window: number): number | null {
  if (autoCompactPct === null || window <= 0 || history.length < 3) return null
  let start = 0
  history.forEach((size, i) => {
    if (i > 0 && size < (history[i - 1] ?? size)) start = i
  })
  const run = history.slice(start)
  const first = run[0]
  const last = run.at(-1)
  if (run.length < 3 || first === undefined || last === undefined) return null
  const pace = (last - first) / (run.length - 1)
  const left = (autoCompactPct / 100) * window - last
  if (pace <= 0) return null
  if (left <= 0) return 0

  return Math.ceil(left / pace)
}

/** Everything the session report needs, gathered from state; dollar figures only as Claude Code gave them. */
export type ReportData = {
  at: number
  ageMs: number | null
  prompts: number | null
  requests: number
  model: string | null
  usd: number | null
  isPlan: boolean
  hit: number | null
  saving: number | null
  cold: { count: number; written: number }
  warmMiss: { count: number; cause: string | null }
  context: { percent: number | null; tokens: number | null; autoCompactPct: number | null; promptsLeft: number | null }
  limits: { name: string; percentUsed: number }[]
  memoryFiles: { name: string; tokens: number }[]
  mcpServers: { name: string; tokens: number; calls: number }[]
  toolsByTool: { tool: string; count: number; tokens: number }[]
  largest: { label: string; tokens: number }[]
  agents: { label: string; steps: number; tokens: number; hit: number | null }[]
  keepwarm: { pings: number; readTokens: number; auto?: number | null }
}

/** A label as inline code in the report, so a crafted path or task cannot add Markdown. */
function code(text: string): string {
  return `\`${cleanLabel(text).replace(/`/g, "'")}\``
}

/** The session report `/tokens report` copies: Markdown, the same figures and labels as the pane. */
export function reportMarkdown(r: ReportData): string {
  const lines: string[] = []
  const usd = r.usd === null ? '–' : `${r.isPlan ? '≈ ' : ''}$${r.usd.toFixed(2)}${r.isPlan ? ' API value (subscription: a comparison, not a charge)' : ' spent'}`
  lines.push(`# Cache Meter – session report`, '')
  lines.push(`${new Date(r.at).toISOString().slice(0, 16).replace('T', ' ')} UTC${r.ageMs === null ? '' : ` · session ${duration(r.ageMs)}`}${r.model === null ? '' : ` · ${r.model}`}`, '')
  lines.push('## Cost and cache', '')
  lines.push(`- Cost: ${usd}${r.prompts ? ` · ${r.prompts} prompts · ${r.requests} requests` : ` · ${r.requests} requests`}`)
  lines.push(`- Cache hit rate: ${r.hit === null ? '–' : `${r.hit}%`}${r.saving === null ? '' : ` · cache saved ${r.saving}% of input cost`}`)
  lines.push(`- Cold re-writes: ${r.cold.count}${r.cold.count > 0 ? ` (${short(r.cold.written)} tokens)` : ''}`)
  lines.push(`- Warm misses: ${r.warmMiss.count}${r.warmMiss.cause === null ? '' : ` – last: ${r.warmMiss.cause}`}`)
  if (r.keepwarm.auto != null) lines.push(`- Keepwarm auto (breaks up to ${durationLabel(r.keepwarm.auto)}): ${r.keepwarm.pings} pings, ${short(r.keepwarm.readTokens)} tokens read`)
  else if (r.keepwarm.pings > 0) lines.push(`- Keepwarm: ${r.keepwarm.pings} pings, ${short(r.keepwarm.readTokens)} tokens read`)
  lines.push('', '## Context', '')
  lines.push(
    `- Fill: ${r.context.percent === null ? '–' : `${r.context.percent}%`}${r.context.tokens === null ? '' : ` (${short(r.context.tokens)} tokens)`}${r.context.autoCompactPct === null ? '' : ` · auto-compact at ${r.context.autoCompactPct}%`}${r.context.promptsLeft === null ? '' : ` · in ≈ ${r.context.promptsLeft} prompts at this pace`}`,
  )
  if (r.memoryFiles.length > 0) lines.push(`- Memory files: ${r.memoryFiles.map(f => `${code(f.name)} ${short(f.tokens)}`).join(', ')}`)
  if (r.mcpServers.length > 0) lines.push(`- MCP servers: ${r.mcpServers.map(m => `${code(m.name)} ${short(m.tokens)} (${m.calls} calls)`).join(', ')}`)
  if (r.toolsByTool.length > 0) {
    lines.push(`- Tool results (≈ tokens, characters ÷ 4): ${r.toolsByTool.map(t => `${t.tool} ${short(t.tokens)} in ${t.count}`).join(', ')}`)
    lines.push(`- Largest: ${r.largest.map(l => `${code(l.label)} ${short(l.tokens)}`).join(', ')}`)
  }
  if (r.agents.length > 0) {
    lines.push('', '## Subagents', '')
    for (const a of r.agents) lines.push(`- ${code(a.label)}: ${short(a.tokens)} tokens, ${a.steps} requests, ${a.hit === null ? '–' : `${a.hit}%`} hit`)
  }
  if (r.limits.length > 0) {
    lines.push('', '## Plan limits', '')
    for (const l of r.limits) lines.push(`- ${l.name}: ${l.percentUsed}%`)
  }
  lines.push('', '_Made with [Cache Meter](https://github.com/florian101010/cache-meter)._')

  return lines.join('\n')
}

/** The café's word for the cache: what the barista and the cup act out. */
export function cafeState(
  kind: 'empty' | 'warm' | 'expired',
  isLow: boolean,
  isWorking: boolean,
  isBeating: boolean,
  isBrewing: boolean,
): CafeState {
  if (isBeating) return 'ping'
  if (isBrewing) return 'brewing'
  if (isWorking) return 'working'
  if (kind === 'expired') return 'cold'
  if (kind === 'empty') return 'empty'

  return isLow ? 'last' : 'warm'
}

/** Ease-out (cubic) of a progress 0…1: fast first, gentle at the end. */
export function easeOut(t: number): number {
  const c = Math.max(0, Math.min(1, t))

  return 1 - (1 - c) ** 3
}

/** How far an animation that started at `start` and lasts `ms` has come at `now`: 0…1, eased. */
export function progress(start: number, now: number, ms: number): number {
  return ms <= 0 ? 1 : easeOut((now - start) / ms)
}

/** A value on its way from `from` to `to`, at an eased progress `p` (0…1). */
export function tween(from: number, to: number, p: number): number {
  return from + (to - from) * Math.max(0, Math.min(1, p))
}

/** A 24-bit colour mixed towards white by `amount` (0…1); the terminal-default marker stays as it is. */
export function lighten(color: number, amount: number): number {
  if (color === DEFAULT_COLOR) return color
  const mix = (v: number) => Math.round(v + (255 - v) * amount)

  return (mix((color >> 16) & 0xff) << 16) | (mix((color >> 8) & 0xff) << 8) | mix(color & 0xff)
}

/**
 * A shine passing over a one-row meter: the cell at `at` (and its neighbours, a little less) drawn
 * lighter. `at` outside the row leaves it unchanged.
 */
export function shineCells(cells: readonly Cell[], at: number): Cell[] {
  return cells.map((cell, x) => {
    const d = Math.abs(x - at)
    if (d > 1) return cell

    return [cell[0], lighten(cell[1], d === 0 ? 0.6 : 0.3), cell[2]]
  })
}

/** A single tool result this large, or larger, in the main conversation is worth a word. */
export const HOG_MIN = 10_000
export const HOG_SHARE = 0.02

/** Whether one tool result fills enough of the context to mention: max(10k, 2 % of the window) tokens. */
export function isContextHog(tokens: number, window: number): boolean {
  return tokens >= Math.max(HOG_MIN, window > 0 ? window * HOG_SHARE : 0)
}

/** The toast for a large tool result: what put how much into the context (an estimate), and why it matters. */
export function hogNote(label: string, tool: string, tokens: number): string {
  return `${label === '' ? tool : label} put ≈ ${short(tokens)} tokens into the context – sent again with every request until /compact`
}

/** A part of the context as a share of every request's context: "6%", "<1%", or '' when unknown. */
export function shareOfRequest(tokens: number, contextTokens: number | null): string {
  if (contextTokens === null || contextTokens <= 0 || tokens <= 0) return ''
  const pct = (tokens / contextTokens) * 100

  return pct < 1 ? '<1%' : `${Math.round(pct)}%`
}

/** The conversation's messages are worth a /compact note from this size and share of the context on. */
export const COMPACT_NOTE_MIN = 20_000
export const COMPACT_NOTE_SHARE = 0.25

/**
 * The Context tab's note on /compact, or null: only measured figures – the messages' size as Claude Code
 * counts it – and what /compact does by the docs (commands: "Free up context by summarizing the
 * conversation so far"; costs: compacting a large context "is itself a large request"). No saving is
 * promised: what the summary keeps is not known before.
 */
export function compactNote(messages: number | null, context: number | null): string | null {
  if (messages === null || context === null || context <= 0) return null
  if (messages < COMPACT_NOTE_MIN || messages < context * COMPACT_NOTE_SHARE) return null

  return `Messages ${short(messages)} (${Math.round((messages / context) * 100)}% of the context) are sent again with every request – /compact summarizes them to free space, itself one large request`
}

/** A plan limit worth a warning: half used or more, and full before it resets at this pace. */
export const LIMIT_NOTE_PCT = 50

/** The terminal width from which the fullscreen layout docks a pane beside the transcript (types: Pane.placement). */
export const DOCK_COLUMNS = 110

/**
 * Why the pane sits above the prompt and how it gets beside the chat, for a terminal only: on the main
 * screen `/tui fullscreen` (it saves the setting and relaunches with the conversation – fullscreen ›
 * Enable fullscreen rendering – so the mod's in-memory figures start over), in fullscreen a wider window. Null when it already
 * docks or nothing is known.
 */
export function dockTip(isFullscreen: boolean | undefined, columns: number | undefined, size: 'sentence' | 'line' | 'short'): string | null {
  if (isFullscreen === false) {
    if (size === 'short') return 'tip: /tui fullscreen puts this beside the chat'
    if (size === 'line') return `tip: /tui fullscreen puts this beside the chat as a sidebar (${DOCK_COLUMNS}+ columns; relaunches, figures start over)`

    return `tip: /tui fullscreen puts this beside the chat as a sidebar (from ${DOCK_COLUMNS} columns; Claude Code relaunches with the conversation, the meter starts over)`
  }
  if (isFullscreen === true && columns !== undefined && columns < DOCK_COLUMNS) {
    return size === 'short' ? `tip: ${DOCK_COLUMNS}+ columns put this beside the chat` : `tip: a window ${DOCK_COLUMNS} columns or wider puts this beside the chat as a sidebar`
  }

  return null
}

/** Which animation a failed surface module is (types: UiFaultInput.module, its path under the plugin's folder). */
export function faultTarget(module: string): 'cafe' | 'spin' | null {
  if (/(^|\/)cafe\.tsx$/.test(module)) return 'cafe'
  if (/(^|\/)spin\.tsx$/.test(module)) return 'spin'

  return null
}
