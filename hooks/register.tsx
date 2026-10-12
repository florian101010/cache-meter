// cache-meter: what the prompt cache and the token budget are doing, at a glance.
//
// Band above the prompt:  ● cache 42m ■■■■■■■□□□ 93% hit · ☀ context 9% (auto-compact 97%) [Compact]
// Pane /tokens:           every main-thread request as a stacked bar (read / written / new), session
//                         sums, subagents, rate limits, cost, keepwarm.
// /keepwarm [2h|off]:     pings the cache through $.model.fork shortly before it lapses.
//
// Single source of truth for every API fact below: the official docs
// (https://code.claude.com/docs/en/plugins/mods/overview and its pages) and the type declaration of
// the running build (.claude-plugin/types/claude-code/index.d.ts) — not memory. Sections cited as
// "interface § …", "prompt-caching § …" etc. are pages under https://code.claude.com/docs/en/.
//
// Sources: turn.step (each request's four token counts), session.measure (context, limits, cost),
// $.session.usage summary (auto-compact point, estimated locally), classic.SessionStart (resume:
// time since the last response; /clear, /resume, /branch reset $.state), classic.PostModelSwitch
// (the engine's own cache_ttl and re-cache estimate).

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CacheInfo, ColdWrite, KeepWarm, Measure, Totals, TtlConfig, Usage4 } from '../types'
import {
  COLD_MIN,
  HOUR,
  MAX_PINGS,
  PING_HIT_SHARE,
  PING_SHARE,
  PING_WRITE_SHARE,
  ZERO,
  add,
  cacheStatus,
  duration,
  forecast,
  hhmm,
  hitPct,
  litCells,
  meter,
  PALETTE,
  parseKeepWarm,
  rasterCells,
  remainingLabel,
  resolveTtl,
  right,
  short,
  sparkline,
  stack,
  tall,
} from './lib'
import type { Palette } from './lib'

const PANE = 'cache-meter'
const TICK_MS = 15_000
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
    }))
  } catch {
    // No reading: the band waits for the first session.measure.
  }
}

async function tick($: EngineInterface) {
  $.ui.invalidate('ui.render')
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

async function pressKeepWarm($: EngineInterface, ms: number | null) {
  $.ui.toast(ms === null ? await stopKeepWarm($) : await startKeepWarm($, ms), { timeoutMs: 8_000 })
}

export const register: Register = (on, options) => {
  setting = typeof options.cacheTtl === 'string' ? options.cacheTtl : 'auto'
  isPinging = false
  mainRequests = 0

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await loadTtlConfig($)
    await measureNow($)
    // Hooks also run under -p and the SDK, where nothing draws (overview § Where mods run).
    isInteractive = e.isInteractive
    if (e.isInteractive) {
      // Returning the promise lets a mock clock await the tick (test § Test a timer).
      $.clock.every(TICK_MS, () => tick($))
    }
    try {
      await $.command.register({ name: 'tokens', description: 'Show token and prompt-cache usage of this session in a pane' })
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
    const result = await next(e)
    await loadTtlConfig($)
    await measureNow($)
    if ((e.source === 'resume' || e.source === 'fork') && e.seconds_since_last_response !== undefined) {
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

    return result
  })

  // Each model request: the four token counts as the API reported them (events § Follow a turn).
  // Whether a keepwarm fork raises turn.step is undocumented ('re-entry' covers a hook's own call,
  // and the ping comes from a timer). Worst case it shows as one row in the history; no real request
  // is filtered out here, because a filter would drop requests that end during a ping.
  on('turn.step', async function* ($, e, next) {
    const isMain = e.agentId === undefined
    // Counted before the first await, so a turn.complete that follows cannot be overtaken.
    if (isMain) mainRequests += 1
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
        await update($, stepsA, list => [...list, { ...u, at: startedAt, model: usage.model }].slice(-STEPS_KEPT))
        await update($, totalsA, t => ({ ...t, main: add(t.main, u), mainSteps: t.mainSteps + 1 }))
        await update($, cacheA, () => ({
          lastAt: startedAt,
          hitPct: hitPct(u),
          contextTokens: u.input + u.read + u.write + u.output,
          rewriteUsd: null,
          coldReason: null,
          idleBeforeMs: null,
        }))
        // Cold by the clock AND by the counts (more written than read), so a wrong TTL assumption
        // cannot turn a warm request into a "cold" one.
        if (wasCold && before !== null && u.write >= COLD_MIN && u.read < u.write) {
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

    return result
  })

  // A main turn has ended, also when aborted (events § Follow a turn; TurnCompleteInput.isAborted):
  // no main request runs any more. Resets the counter even if an aborted stream never reached its
  // finally above, so /keepwarm cannot stall silently.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) mainRequests = 0

    return next(e)
  })

  // After each main-thread turn: context fill, rate limits, cost.
  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    const before = await read($, measureA)
    // The auto-compact point changes only with the window (or the model): compute it once per window.
    let auto: { pct: number | null; isOff: boolean; isKnown: boolean } | null = null
    if (before === null || before.autoCompactWindow !== e.context.window) {
      try {
        const usage = await $.session.usage({ breakdown: 'summary' })
        auto = autoCompactOf(usage.context.breakdown, e.context.window)
      } catch {
        auto = null
      }
    }
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
    const result = await next(e)
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

    return result
  })

  on('command.run', { command: 'tokens' }, async $ => {
    // rows: the height to ask for when the pane sits above the prompt; default a third (types: PaneOpenArgs.rows).
    await $.ui.open({ id: PANE, title: 'Tokens & Cache', rows: 44 })

    return { text: 'Opened the "Tokens & Cache" pane.' }
  })

  on('command.run', { command: 'keepwarm' }, async ($, e) => {
    const ms = parseKeepWarm(e.args)
    if (ms === undefined) return { text: 'Usage: /keepwarm [10m … 8h | off] – 2h when left out.' }

    return { text: ms === null ? await stopKeepWarm($) : await startKeepWarm($, ms) }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // What the mods after this one draw: kept beneath this row (interface § Pick where to draw › Band).
    const theirs = await next(e)
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
    const minBar = 6
    const showRewrite = rewriteText !== '' && base + rewriteText.length + autoText.length + minBar < cols
    const showAuto = autoText !== '' && base + autoText.length + (showRewrite ? rewriteText.length : 0) + minBar < cols
    const free = cols - base - (showAuto ? autoText.length : 0) - (showRewrite ? rewriteText.length : 0) - 1
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
        {showRewrite && (
          <Text color={status.kind === 'expired' ? 'warning' : 'claude'} wrap="truncate-end">
            {rewriteText}
          </Text>
        )}
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
    const { Box, Button, Text } = $.ui.resolve(e)
    // Raster (colored cells) is drawn by the terminal only (reference › Elements); elsewhere text bars.
    const Raster = e.surface === 'terminal' ? $.ui.resolve(e).Raster : null
    const steps = await read($, stepsA)
    const totals: Totals = await read($, totalsA)
    const measure = await read($, measureA)
    const cache = await read($, cacheA)
    const keep: KeepWarm = await read($, keepA)
    const colds = await read($, coldA)
    const ttl = await ttlNow($)
    const now = await $.clock.now()
    const status = cacheStatus(cache, now, ttl.ms)
    // Cards have a round border and one column of padding on each side: 4 columns of chrome.
    const inner = Math.max(20, e.props.bodyColumns - 4)
    const rows = e.props.scroll.bodyRows

    // A one-row meter: gradient cells in the terminal, a text bar elsewhere.
    const gauge = (key: string, lit: number, palette: Palette, color: string, markerAt: number | null = null) =>
      Raster ? (
        <Raster key={key} columns={inner} rows={1} cells={rasterCells(meter(inner, lit, palette, markerAt))} />
      ) : (
        <Text>
          <Text color={color}>{'█'.repeat(Math.min(lit, inner))}</Text>
          <Text color="inactive">
            {[...'░'.repeat(Math.max(0, inner - lit))].map((c, k) => (markerAt !== null && k + lit === markerAt ? '┃' : c)).join('')}
          </Text>
        </Text>
      )

    // --- cache card ---------------------------------------------------------------------------
    const isLow = status.kind === 'warm' && status.remaining <= ttl.ms * PING_SHARE
    const stateColor = status.kind === 'warm' ? (isLow ? 'warning' : 'success') : 'error'
    const palette = status.kind === 'warm' ? (isLow ? PALETTE.low : PALETTE.warm) : PALETTE.cold
    const minutes = status.kind === 'warm' ? Math.ceil(status.remaining / 60_000) : 0
    const digits = status.kind === 'warm' ? tall(status.remaining >= 60_000 ? String(minutes) : String(Math.ceil(status.remaining / 1000))) : tall('--')
    const unit = status.kind === 'warm' ? (status.remaining >= 60_000 ? 'min left' : 's left') : ''
    const stateWord = status.kind === 'warm' ? 'WARM' : status.kind === 'empty' ? 'EMPTY' : 'EXPIRED'
    const rewriteTokens = measure?.tokens ?? cache?.contextTokens ?? 0
    const sub =
      status.kind === 'warm'
        ? ` · ${unit}`
        : status.kind === 'empty'
          ? ' · no answer yet'
          : rewriteTokens > 0
            ? ` · next message re-writes ≈ ${cache?.rewriteUsd != null ? `$${cache.rewriteUsd.toFixed(2)}` : `${short(rewriteTokens)} tokens`}`
            : ''
    const sessionHit = hitPct(totals.main)
    const lit = status.kind === 'warm' ? litCells(status.remaining, ttl.ms, inner) : 0

    // --- keepwarm card ------------------------------------------------------------------------
    const isKeeping = keep.until !== null && keep.until > now
    const pingIn = status.kind === 'warm' ? Math.max(0, status.remaining - ttl.ms * PING_SHARE) : 0
    const canKeep = isInteractive && status.kind === 'warm' && ttl.ms >= HOUR

    // --- context card -------------------------------------------------------------------------
    const percent = measure?.percent ?? null
    const auto = measure?.autoCompactPct ?? null
    const ctxLit = percent === null ? 0 : Math.round((percent / 100) * inner)
    const marker = auto === null ? null : Math.min(inner - 1, Math.round((auto / 100) * inner))

    // --- requests card ------------------------------------------------------------------------
    const limits = measure?.limits ?? []
    const coldLines = Math.min(3, colds.length)
    const shown = steps.slice(-Math.max(3, rows - 36 - limits.length - coldLines))
    const barWidth = Math.max(8, inner - 34)
    const top = Math.max(1, ...shown.map(s => s.input + s.read + s.write))

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Text color="claude" bold>
            ◉ Cache Meter
          </Text>
          <Text dimColor>prompt cache · tokens · Claude Code mod</Text>
        </Box>

        <Box borderStyle="round" borderColor={stateColor} paddingX={1} flexDirection="column">
          <Box flexDirection="row">
            <Box flexDirection="column">
              {digits.map(line => (
                <Text color={stateColor} bold>
                  {line}
                </Text>
              ))}
            </Box>
            <Box flexDirection="column" marginLeft={2}>
              <Text>
                <Text color={stateColor} bold>
                  {stateWord}
                </Text>
                <Text dimColor>{sub}</Text>
              </Text>
              <Text>
                <Text dimColor>hit </Text>
                <Text bold color={hitColor(cache?.hitPct ?? null)}>
                  {cache?.hitPct == null ? '–' : `${cache.hitPct}%`}
                </Text>
                <Text dimColor> last request · </Text>
                <Text bold color={hitColor(sessionHit)}>
                  {sessionHit === null ? '–' : `${sessionHit}%`}
                </Text>
                <Text dimColor> session</Text>
              </Text>
              <Text dimColor>
                TTL {ttl.label} · {ttl.source}
              </Text>
            </Box>
          </Box>
          {gauge('countdown', lit, palette, stateColor)}
        </Box>

        <Box borderStyle="round" borderColor="claude" borderDimColor={!isKeeping} paddingX={1} flexDirection="column">
          {isKeeping && keep.until !== null ? (
            <Box flexDirection="column">
              <Text>
                <Text color="claude" bold>
                  ↻ Keepwarm on
                </Text>
                <Text dimColor> until {hhmm(keep.until)}</Text>
              </Text>
              <Text dimColor>
                {keep.pings}/{MAX_PINGS} pings · {short(keep.readTokens)} tokens read · next ping in ~{remainingLabel(pingIn)}
              </Text>
              <Box flexDirection="row">
                <Button key="keepwarm-stop" plain hotkey="s" onPress={() => pressKeepWarm($, null)}>
                  <Text color="claude" bold>
                    Stop keepwarm
                  </Text>
                </Button>
              </Box>
            </Box>
          ) : (
            <Box flexDirection="column">
              <Text>
                <Text color="claude" bold>
                  ↻ Keepwarm
                </Text>
                <Text dimColor> off{keep.pings > 0 ? ` · last run ${keep.pings} pings` : ''}</Text>
              </Text>
              <Text dimColor>Stepping away? Keep this cache warm – a ping costs about 1/20 of a re-write.</Text>
              {canKeep ? (
                <Box flexDirection="row" columnGap={2}>
                  <Button key="keepwarm-start" plain hotkey="w" onPress={() => pressKeepWarm($, 2 * HOUR)}>
                    <Text color="claude" bold>
                      Keep warm 2h
                    </Text>
                  </Button>
                  <Text dimColor>or /keepwarm 30m … 8h</Text>
                </Box>
              ) : (
                <Text dimColor>
                  {!isInteractive
                    ? 'Interactive sessions only.'
                    : ttl.ms < HOUR
                      ? `Not worth it at a ${ttl.label} TTL.`
                      : 'Available once the cache is warm (after the next answer).'}
                </Text>
              )}
            </Box>
          )}
        </Box>

        <Box borderStyle="round" borderDimColor paddingX={1} flexDirection="column">
          <Text>
            <Text color="claude" bold>
              Context{' '}
            </Text>
            <Text bold>{percent === null ? '–' : `${percent}%`}</Text>
            <Text dimColor>{measure?.tokens == null ? '' : `  ${short(measure.tokens)} / ${short(measure.window)}`}</Text>
          </Text>
          {gauge('context', ctxLit, PALETTE.context, 'suggestion', marker)}
          <Text dimColor>
            {measure?.isAutoCompactOff
              ? 'auto-compact off'
              : auto === null
                ? 'auto-compact unknown'
                : `┃ auto-compact at ${auto}%`}
            {measure !== null && measure.history.length > 2 ? `   trend ${sparkline(measure.history)}` : ''}
          </Text>
        </Box>

        <Box borderStyle="round" borderDimColor paddingX={1} flexDirection="column">
          <Text>
            <Text color="claude" bold>
              Requests{' '}
            </Text>
            <Text dimColor>main conversation · newest last</Text>
          </Text>
          {shown.length === 0 && <Text dimColor>No request measured yet.</Text>}
          {shown.map(s => {
            const seg = stack(s, top, barWidth)
            const used = Math.min(barWidth, seg.read + seg.write + seg.input)
            const hit = hitPct(s)

            return (
              <Text>
                <Text dimColor>{hhmm(s.at)} </Text>
                <Text color="success">{'█'.repeat(Math.min(seg.read, barWidth))}</Text>
                <Text color="warning">{'█'.repeat(Math.max(0, Math.min(seg.write, barWidth - seg.read)))}</Text>
                <Text color="error">{'█'.repeat(Math.max(0, Math.min(seg.input, barWidth - seg.read - seg.write)))}</Text>
                <Text color="inactive">{'·'.repeat(barWidth - used)}</Text>
                <Text> {right(short(s.input + s.read + s.write), 6)} </Text>
                <Text bold color={hitColor(hit)}>
                  {right(hit === null ? '–' : `${hit}%`, 4)}
                </Text>
                <Text dimColor> hit · out {short(s.output)}</Text>
              </Text>
            )
          })}
          <Text>
            <Text color="success">█</Text>
            <Text dimColor> read from cache  </Text>
            <Text color="warning">█</Text>
            <Text dimColor> written to cache  </Text>
            <Text color="error">█</Text>
            <Text dimColor> new (uncached)</Text>
          </Text>
        </Box>

        <Box borderStyle="round" borderDimColor paddingX={1} flexDirection="column">
          <Text color="claude" bold>
            Session
          </Text>
          <Text>
            <Text dimColor>{'Main       '}</Text>
            {usageLine(totals.main)}
            <Text dimColor> · {totals.mainSteps} requests</Text>
          </Text>
          {totals.subSteps > 0 && (
            <Text>
              <Text dimColor>{'Subagents  '}</Text>
              {usageLine(totals.sub)}
              <Text dimColor> · {totals.subSteps} requests</Text>
            </Text>
          )}
          <Text>
            <Text dimColor>{'Cost       '}</Text>
            <Text bold>{measure?.usd == null ? '–' : `$${measure.usd.toFixed(2)}`}</Text>
            <Text dimColor> (as /cost, list price)</Text>
          </Text>
          {colds.length === 0 ? (
            <Text>
              <Text dimColor>{'Cold       '}</Text>
              <Text color="success">None – the cache was warm for every request.</Text>
            </Text>
          ) : (
            <Box flexDirection="column">
              <Text>
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
                <Text>
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
          <Text color="claude" bold>
            Plan limits
          </Text>
          {limits.length === 0 && <Text dimColor>No reading (no subscription, or no answer yet).</Text>}
          {limits.map(l => {
            const width = Math.max(10, Math.min(30, inner - 34))
            const used = Math.max(0, Math.min(width, Math.round((l.percentUsed / 100) * width)))

            return (
              <Text>
                <Text dimColor>{limitName(l.kind).padEnd(11)}</Text>
                <Text color={l.percentUsed >= 90 ? 'error' : l.percentUsed >= 70 ? 'warning' : 'success'}>{'█'.repeat(used)}</Text>
                <Text color="inactive">{'░'.repeat(width - used)}</Text>
                <Text bold> {right(`${l.percentUsed}%`, 4)}</Text>
                <Text dimColor>{l.resetsAt ? ` · resets ${resetLabel(l.resetsAt)}` : ''}</Text>
              </Text>
            )
          })}
        </Box>

        <Box flexDirection="row" justifyContent="space-between">
          <Text dimColor>Hit rate = read ÷ (new + read + written) · cross-check: /usage</Text>
          <Button key="pane-compact" plain hotkey="c" onPress={() => compactNow($)}>
            Compact
          </Button>
        </Box>
        <Text dimColor>
          Keys work while the pane has focus (ctrl+x tab): {isKeeping ? 's stop keepwarm' : canKeep ? 'w keep warm 2h' : ''}
          {isKeeping || canKeep ? ' · ' : ''}c compact · Esc back to the prompt
        </Text>
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
  return `read ${short(u.read)} · written ${short(u.write)} · new ${short(u.input)} · output ${short(u.output)}`
}

/** Green from 80 %, yellow from 50 %, red below; plain while unknown. */
function hitColor(pct: number | null): string | undefined {
  if (pct === null) return undefined
  if (pct >= 80) return 'success'
  if (pct >= 50) return 'warning'

  return 'error'
}
