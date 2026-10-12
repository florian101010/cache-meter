// cache-meter: what the prompt cache and the token budget are doing, at a glance.
//
// Band above the prompt:  ● cache 42m ■■■■■■■□□□ 93% hit · ☀ context 9% (auto-compact 97%) [Compact]
// Pane /tokens:           every main-thread request as a stacked bar (read / written / new), session
//                         sums, subagents, rate limits, cost, keepwarm.
// /keepwarm [2h|off]:     pings the cache through $.model.fork shortly before it lapses.
//
// Single source of truth for every API fact below: the official Claude Code mods documentation and
// its pages (links in CONTRIBUTING.md) and the type declaration of the running build
// (.claude-plugin/types/claude-code/index.d.ts) — not memory. Sections cited as "interface § …",
// "prompt-caching § …" etc. are pages of that documentation.
//
// Sources: turn.step (each request's four token counts), session.measure (context, limits, cost),
// $.session.usage summary (auto-compact point, estimated locally), classic.SessionStart (resume:
// time since the last response; /clear, /resume, /branch reset $.state), classic.PostModelSwitch
// (the engine's own cache_ttl and re-cache estimate).

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CacheInfo, ColdWrite, Health, KeepWarm, Measure, ServerToolCall, Totals, TtlConfig, Usage4 } from '../types'
import {
  COLD_MIN,
  HOUR,
  MAX_PINGS,
  PING_HIT_SHARE,
  PING_SHARE,
  PING_WRITE_SHARE,
  ZERO,
  add,
  isUnexpectedWrite,
  limitForecast,
  nextLimitStarts,
  serverCalls,
  switchNote,
  turnLine,
  cacheStatus,
  duration,
  forecast,
  hhmm,
  hitPct,
  litCells,
  meterCells,
  meterRuns,
  markAt,
  columnCells,
  cacheSaving,
  readMultiplier,
  writeMultiplier,
  FILL,
  HEALTH,
  parseKeepWarm,
  rasterCells,
  remainingLabel,
  resolveTtl,
  right,
  short,
  sparkline,
  stack,
  tall,
  contextMapOf,
  isNormalStop,
  bump,
  tally,
  stopLabel,
  errorLabel,
} from './lib'
import type { BreakdownLike, Mark } from './lib'

const PANE = 'cache-meter'
const TICK_MS = 15_000
// From this context fill a cold cache is worth a hint to compact before the next prompt re-writes it all.
const COMPACT_HINT_PCT = 50
const STEPS_KEPT = 80

const cacheA = atom({ plugin: 'cache-meter', key: 'cache' } as const, null)
const stepsA = atom({ plugin: 'cache-meter', key: 'steps' } as const, [])
const totalsA = atom({ plugin: 'cache-meter', key: 'totals' } as const, {
  main: ZERO,
  sub: ZERO,
  mainSteps: 0,
  subSteps: 0,
  coldCount: 0,
  coldWritten: 0,
})
const measureA = atom({ plugin: 'cache-meter', key: 'measure' } as const, null)
const ttlA = atom({ plugin: 'cache-meter', key: 'reportedTtl' } as const, null)
const keepA = atom({ plugin: 'cache-meter', key: 'keepWarm' } as const, {
  until: null,
  pings: 0,
  readTokens: 0,
  lastPingAt: null,
})
const coldA = atom({ plugin: 'cache-meter', key: 'coldWrites' } as const, [])
const contextMapA = atom({ plugin: 'cache-meter', key: 'contextMap' } as const, null)
const healthA = atom({ plugin: 'cache-meter', key: 'health' } as const, {
  stops: {},
  errors: {},
  subErrors: {},
  serverTools: {},
  lastServerTools: null,
  checks: { agreed: 0, differed: 0, last: null },
  toolCalls: {},
  unexpected: { count: 0, written: 0, lastAt: null },
})
const ttlConfigA = atom({ plugin: 'cache-meter', key: 'ttlConfig' } as const, {
  force5m: false,
  envTtl: null,
  settingTtl: null,
  enable1h: false,
})

// Module values the top-level helpers read: the option (fixed per load), whether a person is at the
// prompt, a ping in flight, and how many main-thread requests are running. None is drawn, and a reload
// runs session.start again, so losing them costs nothing (interface § Keep state).
let setting = 'auto'
let isInteractive = false
let isPinging = false
let mainRequests = 0
// The line under each answer (option turnLine), and per open turn the session cost at its start and
// its main requests. Keyed by turnId; a reload loses at most the line of the turn that was running.
let showTurnLine = true
let openTurns: Record<string, { usd: number | null; requests: number }> = {}
// Where the surface last seated the pane: beside a fullscreen transcript (dock) or above the prompt (inline).
let seat: 'dock' | 'inline' | null = null
// Opening the dashboard as a sidebar by itself (option autoSidebar): only once the band has been drawn
// fullscreen, once per load, and never again after the person closed it.
let autoSidebar = 'auto'
let isFullscreenSeen = false
let hasAutoOpened = false
let isDismissed = false
// The pane's open tab; a reload starts on the overview again.
const TABS = ['overview', 'context', 'health'] as const
let tab: (typeof TABS)[number] = 'overview'

async function ttlNow($: EngineInterface) {
  const measure = await read($, measureA)
  const config = await read($, ttlConfigA)

  return resolveTtl({ setting, ...config, reported: await read($, ttlA), limits: measure?.limits ?? [] })
}

// The TTL controls a session runs under (prompt-caching § Choose the TTL yourself). Read at start
// and after /clear, /resume, /branch, which reset $.state (interface § Load a saved value again).
async function loadTtlConfig($: EngineInterface) {
  let settingTtl: string | null = null
  try {
    const settings: Record<string, unknown> = await $.settings.read()
    settingTtl = typeof settings.promptCacheTtl === 'string' ? settings.promptCacheTtl : null
  } catch {
    settingTtl = null
  }
  const config: TtlConfig = {
    force5m: (await $.env.get('FORCE_PROMPT_CACHING_5M')) === '1',
    envTtl: (await $.env.get('CLAUDE_CODE_PROMPT_CACHE_TTL')) ?? null,
    settingTtl,
    enable1h: (await $.env.get('ENABLE_PROMPT_CACHING_1H')) === '1',
  }
  await update($, ttlConfigA, () => config)
}

// A first reading, so the band has the window and the auto-compact point before any turn.
async function measureNow($: EngineInterface) {
  try {
    const usage = await $.session.usage({ breakdown: 'summary' })
    const now = await $.clock.now()
    const auto = autoCompactOf(usage.context.breakdown, usage.context.window)
    await update($, measureA, m => ({
      percent: usage.context.percent ?? null,
      tokens: usage.context.tokens ?? null,
      window: usage.context.window,
      autoCompactPct: auto.pct,
      isAutoCompactOff: auto.isOff,
      autoCompactWindow: auto.isKnown ? usage.context.window : 0,
      history: m?.history ?? [],
      limits: usage.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
      usd: usage.cost?.usd ?? null,
      startedAt: usage.startedAt,
      prompts: m?.prompts ?? null,
      limitStart: nextLimitStarts(m?.limitStart ?? {}, usage.rateLimits, now),
    }))
    await mapContext($, usage.context.breakdown, 'summary')
  } catch {
    // No reading: the band waits for the first session.measure.
  }
}

// Where the context goes, from a breakdown of $.session.usage (types: SessionContextBreakdown).
// 'summary' is Claude Code's local estimate and sends no request; 'full' counts with the API.
async function mapContext($: EngineInterface, breakdown: unknown, detail: 'summary' | 'full') {
  if (breakdown === undefined || breakdown === null) return
  try {
    const at = await $.clock.now()
    const map = contextMapOf(breakdown as BreakdownLike, detail, at)
    await update($, contextMapA, () => map)
  } catch {
    // A breakdown of another shape: keep the last map.
  }
}

// The exact count behind the Context tab's button: one token-count request per tool and memory
// file, as /context does (types: SessionUsageArgs.breakdown), so only on a press.
let isCounting = false
async function countExactly($: EngineInterface) {
  if (isCounting) return
  isCounting = true
  $.ui.invalidate('ui.render')
  try {
    const usage = await $.session.usage({ breakdown: 'full' })
    await mapContext($, usage.context.breakdown, 'full')
  } catch (error) {
    $.ui.toast(`Exact count failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    isCounting = false
    $.ui.invalidate('ui.render')
  }
}

// Claude Code's own verdict on the cache against Cache Meter's clock, taken before either is acted on.
// Skipped while Cache Meter knows nothing of the cache (no request seen, e.g. right after /resume reset $.state).
async function recordCheck($: EngineInterface, engineWarm: boolean, source: 'model' | 'resume') {
  const cache = await read($, cacheA)
  if (cache === null) return
  const now = await $.clock.now()
  const ourWarm = cacheStatus(cache, now, (await ttlNow($)).ms).kind === 'warm'
  await update($, healthA, prev => ({
    ...prev,
    checks: {
      agreed: prev.checks.agreed + (engineWarm === ourWarm ? 1 : 0),
      differed: prev.checks.differed + (engineWarm === ourWarm ? 0 : 1),
      last: { at: now, engineWarm, ourWarm, source },
    },
  }))
}

// A pane opened unasked is placed from 144 terminal columns (110 once the person opened it before) and
// waits undrawn below that (types: UiOpenResult); docked, it is a sidebar, never a takeover.
async function maybeAutoOpen($: EngineInterface) {
  if (autoSidebar === 'off' || !isInteractive || !isFullscreenSeen || hasAutoOpened || isDismissed) return
  hasAutoOpened = true
  if ((await $.ui.panes()).some(p => p.id === PANE)) return
  await $.ui.open({ id: PANE, title: 'Tokens & Cache' })
}

async function tick($: EngineInterface) {
  $.ui.invalidate('ui.render')
  await maybeAutoOpen($)
  const keep = await read($, keepA)
  // No ping while a main request runs: that request touches the cache anyway.
  if (keep.until === null || isPinging || mainRequests > 0) return
  const now = await $.clock.now()
  if (now > keep.until || keep.pings >= MAX_PINGS) {
    await update($, keepA, k => ({ ...k, until: null }))
    $.ui.toast(`Keepwarm finished (${keep.pings} pings)`)

    return
  }
  const ttl = await ttlNow($)
  if (ttl.ms < HOUR) {
    await update($, keepA, k => ({ ...k, until: null }))
    $.ui.toast(`Keepwarm off: the TTL is now ${ttl.label} (${ttl.source})`)

    return
  }
  const cache = await read($, cacheA)
  const status = cacheStatus(cache, now, ttl.ms)
  if (status.kind !== 'warm' || cache === null) {
    await update($, keepA, k => ({ ...k, until: null }))
    $.ui.toast(status.kind === 'empty' ? 'Keepwarm off: no cache to keep warm' : 'Keepwarm off: the cache has already expired')

    return
  }
  if (status.remaining > ttl.ms * PING_SHARE) return
  isPinging = true
  try {
    // Timed at the request's start: the conservative end of the window (an assumption, see README).
    const startedAt = await $.clock.now()
    const reply = await $.model.fork({ prompt: 'Reply with the single word: warm' })
    if (!reply.isAnswered) {
      await update($, keepA, k => ({ ...k, until: null }))
      $.ui.toast(`Keepwarm off: the ping got no answer (${reply.reason})`)

      return
    }
    const measure = await read($, measureA)
    const expected = measure?.tokens ?? cache.contextTokens
    const got = reply.usage.cache_read_input_tokens
    const wrote = reply.usage.cache_creation_input_tokens
    await update($, keepA, k => ({ ...k, pings: k.pings + 1, readTokens: k.readTokens + got, lastPingAt: startedAt }))
    // A miss (little read) or a partial miss (much written next to what was read): the cache was
    // not what the TTL assumption said. Stop paying for pings.
    if (got === 0 || (expected > 0 && got < expected * PING_HIT_SHARE) || wrote >= got * PING_WRITE_SHARE) {
      await update($, keepA, k => ({ ...k, until: null }))
      $.ui.toast(`Keepwarm off: the ping missed the cache (${short(got)} read, ${short(wrote)} written)`)

      return
    }
    await update($, cacheA, c => (c === null ? c : { ...c, lastAt: startedAt }))
  } finally {
    isPinging = false
  }
}

async function resetCache($: EngineInterface) {
  await update($, cacheA, () => null)
  await update($, measureA, m => (m === null ? m : { ...m, percent: null, tokens: null }))
}

async function compactNow($: EngineInterface) {
  try {
    const result = await $.session.compact()
    if ('skip' in result && result.skip) {
      $.ui.toast(`Compact skipped: ${result.skip}`)

      return
    }
    // $.session.compact runs every hook but the caller's, so the session.compact hook below may
    // not see this one; resetting here too is idempotent.
    await resetCache($)
  } catch (error) {
    $.ui.toast(`Compact is not possible right now: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// Starts keepwarm for `ms`; the answer text explains what happens or why it did not start.
async function startKeepWarm($: EngineInterface, ms: number): Promise<string> {
  if (!isInteractive) return 'Keepwarm only works in an interactive session (no timer runs here). Not started.'
  const now = await $.clock.now()
  const ttl = await ttlNow($)
  if (ttl.ms < HOUR) {
    return `With a ${ttl.label} TTL (${ttl.source}) keepwarm is not worth it: a ping every few minutes. Not started.`
  }
  if (cacheStatus(await read($, cacheA), now, ttl.ms).kind !== 'warm') {
    return 'No warm cache – start keepwarm after the next answer.'
  }
  await update($, keepA, () => ({ until: now + ms, pings: 0, readTokens: 0, lastPingAt: null }))

  return (
    `Keepwarm until ${hhmm(now + ms)}, at most ${MAX_PINGS} pings: one whenever at most ` +
    `${Math.round((ttl.ms * PING_SHARE) / 60_000)} min of the TTL is left (TTL ${ttl.label}, ${ttl.source}). Each ping ` +
    `reads the whole context from the cache. If a ping misses the cache, keepwarm switches itself off.`
  )
}

async function stopKeepWarm($: EngineInterface): Promise<string> {
  const keep = await read($, keepA)
  await update($, keepA, k => ({ ...k, until: null }))

  return `Keepwarm off (${keep.pings} pings, ${short(keep.readTokens)} tokens read from the cache).`
}

// The toast box is narrow and takes only text (types: $.ui.toast), so a press gets the short form;
// /keepwarm prints the full explanation into the transcript.
async function pressKeepWarm($: EngineInterface, ms: number | null) {
  const text = ms === null ? await stopKeepWarm($) : await startKeepWarm($, ms)
  const keep = await read($, keepA)
  const ttl = await ttlNow($)
  const short =
    ms !== null && keep.until !== null
      ? `Keepwarm on until ${hhmm(keep.until)} · pings at ≤ ${Math.round((ttl.ms * PING_SHARE) / 60_000)} min left`
      : text.split(/(?<=[.)])\s/)[0] ?? text
  $.ui.toast(short, { timeoutMs: 8_000 })
}

export const register: Register = (on, options) => {
  setting = typeof options.cacheTtl === 'string' ? options.cacheTtl : 'auto'
  autoSidebar = typeof options.autoSidebar === 'string' ? options.autoSidebar : 'auto'
  isFullscreenSeen = false
  hasAutoOpened = false
  isDismissed = false
  isPinging = false
  mainRequests = 0
  showTurnLine = options.turnLine !== 'off'
  openTurns = {}

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await loadTtlConfig($)
    await measureNow($)
    // Hooks also run under -p and the SDK, where nothing draws (overview § Where mods run).
    isInteractive = e.isInteractive
    if (e.isInteractive) {
      // Returning the promise lets a mock clock await the tick (test § Test a timer).
      $.clock.every(TICK_MS, () => tick($))
      // Soon after start, once the band has been drawn and said whether the session is fullscreen.
      $.clock.after(2_000, () => maybeAutoOpen($))
    }
    try {
      await $.command.register({
        name: 'tokens',
        description: 'Prompt-cache and token dashboard – tabs: overview, context (what fills it), health (errors, cost rate)',
        argumentHint: '[overview | context | health]',
      })
      await $.command.register({
        name: 'keepwarm',
        description: 'Keep the prompt cache warm (each ping costs one cache read of the context)',
        argumentHint: '[2h | 30m | off]  (10m … 8h)',
      })
    } catch {
      // Without the commands the band still works.
    }

    return result
  })

  // /clear, /resume and /branch reset every $.state value and do not fire session.start again
  // (interface § Load a saved value again after /clear). Resume and fork also say how long ago the
  // last response was, so the countdown carries on.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    await loadTtlConfig($)
    await measureNow($)
    if ((e.source === 'resume' || e.source === 'fork') && e.seconds_since_last_response !== undefined) {
      if (e.prompt_cache_likely_expired !== undefined) await recordCheck($, !e.prompt_cache_likely_expired, 'resume')
      const now = await $.clock.now()
      // seconds_since_last_response counts from the last response's end; Claude Code's own verdict
      // prompt_cache_likely_expired wins over that clock (classic SessionStart input, types).
      const cache: CacheInfo = {
        lastAt: e.prompt_cache_likely_expired === true ? 0 : now - e.seconds_since_last_response * 1000,
        hitPct: null,
        contextTokens: e.context_tokens ?? 0,
        rewriteUsd: e.estimated_cache_write_usd ?? null,
        coldReason: e.prompt_cache_likely_expired === true ? 'resume' : null,
        idleBeforeMs: e.seconds_since_last_response * 1000,
      }
      await update($, cacheA, () => cache)
    }

    return next(e)
  })

  // Each model request: the four token counts as the API reported them (events § Follow a turn).
  // Whether a keepwarm fork raises turn.step is undocumented ('re-entry' covers a hook's own call,
  // and the ping comes from a timer). Worst case it shows as one row in the history; no real request
  // is filtered out here, because a filter would drop requests that end during a ping.
  on('turn.step', async function* ($, e, next) {
    const isMain = e.agentId === undefined
    // Counted before the first await, so a turn.complete that follows cannot be overtaken.
    if (isMain) mainRequests += 1
    const open = openTurns[e.turnId]
    if (isMain && open !== undefined) openTurns = { ...openTurns, [e.turnId]: { ...open, requests: open.requests + 1 } }
    let result
    let startedAt = 0
    let before: CacheInfo | null = null
    let wasCold = false
    try {
      startedAt = await $.clock.now()
      // Was the main cache already expired when this request started? (read before the request)
      before = isMain ? await read($, cacheA) : null
      wasCold = before !== null && cacheStatus(before, startedAt, (await ttlNow($)).ms).kind === 'expired'
      result = yield* next(e)
    } finally {
      if (isMain) mainRequests = Math.max(0, mainRequests - 1)
    }
    const usage = result.usage
    if (usage !== null) {
      const u: Usage4 = {
        input: usage.input_tokens,
        read: usage.cache_read_input_tokens,
        write: usage.cache_creation_input_tokens,
        output: usage.output_tokens,
      }
      if (e.agentId !== undefined) {
        await update($, totalsA, t => ({ ...t, sub: add(t.sub, u), subSteps: t.subSteps + 1 }))
      } else {
        // Cold by the clock AND by the counts (more written than read), so a wrong TTL assumption
        // cannot turn a warm request into a "cold" one. A request with no cache before it (session
        // start, after /compact or /clear) writes the cache for the first time: not a loss.
        const isCold = wasCold && before !== null && u.write >= COLD_MIN && u.read < u.write
        const kind = isCold ? ('cold' as const) : before === null ? ('first' as const) : undefined
        await update($, stepsA, list => [...list, { ...u, at: startedAt, model: usage.model, ...(kind ? { kind } : {}) }].slice(-STEPS_KEPT))
        await update($, totalsA, t => ({ ...t, main: add(t.main, u), mainSteps: t.mainSteps + 1 }))
        // Measured, not explained: how often a warm cache was re-written anyway. Why is left open,
        // because the prompt sections are not compared (a prompt.compose hook would run on every render).
        if (isUnexpectedWrite(wasCold, before !== null && before.lastAt > 0, u)) {
          await update($, healthA, h => {
            const prev = h.unexpected ?? { count: 0, written: 0, lastAt: null }

            return { ...h, unexpected: { count: prev.count + 1, written: prev.written + u.write, lastAt: startedAt } }
          })
        }
        await update($, cacheA, () => ({
          lastAt: startedAt,
          hitPct: hitPct(u),
          contextTokens: u.input + u.read + u.write + u.output,
          rewriteUsd: null,
          coldReason: null,
          idleBeforeMs: null,
        }))
        if (isCold && before !== null) {
          const cause: ColdWrite['cause'] = before.lastAt > 0 ? 'pause' : before.coldReason ?? 'model'
          const idleMs = cause === 'pause' ? startedAt - before.lastAt : before.idleBeforeMs
          const cold: ColdWrite = { at: startedAt, written: u.write, cause, idleMs }
          await update($, coldA, list => [...list, cold].slice(-20))
          await update($, totalsA, t => ({ ...t, coldCount: t.coldCount + 1, coldWritten: t.coldWritten + u.write }))
          const keep = await read($, keepA)
          // A hint, not an action: switching keepwarm on by itself would spend quota unasked.
          // Only after a pause in this session: after a model switch or a resume, keepwarm could not have helped.
          if (cause === 'pause' && isInteractive && !(keep.until !== null && keep.until > startedAt)) {
            $.ui.toast(`Cache was cold: ${short(u.write)} tokens re-written – try /keepwarm before your next break`, {
              timeoutMs: 10_000,
            })
          }
        }
      }
    }
    if (isMain) {
      // Why the request stopped, when not normally, and the tool calls the API ran itself
      // (events › Follow a turn: serverToolUses, v2.1.290+; no tool.call fires for these).
      const stop = result.stopReason
      const calls: ServerToolCall[] = (result.serverToolUses ?? []).map(t => ({
        name: t.name,
        ms: t.endedAt === undefined ? null : Math.max(0, t.endedAt - t.startedAt),
      }))
      if (!isNormalStop(stop) || calls.length > 0) {
        await update($, healthA, prev => {
          const serverTools = { ...prev.serverTools }
          for (const c of calls) {
            const sum = serverTools[c.name] ?? { count: 0, ms: 0 }
            serverTools[c.name] = { count: sum.count + 1, ms: sum.ms + (c.ms ?? 0) }
          }

          return {
            ...prev,
            stops: stop !== null && !isNormalStop(stop) ? bump(prev.stops, stop) : prev.stops,
            serverTools,
            lastServerTools: calls.length > 0 ? { at: startedAt, calls } : prev.lastServerTools,
          }
        })
      }
    }

    return result
  })

  // A turn ended on an error (settings hook event StopFailure, observed only): counted by kind,
  // the main conversation and subagents apart (agent_id is set for a subagent).
  on('classic.StopFailure', async ($, e, next) => {
    await update($, healthA, prev =>
      e.agent_id === undefined ? { ...prev, errors: bump(prev.errors, e.error) } : { ...prev, subErrors: bump(prev.subErrors, e.error) },
    )

    return next(e)
  })

  // A main turn has ended, also when aborted (events § Follow a turn; TurnCompleteInput.isAborted):
  // no main request runs any more. Resets the counter even if an aborted stream never reached its
  // finally above, so /keepwarm cannot stall silently.
  // The session cost when a turn starts, for the line under its answer. SessionCost.usd sums every
  // priced response, subagents' included: the line shows what the whole answer cost (types: SessionCost).
  on('turn.start', async ($, e, next) => {
    let usd: number | null = null
    try {
      usd = (await $.session.usage()).cost?.usd ?? null
    } catch {
      usd = null
    }
    openTurns = { ...openTurns, [e.turnId]: { usd, requests: 0 } }

    return next(e)
  })

  // A main turn has ended, also when aborted (events § Follow a turn; TurnCompleteInput.isAborted):
  // no main request runs any more. Resets the counter even if an aborted stream never reached its
  // finally above, so /keepwarm cannot stall silently. A returned text other than the answer is shown
  // beneath it (reference › Turns): one line with what the answer cost and how it hit the cache.
  on('turn.complete', async ($, e, next) => {
    const isMain = e.agentId === undefined
    if (isMain) mainRequests = 0
    const open = openTurns[e.turnId]
    const { [e.turnId]: _done, ...rest } = openTurns
    openTurns = rest
    const result = await next(e)
    if (!isMain || !showTurnLine || e.isAborted || !e.usage || open === undefined || open.requests === 0) return result
    let usd: number | null = null
    try {
      const now = (await $.session.usage()).cost?.usd ?? null
      usd = now === null || open.usd === null ? null : Math.max(0, now - open.usd)
    } catch {
      usd = null
    }
    const u: Usage4 = {
      input: e.usage.input_tokens,
      read: e.usage.cache_read_input_tokens,
      write: e.usage.cache_creation_input_tokens,
      output: e.usage.output_tokens,
    }

    return { ...result, text: turnLine(u, open.requests, usd, isPlan(await read($, measureA))) }
  })

  // Calls to MCP tools by wire name, so the context tab can tell servers in use from idle ones.
  // Counted after the call ran; the call and its result pass through unchanged.
  on('tool.call', { tool: /^mcp__/ }, async ($, e, next) => {
    const result = await next(e)
    if (!('deny' in result && result.deny)) await update($, healthA, h => ({ ...h, toolCalls: bump(h.toolCalls ?? {}, e.tool) }))

    return result
  })

  // Before a model switch Claude Code asks for confirmation while the cache is warm (prompt-caching ›
  // Switching models). A note with its own estimate and the time the cache has left; never a decision:
  // "ask" counts as a refusal on /config and SDK switches (hooks › PreModelSwitch decision control),
  // and a slow hook here blocks the switch, so only two state reads.
  on('classic.PreModelSwitch', async ($, e, next) => {
    if (isInteractive && e.prompt_cache_warm && e.from_model !== e.to_model && e.context_tokens >= COLD_MIN) {
      const status = cacheStatus(await read($, cacheA), await $.clock.now(), (await ttlNow($)).ms)
      const note = switchNote(e.context_tokens, e.estimated_cache_write_usd, e.pricing !== 'default', status.kind === 'warm' ? status.remaining : null)
      $.ui.toast(note, { timeoutMs: 12_000 })
    }

    return next(e)
  })

  // After each main-thread turn: context fill, rate limits, cost.
  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    const before = await read($, measureA)
    // A summary reading after each turn: Claude Code estimates it locally and sends no request
    // (types: SessionUsageArgs). It gives the auto-compact point, the context map and the start time.
    let auto: { pct: number | null; isOff: boolean; isKnown: boolean } | null = null
    let startedAt: number | null = null
    let prompts: number | null = null
    try {
      const usage = await $.session.usage({ breakdown: 'summary' })
      if (before === null || before.autoCompactWindow !== e.context.window) auto = autoCompactOf(usage.context.breakdown, e.context.window)
      startedAt = usage.startedAt
      await mapContext($, usage.context.breakdown, 'summary')
    } catch {
      auto = null
    }
    try {
      prompts = await $.session.turns()
    } catch {
      prompts = null
    }
    const now = await $.clock.now()
    await update($, measureA, m => {
      const tokens = e.context.tokens ?? null
      const history =
        e.changed.includes('context') && tokens !== null ? [...(m?.history ?? []), tokens].slice(-12) : m?.history ?? []
      const measured: Measure = {
        percent: e.context.percent ?? null,
        tokens,
        window: e.context.window,
        autoCompactPct: auto ? auto.pct : m?.autoCompactPct ?? null,
        isAutoCompactOff: auto ? auto.isOff : m?.isAutoCompactOff ?? false,
        autoCompactWindow: auto ? (auto.isKnown ? e.context.window : 0) : m?.autoCompactWindow ?? 0,
        history,
        limits: e.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
        usd: e.cost?.usd ?? m?.usd ?? null,
        startedAt: startedAt ?? m?.startedAt ?? null,
        prompts: prompts ?? m?.prompts ?? null,
        limitStart: nextLimitStarts(m?.limitStart ?? {}, e.rateLimits, now),
      }

      return measured
    })

    return result
  })

  // A compaction replaces the prefix: the next request writes a fresh cache.
  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    if (e.trigger !== 'precompute' && e.agentId === undefined && !('skip' in result && result.skip)) {
      await resetCache($)
    }

    return result
  })

  // A real model switch starts a cold cache; the event carries the engine's own TTL and estimate.
  on('classic.PostModelSwitch', async ($, e, next) => {
    // Before the cache is set cold below: what Claude Code and Cache Meter each thought of it.
    await recordCheck($, e.prompt_cache_warm, e.source === 'resume' ? 'resume' : 'model')
    await update($, ttlA, () => e.cache_ttl)
    if (e.source !== 'resume' && e.from_model !== e.to_model) {
      const cold: CacheInfo = {
        lastAt: 0,
        hitPct: null,
        contextTokens: e.context_tokens,
        rewriteUsd: e.estimated_cache_write_usd,
        coldReason: 'model',
        idleBeforeMs: null,
      }
      await update($, cacheA, () => cold)
      await update($, measureA, m => (m === null ? m : { ...m, autoCompactWindow: 0 }))
    }

    return next(e)
  })

  // /tokens toggles. rows: the height asked for above the prompt, default a third (types: PaneOpenArgs.rows);
  // closeOnEscape: Esc at the idle, empty prompt closes it too. No focus: hotkeys would swallow typing.
  on('command.run', { command: 'tokens' }, async ($, e) => {
    // /tokens <tab> opens on that tab, or switches to it when the pane is open: no focus chord needed.
    const asked = (e.args ?? '').trim().toLowerCase()
    const wanted = TABS.find(t => t === asked || (asked.length > 0 && t.startsWith(asked)))
    if (asked !== '' && wanted === undefined) return { text: 'Usage: /tokens [overview | context | health]' }
    const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
    if (wanted !== undefined) {
      tab = wanted
      $.ui.invalidate('ui.render')
      if (isOpen) return { text: `Switched the pane to ${wanted}.` }
    }
    if (isOpen) {
      isDismissed = true
      await $.ui.close({ id: PANE })

      return { text: 'Closed the "Tokens & Cache" pane.' }
    }
    // From about 114 terminal columns the body is wide enough for two columns, which needs fewer rows.
    const columns = e.presentation?.columns ?? 80
    const pane = { id: PANE, title: 'Tokens & Cache', rows: columns >= 114 ? 26 : 36 }
    // Docked beside a fullscreen transcript from 110 columns (types: CommandPresentation), the pane is a
    // sidebar: Esc only hands the keys back. Above the prompt Esc closes it (closeOnEscape takes only true).
    const isDock = e.presentation?.isFullscreen === true && columns >= 110
    await $.ui.open(isDock ? pane : { ...pane, closeOnEscape: true })

    return {
      text: isDock
        ? 'Opened the "Tokens & Cache" sidebar. /tokens again closes it.'
        : 'Opened the "Tokens & Cache" pane. Esc at an empty prompt or /tokens again closes it.',
    }
  })

  // The person closed the dashboard (its close mark or ctrl+x x): it stays closed this session.
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && e.origin.kind === 'person') isDismissed = true

    return next(e)
  })

  // Above the prompt the pane is a glance: it takes rows from the transcript, so the person's next prompt
  // closes it (the band keeps the summary). Docked beside a fullscreen transcript it is a sidebar and stays.
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'composer' && seat === 'inline' && (await $.ui.panes()).some(p => p.id === PANE)) {
      await $.ui.close({ id: PANE })
    }

    return next(e)
  })

  on('command.run', { command: 'keepwarm' }, async ($, e) => {
    const ms = parseKeepWarm(e.args)
    if (ms === undefined) return { text: 'Usage: /keepwarm [10m … 8h | off] – 2h when left out.' }

    return { text: ms === null ? await stopKeepWarm($) : await startKeepWarm($, ms) }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // What the mods after this one draw: kept beneath this row (interface § Pick where to draw › Band).
    const theirs = await next(e)
    if (e.viewport?.isFullscreen === true) isFullscreenSeen = true
    if (e.props.hasSurvey) return theirs
    const measure = await read($, measureA)
    const cache = await read($, cacheA)
    const keep = await read($, keepA)
    const ttl = await ttlNow($)
    const now = await $.clock.now()
    const status = cacheStatus(cache, now, ttl.ms)
    const { Box, Button, Text } = $.ui.resolve(e)
    const cols = e.props.bodyColumns

    const percent = measure?.percent ?? null
    const auto = measure?.autoCompactPct ?? null
    const isKeeping = keep.until !== null && keep.until > now
    const isLow = status.kind === 'warm' && status.remaining <= ttl.ms * PING_SHARE
    const sky = percent === null ? null : forecast(percent, auto)
    const showButton = !e.props.isWorking

    // Every segment's width, so the row never wraps (AbovePrompt.bodyColumns).
    const label = status.kind === 'warm' ? remainingLabel(status.remaining) : status.kind === 'empty' ? 'empty' : 'expired'
    const hit = cache === null || cache.hitPct === null ? '–' : `${cache.hitPct}%`
    const pct = percent === null ? '–' : `${percent}%`
    const autoText = measure?.isAutoCompactOff ? ' (auto-compact off)' : auto === null ? '' : ` (auto-compact ${auto}%)`
    const rewriteTokens = measure?.tokens ?? cache?.contextTokens ?? 0
    const rewriteText =
      status.kind === 'expired' && cache !== null && rewriteTokens > 0
        ? ` · rewrite ${cache.rewriteUsd !== null ? `≈ $${cache.rewriteUsd.toFixed(2)}` : `≈ ${short(rewriteTokens)} tok`}`
        : isLow && !isKeeping && isInteractive
          ? ' · /keepwarm?'
          : ''
    const base =
      '● cache '.length +
      label.length +
      (isKeeping ? 2 : 0) +
      1 +
      hit.length +
      ' hit · '.length +
      (sky ? 2 : 0) +
      'context '.length +
      pct.length +
      (showButton ? '[ Compact ]'.length + 1 : 0)
    // Claude Code's own cost figure, the one /cost shows: on a subscription a comparison value (what an
    // API key would pay), on an API key or a cloud provider real spend. Hidden at $0.00.
    const usd = measure?.usd ?? null
    const costText = usd === null || usd < 0.005 ? '' : isPlan(measure) ? ` · API value $${usd.toFixed(2)}` : ` · spent $${usd.toFixed(2)}`
    // The cache is cold anyway: compacting now loses no warm cache (it still reads the context once).
    const compactText = status.kind === 'expired' && showButton && percent !== null && percent >= COMPACT_HINT_PCT ? ' · cold: good time to' : ''
    const minBar = 6
    const showRewrite = rewriteText !== '' && base + rewriteText.length + autoText.length + minBar < cols
    const showAuto = autoText !== '' && base + autoText.length + (showRewrite ? rewriteText.length : 0) + minBar < cols
    // Dropped first when the row gets narrow: after it the auto-compact point, then the bar.
    const showCost =
      costText !== '' && base + costText.length + (showAuto ? autoText.length : 0) + (showRewrite ? rewriteText.length : 0) + minBar < cols
    const showCompact =
      compactText !== '' &&
      base + compactText.length + (showAuto ? autoText.length : 0) + (showRewrite ? rewriteText.length : 0) + (showCost ? costText.length : 0) + minBar < cols
    const free =
      cols -
      base -
      (showAuto ? autoText.length : 0) -
      (showRewrite ? rewriteText.length : 0) -
      (showCost ? costText.length : 0) -
      (showCompact ? compactText.length : 0) -
      1
    const cells = free >= minBar ? Math.min(20, free) : 0
    const lit = status.kind === 'warm' ? litCells(status.remaining, ttl.ms, cells) : 0

    const mine = (
      <Box flexDirection="row">
        <Text color={status.kind === 'warm' ? 'success' : 'error'}>● </Text>
        <Text dimColor>cache </Text>
        <Text color={status.kind === 'warm' ? (isLow ? 'warning' : 'success') : 'error'} bold={status.kind === 'warm'}>
          {label}
        </Text>
        {isKeeping && <Text color="success"> ↻</Text>}
        <Text> </Text>
        {cells > 0 && <Text color={isLow ? 'warning' : 'success'}>{'■'.repeat(lit)}</Text>}
        {cells > 0 && <Text color="inactive">{'■'.repeat(cells - lit)}</Text>}
        {cells > 0 && <Text> </Text>}
        <Text bold color={hitColor(cache?.hitPct ?? null)}>
          {hit}
        </Text>
        <Text dimColor> hit · </Text>
        {sky && <Text color={sky.color}>{sky.icon} </Text>}
        <Text dimColor>context </Text>
        <Text bold>{pct}</Text>
        {showAuto && <Text dimColor>{autoText}</Text>}
        {showCost && <Text dimColor>{costText}</Text>}
        {showRewrite && (
          <Text color={status.kind === 'expired' ? 'warning' : 'claude'} wrap="truncate-end">
            {rewriteText}
          </Text>
        )}
        {showCompact && <Text color="claude">{compactText}</Text>}
        {showButton && <Text> </Text>}
        {showButton && <Button key="compact" label="Compact" onPress={() => compactNow($)} />}
      </Box>
    )

    return (
      <Box flexDirection="column">
        {mine}
        {theirs}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements
    seat = e.props.placement
    // Raster (colored cells) is drawn by the terminal only (reference › Elements); elsewhere text.
    const Raster = 'Raster' in elements ? elements.Raster : null
    const steps = await read($, stepsA)
    const totals: Totals = await read($, totalsA)
    const measure = await read($, measureA)
    const cache = await read($, cacheA)
    const keep: KeepWarm = await read($, keepA)
    const colds = await read($, coldA)
    const map = await read($, contextMapA)
    const health: Health = await read($, healthA)
    const ttl = await ttlNow($)
    const now = await $.clock.now()
    const status = cacheStatus(cache, now, ttl.ms)

    // Three widths: a narrow dock (about 48 body columns beside a 120-column terminal) drops the
    // secondary text; from 110 the cards sit in two columns, so the pane also needs fewer rows.
    const cols = e.props.bodyColumns
    const tier = cols < 64 ? 'narrow' : cols < 110 ? 'medium' : 'wide'
    const left = tier === 'wide' ? Math.floor((cols - 1) / 2) : cols
    const rightW = tier === 'wide' ? cols - 1 - left : cols
    // A card has a round border and one column of padding on each side: 4 columns of chrome.
    const leftIn = Math.max(16, left - 4)
    const rightIn = Math.max(16, rightW - 4)
    const fullIn = Math.max(16, cols - 4)

    // A one-row meter: Raster cells in the terminal, the same runs as colored text elsewhere.
    const gauge = (key: string, width: number, fraction: number, fill: number, theme: string, marks: readonly Mark[] = []) => {
      const runs = meterRuns(width, fraction, marks)

      return Raster ? (
        <Raster key={key} columns={width} rows={1} cells={rasterCells(meterCells(runs, fill, marks))} />
      ) : (
        <Text wrap="truncate-end">
          {runs.map(r => (
            <Text color={r.role === 'fill' ? theme : r.role === 'track' ? 'inactive' : marks[r.role]?.theme}>{r.text}</Text>
          ))}
        </Text>
      )
    }

    // --- cache --------------------------------------------------------------------------------
    const isWarm = status.kind === 'warm'
    const isLow = isWarm && status.remaining <= ttl.ms * PING_SHARE
    const stateColor = isWarm ? (isLow ? 'warning' : 'success') : 'error'
    const remaining = isWarm ? status.remaining : 0
    const isSeconds = isWarm && remaining < 60_000
    const digits = tall(isWarm ? String(Math.ceil(remaining / (isSeconds ? 1000 : 60_000))) : '--')
    const lastAt = cache !== null && cache.lastAt > 0 ? cache.lastAt : null
    const stateWord = isWarm ? 'WARM' : status.kind === 'empty' ? 'EMPTY' : 'EXPIRED'
    const stateNote = isWarm
      ? ` · ${isSeconds ? 's' : 'min'} left${lastAt === null || tier === 'narrow' ? '' : ` · until ${hhmm(lastAt + ttl.ms)}`}`
      : status.kind === 'empty'
        ? ' · waiting for the first answer'
        : lastAt === null
          ? ''
          : ` · since ${hhmm(lastAt + ttl.ms)}`
    const sessionHit = hitPct(totals.main)
    const rewriteTokens = measure?.tokens ?? cache?.contextTokens ?? 0
    const stake =
      cache?.rewriteUsd != null ? `$${cache.rewriteUsd.toFixed(2)} (${short(rewriteTokens)} tokens)` : `${short(rewriteTokens)} tokens`
    // Keepwarm pings once PING_SHARE of the TTL is left: the marker shows that point on the countdown.
    const canKeep = isInteractive && isWarm && ttl.ms >= HOUR
    const isKeeping = keep.until !== null && keep.until > now
    const pingMarks: Mark[] = canKeep || isKeeping ? [{ at: markAt(PING_SHARE, leftIn), color: 0xd97757, theme: 'claude' }] : []

    const cacheCard = (
      <Box borderStyle="round" borderColor={stateColor} paddingX={1} flexDirection="column">
        <Box flexDirection="row">
          <Box flexDirection="column">
            {digits.map(row => (
              <Text color={stateColor} bold>
                {row}
              </Text>
            ))}
          </Box>
          <Box flexDirection="column" marginLeft={2} flexShrink={1}>
            <Text wrap="truncate-end">
              <Text color={stateColor} bold>
                {stateWord}
              </Text>
              <Text dimColor>{stateNote}</Text>
            </Text>
            <Text wrap="truncate-end">
              <Text dimColor>hit </Text>
              <Text bold color={hitColor(cache?.hitPct ?? null)}>
                {cache?.hitPct == null ? '–' : `${cache.hitPct}%`}
              </Text>
              {tier !== 'narrow' && <Text dimColor> last · </Text>}
              {tier !== 'narrow' && (
                <Text bold color={hitColor(sessionHit)}>
                  {sessionHit === null ? '–' : `${sessionHit}%`}
                </Text>
              )}
              {tier !== 'narrow' && <Text dimColor> session</Text>}
            </Text>
            <Text dimColor wrap="truncate-end">
              TTL {ttl.label}
              {tier === 'narrow' ? '' : ` · ${ttl.source}`}
            </Text>
          </Box>
        </Box>
        {gauge('countdown', leftIn, isWarm ? remaining / ttl.ms : 0, isWarm ? (isLow ? FILL.low : FILL.warm) : FILL.cold, stateColor, pingMarks)}
        {status.kind === 'expired' && rewriteTokens > 0 && (
          <Text color="warning" wrap="truncate-end">
            next message re-writes ≈ {stake}
          </Text>
        )}
        {isWarm && rewriteTokens > 0 && (
          <Text dimColor wrap="truncate-end">
            expiry costs a re-write of ≈ {stake}
            {pingMarks.length > 0 && tier !== 'narrow' ? ' · ┃ keepwarm pings here' : ''}
          </Text>
        )}
      </Box>
    )

    // --- keepwarm -----------------------------------------------------------------------------
    const pingIn = isWarm ? Math.max(0, remaining - ttl.ms * PING_SHARE) : 0
    const keepCard = (
      <Box borderStyle="round" borderColor="claude" borderDimColor={!isKeeping} paddingX={1} flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Text wrap="truncate-end">
            <Text color="claude" bold>
              {isKeeping ? '↻ Keepwarm on' : '↻ Keepwarm'}
            </Text>
            <Text dimColor>
              {isKeeping && keep.until !== null ? ` until ${hhmm(keep.until)}` : ` off${keep.pings > 0 && tier !== 'narrow' ? ` · last run ${keep.pings} pings` : ''}`}
            </Text>
          </Text>
          {isKeeping ? (
            <Button key="keepwarm-stop" plain hotkey="s" onPress={() => pressKeepWarm($, null)}>
              <Text color="claude" bold>
                Stop
              </Text>
            </Button>
          ) : (
            canKeep && (
              <Button key="keepwarm-start" plain hotkey="w" onPress={() => pressKeepWarm($, 2 * HOUR)}>
                <Text color="claude" bold>
                  Keep warm 2h
                </Text>
              </Button>
            )
          )}
        </Box>
        <Text dimColor wrap="truncate-end">
          {isKeeping
            ? `${keep.pings}/${MAX_PINGS} pings · ${short(keep.readTokens)} read · next ~${remainingLabel(pingIn)}`
            : canKeep
              ? 'Break ahead? A ping ≈ 1/20 of a re-write.'
              : !isInteractive
                ? 'Interactive sessions only.'
                : ttl.ms < HOUR
                  ? `Not worth it at a ${ttl.label} TTL.`
                  : 'Available once the cache is warm.'}
        </Text>
      </Box>
    )

    // --- context ------------------------------------------------------------------------------
    const percent = measure?.percent ?? null
    const auto = measure?.autoCompactPct ?? null
    const autoMarks: Mark[] = auto === null ? [] : [{ at: markAt(auto / 100, rightIn), color: 0xff6b81, theme: 'error' }]
    const contextCard = (
      <Box borderStyle="round" borderDimColor paddingX={1} flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Text wrap="truncate-end">
            <Text color="claude" bold>
              Context{' '}
            </Text>
            <Text bold>{percent === null ? '–' : `${percent}%`}</Text>
          </Text>
          <Text dimColor>{measure?.tokens == null ? '' : `${short(measure.tokens)} / ${short(measure.window)}`}</Text>
        </Box>
        {gauge('context', rightIn, (percent ?? 0) / 100, FILL.context, 'suggestion', autoMarks)}
        <Box flexDirection="row" justifyContent="space-between">
          <Text wrap="truncate-end">
            {auto !== null && <Text color="error">┃</Text>}
            <Text dimColor>
              {measure?.isAutoCompactOff ? 'auto-compact off' : auto === null ? 'auto-compact unknown' : ` auto-compact ${auto}%`}
            </Text>
          </Text>
          <Text dimColor>{tier !== 'narrow' && measure !== null && measure.history.length > 2 ? `trend ${sparkline(measure.history)}` : ''}</Text>
        </Box>
      </Box>
    )

    // --- session ------------------------------------------------------------------------------
    // What caching saved: every input token at the base price against what reads and writes cost,
    // with the last request's model and the current TTL for the whole session (README › Pane).
    const saving = cacheSaving(totals.main, readMultiplier(steps.at(-1)?.model ?? ''), writeMultiplier(ttl.ms))
    const errorCount = Object.values(health.errors).reduce((a, n) => a + n, 0)
    const stopCount = Object.values(health.stops).reduce((a, n) => a + n, 0)
    const issues = [
      errorCount > 0 ? `${errorCount} API error${errorCount === 1 ? '' : 's'}` : '',
      stopCount > 0 ? `${stopCount} unusual stop${stopCount === 1 ? '' : 's'}` : '',
    ]
      .filter(Boolean)
      .join(' · ')
    const limits = measure?.limits ?? []
    // Name (11) + bar + ' 100%' (5) + ' · resets Mon 17:10' (19): the bar takes what the column leaves.
    const limitBar = Math.max(6, Math.min(24, rightIn - 35))
    const sessionCard = (
      <Box borderStyle="round" borderDimColor paddingX={1} flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexShrink={0} marginRight={1}>
            <Text color="claude" bold>
              Session
            </Text>
          </Box>
          {saving !== null && (
            <Text bold color={saving >= 0 ? 'success' : 'warning'} wrap="truncate-end">
              {saving >= 0 ? `cache saved ${saving}%${tier === 'narrow' ? '' : ' of input cost'}` : `cache cost +${-saving}%`}
            </Text>
          )}
        </Box>
        <Text dimColor wrap="truncate-end">
          {usageLine(totals.main)}
        </Text>
        <Text wrap="truncate-end">
          <Text dimColor>{totals.mainSteps} requests · </Text>
          <Text bold>{measure?.usd == null ? '–' : `${isPlan(measure) ? '≈ ' : ''}$${measure.usd.toFixed(2)}`}</Text>
          <Text dimColor>{measure?.usd == null ? '' : costLabel(measure, tier !== 'narrow')}</Text>
        </Text>
        {totals.subSteps > 0 && (
          <Text dimColor wrap="truncate-end">
            subagents {usageLine(totals.sub)} · {totals.subSteps} requests
          </Text>
        )}
        {issues !== '' && (
          <Text color="warning" wrap="truncate-end">
            {issues} – see 3: Health
          </Text>
        )}
        {totals.mainSteps === 0 ? null : colds.length === 0 ? (
          <Text wrap="truncate-end">
            <Text dimColor>{'Cold       '}</Text>
            <Text color="success">None – warm for every request.</Text>
          </Text>
        ) : (
          <Box flexDirection="column">
            <Text wrap="truncate-end">
              <Text dimColor>{'Cold       '}</Text>
              <Text color="warning" bold>
                Total {totals.coldCount}× · {short(totals.coldWritten)} tokens
              </Text>
              <Text dimColor>
                {colds.some(c => c.cause === 'pause') ? ' · /keepwarm before a break prevents this' : ''}
                {totals.coldCount > 3 ? ' · showing the last 3' : ''}
              </Text>
            </Text>
            {colds.slice(-3).map(c => (
              <Text wrap="truncate-end">
                <Text dimColor>{'           '}{hhmm(c.at)} </Text>
                <Text color="warning">{short(c.written)}</Text>
                <Text dimColor>
                  {' '}re-written
                  {c.cause === 'model'
                    ? ' (after a model switch)'
                    : c.cause === 'resume'
                      ? ` (after resume${c.idleMs === null ? '' : `, ${duration(c.idleMs)} idle`})`
                      : ` after ${duration(c.idleMs ?? 0)} idle`}
                </Text>
              </Text>
            ))}
          </Box>
        )}
        {limits.length === 0 && (
          <Text dimColor wrap="truncate-end">
            Plan limits: no reading (no subscription, or no answer yet)
          </Text>
        )}
        {limits.map(l => {
          const used = Math.max(0, Math.min(limitBar, Math.round((l.percentUsed / 100) * limitBar)))
          const full = limitForecast(measure?.limitStart?.[l.kind], l.percentUsed, now, l.resetsAt)

          return (
            <Text wrap="truncate-end">
              <Text dimColor>{limitName(l.kind).padEnd(11)}</Text>
              <Text color={l.percentUsed >= 90 ? 'error' : l.percentUsed >= 70 ? 'warning' : 'success'}>{'█'.repeat(used)}</Text>
              <Text color="inactive">{'░'.repeat(limitBar - used)}</Text>
              <Text bold> {right(`${l.percentUsed}%`, 4)}</Text>
              <Text dimColor>{l.resetsAt ? ` · resets ${resetLabel(l.resetsAt)}` : ''}</Text>
              {full !== null && <Text color="warning">{` · full ≈ ${hhmm(full)} at this pace`}</Text>}
            </Text>
          )
        })}
      </Box>
    )

    // --- requests: one column per request, its height the share not read from the cache --------
    const chartRows = tier === 'narrow' ? 3 : 4
    const slots = Math.floor(fullIn / 2)
    const shown = steps.slice(-slots)
    const last = steps.at(-1)
    const lastHit = last === undefined ? null : hitPct(last)
    const columns = shown.map(s => {
      const all = s.input + s.read + s.write
      const hit = hitPct(s) ?? 100

      // The first write of a cache (session start, after /compact) is not a loss: drawn in blue.
      const color = s.kind === 'first' ? FILL.context : hit >= 80 ? HEALTH.good : hit >= 50 ? HEALTH.fair : HEALTH.poor

      return { share: all > 0 ? (s.input + s.write) / all : 0, color }
    })
    const requestsCard = (
      <Box borderStyle="round" borderDimColor paddingX={1} flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexShrink={0} marginRight={1}>
            <Text color="claude" bold>
              Requests
            </Text>
          </Box>
          <Text dimColor wrap="truncate-end">
            {tier === 'wide'
              ? 'height = share not from cache · blue = first write · newest right'
              : tier === 'medium'
                ? 'height = not from cache · blue = first write'
                : 'not from cache'}
          </Text>
        </Box>
        {steps.length === 0 && <Text dimColor>No request measured yet.</Text>}
        {steps.length > 0 && Raster && (
          <Raster key="requests" columns={fullIn} rows={chartRows} cells={rasterCells(columnCells(columns, fullIn, chartRows))} />
        )}
        {steps.length > 0 && Raster && (
          <Box flexDirection="row" justifyContent="space-between">
            <Text dimColor>{hhmm(shown[0]!.at)}</Text>
            <Text dimColor>{hhmm(shown.at(-1)!.at)}</Text>
          </Box>
        )}
        {steps.length > 0 &&
          !Raster &&
          steps.slice(-4).map(s => (
            <Text wrap="truncate-end">
              <Text dimColor>{hhmm(s.at)} </Text>
              <Text>{right(short(s.input + s.read + s.write), 6)} </Text>
              <Text bold color={hitColor(hitPct(s))}>
                {right(hitPct(s) === null ? '–' : `${hitPct(s)}%`, 4)}
              </Text>
              <Text dimColor> hit · out {short(s.output)}</Text>
            </Text>
          ))}
        {last !== undefined && Raster && (
          <Text wrap="truncate-end">
            <Text dimColor>last {short(last.input + last.read + last.write)} in · </Text>
            <Text bold color={hitColor(lastHit)}>
              {lastHit === null ? '–' : `${lastHit}%`}
            </Text>
            <Text dimColor> hit · out {short(last.output)}</Text>
          </Text>
        )}
      </Box>
    )

    // --- context tab: where the context goes ---------------------------------------------------
    const itemRow = (name: string, tokens: number, top: number, nameW: number, note = '') => {
      const barW = Math.max(4, Math.min(24, fullIn - nameW - 20))
      const lit = top > 0 ? Math.max(tokens > 0 ? 1 : 0, Math.round((tokens / top) * barW)) : 0

      return (
        <Box flexDirection="row">
          <Box width={nameW}>
            <Text wrap="truncate-start">{name}</Text>
          </Box>
          <Text color="suggestion"> {'█'.repeat(lit)}</Text>
          <Text>{' '.repeat(barW - lit)}</Text>
          <Text bold> {right(short(tokens), 7)}</Text>
          <Text dimColor wrap="truncate-end">
            {note}
          </Text>
        </Box>
      )
    }
    const window = measure?.window ?? 0
    const pctOf = (tokens: number) => (window > 0 ? ` ${Math.round((tokens / window) * 100)}%` : '')
    const nameW = Math.max(12, Math.min(34, Math.floor(fullIn * 0.4)))
    const topCat = map?.categories[0]?.tokens ?? 0
    const topFile = map?.memoryFiles[0]?.tokens ?? 0
    const topServer = map?.mcpServers[0]?.tokens ?? 0
    const contextView = (
      <Box flexDirection="column">
        {contextCard}
        <Box borderStyle="round" borderDimColor paddingX={1} flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Box flexShrink={0} marginRight={1}>
              <Text color="claude" bold>
                Where it goes
              </Text>
            </Box>
            <Text dimColor wrap="truncate-end">
              {map === null ? 'no reading yet' : `${map.detail === 'full' ? 'exact' : 'estimate'} · ${hhmm(map.at)}`}
            </Text>
          </Box>
          {map === null && <Text dimColor>Claude Code reports it after the first answer.</Text>}
          {map !== null && map.categories.slice(0, 8).map(c => itemRow(c.name, c.tokens, topCat, nameW, pctOf(c.tokens)))}
          <Box flexDirection="row" justifyContent="space-between">
            <Text dimColor wrap="truncate-end">
              {tier === 'wide' ? 'Exact count: one API request per tool and memory file, as /context' : 'exact: 1 request per tool and file'}
            </Text>
            <Box flexShrink={0} marginLeft={2}>
              {isCounting ? (
                <Text color="claude">counting…</Text>
              ) : (
                <Button key="context-exact" plain hotkey="x" onPress={() => countExactly($)}>
                  <Text color="claude" bold>
                    Count exactly
                  </Text>
                </Button>
              )}
            </Box>
          </Box>
        </Box>
        {map !== null && (
          <Box borderStyle="round" borderDimColor paddingX={1} flexDirection="column">
            <Text color="claude" bold>
              Heaviest items
            </Text>
            <Text dimColor>Memory files (CLAUDE.md and rules)</Text>
            {map.memoryFiles.length === 0 && <Text dimColor> none</Text>}
            {map.memoryFiles.slice(0, 5).map(f => itemRow(homeShort(f.name), f.tokens, topFile, nameW))}
            <Text dimColor wrap="truncate-end">
              MCP servers{map.deferredMcpTools > 0 ? ` · ${map.deferredMcpTools} more tools behind tool search, not loaded` : ''}
            </Text>
            {map.mcpServers.length === 0 && <Text dimColor> none loaded</Text>}
            {map.mcpServers.slice(0, 5).map(m => itemRow(m.name, m.tokens, topServer, nameW, mcpNote(m.tools, m.toolNames, health.toolCalls ?? {}, measure?.prompts ?? null)))}
            <Text wrap="truncate-end">
              <Text dimColor>Skills </Text>
              {map.skills === null ? (
                <Text dimColor>–</Text>
              ) : (
                <Text>
                  <Text bold color={map.skills.included < map.skills.total ? 'warning' : undefined}>
                    {map.skills.included} of {map.skills.total}
                  </Text>
                  <Text dimColor> listed · {short(map.skills.tokens)} tokens</Text>
                  {map.skills.included < map.skills.total && <Text dimColor> · the rest did not fit the listing budget</Text>}
                </Text>
              )}
            </Text>
            {map.agents.length > 0 && (
              <Text dimColor wrap="truncate-end">
                Agents {map.agents.slice(0, 4).map(a => `${a.name} ${short(a.tokens)}`).join(' · ')}
              </Text>
            )}
          </Box>
        )}
      </Box>
    )

    // --- health tab: rates, stops, errors, server-side tools, Claude Code's cache verdict ---------
    const label = (text: string) => <Text dimColor>{text.padEnd(10)}</Text>
    const age = measure?.startedAt == null ? null : Math.max(0, now - measure.startedAt)
    const hours = age === null ? 0 : age / HOUR
    const prompts = measure?.prompts ?? null
    const usd = measure?.usd ?? null
    const tokensAll = totals.main.input + totals.main.read + totals.main.write + totals.main.output
    const subErrors = tally(health.subErrors, errorLabel)
    const serverNames = Object.entries(health.serverTools).sort((a, b) => b[1].ms - a[1].ms)
    const lastCheck = health.checks.last
    const unexpected = health.unexpected ?? { count: 0, written: 0, lastAt: null }
    const healthView = (
      <Box flexDirection="column">
        <Box borderStyle="round" borderDimColor paddingX={1} flexDirection="column">
          <Text color="claude" bold>
            Session
          </Text>
          <Text wrap="truncate-end">
            {label('Age')}
            <Text bold>{age === null ? '–' : duration(age)}</Text>
            <Text dimColor>{measure?.startedAt == null ? '' : ` · since ${hhmm(measure.startedAt)}`}</Text>
          </Text>
          <Text wrap="truncate-end">
            {label('Prompts')}
            <Text bold>{prompts ?? '–'}</Text>
            <Text dimColor> · {totals.mainSteps} requests</Text>
          </Text>
          <Text wrap="truncate-end">
            {label('Cost')}
            <Text bold>{usd === null ? '–' : `${isPlan(measure) ? '≈ ' : ''}$${usd.toFixed(2)}`}</Text>
            <Text dimColor>
              {usd === null ? '' : costLabel(measure, false)}
              {usd !== null && hours >= 0.05 ? ` · $${(usd / hours).toFixed(2)}/h` : ''}
              {usd !== null && prompts ? ` · $${(usd / prompts).toFixed(2)}/prompt` : ''}
            </Text>
          </Text>
          <Text wrap="truncate-end">
            {label('Tokens')}
            <Text bold>{prompts && totals.mainSteps > 0 ? short(Math.round(tokensAll / prompts)) : '–'}</Text>
            <Text dimColor> per prompt (main conversation, in + out)</Text>
          </Text>
        </Box>
        <Box borderStyle="round" borderDimColor paddingX={1} flexDirection="column">
          <Text color="claude" bold>
            Requests
          </Text>
          <Text wrap="truncate-end">
            {label('Stops')}
            {stopCount === 0 ? (
              <Text color="success">all normal</Text>
            ) : (
              <Text color="warning">{tally(health.stops, stopLabel)}</Text>
            )}
          </Text>
          <Text wrap="truncate-end">
            {label('Errors')}
            {errorCount === 0 ? <Text color="success">none</Text> : <Text color="error">{tally(health.errors, errorLabel)}</Text>}
            <Text dimColor>{subErrors === '' ? '' : ` · subagents: ${subErrors}`}</Text>
          </Text>
          <Text wrap="truncate-end">
            {label('Server')}
            {serverNames.length === 0 ? (
              <Text dimColor>no server-side tool calls (advisor, …)</Text>
            ) : (
              <Text>{serverNames.map(([n, v]) => `${n} ${v.count}× · ${duration(v.ms)}`).join('  ')}</Text>
            )}
          </Text>
          {health.lastServerTools !== null && (
            <Text dimColor wrap="truncate-end">
              {''.padEnd(10)}last {hhmm(health.lastServerTools.at)}: {health.lastServerTools.calls.map(c => `${c.name} ${c.ms === null ? '–' : duration(c.ms)}`).join(', ')}
            </Text>
          )}
        </Box>
        <Box borderStyle="round" borderDimColor paddingX={1} flexDirection="column">
          <Text color="claude" bold>
            Cache check
          </Text>
          {lastCheck === null ? (
            <Text dimColor wrap="truncate-end">
              No model switch or resume yet – Claude Code reports its own verdict on the cache then.
            </Text>
          ) : (
            <Box flexDirection="column">
              <Text wrap="truncate-end">
                <Text color={health.checks.differed === 0 ? 'success' : 'warning'} bold>
                  {health.checks.differed === 0
                    ? `Claude Code agreed ${health.checks.agreed} of ${health.checks.agreed} times`
                    : `Claude Code differed ${health.checks.differed} of ${health.checks.agreed + health.checks.differed} times`}
                </Text>
              </Text>
              <Text dimColor wrap="truncate-end">
                last {hhmm(lastCheck.at)} ({lastCheck.source === 'model' ? 'model switch' : 'resume'}): Claude Code {lastCheck.engineWarm ? 'warm' : 'cold'},
                Cache Meter {lastCheck.ourWarm ? 'warm' : 'cold'}
              </Text>
            </Box>
          )}
          <Text wrap="truncate-end">
            {label('Warm miss')}
            {unexpected.count === 0 ? (
              <Text color="success">none – every warm request read the cache</Text>
            ) : (
              <Text color="warning">
                {unexpected.count}× re-written while warm · {short(unexpected.written)} tokens
                {unexpected.lastAt === null ? '' : ` · last ${hhmm(unexpected.lastAt)}`}
              </Text>
            )}
          </Text>
          {unexpected.count > 0 && (
            <Text dimColor wrap="truncate-end">
              {''.padEnd(10)}something early in the prompt changed: CLAUDE.md, MCP tools or settings
            </Text>
          )}
        </Box>
      </Box>
    )

    // Clicks reach a pane only in Claude Code's fullscreen renderer, which captures the mouse
    // (fullscreen › Use the mouse); in the classic renderer the terminal keeps it.
    const canClick = e.viewport?.isFullscreen === true
    const tabButton = (id: typeof tab, name: string, hotkey: string, warn = false) => (
      <Button
        key={`tab-${id}`}
        plain
        hotkey={hotkey}
        onPress={() => {
          tab = id
          $.ui.invalidate('ui.render')
        }}
      >
        <Text bold={tab === id} dimColor={tab !== id} color={warn ? 'warning' : tab === id ? 'claude' : undefined}>
          {name}
          {warn ? ' !' : ''}
        </Text>
      </Button>
    )

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="row" columnGap={2}>
            <Text color="claude" bold>
              ◉ Cache Meter
            </Text>
            {tabButton('overview', 'Overview', '1')}
            {tabButton('context', 'Context', '2')}
            {tabButton('health', 'Health', '3', issues !== '')}
          </Box>
          <Text dimColor wrap="truncate-end">
            {tier === 'wide' ? 'prompt cache · tokens' : ''}
          </Text>
        </Box>
        {tab === 'overview' &&
          (tier === 'wide' ? (
            <Box key="columns" flexDirection="row" columnGap={1}>
              <Box flexDirection="column" width={left}>
                {cacheCard}
                {keepCard}
              </Box>
              <Box flexDirection="column" width={rightW}>
                {contextCard}
                {sessionCard}
              </Box>
            </Box>
          ) : (
            <Box flexDirection="column">
              {cacheCard}
              {keepCard}
              {contextCard}
              {sessionCard}
            </Box>
          ))}
        {tab === 'overview' && requestsCard}
        {tab === 'context' && contextView}
        {tab === 'health' && healthView}
        <Box flexDirection="row" justifyContent="space-between">
          <Text dimColor wrap="truncate-end">
            {tier === 'narrow'
              ? `${canClick ? 'click a tab · ' : ''}/tokens health`
              : `${canClick ? 'click a tab or ' : ''}/tokens context | health · keys: ctrl+x tab, then 1–3${isKeeping ? ' · s stop' : canKeep ? ' · w keep warm' : ''}`}
          </Text>
          {/* The hint truncates; the button keeps its width and a gap (it ran into the hint at ~80 columns). */}
          <Box flexShrink={0} marginLeft={2}>
            <Button key="pane-compact" plain hotkey="c" onPress={() => compactNow($)}>
              Compact
            </Button>
          </Box>
        </Box>
      </Box>
    )
  })
}

function autoCompactOf(
  breakdown: { autoCompactThreshold?: number; isAutoCompactEnabled: boolean } | undefined,
  window: number,
): { pct: number | null; isOff: boolean; isKnown: boolean } {
  if (!breakdown || window <= 0) return { pct: null, isOff: false, isKnown: false }
  if (!breakdown.isAutoCompactEnabled) return { pct: null, isOff: true, isKnown: true }
  if (!breakdown.autoCompactThreshold) return { pct: null, isOff: false, isKnown: false }

  return { pct: Math.round((breakdown.autoCompactThreshold / window) * 100), isOff: false, isKnown: true }
}

function limitName(kind: string): string {
  if (kind === 'five_hour') return '5 hours'
  if (kind === 'seven_day') return '7 days'
  if (kind === 'spend_limit') return 'Spend limit'

  return kind
}

function resetLabel(iso: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return iso
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return `${days[new Date(ms).getDay()]} ${hhmm(ms)}`
}

function usageLine(u: Usage4) {
  return `read ${short(u.read)} · written ${short(u.write)} · new ${short(u.input)} · out ${short(u.output)}`
}

/** Green from 80 %, yellow from 50 %, red below; plain while unknown. */
function hitColor(pct: number | null): string | undefined {
  if (pct === null) return undefined
  if (pct >= 80) return 'success'
  if (pct >= 50) return 'warning'

  return 'error'
}

/** A home directory as `~`, so paths stay short and screenshots show no user name. */
function homeShort(path: string): string {
  return path.replace(/^\/(Users|home)\/[^/]+(?=\/|$)/, '~')
}

/**
 * A subscription: Claude Code reports plan limits only there (types: SessionMeasureInput.rateLimits,
 * "empty off a subscription or before the first reading").
 */
function isPlan(measure: Measure | null): boolean {
  return (measure?.limits.length ?? 0) > 0
}

/** What the cost figure means here: a comparison value on a plan, real spend on an API key. */
function costLabel(measure: Measure | null, isLong: boolean): string {
  if (isPlan(measure)) return isLong ? ' API value (API-key price)' : ' API value'

  return isLong ? ' spent (as /cost)' : ' spent'
}

/**
 * An MCP server's note in the context tab: its tools and how often this session called them. "unused
 * so far" only after a few prompts, so a fresh session does not call every server idle.
 */
function mcpNote(tools: number, toolNames: readonly string[] | undefined, calls: Readonly<Record<string, number>>, prompts: number | null): string {
  if (toolNames === undefined) return ` · ${tools} tools`
  const n = serverCalls(toolNames, calls)
  const idle = n === 0 && prompts !== null && prompts >= 3 ? ' – unused so far' : ''

  return ` · ${tools} tools · ${n} call${n === 1 ? '' : 's'}${idle}`
}
