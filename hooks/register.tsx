// cache-meter: what the prompt cache and the token budget are doing, at a glance.
//
// Band above the prompt:  ● cache 42m ■■■■■■■□□□ 93% hit · ☀ Kontext 9% (Auto-Compact 97%) [Compact]
// Pane /tokens:           every request as a stacked bar (read / written / new), session sums,
//                         subagents, rate limits, cost, keepwarm.
// /keepwarm [2h|aus]:     pings the cache through $.model.fork shortly before it lapses.
//
// Sources: turn.step (each request's four token counts), session.measure (context, limits,
// cost), $.session.usage summary (auto-compact point), classic.SessionStart (resume: time since
// the last response), classic.PostModelSwitch (the engine's own cache_ttl).

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { KeepWarm, Measure, Step, Totals, Usage4 } from '../types'
import {
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

const KEEP_OFF: KeepWarm = { until: null, pings: 0, readTokens: 0, lastPingAt: null }

// Module values the top-level helpers read: the option, fixed per load, and a ping in flight.
let setting = 'auto'
let isPinging = false

async function ttlNow($: EngineInterface) {
  const measure = await read($, measureA)

  return resolveTtl(setting, await read($, ttlA), measure?.limits ?? [])
}

async function tick($: EngineInterface) {
  $.ui.invalidate('ui.render')
  const keep = await read($, keepA)
  if (keep.until === null || isPinging) return
  const now = await $.clock.now()
  if (now > keep.until) {
    await update($, keepA, k => ({ ...k, until: null }))
    $.ui.toast(`Warmhalten beendet (${keep.pings} Pings)`)

    return
  }
  const ttl = await ttlNow($)
  const status = cacheStatus(await read($, cacheA), now, ttl.ms)
  if (status.kind !== 'warm') {
    await update($, keepA, k => ({ ...k, until: null }))
    $.ui.toast(status.kind === 'empty' ? 'Kein Cache zum Warmhalten – aus' : 'Cache schon abgelaufen – Warmhalten aus')

    return
  }
  if (status.remaining > ttl.ms * PING_SHARE) return
  isPinging = true
  try {
    const reply = await $.model.fork({ prompt: 'Antworte nur mit dem Wort: warm' })
    if (reply.isAnswered) {
      const at = await $.clock.now()
      await update($, cacheA, c => (c === null ? c : { ...c, lastAt: at }))
      await update($, keepA, k => ({
        ...k,
        pings: k.pings + 1,
        readTokens: k.readTokens + reply.usage.cache_read_input_tokens,
        lastPingAt: at,
      }))
    } else {
      await update($, keepA, k => ({ ...k, until: null }))
      $.ui.toast(`Warmhalten aus: Ping ohne Antwort (${reply.reason})`)
    }
  } finally {
    isPinging = false
  }
}

async function compactNow($: EngineInterface) {
  try {
    const result = await $.session.compact()
    if ('skip' in result && result.skip) $.ui.toast(`Compact übersprungen: ${result.skip}`)
  } catch (error) {
    $.ui.toast(`Compact geht gerade nicht: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function resetCache($: EngineInterface) {
  await update($, cacheA, () => null)
  await update($, measureA, m => (m === null ? m : { ...m, percent: null, tokens: null }))
}

export const register: Register = (on, options) => {
  setting = typeof options.cacheTtl === 'string' ? options.cacheTtl : 'auto'
  isPinging = false

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({
      name: 'tokens',
      description: 'Token- und Cache-Nutzung dieser Session im Pane zeigen',
    })
    await $.command.register({
      name: 'keepwarm',
      description: 'Prompt-Cache warmhalten (kostet je Ping eine Cache-Lesung des Kontexts)',
      argumentHint: '[2h | 30m | aus]',
    })
    try {
      const usage = await $.session.usage({ breakdown: 'summary' })
      await update($, measureA, m => ({
        percent: usage.context.percent ?? null,
        tokens: usage.context.tokens ?? null,
        window: usage.context.window,
        autoCompactPct: autoCompactOf(usage.context.breakdown, usage.context.window),
        history: m?.history ?? [],
        limits: usage.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
        usd: usage.cost?.usd ?? null,
      }))
    } catch {
      // No first reading: the band waits for the first session.measure.
    }
    $.clock.every(TICK_MS, () => {
      void tick($)
    })

    return result
  })

  // Each model request: the four token counts as the API reported them.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const usage = result.usage
    if (usage !== null) {
      const at = await $.clock.now()
      const u: Usage4 = {
        input: usage.input_tokens,
        read: usage.cache_read_input_tokens,
        write: usage.cache_creation_input_tokens,
        output: usage.output_tokens,
      }
      const isAgent = e.agentId !== undefined
      const step: Step = { ...u, at, agent: isAgent, model: usage.model }
      await update($, stepsA, list => [...list, step].slice(-STEPS_KEPT))
      await update($, totalsA, t =>
        isAgent
          ? { ...t, sub: add(t.sub, u), subSteps: t.subSteps + 1 }
          : { ...t, main: add(t.main, u), mainSteps: t.mainSteps + 1 },
      )
      if (!isAgent) {
        await update($, cacheA, () => ({
          lastAt: at,
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
    let autoCompactPct: number | null | undefined
    if (e.changed.includes('context')) {
      try {
        const usage = await $.session.usage({ breakdown: 'summary' })
        autoCompactPct = autoCompactOf(usage.context.breakdown, e.context.window)
      } catch {
        autoCompactPct = undefined
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
        autoCompactPct: autoCompactPct === undefined ? m?.autoCompactPct ?? null : autoCompactPct,
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
  }).catch(($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await resetCache($)
      await update($, stepsA, () => [])
      await update($, totalsA, () => ({ main: ZERO, sub: ZERO, mainSteps: 0, subSteps: 0 }))
      await update($, keepA, () => KEEP_OFF)
    }

    return next(e)
  })

  // Resume / fork: the engine says how long ago the last response was, so the countdown carries on.
  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    if ((e.source === 'resume' || e.source === 'fork') && e.seconds_since_last_response !== undefined) {
      const now = await $.clock.now()
      await update($, cacheA, () => ({
        lastAt: now - e.seconds_since_last_response! * 1000,
        hitPct: null,
        contextTokens: e.context_tokens ?? 0,
        rewriteUsd: e.estimated_cache_write_usd ?? null,
      }))
    }

    return result
  }).catch(($, e, next) => next(e))

  // A model switch forfeits the cache; the event carries the engine's own TTL.
  on('classic.PostModelSwitch', async ($, e, next) => {
    const result = await next(e)
    await update($, ttlA, () => e.cache_ttl)
    await update($, cacheA, () => null)

    return result
  }).catch(($, e, next) => next(e))

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
    if (cacheStatus(await read($, cacheA), now, ttl.ms).kind !== 'warm') {
      return { text: 'Kein warmer Cache – Warmhalten startet erst nach der nächsten Antwort sinnvoll.' }
    }
    await update($, keepA, () => ({ until: now + ms, pings: 0, readTokens: 0, lastPingAt: null }))

    return {
      text:
        `Warmhalten bis ${hhmm(now + ms)}: ein Ping, sobald weniger als ${remainingLabel(ttl.ms * PING_SHARE)} ` +
        `TTL übrig sind (TTL ${ttl.label}, ${ttl.source}). Jeder Ping liest den ganzen Kontext aus dem Cache.`,
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
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
    const showAuto = cols >= 60
    // Fixed text ≈ 47 columns, the auto-compact note 19, the button 12; the bar takes what is left.
    const cells = Math.max(0, Math.min(20, cols - 47 - (showAuto ? 19 : 0) - 12))
    const lit = status.kind === 'warm' ? litCells(status.remaining, ttl.ms, cells) : 0
    const isLow = status.kind === 'warm' && status.remaining <= ttl.ms * PING_SHARE
    const sky = percent === null ? null : forecast(percent, auto)
    const isKeeping = keep.until !== null && keep.until > now

    return (
      <Box flexDirection="row">
        <Text color={status.kind === 'warm' ? 'success' : 'error'}>● </Text>
        <Text dimColor>cache </Text>
        {status.kind === 'warm' ? (
          <Text color={isLow ? 'warning' : 'success'} bold>
            {remainingLabel(status.remaining)}
          </Text>
        ) : (
          <Text color="error">{status.kind === 'empty' ? 'leer' : 'abgelaufen'}</Text>
        )}
        {isKeeping && <Text color="success"> ↻</Text>}
        <Text> </Text>
        {cells > 0 && <Text color={isLow ? 'warning' : 'success'}>{'■'.repeat(lit)}</Text>}
        {cells > 0 && <Text color="inactive">{'■'.repeat(cells - lit)}</Text>}
        {cells > 0 && <Text> </Text>}
        <Text bold>{cache?.hitPct === null || cache === null ? '–' : `${cache.hitPct}%`}</Text>
        <Text dimColor> hit · </Text>
        {sky && <Text color={sky.color}>{sky.icon} </Text>}
        <Text dimColor>Kontext </Text>
        <Text bold>{percent === null ? '–' : `${percent}%`}</Text>
        {showAuto && <Text dimColor>{auto === null ? ' (Auto-Compact aus)' : ` (Auto-Compact ${auto}%)`}</Text>}
        {status.kind === 'expired' && cache !== null && cache.contextTokens > 0 && cols >= 100 && (
          <Text color="warning">
            {' '}
            · Neuschreiben {cache.rewriteUsd !== null ? `≈ $${cache.rewriteUsd.toFixed(2)}` : `≈ ${short(cache.contextTokens)} Tok`}
          </Text>
        )}
        <Text> </Text>
        <Button key="compact" label="Compact" onPress={() => compactNow($)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const steps = await read($, stepsA)
    const totals: Totals = await read($, totalsA)
    const measure = await read($, measureA)
    const cache = await read($, cacheA)
    const keep = await read($, keepA)
    const ttl = await ttlNow($)
    const now = await $.clock.now()
    const status = cacheStatus(cache, now, ttl.ms)
    const cols = e.props.bodyColumns
    const rows = e.viewport?.rows ?? 30

    const main = steps.filter(s => !s.agent)
    const shown = main.slice(-Math.max(3, rows - 22))
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
            ? `an bis ${hhmm(keep.until)} · ${keep.pings} Pings · ${short(keep.readTokens)} Tok gelesen`
            : 'aus (/keepwarm 2h)'}
        </Text>
        <Text> </Text>

        <Text bold>Kontext</Text>
        <Text>
          {measure?.percent == null ? '–' : `${measure.percent}%`}
          <Text dimColor>
            {'  '}
            {measure?.tokens == null ? '' : `${short(measure.tokens)} / ${short(measure.window)} · `}
            {measure?.autoCompactPct == null ? 'Auto-Compact aus' : `Auto-Compact bei ${measure.autoCompactPct}%`}
          </Text>
          {measure !== null && measure.history.length > 1 && (
            <Text color="cyan">
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
              <Text color="red">{'█'.repeat(seg.input)}</Text>
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
          <Text color="red">█</Text>
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
          const lit = Math.min(20, Math.round((l.percentUsed / 100) * 20))

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
          Treffer = gelesen ÷ (neu + gelesen + geschrieben) je Anfrage. Die TTL meldet die API nicht je Anfrage:
          „angenommen“ = 60m, bei überschrittenem Abo-Limit 5m.
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
): number | null {
  if (!breakdown || !breakdown.isAutoCompactEnabled || !breakdown.autoCompactThreshold || window <= 0) return null

  return Math.round((breakdown.autoCompactThreshold / window) * 100)
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
