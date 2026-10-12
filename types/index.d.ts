export type Usage4 = { input: number; read: number; write: number; output: number }

/** One main-thread model request as the API counted it, timed at the request's start. */
export type Step = Usage4 & { at: number; model: string }

/** The main thread's prompt cache: when a request last touched it, and how well the last one hit it. */
export type CacheInfo = {
  /** Start of the request that last read or wrote the cache (the lifetime counts from there). 0 = known cold. */
  lastAt: number
  hitPct: number | null
  /** Tokens the next request re-sends, as far as known (input + read + write + output of the last response). */
  contextTokens: number
  /** What re-caching would cost, when the engine estimated it (resume, model switch). */
  rewriteUsd: number | null
}

export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Measure = {
  percent: number | null
  tokens: number | null
  window: number
  /** Auto-compact threshold over the same window as `percent`; null while unknown or when off. */
  autoCompactPct: number | null
  /** True when the session reported auto-compact as switched off. */
  isAutoCompactOff: boolean
  /** The window the auto-compact figure was computed for; 0 = compute again. */
  autoCompactWindow: number
  /** Context tokens after each main-thread turn, oldest first. */
  history: number[]
  limits: Limit[]
  usd: number | null
}

export type Totals = { main: Usage4; sub: Usage4; mainSteps: number; subSteps: number }

export type KeepWarm = { until: number | null; pings: number; readTokens: number; lastPingAt: number | null }

/** The TTL controls Claude Code documents (prompt-caching § Choose the TTL yourself), read at start. */
export type TtlConfig = { force5m: boolean; envTtl: string | null; settingTtl: string | null; enable1h: boolean }

declare module 'claude-code' {
  interface PluginState {
    'cache-meter': {
      cache: CacheInfo | null
      steps: Step[]
      totals: Totals
      measure: Measure | null
      reportedTtl: '5m' | '1h' | null
      keepWarm: KeepWarm
      ttlConfig: TtlConfig
    }
  }
}
