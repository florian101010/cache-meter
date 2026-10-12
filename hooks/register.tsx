// cache-meter: what the prompt cache and the token budget are doing, at a glance.
//
// Band above the prompt:  ● cache 42m ■■■■■■■□□□ 93% hit · ☀ Kontext 9% (Auto-Compact 97%) [Compact]
// Pane /tokens:           every main-thread request as a stacked bar (read / written / new), session
//                         sums, subagents, rate limits, cost, keepwarm.
// /keepwarm [2h|aus]:     pings the cache through $.model.fork shortly before it lapses.
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

import type { CacheInfo, KeepWarm, Measure, Totals, TtlConfig, Usage4 } from '../types'
import {
  HOUR,
  MAX_PINGS,
  PING_HIT_SHARE,
  PING_SHARE,
  ZERO,
  add,
  cacheStatus,
  forecast,
  hhmm,
  hitPct,
  litCells,
  parseKeepWarm,
  remainingLabel,
  resolveTtl,
  short,
  sparkline,
  stack,
} from './lib'

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
})
const measureA = atom({ plugin: 'cache-meter', key: 'measure' } as const, null)
const ttlA = atom({ plugin: 'cache-meter', key: 'reportedTtl' } as const, null)
const keepA = atom({ plugin: 'cache-meter', key: 'keepWarm' } as const, {
  until: null,
  pings: 0,
  readTokens: 0,
  lastPingAt: null,
})
const ttlConfigA = atom({ plugin: 'cache-meter', key: 'ttlConfig' } as const, {
  force5m: false,
  envTtl: null,
  settingTtl: null,
  enable1h: false,
})

// Module values the top-level helpers read: the option (fixed per load) and a ping in flight.
// Neither is drawn, so losing them on a reload costs nothing (interface § Keep state).
let setting = 'auto'
let isPinging = false

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
  if (keep.until === null || isPinging) return
  const now = await $.clock.now()
  if (now > keep.until || keep.pings >= MAX_PINGS) {
    await update($, keepA, k => ({ ...k, until: null }))
    $.ui.toast(`Warmhalten beendet (${keep.pings} Pings)`)

    return
  }
  const ttl = await ttlNow($)
  if (ttl.ms < HOUR) {
    await update($, keepA, k => ({ ...k, until: null }))
    $.ui.toast(`Warmhalten aus: TTL ist jetzt ${ttl.label} (${ttl.source})`)

    return
  }
  const cache = await read($, cacheA)
  const status = cacheStatus(cache, now, ttl.ms)
  if (status.kind !== 'warm' || cache === null) {
    await update($, keepA, k => ({ ...k, until: null }))
    $.ui.toast(status.kind === 'empty' ? 'Kein Cache zum Warmhalten – aus' : 'Cache schon abgelaufen – Warmhalten aus')

    return
  }
  if (status.remaining > ttl.ms * PING_SHARE) return
  isPinging = true
  try {
    // The lifetime counts from the start of the request that reads the entry (prompt-caching).
    const startedAt = await $.clock.now()
    const reply = await $.model.fork({ prompt: 'Antworte nur mit dem Wort: warm' })
    if (!reply.isAnswered) {
      await update($, keepA, k => ({ ...k, until: null }))
      $.ui.toast(`Warmhalten aus: Ping ohne Antwort (${reply.reason})`)

      return
    }
    const measure = await read($, measureA)
    const expected = measure?.tokens ?? cache.contextTokens
    const got = reply.usage.cache_read_input_tokens
    await update($, keepA, k => ({ ...k, pings: k.pings + 1, readTokens: k.readTokens + got, lastPingAt: startedAt }))
    if (expected > 0 && got < expected * PING_HIT_SHARE) {
      // The ping rebuilt the cache instead of reading it: the TTL assumption is wrong. Stop paying.
      await update($, keepA, k => ({ ...k, until: null }))
      $.ui.toast(`Warmhalten aus: Ping traf den Cache nicht (${short(got)} von ${short(expected)} gelesen)`)

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
      $.ui.toast(`Compact übersprungen: ${result.skip}`)

      return
    }
    // $.session.compact runs every hook but the caller's, so the session.compact hook below may
    // not see this one; resetting here too is idempotent.
    await resetCache($)
  } catch (error) {
    $.ui.toast(`Compact geht gerade nicht: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export const register: Register = (on, options) => {
  setting = typeof options.cacheTtl === 'string' ? options.cacheTtl : 'auto'
  isPinging = false

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await loadTtlConfig($)
    await measureNow($)
    // Hooks also run under -p and the SDK, where nothing draws (overview § Where mods run).
    if (e.isInteractive) {
      // Returning the promise lets a mock clock await the tick (test § Test a timer).
      $.clock.every(TICK_MS, () => tick($))
    }
    try {
      await $.command.register({ name: 'tokens', description: 'Token- und Cache-Nutzung dieser Session im Pane zeigen' })
      await $.command.register({
        name: 'keepwarm',
        description: 'Prompt-Cache warmhalten (kostet je Ping eine Cache-Lesung des Kontexts)',
        argumentHint: '[2h | 30m | aus]',
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
      const cache: CacheInfo = {
        lastAt: now - e.seconds_since_last_response * 1000,
        hitPct: null,
        contextTokens: e.context_tokens ?? 0,
        rewriteUsd: e.estimated_cache_write_usd ?? null,
      }
      await update($, cacheA, () => cache)
    }

    return result
  })

  // Each model request: the four token counts as the API reported them (events § Follow a turn).
  on('turn.step', async function* ($, e, next) {
    const startedAt = await $.clock.now()
    const result = yield* next(e)
    const usage = result.usage
    // Whether a keepwarm fork raises turn.step is undocumented: leave its request out either way.
    if (usage !== null && !isPinging) {
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
        }))
      }
    }

    return result
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
      }
      await update($, cacheA, () => cold)
      await update($, measureA, m => (m === null ? m : { ...m, autoCompactWindow: 0 }))
    }

    return result
  })

  on('command.run', { command: 'tokens' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Tokens & Cache' })

    return { text: 'Pane „Tokens & Cache“ geöffnet.' }
  })

  on('command.run', { command: 'keepwarm' }, async ($, e) => {
    const ms = parseKeepWarm(e.args)
    if (ms === undefined) return { text: 'Aufruf: /keepwarm [30m … 8h | aus] – ohne Angabe 2h.' }
    if (ms === null) {
      const keep = await read($, keepA)
      await update($, keepA, k => ({ ...k, until: null }))

      return { text: `Warmhalten aus (${keep.pings} Pings, ${short(keep.readTokens)} Tokens aus dem Cache gelesen).` }
    }
    const now = await $.clock.now()
    const ttl = await ttlNow($)
    if (ttl.ms < HOUR) {
      return {
        text: `Bei ${ttl.label}-TTL (${ttl.source}) lohnt Warmhalten nicht: ein Ping alle paar Minuten. Nicht gestartet.`,
      }
    }
    if (cacheStatus(await read($, cacheA), now, ttl.ms).kind !== 'warm') {
      return { text: 'Kein warmer Cache – Warmhalten startet erst nach der nächsten Antwort sinnvoll.' }
    }
    await update($, keepA, () => ({ until: now + ms, pings: 0, readTokens: 0, lastPingAt: null }))

    return {
      text:
        `Warmhalten bis ${hhmm(now + ms)}, höchstens ${MAX_PINGS} Pings: einer, sobald weniger als ` +
        `${remainingLabel(ttl.ms * PING_SHARE)} TTL übrig sind (TTL ${ttl.label}, ${ttl.source}). Jeder Ping ` +
        `liest den ganzen Kontext aus dem Cache. Trifft ein Ping den Cache nicht, schaltet es sich ab.`,
    }
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
    const label = status.kind === 'warm' ? remainingLabel(status.remaining) : status.kind === 'empty' ? 'leer' : 'abgelaufen'
    const hit = cache === null || cache.hitPct === null ? '–' : `${cache.hitPct}%`
    const pct = percent === null ? '–' : `${percent}%`
    const autoText = measure?.isAutoCompactOff ? ' (Auto-Compact aus)' : auto === null ? '' : ` (Auto-Compact ${auto}%)`
    const rewriteTokens = measure?.tokens ?? cache?.contextTokens ?? 0
    const rewriteText =
      status.kind === 'expired' && cache !== null && rewriteTokens > 0
        ? ` · Neuschreiben ${cache.rewriteUsd !== null ? `≈ $${cache.rewriteUsd.toFixed(2)}` : `≈ ${short(rewriteTokens)} Tok`}`
        : ''
    const base =
      '● cache '.length +
      label.length +
      (isKeeping ? 2 : 0) +
      1 +
      hit.length +
      ' hit · '.length +
      (sky ? 2 : 0) +
      'Kontext '.length +
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
        <Text bold>{hit}</Text>
        <Text dimColor> hit · </Text>
        {sky && <Text color={sky.color}>{sky.icon} </Text>}
        <Text dimColor>Kontext </Text>
        <Text bold>{pct}</Text>
        {showAuto && <Text dimColor>{autoText}</Text>}
        {showRewrite && (
          <Text color="warning" wrap="truncate-end">
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
    const steps = await read($, stepsA)
    const totals: Totals = await read($, totalsA)
    const measure = await read($, measureA)
    const cache = await read($, cacheA)
    const keep: KeepWarm = await read($, keepA)
    const ttl = await ttlNow($)
    const now = await $.clock.now()
    const status = cacheStatus(cache, now, ttl.ms)
    const cols = e.props.bodyColumns
    const rows = e.props.scroll.bodyRows

    const shown = steps.slice(-Math.max(3, rows - 24))
    const barWidth = Math.max(10, cols - 34)
    const top = Math.max(1, ...shown.map(s => s.input + s.read + s.write))
    const sessionHit = hitPct(totals.main)
    const limits = measure?.limits ?? []

    return (
      <Box flexDirection="column">
        <Text bold>Cache</Text>
        <Text>
          {status.kind === 'warm' ? (
            <Text color="success">warm · noch {remainingLabel(status.remaining)}</Text>
          ) : (
            <Text color="error">{status.kind === 'empty' ? 'leer – noch keine Antwort' : 'abgelaufen'}</Text>
          )}
          <Text dimColor>
            {'  '}TTL {ttl.label} ({ttl.source}) · Treffer letzte Anfrage{' '}
            {cache?.hitPct == null ? '–' : `${cache.hitPct}%`} · Session {sessionHit === null ? '–' : `${sessionHit}%`}
          </Text>
        </Text>
        <Text dimColor>
          Warmhalten:{' '}
          {keep.until !== null && keep.until > now
            ? `an bis ${hhmm(keep.until)} · ${keep.pings}/${MAX_PINGS} Pings · ${short(keep.readTokens)} Tok gelesen`
            : `aus (/keepwarm 2h)${keep.pings > 0 ? ` · zuletzt ${keep.pings} Pings` : ''}`}
        </Text>
        <Text> </Text>

        <Text bold>Kontext</Text>
        <Text>
          {measure?.percent == null ? '–' : `${measure.percent}%`}
          <Text dimColor>
            {'  '}
            {measure?.tokens == null ? '' : `${short(measure.tokens)} / ${short(measure.window)} · `}
            {measure?.isAutoCompactOff
              ? 'Auto-Compact aus'
              : measure?.autoCompactPct == null
                ? 'Auto-Compact unbekannt'
                : `Auto-Compact bei ${measure.autoCompactPct}%`}
          </Text>
          {measure !== null && measure.history.length > 1 && (
            <Text color="suggestion">
              {'  '}
              {sparkline(measure.history)}
            </Text>
          )}
        </Text>
        <Text> </Text>

        <Text bold>Anfragen im Hauptthread (neueste unten)</Text>
        {shown.length === 0 && <Text dimColor>Noch keine Anfrage gemessen.</Text>}
        {shown.map(s => {
          const seg = stack(s, top, barWidth)
          const hit = hitPct(s)

          return (
            <Text>
              <Text dimColor>{hhmm(s.at)} </Text>
              <Text color="success">{'█'.repeat(seg.read)}</Text>
              <Text color="warning">{'█'.repeat(seg.write)}</Text>
              <Text color="error">{'█'.repeat(seg.input)}</Text>
              <Text dimColor>
                {' '}
                {short(s.input + s.read + s.write)} · {hit === null ? '–' : `${hit}%`} · aus {short(s.output)}
              </Text>
            </Text>
          )
        })}
        <Text>
          <Text color="success">█</Text>
          <Text dimColor> aus Cache gelesen  </Text>
          <Text color="warning">█</Text>
          <Text dimColor> in Cache geschrieben  </Text>
          <Text color="error">█</Text>
          <Text dimColor> neu (ungecacht)</Text>
        </Text>
        <Text> </Text>

        <Text bold>Summen dieser Session</Text>
        <Text>
          <Text dimColor>Hauptthread  </Text>
          {usageLine(totals.main)}
          <Text dimColor> · {totals.mainSteps} Anfragen</Text>
        </Text>
        <Text>
          <Text dimColor>Subagenten   </Text>
          {usageLine(totals.sub)}
          <Text dimColor> · {totals.subSteps} Anfragen</Text>
        </Text>
        <Text>
          <Text dimColor>Kosten       </Text>
          {measure?.usd == null ? '–' : `$${measure.usd.toFixed(2)}`}
          <Text dimColor> (wie /cost, Listenpreis)</Text>
        </Text>
        <Text> </Text>

        <Text bold>Limits</Text>
        {limits.length === 0 && <Text dimColor>Keine Messung (kein Abo oder noch keine Antwort).</Text>}
        {limits.map(l => {
          const lit = Math.max(0, Math.min(20, Math.round((l.percentUsed / 100) * 20)))

          return (
            <Text>
              <Text dimColor>{limitName(l.kind).padEnd(12)} </Text>
              <Text color={l.percentUsed >= 90 ? 'error' : l.percentUsed >= 70 ? 'warning' : 'success'}>
                {'■'.repeat(lit)}
              </Text>
              <Text color="inactive">{'■'.repeat(20 - lit)}</Text>
              <Text> {l.percentUsed}%</Text>
              <Text dimColor>{l.resetsAt ? ` · Reset ${resetLabel(l.resetsAt)}` : ''}</Text>
            </Text>
          )
        })}
        <Text> </Text>
        <Text dimColor>
          Treffer = gelesen ÷ (neu + gelesen + geschrieben) je Anfrage. Die TTL meldet keine Mod-Schnittstelle je
          Anfrage; Quelle der Annahme steht oben. Gegenprobe: /usage → „Prompt cache (main)“.
        </Text>
        <Box flexDirection="row">
          <Button key="pane-compact" label="Compact" onPress={() => compactNow($)} />
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
  if (kind === 'five_hour') return '5 Stunden'
  if (kind === 'seven_day') return '7 Tage'
  if (kind === 'spend_limit') return 'Ausgabelimit'

  return kind
}

function resetLabel(iso: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return iso
  const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

  return `${days[new Date(ms).getDay()]} ${hhmm(ms)}`
}

function usageLine(u: Usage4) {
  return `gelesen ${short(u.read)} · geschrieben ${short(u.write)} · neu ${short(u.input)} · Ausgabe ${short(u.output)}`
}
