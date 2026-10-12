// Tests for cache-meter. How the kit fires events and stubs Claude Code's answers follows
// https://code.claude.com/docs/en/plugins/mods/test (single source of truth, not memory).

import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { FIVE_MIN, HOUR, forecast, hitPct, litCells, parseKeepWarm, remainingLabel, resolveTtl } from '../hooks/lib'

const T0 = Date.parse('2026-10-12T10:00:00Z')
const SUMMARY = [{ role: 'user' as const, text: 'Zusammenfassung', toolUses: [] }]
const NO_TTL = { setting: 'auto', force5m: false, envTtl: null, settingTtl: null, enable1h: false, reported: null, limits: [] }

function band(bodyColumns: number, isWorking = false) {
  return {
    plugin: 'cache-meter',
    component: 'AbovePrompt' as const,
    props: { hasSurvey: false, isWorking, maxRows: 3, bodyColumns, scroll: { offset: 0, bodyRows: 3 }, view: {} },
  }
}

const PANE = {
  plugin: 'cache-meter',
  component: 'Pane' as const,
  requestId: 'cache-meter',
  props: {
    title: 'Tokens & Cache',
    isFocused: false,
    bodyColumns: 90,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
}

function usageValue(tokens: number | undefined, window: number, threshold: number | undefined, rateLimits: unknown[] = []) {
  return {
    value: {
      startedAt: T0,
      context: {
        tokens,
        window,
        percent: tokens === undefined ? undefined : Math.round((tokens / window) * 100),
        breakdown: { autoCompactThreshold: threshold, isAutoCompactEnabled: threshold !== undefined },
      },
      rateLimits,
      cost: { usd: 1.5 },
    },
  } as never
}

/** Every stub a session-start-to-turn test needs; registered before the first call on $. */
function world(on: On, opts: { env?: Record<string, string>; forkRead?: number; forkWrite?: number; forkAnswer?: boolean } = {}) {
  const clock = mock.clock(on, { now: T0 })
  mock.env(on, opts.env ?? {})
  const toasts: string[] = []
  const forks: string[] = []
  // What the next main request writes to the cache; a test raises it to stage a cold rewrite.
  const next = { write: 6_000, read: 93_000, slowMs: 0 }
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn below'] }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('command.register', () => ({ value: undefined }) as never)
  on('settings.read', () => ({ value: {} }))
  on('session.usage', () => usageValue(100_000, 1_000_000, 970_000))
  on('session.start', () => ({ cwd: '/work' }))
  on('classic.SessionStart', () => ({}))
  on('classic.PostModelSwitch', () => ({}))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('session.compact', () => ({ messages: SUMMARY }))
  on('turn.complete', () => ({ text: '' }))
  on('model.fork', ($, e) => {
    forks.push(e.prompt)
    return opts.forkAnswer === false
      ? ({ value: { isAnswered: false, reason: 'nothing-to-fork' } } as never)
      : ({
          value: {
            isAnswered: true,
            text: 'warm',
            usage: { input_tokens: 5, output_tokens: 1, cache_read_input_tokens: opts.forkRead ?? 99_000, cache_creation_input_tokens: opts.forkWrite ?? 0 },
          },
        } as never)
  })
  on('turn.step', async function* ($, e) {
    // A slow request stays in flight until the test advances the clock past it (test § Test a timer).
    if (next.slowMs > 0) await clock.sleep(next.slowMs)
    yield { kind: 'text', index: 0, text: 'ok' }
    return {
      turnId: e.turnId,
      index: e.index,
      answer: 'ok',
      toolUses: [],
      stopReason: 'end_turn',
      usage: { model: 'claude-test', input_tokens: 1_000, output_tokens: 500, cache_read_input_tokens: next.read, cache_creation_input_tokens: next.write },
    } as never
  })

  return { clock, toasts, forks, next }
}

/** Runs a slash command; the kit fills origin and presentation (test § Write a test). */
function run($: Engine, command: string, args: string) {
  return $.command.run({ command, args } as never) as Promise<{ text?: string }>
}

async function step($: Engine, agentId?: string) {
  const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude-test', messageCount: 1, ...(agentId ? { agentId } : {}) })
  let next = await stream.next()
  while (next.done !== true) next = await stream.next()

  return next.value
}

test('TTL: eigene Option, dann Claude Codes Steuerung, dann Overage, dann Meldung', async () => {
  expect(resolveTtl({ ...NO_TTL, setting: '5m', reported: '1h' }).ms).toBe(FIVE_MIN)
  expect(resolveTtl({ ...NO_TTL, force5m: true, enable1h: true }).source).toBe('FORCE_PROMPT_CACHING_5M')
  expect(resolveTtl({ ...NO_TTL, envTtl: '5m', settingTtl: '1h' }).source).toBe('CLAUDE_CODE_PROMPT_CACHE_TTL')
  expect(resolveTtl({ ...NO_TTL, settingTtl: '5m' }).ms).toBe(FIVE_MIN)
  expect(resolveTtl({ ...NO_TTL, envTtl: 'bogus' }).ms).toBe(HOUR)
  expect(resolveTtl({ ...NO_TTL, reported: '1h', limits: [{ kind: 'five_hour', percentUsed: 100 }] }).ms).toBe(FIVE_MIN)
  expect(resolveTtl({ ...NO_TTL, reported: '5m' }).source).toBe('gemeldet beim Modellwechsel')
  expect(resolveTtl(NO_TTL).ms).toBe(HOUR)
})

test('Trefferquote, Balken, Restzeit, Wetter, /keepwarm-Argumente', async () => {
  expect(hitPct({ input: 10, read: 930, write: 60, output: 5 })).toBe(93)
  expect(hitPct({ input: 0, read: 0, write: 0, output: 5 })).toBe(null)
  expect(litCells(HOUR, HOUR, 20)).toBe(20)
  expect(litCells(1000, HOUR, 20)).toBe(1)
  expect(remainingLabel(HOUR)).toBe('60m')
  expect(remainingLabel(45_000)).toBe('45s')
  expect(forecast(9, 97).icon).toBe('☀')
  expect(forecast(95, 97).icon).toBe('↯')
  expect(parseKeepWarm('')).toBe(2 * HOUR)
  expect(parseKeepWarm('aus')).toBe(null)
  expect(parseKeepWarm('120m')).toBe(2 * HOUR)
  expect(parseKeepWarm('5m')).toBe(undefined)
  expect(parseKeepWarm('12h')).toBe(undefined)
})

test('Band: leer, behält was andere Mods darunter zeichnen, Knopf nur wenn kein Turn läuft', async ($, on) => {
  world(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ surface, ...band(120) })
    expect(await ui.find({ type: 'Text', text: 'leer' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'drawn below' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'compact' })).toBeDefined()
    await ui.unmount()
  }
  const busy = await $.ui.mount({ surface: 'terminal', ...band(120, true) })
  expect(await busy.find({ type: 'Button', key: 'compact' })).toBeUndefined()
  await busy.unmount()
})

test('turn.step: Hauptanfrage füllt Band, Subagent nur die Summen', async ($, on) => {
  world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($, 'agent-1')
  let ui = await $.ui.mount({ surface: 'terminal', ...band(120) })
  expect(await ui.find({ type: 'Text', text: 'leer' })).toBeDefined()
  await ui.unmount()

  await step($)
  ui = await $.ui.mount({ surface: 'terminal', ...band(120) })
  expect(await ui.find({ type: 'Text', text: '60m' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '93%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' (Auto-Compact 97%)' })).toBeDefined()
  await ui.unmount()

  const pane = await $.ui.mount({ surface: 'desktop', ...PANE })
  expect(await pane.find({ type: 'Text', text: / · 1 Anfragen/ })).toBeDefined()
  await pane.unmount()
})

test('Countdown zählt ab Beginn der Anfrage und läuft ab', async ($, on) => {
  const { clock } = world(on)
  await step($)
  await clock.advance(61 * 60_000)
  const ui = await $.ui.mount({ surface: 'terminal', ...band(130) })
  expect(await ui.find({ type: 'Text', text: 'abgelaufen' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Neuschreiben/ })).toBeDefined()
  await ui.unmount()
})

test('Resume setzt den Countdown fort, /clear lädt Messwerte neu', async ($, on) => {
  world(on)
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 600, context_tokens: 120_000 })
  let ui = await $.ui.mount({ surface: 'terminal', ...band(120) })
  expect(await ui.find({ type: 'Text', text: '50m' })).toBeDefined()
  await ui.unmount()

  await $.classic.SessionStart({ source: 'clear' })
  ui = await $.ui.mount({ surface: 'terminal', ...band(120) })
  expect(await ui.find({ type: 'Text', text: ' (Auto-Compact 97%)' })).toBeDefined()
  await ui.unmount()
})

test('Modellwechsel: kalt mit Schätzung, beim Resume nicht', async ($, on) => {
  world(on)
  await step($)
  const sw = {
    from_model: 'a',
    to_model: 'b',
    requested_model: null,
    context_tokens: 120_000,
    prompt_cache_warm: true,
    cache_ttl: '1h' as const,
    estimated_cache_write_usd: 0.42,
    pricing: 'catalog' as const,
  }
  await $.classic.PostModelSwitch({ ...sw, source: 'resume' })
  let ui = await $.ui.mount({ surface: 'terminal', ...band(130) })
  expect(await ui.find({ type: 'Text', text: '60m' })).toBeDefined()
  await ui.unmount()

  await $.classic.PostModelSwitch({ ...sw, source: 'command' })
  ui = await $.ui.mount({ surface: 'terminal', ...band(130) })
  expect(await ui.find({ type: 'Text', text: 'abgelaufen' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /≈ \$0\.42/ })).toBeDefined()
  await ui.unmount()
})

test('Compact: echter Compact leert, precompute nicht, Knopf leert selbst', async ($, on) => {
  world(on)
  await step($)
  await $.session.compact({ trigger: 'precompute', messages: SUMMARY })
  let ui = await $.ui.mount({ surface: 'terminal', ...band(120) })
  expect(await ui.find({ type: 'Text', text: '60m' })).toBeDefined()
  await ui.press({ key: 'compact' })
  expect(await ui.find({ type: 'Text', text: 'leer' })).toBeDefined()
  await ui.unmount()

  await step($)
  await $.session.compact({ trigger: 'manual', messages: SUMMARY })
  ui = await $.ui.mount({ surface: 'terminal', ...band(120) })
  expect(await ui.find({ type: 'Text', text: 'leer' })).toBeDefined()
  await ui.unmount()
})

test('Schmales Band: nichts bricht um, Teile fallen weg', async ($, on) => {
  const { clock } = world(on)
  await step($)
  await clock.advance(61 * 60_000)
  const narrow = await $.ui.mount({ surface: 'terminal', ...band(60) })
  expect(await narrow.find({ type: 'Text', text: /Neuschreiben/ })).toBeUndefined()
  expect(await narrow.find({ type: 'Text', text: /Auto-Compact/ })).toBeUndefined()
  await narrow.unmount()
})

test('/keepwarm pingt kurz vor Ablauf und verlängert', async ($, on) => {
  const { clock, forks } = world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($)
  const started = await run($, 'keepwarm', '2h')
  expect(started.text).toMatch(/Warmhalten bis/)
  await clock.advance(49 * 60_000)
  expect(forks).toHaveLength(0)
  await clock.advance(2 * 60_000)
  await clock.settle()
  expect(forks).toHaveLength(1)
  // Pinged at T0+50m (first 15 s tick with ≤ 17 % TTL left), drawn at T0+51m: 59 minutes left.
  const ui = await $.ui.mount({ surface: 'terminal', ...band(120) })
  expect(await ui.find({ type: 'Text', text: '59m' })).toBeDefined()
  await ui.unmount()
  const stopped = await run($, 'keepwarm', 'aus')
  expect(stopped.text).toMatch(/1 Pings/)
})

test('/keepwarm schaltet ab, wenn ein Ping den Cache nicht trifft', async ($, on) => {
  const { clock, forks, toasts } = world(on, { forkRead: 0 })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($)
  await run($, 'keepwarm', '')
  await clock.advance(51 * 60_000)
  await clock.settle()
  expect(forks).toHaveLength(1)
  expect(toasts.some(t => t.includes('traf den Cache nicht'))).toBe(true)
  await clock.advance(60 * 60_000)
  expect(forks).toHaveLength(1)
})

test('/keepwarm startet bei 5m-TTL nicht', async ($, on) => {
  world(on, { env: { FORCE_PROMPT_CACHING_5M: '1' } })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($)
  const answer = await run($, 'keepwarm', '2h')
  expect(answer.text).toMatch(/lohnt Warmhalten nicht/)
})

test('Ohne Bildschirm (-p) läuft kein Timer, also kein Ping', async ($, on) => {
  const { clock, forks } = world(on)
  await $.session.start({ surface: null, isInteractive: false, cwd: '/work' })
  await step($)
  const answer = await run($, 'keepwarm', '2h')
  expect(answer.text).toMatch(/nur in einer interaktiven Session/)
  await clock.advance(55 * 60_000)
  expect(forks).toHaveLength(0)
})

test('Pane zeichnet mit Anfragen und Limits auf jeder Oberfläche', async ($, on) => {
  world(on)
  await step($)
  await $.session.measure({
    context: { tokens: 100_000, window: 1_000_000, percent: 10 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 34, resetsAt: '2026-10-12T14:00:00Z' }],
    cost: { usd: 2.5 },
    changed: ['context', 'rateLimits', 'cost'],
  })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /warm · noch 60m/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /5 Stunden/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\$2\.50/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'pane-compact' })).toBeDefined()
    await ui.unmount()
  }
})

test('/keepwarm schaltet ab, wenn ein Ping viel neu schreibt (Teil-Fehltreffer)', async ($, on) => {
  const { clock, forks, toasts } = world(on, { forkRead: 99_000, forkWrite: 20_000 })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($)
  await run($, 'keepwarm', '')
  await clock.advance(51 * 60_000)
  await clock.settle()
  expect(forks).toHaveLength(1)
  expect(toasts.some(t => t.includes('20.0k geschrieben'))).toBe(true)
  await clock.advance(60 * 60_000)
  expect(forks).toHaveLength(1)
})

test('Kalte Neuschreibung: Liste im Pane und Hinweis, warme zählt nicht', async ($, on) => {
  const { clock, toasts, next } = world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($)
  // Warm, but much written (new context): not a cold rewrite.
  next.write = 150_000
  await step($)
  // After a 70-minute break the cache has lapsed; this request writes it anew.
  await clock.advance(70 * 60_000)
  await step($)
  expect(toasts.filter(t => t.startsWith('Cache war kalt: 150.0k'))).toHaveLength(1)
  const ui = await $.ui.mount({ surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: ' neu geschrieben nach 1h10m Pause' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Zusammen 1×/ })).toBeDefined()
  await ui.unmount()
})

test('Kalte Neuschreibung: kein Hinweis, solange /keepwarm läuft', async ($, on) => {
  const { clock, toasts, next } = world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($)
  await run($, 'keepwarm', '2h')
  next.write = 150_000
  await clock.advance(70 * 60_000)
  await step($)
  expect(toasts.some(t => t.startsWith('Cache war kalt'))).toBe(false)
})

test('Kalt: Grenzen – unter 10k, mehr gelesen als geschrieben, nach /compact, Subagent', async ($, on) => {
  const { clock, toasts, next } = world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($)
  // Expired, but only 9,999 written: not counted.
  await clock.advance(70 * 60_000)
  next.write = 9_999
  await step($)
  // Expired by the clock, but read more than written (TTL assumption wrong): not counted.
  await clock.advance(70 * 60_000)
  next.write = 20_000
  next.read = 150_000
  await step($)
  // After /compact the cache is empty, so a big write is a rebuild, not a cold rewrite.
  await $.session.compact({ trigger: 'manual', messages: SUMMARY })
  next.write = 150_000
  next.read = 0
  await step($)
  // A subagent's cold request does not count either.
  await clock.advance(70 * 60_000)
  await step($, 'agent-1')
  expect(toasts.some(t => t.startsWith('Cache war kalt'))).toBe(false)
  const ui = await $.ui.mount({ surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /Keine – der Cache war/ })).toBeDefined()
  await ui.unmount()
})

test('Kalt nach Modellwechsel: gezählt, aber ohne /keepwarm-Hinweis', async ($, on) => {
  const { toasts, next } = world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($)
  await $.classic.PostModelSwitch({
    from_model: 'a',
    to_model: 'b',
    requested_model: null,
    source: 'command',
    context_tokens: 120_000,
    prompt_cache_warm: true,
    cache_ttl: '1h',
    estimated_cache_write_usd: 0.42,
    pricing: 'catalog',
  })
  next.write = 150_000
  next.read = 0
  await step($)
  expect(toasts.some(t => t.startsWith('Cache war kalt'))).toBe(false)
  const ui = await $.ui.mount({ surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: ' neu geschrieben (nach Modellwechsel)' })).toBeDefined()
  await ui.unmount()
})

test('Resume mit "wahrscheinlich abgelaufen": Band kalt, erste Anfrage zählt', async ($, on) => {
  const { toasts, next } = world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 1_200, prompt_cache_likely_expired: true, context_tokens: 150_000 })
  const ui = await $.ui.mount({ surface: 'terminal', ...band(130) })
  expect(await ui.find({ type: 'Text', text: 'abgelaufen' })).toBeDefined()
  await ui.unmount()
  next.write = 150_000
  next.read = 0
  await step($)
  // Claude Code said cold: counted as a resume with the reported pause, no keepwarm hint.
  expect(toasts.some(t => t.startsWith('Cache war kalt'))).toBe(false)
  const pane = await $.ui.mount({ surface: 'terminal', ...PANE })
  expect(await pane.find({ type: 'Text', text: /Zusammen 1×/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: / \(nach Resume, 20m Pause\)/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /Modellwechsel/ })).toBeUndefined()
  await pane.unmount()
})

test('/keepwarm stoppt, wenn ein Ping ohne Antwort bleibt', async ($, on) => {
  const { clock, forks, toasts } = world(on, { forkAnswer: false })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($)
  await run($, 'keepwarm', '')
  await clock.advance(51 * 60_000)
  await clock.settle()
  expect(forks).toHaveLength(1)
  expect(toasts.some(t => t.includes('Ping ohne Antwort (nothing-to-fork)'))).toBe(true)
  await clock.advance(60 * 60_000)
  expect(forks).toHaveLength(1)
})

test('/keepwarm pingt nicht, solange eine Hauptanfrage läuft', async ($, on) => {
  const { clock, forks, next } = world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($)
  await run($, 'keepwarm', '2h')
  // A long request starts at minute 1 and is still running when the ping would be due.
  await clock.advance(60_000)
  next.slowMs = 60 * 60_000
  const running = step($)
  await clock.advance(50 * 60_000)
  await clock.settle()
  expect(forks).toHaveLength(0)
  await clock.advance(10 * 60_000)
  await running
  expect(forks).toHaveLength(0)
})

test('/keepwarm pingt wieder, nachdem ein Turn abgebrochen wurde', async ($, on) => {
  const { clock, forks, next } = world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($)
  await run($, 'keepwarm', '2h')
  // A request starts at minute 1 and hangs; the person presses Esc and the turn ends aborted.
  await clock.advance(60_000)
  next.slowMs = 60 * 60_000
  const hanging = step($)
  await clock.advance(1_000)
  await $.turn.complete({ turnId: 't', answer: '', durationMs: 1_000, isAborted: true, reason: 'aborted' } as never)
  await clock.advance(50 * 60_000)
  await clock.settle()
  expect(forks).toHaveLength(1)
  await clock.advance(15 * 60_000)
  await hanging
})
