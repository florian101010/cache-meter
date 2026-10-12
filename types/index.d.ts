export type Usage4 = { input: number; read: number; write: number; output: number }

/** One model request as the API counted it. `agent` marks a subagent's loop. */
export type Step = Usage4 & { at: number; agent: boolean; model: string }

/** The main thread's prompt cache: when it was last touched, and how well the last request hit it. */
export type CacheInfo = {
  lastAt: number
  hitPct: number | null
  /** Tokens the next request re-sends (input + read + write + output of the last response). */
  contextTokens: number
  /** What re-caching would cost, when the engine estimated it (resume, model switch). */
  rewriteUsd: number | null
}

export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Measure = {
  percent: number | null
  tokens: number | null
  window: number
  /** Auto-compact threshold over the same window as `percent`; null when auto-compact is off. */
  autoCompactPct: number | null
  /** Context tokens after each main-thread turn, oldest first. */
  history: number[]
  limits: Limit[]
  usd: number | null
}

export type Totals = { main: Usage4; sub: Usage4; mainSteps: number; subSteps: number }

export type KeepWarm = { until: number | null; pings: number; readTokens: number; lastPingAt: number | null }

declare module 'claude-code' {
  interface PluginState {
    'cache-meter': {
      cache: CacheInfo | null
      steps: Step[]
      totals: Totals
      measure: Measure | null
      reportedTtl: '5m' | '1h' | null
      keepWarm: KeepWarm
    }
  }
}
