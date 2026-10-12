export type Usage4 = { input: number; read: number; write: number; output: number }

/** One main-thread model request as the API counted it, timed at the request's start. */
export type Step = Usage4 & { at: number; model: string; kind?: 'first' | 'cold' }

/** The main thread's prompt cache: when a request last touched it, and how well the last one hit it. */
export type CacheInfo = {
  /** Start of the request that last read or wrote the cache (the lifetime counts from there). 0 = known cold. */
  lastAt: number
  hitPct: number | null
  /** Tokens the next request re-sends, as far as known (input + read + write + output of the last response). */
  contextTokens: number
  /** What re-caching would cost, when the engine estimated it (resume, model switch). */
  rewriteUsd: number | null
  /** Why the cache is known cold although the clock cannot say (lastAt 0): a model switch or a resume. */
  coldReason: 'model' | 'resume' | null
  /** On a cold resume: how long the session had been idle, as Claude Code reported it. */
  idleBeforeMs: number | null
}

export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

/** A plan limit's first reading in its current window: where the pace for the forecast starts. */
export type LimitStart = { at: number; pct: number; resetsAt: string | null }

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
  /** When this session's usage began ($.session.usage().startedAt; /clear starts it over). */
  startedAt: number | null
  /** Prompts the user has sent this session ($.session.turns()). */
  prompts: number | null
  /** Per plan limit, the first reading of this window: the start of the pace for the forecast. */
  /** Absent in state an older version of the module wrote (it survives a reload). */
  limitStart?: Record<string, LimitStart>
}

/** Session sums; the cold-rewrite count and tokens are kept apart from the (capped) list of cold rewrites. */
export type Totals = { main: Usage4; sub: Usage4; mainSteps: number; subSteps: number; coldCount: number; coldWritten: number }

export type KeepWarm = { until: number | null; pings: number; readTokens: number; lastPingAt: number | null }

/** A main request that found the cache expired and wrote it anew: after a pause, a model switch, or a resume. */
export type ColdWrite = { at: number; written: number; cause: 'pause' | 'model' | 'resume'; idleMs: number | null }

/** A named share of the context, in tokens. */
export type ContextItem = { name: string; tokens: number }

/** Where the context goes, from $.session.usage's breakdown: the heaviest items, and how they were counted. */
export type ContextMap = {
  /** 'summary' = Claude Code's local estimate (free); 'full' = counted by the API on request, as /context does. */
  detail: 'summary' | 'full'
  at: number
  /** Categories that hold tokens (kind 'used'), heaviest first. */
  categories: ContextItem[]
  memoryFiles: ContextItem[]
  /** Loaded MCP tools summed per server; `tools` counts them. */
  /** `toolNames` is absent in a map an older version wrote; it is rewritten at the next reading. */
  mcpServers: (ContextItem & { tools: number; toolNames?: string[] })[]
  /** MCP tools behind tool search, not in the context until loaded. */
  deferredMcpTools: number
  agents: ContextItem[]
  skills: { total: number; included: number; tokens: number } | null
}

/** One server-side tool call (the API ran it, e.g. the advisor): no tool.call fires for these. */
export type ServerToolCall = { name: string; ms: number | null }

/** What went wrong or out of the ordinary this session, beyond the cache. */
export type Health = {
  /** Main requests by stop reason, only the ones that are not a normal end (end_turn, tool_use). */
  stops: Record<string, number>
  /** Errors a turn ended on (classic StopFailure), main conversation and subagents apart. */
  errors: Record<string, number>
  subErrors: Record<string, number>
  /** Server-side tool calls of the main conversation, summed per tool name. */
  serverTools: Record<string, { count: number; ms: number }>
  /** The server-side tool calls of the last main request that had any. */
  lastServerTools: { at: number; calls: ServerToolCall[] } | null
  /** MCP tool calls of this session by wire name (mcp__server__tool), to tell used servers from unused ones. */
  toolCalls?: Record<string, number>
  /**
   * Main requests that re-wrote the cache although it was warm by the clock: the model, effort or tool
   * set changed, or the real TTL is shorter than assumed. Optional fields here and above: state written
   * by an older version of the module survives a reload without them.
   */
  unexpected?: { count: number; written: number; lastAt: number | null; lastIdleMs: number | null; lastCause?: string | null }
  /** The expiry notification (option expiryNotice): how many went out and why the last one did not. */
  notice?: { sent: number; lastReason: string | null }
  /** Claude Code's own verdict on the cache against Cache Meter's, at model switches and resumes. */
  checks: { agreed: number; differed: number; last: { at: number; engineWarm: boolean; ourWarm: boolean; source: 'model' | 'resume' } | null }
}

/** One subagent's requests, summed: what it read from and wrote to its own cache. */
/** `model` is the last one seen; `isNamed` false while the type and task could not be looked up yet. */
export type AgentUse = Usage4 & { steps: number; label: string; model: string; isNamed?: boolean }

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
      coldWrites: ColdWrite[]
      contextMap: ContextMap | null
      health: Health
      agents: Record<string, AgentUse>
    }
  }
}
