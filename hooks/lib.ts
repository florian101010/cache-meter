// Pure helpers of cache-meter: no `$`, so the tests call them directly.

import type { CacheInfo, ContextMap, Limit, Usage4 } from '../types'

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
  if (a === 'off' || a === '0') return null
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
    memoryFiles: heaviest(b.memoryFiles).map(f => ({ name: f.path, tokens: f.tokens })),
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
 * When a plan limit reaches 100 % at the pace since its first reading in this session, or null:
 * too early, no rise, or not before the window resets.
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
  const reset = resetsAt === undefined ? Number.NaN : Date.parse(resetsAt)

  return Number.isNaN(reset) || at < reset ? at : null
}

/** The line under an answer: what the turn cost and how well it hit the cache. Cost only when known. */
export function turnLine(u: Usage4, requests: number, usd: number | null, isPlan: boolean): string {
  const hit = hitPct(u)
  const cost = usd === null || usd < 0.005 ? '' : `${isPlan ? '≈ ' : ''}$${usd.toFixed(2)} ${isPlan ? 'API value' : 'spent'} · `
  const parts = [`${requests} request${requests === 1 ? '' : 's'}`, hit === null ? '' : `${hit}% from cache`, u.write >= 1000 ? `${short(u.write)} written to cache` : '']

  return `◉ Cache Meter · ${cost}${parts.filter(Boolean).join(' · ')}`
}

/**
 * Where each plan limit's pace starts: its first reading, renewed when the window reset (the
 * percentage fell, or the reset time moved), so the forecast does not die after the first reset.
 */
export function nextLimitStarts(
  prev: Readonly<Record<string, { at: number; pct: number; resetsAt: string | null }>>,
  limits: readonly { kind: string; percentUsed: number; resetsAt?: string }[],
  now: number,
): Record<string, { at: number; pct: number; resetsAt: string | null }> {
  const next: Record<string, { at: number; pct: number; resetsAt: string | null }> = {}
  for (const l of limits) {
    const old = prev[l.kind]
    const resetsAt = l.resetsAt ?? null
    const isNewWindow = old === undefined || l.percentUsed < old.pct || (old.resetsAt !== null && resetsAt !== null && resetsAt !== old.resetsAt)
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
export function switchNote(tokens: number, usd: number, isListPrice: boolean, remainingMs: number | null): string {
  const price = `≈ $${usd.toFixed(2)}${isListPrice ? '' : ' (estimate)'}`
  const warm = remainingMs === null ? '' : ` · cache warm ${remainingLabel(remainingMs)} more`

  return `Model switch re-writes ${short(tokens)} tokens to the cache (${price})${warm} – after it expires, switching adds nothing`
}
