// Tests for cache-meter. How the kit fires events and stubs Claude Code's answers follows
// the official mods documentation, page "test" (single source of truth, not memory).

import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import {
  FIVE_MIN,
  HOUR,
  cacheSaving,
  columnCells,
  forecast,
  hhmm,
  hitPct,
  isUnexpectedWrite,
  limitForecast,
  litCells,
  meterCells,
  meterRuns,
  nextLimitStarts,
  parseKeepWarm,
  rasterCells,
  readMultiplier,
  remainingLabel,
  resolveTtl,
  switchNote,
  tall,
  turnLine,
  writeMultiplier,
} from '../hooks/lib'

const T0 = Date.parse('2026-10-12T10:00:00Z')
const SUMMARY = [{ role: 'user' as const, text: 'Summary', toolUses: [] }]
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
        breakdown: {
          autoCompactThreshold: threshold,
          isAutoCompactEnabled: threshold !== undefined,
          categories: [
            { name: 'System prompt', tokens: 3_000, kind: 'used' },
            { name: 'Messages', tokens: 80_000, kind: 'used' },
            { name: 'Free space', tokens: 800_000, kind: 'free' },
          ],
          memoryFiles: [
            { path: '/work/CLAUDE.md', type: 'Project', tokens: 4_000 },
            { path: '/home/u/.claude/CLAUDE.md', type: 'User', tokens: 9_000 },
          ],
          mcpTools: [
            { name: 'mcp__github__a', serverName: 'github', tokens: 1_000, isLoaded: true },
            { name: 'mcp__github__b', serverName: 'github', tokens: 2_000, isLoaded: true },
            { name: 'mcp__memory__c', serverName: 'memory', tokens: 500, isLoaded: false },
          ],
          agents: [],
          skills: { totalSkills: 154, includedSkills: 120, tokens: 4_200, skillFrontmatter: [] },
        },
      },
      rateLimits,
      cost: { usd: 1.5 },
    },
  } as never
}

/** Every stub a session-start-to-turn test needs; registered before the first call on $. */
function world(on: On, opts: { env?: Record<string, string>; forkRead?: number; forkWrite?: number; forkAnswer?: boolean; turnText?: string } = {}) {
  const clock = mock.clock(on, { now: T0 })
  mock.env(on, opts.env ?? {})
  const toasts: string[] = []
  const forks: string[] = []
  // What the next main request writes to the cache; a test raises it to stage a cold rewrite.
  const next = {
    write: 6_000,
    read: 93_000,
    slowMs: 0,
    stop: 'end_turn' as string | null,
    // The session cost $.session.usage reports; a test raises it during a turn.
    usd: 1.5,
    // What $.session.turns() answers (prompts in the transcript).
    turns: 4,
    // Whether the next tool call is refused (a deny from a hook beneath).
    deny: false,
    server: [] as { id: string; name: string; input: unknown; startedAt: number; endedAt?: number }[],
  }
  // The breakdown detail of each $.session.usage call, to tell the free estimate from the exact count.
  const usageDetails: (string | undefined)[] = []
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn below'] }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  // The pane's open/closed record, as $.ui.panes() reports it.
  const pane = { isOpen: false, closed: [] as string[], opened: [] as Record<string, unknown>[] }
  on('ui.open', ($, e) => {
    pane.opened.push(e as Record<string, unknown>)
    pane.isOpen = true
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($, e) => {
    pane.isOpen = false
    pane.closed.push(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: pane.isOpen
      ? [{ id: 'cache-meter', title: 'Tokens & Cache', isShown: true, isFocused: false, isPlaced: true, plugin: 'cache-meter' }]
      : [],
  }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('command.register', () => ({ value: undefined }) as never)
  on('settings.read', () => ({ value: {} }))
  on('session.usage', ($, e) => {
    usageDetails.push((e as { breakdown?: string }).breakdown)
    const v = usageValue(100_000, 1_000_000, 970_000) as { value: Record<string, unknown> }
    return { value: { ...v.value, cost: { usd: next.usd } } } as never
  })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('tool.call', () => (next.deny ? { deny: 'refused' } : { result: 'ok' }) as never)
  on('classic.PreModelSwitch', () => ({}))
  on('session.turns', () => ({ value: next.turns }))
  on('classic.StopFailure', () => ({}))
  on('session.start', () => ({ cwd: '/work' }))
  on('classic.SessionStart', () => ({}))
  on('classic.PostModelSwitch', () => ({}))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('session.compact', () => ({ messages: SUMMARY }))
  on('turn.complete', () => ({ text: opts.turnText ?? '' }))
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
      stopReason: next.stop,
      ...(next.server.length > 0 ? { serverToolUses: next.server } : {}),
      usage: { model: 'claude-test', input_tokens: 1_000, output_tokens: 500, cache_read_input_tokens: next.read, cache_creation_input_tokens: next.write },
    } as never
  })

  return { clock, toasts, forks, next, pane, usageDetails }
}

/** Runs a slash command; the kit fills origin and presentation (test § Write a test). */
function run($: Engine, command: string, args: string) {
  return $.command.run({ command, args } as never) as Promise<{ text?: string }>
}

/** Runs /tokens as a terminal of that kind and width would (types: CommandPresentation). */
function present($: Engine, isFullscreen: boolean, columns: number) {
  return $.command.run({ command: 'tokens', args: '', presentation: { isFullscreen, columns } } as never) as Promise<{ text?: string }>
}

async function step($: Engine, agentId?: string) {
  const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude-test', messageCount: 1, ...(agentId ? { agentId } : {}) })
  let next = await stream.next()
  while (next.done !== true) next = await stream.next()

  return next.value
}

test('TTL: own option, then Claude Code controls, then overage, then reported value', async () => {
  expect(resolveTtl({ ...NO_TTL, setting: '5m', reported: '1h' }).ms).toBe(FIVE_MIN)
  expect(resolveTtl({ ...NO_TTL, force5m: true, enable1h: true }).source).toBe('FORCE_PROMPT_CACHING_5M')
  expect(resolveTtl({ ...NO_TTL, envTtl: '5m', settingTtl: '1h' }).source).toBe('CLAUDE_CODE_PROMPT_CACHE_TTL')
  expect(resolveTtl({ ...NO_TTL, settingTtl: '5m' }).ms).toBe(FIVE_MIN)
  expect(resolveTtl({ ...NO_TTL, envTtl: 'bogus' }).ms).toBe(HOUR)
  expect(resolveTtl({ ...NO_TTL, reported: '1h', limits: [{ kind: 'five_hour', percentUsed: 100 }] }).ms).toBe(FIVE_MIN)
  expect(resolveTtl({ ...NO_TTL, reported: '5m' }).source).toBe('reported on model switch')
  expect(resolveTtl(NO_TTL).ms).toBe(HOUR)
})

test('hit rate, bar, time left, weather, /keepwarm arguments', async () => {
  expect(hitPct({ input: 10, read: 930, write: 60, output: 5 })).toBe(93)
  expect(hitPct({ input: 0, read: 0, write: 0, output: 5 })).toBe(null)
  expect(litCells(HOUR, HOUR, 20)).toBe(20)
  expect(litCells(1000, HOUR, 20)).toBe(1)
  expect(remainingLabel(HOUR)).toBe('60m')
  expect(remainingLabel(45_000)).toBe('45s')
  expect(forecast(9, 97).icon).toBe('☀')
  expect(forecast(95, 97).icon).toBe('↯')
  expect(parseKeepWarm('')).toBe(2 * HOUR)
  expect(parseKeepWarm('off')).toBe(null)
  expect(parseKeepWarm('120m')).toBe(2 * HOUR)
  expect(parseKeepWarm('5m')).toBe(undefined)
  expect(parseKeepWarm('12h')).toBe(undefined)
})

test('band: empty, keeps what other mods draw below, button only between turns', async ($, on) => {
  world(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ surface, ...band(120) })
    expect(await ui.find({ type: 'Text', text: 'empty' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'drawn below' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'compact' })).toBeDefined()
    await ui.unmount()
  }
  const busy = await $.ui.mount({ surface: 'terminal', ...band(120, true) })
  expect(await busy.find({ type: 'Button', key: 'compact' })).toBeUndefined()
  await busy.unmount()
})

test('turn.step: a main request fills the band, a subagent only the totals', async ($, on) => {
  world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($, 'agent-1')
  let ui = await $.ui.mount({ surface: 'terminal', ...band(120) })
  expect(await ui.find({ type: 'Text', text: 'empty' })).toBeDefined()
  await ui.unmount()

  await step($)
  ui = await $.ui.mount({ surface: 'terminal', ...band(120) })
  expect(await ui.find({ type: 'Text', text: '60m' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '93%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' (auto-compact 97%)' })).toBeDefined()
  await ui.unmount()

  const pane = await $.ui.mount({ surface: 'desktop', ...PANE })
  expect(await pane.find({ type: 'Text', text: / · 1 requests/ })).toBeDefined()
  await pane.unmount()
})

test('countdown starts at the request and expires', async ($, on) => {
  const { clock } = world(on)
  await step($)
  await clock.advance(61 * 60_000)
  const ui = await $.ui.mount({ surface: 'terminal', ...band(130) })
  expect(await ui.find({ type: 'Text', text: 'expired' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /rewrite/ })).toBeDefined()
  await ui.unmount()
})

test('resume continues the countdown, /clear reloads the measurement', async ($, on) => {
  world(on)
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 600, context_tokens: 120_000 })
  let ui = await $.ui.mount({ surface: 'terminal', ...band(120) })
  expect(await ui.find({ type: 'Text', text: '50m' })).toBeDefined()
  await ui.unmount()

  await $.classic.SessionStart({ source: 'clear' })
  ui = await $.ui.mount({ surface: 'terminal', ...band(120) })
  expect(await ui.find({ type: 'Text', text: ' (auto-compact 97%)' })).toBeDefined()
  await ui.unmount()
})

test('model switch: cold with estimate, but not on resume', async ($, on) => {
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
  expect(await ui.find({ type: 'Text', text: 'expired' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /≈ \$0\.42/ })).toBeDefined()
  await ui.unmount()
})

test('compact: a real compact empties, precompute does not, the button empties itself', async ($, on) => {
  world(on)
  await step($)
  await $.session.compact({ trigger: 'precompute', messages: SUMMARY })
  let ui = await $.ui.mount({ surface: 'terminal', ...band(120) })
  expect(await ui.find({ type: 'Text', text: '60m' })).toBeDefined()
  await ui.press({ key: 'compact' })
  expect(await ui.find({ type: 'Text', text: 'empty' })).toBeDefined()
  await ui.unmount()

  await step($)
  await $.session.compact({ trigger: 'manual', messages: SUMMARY })
  ui = await $.ui.mount({ surface: 'terminal', ...band(120) })
  expect(await ui.find({ type: 'Text', text: 'empty' })).toBeDefined()
  await ui.unmount()
})

test('narrow band: nothing wraps, parts are dropped', async ($, on) => {
  const { clock } = world(on)
  await step($)
  await clock.advance(61 * 60_000)
  const narrow = await $.ui.mount({ surface: 'terminal', ...band(60) })
  expect(await narrow.find({ type: 'Text', text: /rewrite/ })).toBeUndefined()
  expect(await narrow.find({ type: 'Text', text: /auto-compact/ })).toBeUndefined()
  await narrow.unmount()
})

test('/keepwarm pings shortly before expiry and extends', async ($, on) => {
  const { clock, forks } = world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($)
  const started = await run($, 'keepwarm', '2h')
  expect(started.text).toMatch(/Keepwarm until/)
  await clock.advance(49 * 60_000)
  expect(forks).toHaveLength(0)
  await clock.advance(2 * 60_000)
  await clock.settle()
  expect(forks).toHaveLength(1)
  // Pinged at T0+50m (first 15 s tick with ≤ 17 % TTL left), drawn at T0+51m: 59 minutes left.
  const ui = await $.ui.mount({ surface: 'terminal', ...band(120) })
  expect(await ui.find({ type: 'Text', text: '59m' })).toBeDefined()
  await ui.unmount()
  const stopped = await run($, 'keepwarm', 'off')
  expect(stopped.text).toMatch(/1 pings/)
})

test('/keepwarm stops when a ping misses the cache', async ($, on) => {
  const { clock, forks, toasts } = world(on, { forkRead: 0 })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($)
  await run($, 'keepwarm', '')
  await clock.advance(51 * 60_000)
  await clock.settle()
  expect(forks).toHaveLength(1)
  expect(toasts.some(t => t.includes('the ping missed the cache'))).toBe(true)
  await clock.advance(60 * 60_000)
  expect(forks).toHaveLength(1)
})

test('/keepwarm does not start at a 5m TTL', async ($, on) => {
  world(on, { env: { FORCE_PROMPT_CACHING_5M: '1' } })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($)
  const answer = await run($, 'keepwarm', '2h')
  expect(answer.text).toMatch(/keepwarm is not worth it/)
})

test('without a screen (-p) no timer runs, so no ping', async ($, on) => {
  const { clock, forks } = world(on)
  await $.session.start({ surface: null, isInteractive: false, cwd: '/work' })
  await step($)
  const answer = await run($, 'keepwarm', '2h')
  expect(answer.text).toMatch(/only works in an interactive session/)
  await clock.advance(55 * 60_000)
  expect(forks).toHaveLength(0)
})

test('pane draws with requests and limits on every surface', async ($, on) => {
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
    expect(await ui.find({ type: 'Text', text: 'WARM' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: / min left · until \d\d:\d\d$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^cache saved \d+% of input cost$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /5 hours/ })).toBeDefined()
    // Colored cells in the terminal, a text bar in the Desktop app (reference › Elements).
    expect((await ui.find({ type: 'Raster' })) !== undefined).toBe(surface === 'terminal')
    expect(await ui.find({ type: 'Text', text: /\$2\.50/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'pane-compact' })).toBeDefined()
    await ui.unmount()
  }
})

test('/keepwarm stops when a ping writes a lot (partial miss)', async ($, on) => {
  const { clock, forks, toasts } = world(on, { forkRead: 99_000, forkWrite: 20_000 })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($)
  await run($, 'keepwarm', '')
  await clock.advance(51 * 60_000)
  await clock.settle()
  expect(forks).toHaveLength(1)
  expect(toasts.some(t => t.includes('20.0k written'))).toBe(true)
  await clock.advance(60 * 60_000)
  expect(forks).toHaveLength(1)
})

test('cold rewrite: listed in the pane with a hint, a warm one does not count', async ($, on) => {
  const { clock, toasts, next } = world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($)
  // Warm, but much written (new context): not a cold rewrite.
  next.write = 150_000
  await step($)
  // After a 70-minute break the cache has lapsed; this request writes it anew.
  await clock.advance(70 * 60_000)
  await step($)
  expect(toasts.filter(t => t.startsWith('Cache was cold: 150.0k'))).toHaveLength(1)
  const ui = await $.ui.mount({ surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: ' re-written after 1h10m idle' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Total 1×/ })).toBeDefined()
  await ui.unmount()
})

test('cold rewrite: no hint while /keepwarm runs', async ($, on) => {
  const { clock, toasts, next } = world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($)
  await run($, 'keepwarm', '2h')
  next.write = 150_000
  await clock.advance(70 * 60_000)
  await step($)
  expect(toasts.some(t => t.startsWith('Cache was cold'))).toBe(false)
})

test('cold: limits – under 10k, more read than written, after /compact, subagent', async ($, on) => {
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
  expect(toasts.some(t => t.startsWith('Cache was cold'))).toBe(false)
  const ui = await $.ui.mount({ surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /None – warm for every request/ })).toBeDefined()
  await ui.unmount()
})

test('cold after a model switch: counted, but no /keepwarm hint', async ($, on) => {
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
  expect(toasts.some(t => t.startsWith('Cache was cold'))).toBe(false)
  const ui = await $.ui.mount({ surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: ' re-written (after a model switch)' })).toBeDefined()
  await ui.unmount()
})

test('resume reported as likely expired: band cold, first request counts', async ($, on) => {
  const { toasts, next } = world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 1_200, prompt_cache_likely_expired: true, context_tokens: 150_000 })
  const ui = await $.ui.mount({ surface: 'terminal', ...band(130) })
  expect(await ui.find({ type: 'Text', text: 'expired' })).toBeDefined()
  await ui.unmount()
  next.write = 150_000
  next.read = 0
  await step($)
  // Claude Code said cold: counted as a resume with the reported pause, no keepwarm hint.
  expect(toasts.some(t => t.startsWith('Cache was cold'))).toBe(false)
  const pane = await $.ui.mount({ surface: 'terminal', ...PANE })
  expect(await pane.find({ type: 'Text', text: /Total 1×/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: / \(after resume, 20m idle\)/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /model switch/ })).toBeUndefined()
  await pane.unmount()
})

test('/keepwarm stops when a ping gets no answer', async ($, on) => {
  const { clock, forks, toasts } = world(on, { forkAnswer: false })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($)
  await run($, 'keepwarm', '')
  await clock.advance(51 * 60_000)
  await clock.settle()
  expect(forks).toHaveLength(1)
  expect(toasts.some(t => t.includes('the ping got no answer (nothing-to-fork)'))).toBe(true)
  await clock.advance(60 * 60_000)
  expect(forks).toHaveLength(1)
})

test('/keepwarm does not ping while a main request runs', async ($, on) => {
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

test('/keepwarm pings again after an aborted turn', async ($, on) => {
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

test('drawing helpers: tall digits, raster cells, meter', async () => {
  expect(tall('58')).toEqual(['█▀▀ █▀█', '▀▀█ █▀█', '▀▀▀ ▀▀▀'])
  // Reference values computed independently: base64 of little-endian u32 triplets.
  expect(rasterCells([[0x2588, 0xff8800, 0x01000000]])).toBe('iCUAAACI/wAAAAAB')
  expect(rasterCells([[0x2588, 0x00ff00, 0x01000000], [0x2591, 0x585b70, 0x01000000]])).toBe('iCUAAAD/AAAAAAABkSUAAHBbWAAAAAAB')
  // 4.5 of 10 cells: four full, a half block, a marker on cell 7, the rest track.
  const mark = { at: 7, color: 0xff6b81, theme: 'error' }
  const runs = meterRuns(10, 0.45, [mark])
  expect(runs.map(r => r.text).join('')).toBe('████▌░░┃░░')
  expect(runs.map(r => r.role)).toEqual(['fill', 'track', 0, 'track'])
  const cells = meterCells(runs, 0x40c070, [mark])
  expect(cells[4]).toEqual([0x258c, 0x40c070, 0x01000000])
  expect(cells[7]).toEqual([0x2503, 0xff6b81, 0x01000000])
  // 7.96 eighths round up to a full cell, not to an empty partial one.
  expect(meterRuns(4, 0.999, []).map(r => r.text).join('')).toBe('████')
  // Columns: two slots in four cells, newest at the right; a full and an empty one, two rows tall.
  const chart = columnCells([{ share: 1, color: 0xe05060 }, { share: 0, color: 0x40c070 }], 4, 2)
  expect(chart.map(c => String.fromCodePoint(c[0])).join('')).toBe('██  ██▁▁')
  expect(chart[6]?.[1]).toBe(0x45475a)
  // A tiny share still shows an eighth; one value sits in the right-hand slot.
  const tiny = columnCells([{ share: 0.01, color: 0x40c070 }], 4, 2)
  expect(tiny.map(c => String.fromCodePoint(c[0])).join('')).toBe('    ▁▁▁▁')
  expect(tiny[6]?.[1]).toBe(0x40c070)
  expect(tiny[4]?.[1]).toBe(0x45475a)
})

test('cache saving: base price against reads and writes, by model and TTL', async () => {
  // 460k read, 122k written, 8 new on Opus 5.5 (read 0.05×) with one-hour writes (2×): 54 % saved.
  expect(cacheSaving({ input: 8, read: 460_000, write: 122_000, output: 0 }, readMultiplier('claude-opus-5-5'), writeMultiplier(HOUR))).toBe(54)
  // Only writes: twice the base price, so the cache cost 100 % more.
  expect(cacheSaving({ input: 0, read: 0, write: 100, output: 0 }, 0.1, writeMultiplier(HOUR))).toBe(-100)
  expect(cacheSaving({ input: 0, read: 0, write: 0, output: 5 }, 0.1, 2)).toBe(null)
  expect(readMultiplier('claude-fable-5-1')).toBe(0.025)
  expect(readMultiplier('claude-mythos-5-1')).toBe(0.025)
  expect(readMultiplier('claude-sonnet-5-5')).toBe(0.05)
  expect(readMultiplier('claude-haiku-5-5')).toBe(0.1)
  expect(writeMultiplier(FIVE_MIN)).toBe(1.25)
})

test('pane: the keepwarm button starts and stops keepwarm', async ($, on) => {
  const { toasts } = world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($)
  const ui = await $.ui.mount({ surface: 'terminal', ...PANE })
  await ui.press({ key: 'keepwarm-start' })
  // The toast box is narrow: one short line.
  expect(toasts.some(t => /^Keepwarm on until \d\d:\d\d · pings at ≤ 10 min left$/.test(t))).toBe(true)
  expect(await ui.find({ type: 'Text', text: '↻ Keepwarm on' })).toBeDefined()
  await ui.press({ key: 'keepwarm-stop' })
  expect(toasts.some(t => t.startsWith('Keepwarm off'))).toBe(true)
  expect(await ui.find({ type: 'Button', key: 'keepwarm-start' })).toBeDefined()
  await ui.unmount()
})

test('/tokens toggles; above the prompt the next own prompt closes the pane, docked it stays', async ($, on) => {
  const { pane } = world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  expect((await run($, 'tokens', '')).text).toMatch(/^Opened/)
  expect((await run($, 'tokens', '')).text).toMatch(/^Closed/)

  // Docked: a prompt leaves it open.
  await run($, 'tokens', '')
  let ui = await $.ui.mount({ surface: 'terminal', ...PANE })
  await $.prompt.submit({ text: 'next question', origin: { kind: 'composer' } } as never)
  expect(pane.isOpen).toBe(true)
  await ui.unmount()
  // Inline: a prompt the person did not type (a scheduled one) leaves it open ...
  ui = await $.ui.mount({ surface: 'terminal', ...PANE, props: { ...PANE.props, placement: 'inline' as const } })
  await $.prompt.submit({ text: 'scheduled', origin: { kind: 'scheduled-trigger' } } as never)
  expect(pane.isOpen).toBe(true)
  // ... the person's own prompt closes it.
  await $.prompt.submit({ text: 'next question', origin: { kind: 'composer' } } as never)
  expect(pane.isOpen).toBe(false)
  expect(pane.closed).toEqual(['cache-meter', 'cache-meter'])
  await ui.unmount()
})

test('pane widths: a narrow dock drops secondary text, from 110 columns two columns', async ($, on) => {
  world(on)
  await step($)
  let ui = await $.ui.mount({ surface: 'terminal', ...PANE, props: { ...PANE.props, bodyColumns: 50 } })
  expect(await ui.find({ type: 'Text', text: 'prompt cache · tokens' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'not from cache' })).toBeDefined()
  expect(await ui.find({ key: 'columns' })).toBeUndefined()
  await ui.unmount()

  ui = await $.ui.mount({ surface: 'terminal', ...PANE, props: { ...PANE.props, bodyColumns: 90 } })
  // The header holds the tabs; the subtitle shows only in the wide layout.
  expect(await ui.find({ type: 'Text', text: 'prompt cache · tokens' })).toBeUndefined()
  expect(await ui.find({ key: 'columns' })).toBeUndefined()
  await ui.unmount()

  ui = await $.ui.mount({ surface: 'terminal', ...PANE, props: { ...PANE.props, bodyColumns: 140 } })
  expect(await ui.find({ type: 'Text', text: 'prompt cache · tokens' })).toBeDefined()
  expect(await ui.find({ key: 'columns' })).toBeDefined()
  // The countdown spans one column of two: (140 - 1) / 2 = 69, minus 4 of card chrome.
  expect((await ui.find({ type: 'Raster', key: 'countdown' }))?.props.columns).toBe(65)
  expect((await ui.find({ type: 'Raster', key: 'requests' }))?.props.columns).toBe(136)
  await ui.unmount()
})

test('health tab: unusual stops, API errors, server-side tools, rates', async ($, on) => {
  const { next, clock } = world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($)
  next.stop = 'max_tokens'
  next.server = [{ id: 's1', name: 'advisor', input: {}, startedAt: T0, endedAt: T0 + 12_000 }]
  await step($)
  next.stop = 'tool_use'
  next.server = []
  await step($)
  // A subagent's unusual stop is not counted.
  next.stop = 'refusal'
  await step($, 'agent-1')
  await $.classic.StopFailure({ hook_event_name: 'StopFailure', error: 'overloaded' } as never)
  await $.classic.StopFailure({ hook_event_name: 'StopFailure', error: 'overloaded' } as never)
  await $.classic.StopFailure({ hook_event_name: 'StopFailure', error: 'rate_limit', agent_id: 'agent-1' } as never)
  await clock.advance(2 * 60 * 60_000)
  await $.session.measure({ context: { tokens: 100_000, window: 1_000_000, percent: 10 }, rateLimits: [], cost: { usd: 4 }, changed: ['context', 'cost'] })

  const ui = await $.ui.mount({ surface: 'terminal', ...PANE })
  // Names each check, so a failure says which text is missing.
  const has = async (text: string | RegExp) => expect([String(text), (await ui.find({ type: 'Text', text })) !== undefined]).toEqual([String(text), true])
  // The overview points at the problems; the Health tab is marked.
  await has(/^2 API errors · 1 unusual stop/)
  await ui.press({ key: 'tab-health' })
  await has('output limit 1×')
  await has('overloaded 2×')
  await has(' · subagents: rate limit 1×')
  await has(/^advisor 1× · 12s/)
  // $4 over two hours and four prompts.
  await has(/ · \$2\.00\/h · \$1\.00\/prompt$/)
  await has(/No model switch or resume yet/)
  await ui.press({ key: 'tab-overview' })
  // Two hours on, the one-hour cache has expired: back on the overview.
  await has('EXPIRED')
  await ui.unmount()
})

test('context tab: heaviest items from the free estimate, exact count only on a press', async ($, on) => {
  const { usageDetails } = world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($)
  await $.session.measure({ context: { tokens: 100_000, window: 1_000_000, percent: 10 }, rateLimits: [], changed: ['context'] })
  expect(usageDetails.every(d => d === 'summary')).toBe(true)

  const ui = await $.ui.mount({ surface: 'terminal', ...PANE })
  await ui.press({ key: 'tab-context' })
  expect(await ui.find({ type: 'Text', text: /^estimate · / })).toBeDefined()
  // Used categories only, heaviest first; free space is not a share of the context.
  expect(await ui.find({ type: 'Text', text: 'Messages' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Free space' })).toBeUndefined()
  // The home directory shows as ~ (shorter, and no user name on a screenshot).
  expect(await ui.find({ type: 'Text', text: '~/.claude/CLAUDE.md' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' · 2 tools' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1 more tools behind tool search/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '120 of 154' })).toBeDefined()

  await ui.press({ key: 'context-exact' })
  expect(usageDetails.at(-1)).toBe('full')
  expect(usageDetails.filter(d => d === 'full')).toHaveLength(1)
  expect(await ui.find({ type: 'Text', text: /^exact · / })).toBeDefined()
  await ui.unmount()
})

test('cache check: Claude Code\'s verdict against the clock at resume and model switch', async ($, on) => {
  world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($)
  // Warm by the clock, and Claude Code agrees.
  await $.classic.PostModelSwitch({
    hook_event_name: 'PostModelSwitch',
    from_model: 'a',
    to_model: 'a',
    requested_model: null,
    source: 'command',
    context_tokens: 100_000,
    prompt_cache_warm: true,
    cache_ttl: '1h',
    estimated_cache_write_usd: 0.4,
    pricing: 'catalog',
  } as never)
  // A resume Claude Code calls expired, while the clock (10 minutes) says warm: they differ.
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 600, prompt_cache_likely_expired: true, context_tokens: 100_000 } as never)

  const ui = await $.ui.mount({ surface: 'terminal', ...PANE })
  await ui.press({ key: 'tab-health' })
  expect(await ui.find({ type: 'Text', text: 'Claude Code differed 1 of 2 times' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\(resume\): Claude Code cold,/ })).toBeDefined()
  await ui.unmount()
})

test('first write of a cache is blue in the request chart, a warm request green', async ($, on) => {
  world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($)
  await step($)
  const ui = await $.ui.mount({ surface: 'terminal', ...PANE })
  const chart = await ui.find({ type: 'Raster', key: 'requests' })
  const cells = Array.from(atob(String(chart?.props.cells)), c => c.charCodeAt(0))
  // u32 little-endian triplets; the bottom row's last four cells are the two requests.
  const words: number[] = []
  for (let i = 0; i < cells.length; i += 4) words.push(cells[i]! | (cells[i + 1]! << 8) | (cells[i + 2]! << 16) | (cells[i + 3]! << 24))
  const columns = Number(chart?.props.columns)
  const bottom = words.slice(-columns * 3)
  const fg = (x: number) => bottom[x * 3 + 1]
  expect(fg(columns - 4)).toBe(0x7088f0)
  expect(fg(columns - 1)).toBe(0x40c070)
  await ui.unmount()
})

test('band: cost as API value on a plan, as spent on an API key; dropped first when narrow', async ($, on) => {
  world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($)
  // No plan limits reported: an API key or a cloud provider, where the figure is real spend.
  await $.session.measure({ context: { tokens: 100_000, window: 1_000_000, percent: 10 }, rateLimits: [], cost: { usd: 2.5 }, changed: ['context', 'cost'] })
  let ui = await $.ui.mount({ surface: 'terminal', ...band(130) })
  expect(await ui.find({ type: 'Text', text: ' · spent $2.50' })).toBeDefined()
  await ui.unmount()
  // Plan limits reported: a subscription, where the figure only compares with an API key.
  await $.session.measure({
    context: { tokens: 100_000, window: 1_000_000, percent: 10 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 12 }],
    cost: { usd: 2.5 },
    changed: ['rateLimits'],
  })
  ui = await $.ui.mount({ surface: 'terminal', ...band(130) })
  expect(await ui.find({ type: 'Text', text: ' · API value $2.50' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' (auto-compact 97%)' })).toBeDefined()
  await ui.unmount()
  ui = await $.ui.mount({ surface: 'terminal', ...band(80) })
  expect(await ui.find({ type: 'Text', text: ' · API value $2.50' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: ' (auto-compact 97%)' })).toBeDefined()
  await ui.unmount()
  const pane = await $.ui.mount({ surface: 'terminal', ...PANE })
  expect(await pane.find({ type: 'Text', text: ' API value (API-key price)' })).toBeDefined()
  await pane.unmount()
})

test('cache check: nothing is counted while Cache Meter knows nothing of the cache', async ($, on) => {
  world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  // A resume right at the start: no request seen yet, so there is no verdict of ours to compare.
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 600, prompt_cache_likely_expired: false, context_tokens: 100_000 } as never)
  // The resume set the countdown from Claude Code's figures; a later switch is a real comparison.
  await $.classic.PostModelSwitch({
    hook_event_name: 'PostModelSwitch',
    from_model: 'a',
    to_model: 'a',
    requested_model: null,
    source: 'command',
    context_tokens: 100_000,
    prompt_cache_warm: true,
    cache_ttl: '1h',
    estimated_cache_write_usd: 0.4,
    pricing: 'catalog',
  } as never)
  const ui = await $.ui.mount({ surface: 'terminal', ...PANE })
  await ui.press({ key: 'tab-health' })
  expect(await ui.find({ type: 'Text', text: 'Claude Code agreed 1 of 1 times' })).toBeDefined()
  await ui.unmount()
})

test('/tokens: Esc closes the pane above the prompt, but not the docked sidebar', async ($, on) => {
  const { pane } = world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect((await present($, true, 190)).text).toMatch(/sidebar/)
  await present($, true, 190) // closes
  await present($, false, 190)
  await present($, false, 190) // closes
  await present($, true, 100) // fullscreen, but too narrow to dock
  expect(pane.opened.map(o => o.closeOnEscape)).toEqual([undefined, true, true])
  expect(pane.opened.map(o => o.rows)).toEqual([26, 26, 36])
})

test('/tokens <tab> opens on that tab and switches an open pane instead of closing it', async ($, on) => {
  const { pane } = world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect((await run($, 'tokens', 'health')).text).toMatch(/^Opened/)
  let ui = await $.ui.mount({ surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: 'Cache check' })).toBeDefined()
  await ui.unmount()
  // Open: a tab name switches, a prefix is enough, and the pane stays open.
  expect((await run($, 'tokens', 'c')).text).toBe('Switched the pane to context.')
  expect(pane.isOpen).toBe(true)
  ui = await $.ui.mount({ surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: 'Where it goes' })).toBeDefined()
  await ui.unmount()
  expect((await run($, 'tokens', 'nope')).text).toBe('Usage: /tokens [overview | context | health]')
  expect(pane.isOpen).toBe(true)
  // Without a tab /tokens still toggles.
  expect((await run($, 'tokens', '')).text).toMatch(/^Closed/)
})

test('pane footer: offers clicks only in the fullscreen renderer, which captures the mouse', async ($, on) => {
  world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const footer = /\/tokens context \| health · keys: ctrl\+x tab, then 1–3/
  let ui = await $.ui.mount({ surface: 'terminal', ...PANE, viewport: { columns: 190, rows: 50, isFullscreen: false } })
  expect(await ui.find({ type: 'Text', text: footer })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^click a tab/ })).toBeUndefined()
  await ui.unmount()
  ui = await $.ui.mount({ surface: 'terminal', ...PANE, viewport: { columns: 190, rows: 50, isFullscreen: true } })
  expect(await ui.find({ type: 'Text', text: /^click a tab or \/tokens context \| health/ })).toBeDefined()
  await ui.unmount()
})

test('sidebar at start: opens by itself only in fullscreen, and not again once closed', async ($, on) => {
  const { pane, clock } = world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  // Classic renderer: the band is drawn, the pane never opens by itself.
  let ui = await $.ui.mount({ surface: 'terminal', ...band(130), viewport: { columns: 190, rows: 50, isFullscreen: false } })
  await ui.unmount()
  await clock.advance(20_000)
  expect(pane.opened).toHaveLength(0)
  // Fullscreen: the next tick opens it unasked – a sidebar, so without closeOnEscape.
  ui = await $.ui.mount({ surface: 'terminal', ...band(130), viewport: { columns: 190, rows: 50, isFullscreen: true } })
  await ui.unmount()
  await clock.advance(16_000)
  expect(pane.opened).toHaveLength(1)
  expect(pane.opened[0]?.closeOnEscape).toBeUndefined()
  // Closed with /tokens: it stays closed.
  expect((await run($, 'tokens', '')).text).toMatch(/^Closed/)
  await clock.advance(60_000)
  expect(pane.opened).toHaveLength(1)
})

test('sidebar at start: a pane the person opened and closed before stays closed', async ($, on) => {
  const { pane, clock } = world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await run($, 'tokens', '')
  await run($, 'tokens', '')
  const ui = await $.ui.mount({ surface: 'terminal', ...band(130), viewport: { columns: 190, rows: 50, isFullscreen: true } })
  await ui.unmount()
  await clock.advance(20_000)
  expect(pane.opened).toHaveLength(1)
})

const TURN_USAGE = { model: 'claude-test', input_tokens: 1_000, output_tokens: 500, cache_read_input_tokens: 93_000, cache_creation_input_tokens: 6_000 }

function complete($: Engine, isAborted = false, agentId?: string) {
  return $.turn.complete({ turnId: 't', answer: 'ok', durationMs: 1_000, isAborted, usage: TURN_USAGE, ...(agentId ? { agentId } : {}) } as never) as Promise<{ text: string }>
}

test('line under the answer: cost of the turn, requests, cache share', async ($, on) => {
  const { next } = world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.turn.start({ turnId: 't', text: 'hi' } as never)
  await step($)
  await step($)
  next.usd = 1.92
  const done = await complete($)
  expect(done.text).toBe('◉ Cache Meter · $0.42 spent · 2 requests · 93% from cache · 6.0k written to cache')
})

test('line under the answer: none when aborted, for a subagent, or without a request', async ($, on) => {
  world(on)
  await $.turn.start({ turnId: 't', text: 'hi' } as never)
  await step($)
  expect((await complete($, true)).text).toBe('')
  await $.turn.start({ turnId: 't', text: 'hi' } as never)
  await step($)
  expect((await complete($, false, 'agent-1')).text).toBe('')
  // A turn with no main request (a local command) gets no line either.
  await $.turn.start({ turnId: 't', text: 'hi' } as never)
  expect((await complete($)).text).toBe('')
})

test('turnLine: API value on a plan, no cost under half a cent', async () => {
  const u = { input: 1_000, read: 93_000, write: 6_000, output: 500 }
  expect(turnLine(u, 1, 0.42, true)).toBe('◉ Cache Meter · ≈ $0.42 API value · 1 request · 93% from cache · 6.0k written to cache')
  expect(turnLine({ ...u, write: 0 }, 3, 0.001, false)).toBe('◉ Cache Meter · 3 requests · 99% from cache')
  expect(turnLine(u, 1, null, false)).not.toMatch(/\$/)
})

test('limit forecast: pace since the first reading, renewed after a reset', async () => {
  const t0 = T0
  const start = { at: t0, pct: 20, resetsAt: '2026-10-12T15:00:00Z' }
  // 20 % → 40 % in one hour: the remaining 60 % take three more hours, so full at T0 + 4 h.
  expect(limitForecast(start, 40, t0 + HOUR, '2026-10-12T15:00:00Z')).toBe(t0 + 4 * HOUR)
  // After the reset the limit is free again before it would fill: no forecast.
  expect(limitForecast(start, 40, t0 + HOUR, '2026-10-12T12:00:00Z')).toBeNull()
  // Too early, or no rise: no forecast.
  expect(limitForecast(start, 21, t0 + 5 * 60_000, undefined)).toBeNull()
  expect(limitForecast(start, 20, t0 + HOUR, undefined)).toBeNull()
  // The window reset (lower percentage): the start is renewed, so the forecast works again.
  const renewed = nextLimitStarts({ five_hour: start }, [{ kind: 'five_hour', percentUsed: 3, resetsAt: '2026-10-12T20:00:00Z' }], t0 + 5 * HOUR)
  expect(renewed.five_hour).toEqual({ at: t0 + 5 * HOUR, pct: 3, resetsAt: '2026-10-12T20:00:00Z' })
  // The reset moved while the percentage rose: a new window all the same.
  const moved = nextLimitStarts({ five_hour: start }, [{ kind: 'five_hour', percentUsed: 25, resetsAt: '2026-10-12T20:00:00Z' }], t0 + 2 * HOUR)
  expect(moved.five_hour).toEqual({ at: t0 + 2 * HOUR, pct: 25, resetsAt: '2026-10-12T20:00:00Z' })
  // No reset time: the window may free up first, so no forecast.
  expect(limitForecast(start, 40, t0 + HOUR, undefined)).toBeNull()
  const kept = nextLimitStarts({ five_hour: start }, [{ kind: 'five_hour', percentUsed: 30, resetsAt: '2026-10-12T15:00:00Z' }], t0 + HOUR)
  expect(kept.five_hour).toBe(start)
})

test('limit forecast drawn in the overview once the pace is known', async ($, on) => {
  const { clock } = world(on)
  const at = (pct: number) => ({ context: { tokens: 100_000, window: 1_000_000, percent: 10 }, rateLimits: [{ kind: 'five_hour', percentUsed: pct, resetsAt: '2026-10-12T20:00:00Z' }], changed: ['rateLimits'] })
  await $.session.measure(at(20) as never)
  let ui = await $.ui.mount({ surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /full ≈/ })).toBeUndefined()
  await ui.unmount()
  await clock.advance(HOUR)
  await $.session.measure(at(40) as never)
  ui = await $.ui.mount({ surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: ` · full ≈ ${hhmm(T0 + 4 * HOUR)} at this pace` })).toBeDefined()
  await ui.unmount()
})

test('MCP servers: calls counted per server, idle ones marked after a few prompts', async ($, on) => {
  const { next } = world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.tool.call({ tool: 'mcp__github__a' } as never)
  await $.tool.call({ tool: 'mcp__github__a' } as never)
  await $.tool.call({ tool: 'mcp__github__b' } as never)
  // A refused call did not run: not counted.
  next.deny = true
  await $.tool.call({ tool: 'mcp__github__b' } as never)
  next.deny = false
  await $.session.measure({ context: { tokens: 100_000, window: 1_000_000, percent: 10 }, rateLimits: [], changed: ['context'] })
  const ui = await $.ui.mount({ surface: 'terminal', ...PANE })
  await ui.press({ key: 'tab-context' })
  expect(await ui.find({ type: 'Text', text: / · 2 tools · 3 calls$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /unused so far/ })).toBeUndefined()
  await ui.unmount()
})

test('model switch while warm: a note with the estimate, never a decision', async ($, on) => {
  const { toasts } = world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($)
  const sw = {
    from_model: 'a',
    to_model: 'b',
    requested_model: null,
    context_tokens: 148_000,
    prompt_cache_warm: true,
    cache_ttl: '1h' as const,
    estimated_cache_write_usd: 1.18,
    pricing: 'catalog' as const,
  }
  for (const source of ['command', 'picker', 'sdk'] as const) {
    // Exactly what the stub beneath answered: no decision, no reason, no block of its own.
    expect(await $.classic.PreModelSwitch({ ...sw, source } as never)).toEqual({})
  }
  expect(toasts.filter(t => t.startsWith('Model switch re-writes 148.0k tokens to the cache (≈ $1.18) · cache warm 60m more')).length).toBe(3)
  // Cold, or to the same model: nothing to say.
  await $.classic.PreModelSwitch({ ...sw, source: 'command', prompt_cache_warm: false } as never)
  await $.classic.PreModelSwitch({ ...sw, source: 'command', to_model: 'a' } as never)
  expect(toasts.filter(t => t.startsWith('Model switch')).length).toBe(3)
  expect(switchNote(148_000, 1.18, false, null)).toBe('Model switch re-writes 148.0k tokens to the cache (≈ $1.18 (estimate)) – after it expires, switching adds nothing')
})

test('warm miss: a warm cache re-written anyway is counted, a cold one is not', async ($, on) => {
  const { clock, next } = world(on)
  await step($)
  next.write = 60_000
  next.read = 10_000
  await clock.advance(5 * 60_000)
  await step($)
  let ui = await $.ui.mount({ surface: 'terminal', ...PANE })
  await ui.press({ key: 'tab-health' })
  expect(await ui.find({ type: 'Text', text: /1× re-written while warm · 60.0k tokens · last \d\d:\d\d after 5m idle/ })).toBeDefined()
  await ui.unmount()
  // After the TTL the same re-write is an expiry, not a warm miss.
  await clock.advance(2 * HOUR)
  await step($)
  ui = await $.ui.mount({ surface: 'terminal', ...PANE })
  await ui.press({ key: 'tab-health' })
  expect(await ui.find({ type: 'Text', text: /1× re-written while warm/ })).toBeDefined()
  await ui.unmount()
  expect(isUnexpectedWrite(false, false, { input: 0, read: 0, write: 50_000, output: 0 })).toBe(false)
})

test('band: a cold cache over half full suggests compacting', async ($, on) => {
  const { clock } = world(on)
  await step($)
  await $.session.measure({ context: { tokens: 600_000, window: 1_000_000, percent: 60 }, rateLimits: [], changed: ['context'] })
  let ui = await $.ui.mount({ surface: 'terminal', ...band(160) })
  expect(await ui.find({ type: 'Text', text: /good time to/ })).toBeUndefined()
  await ui.unmount()
  await clock.advance(61 * 60_000)
  ui = await $.ui.mount({ surface: 'terminal', ...band(160) })
  expect(await ui.find({ type: 'Text', text: ' · cold: good time to' })).toBeDefined()
  await ui.unmount()
  // While Claude works there is no button, so no hint.
  ui = await $.ui.mount({ surface: 'terminal', ...band(160, true) })
  expect(await ui.find({ type: 'Text', text: /good time to/ })).toBeUndefined()
  await ui.unmount()
})

test('MCP servers: unused only after three prompts since the start or a /resume', async ($, on) => {
  const { next } = world(on)
  // A resumed transcript already holds 4 prompts; the call counts start again ($.state resets there).
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  next.turns = 5
  await $.session.measure({ context: { tokens: 100_000, window: 1_000_000, percent: 10 }, rateLimits: [], changed: ['context'] })
  let ui = await $.ui.mount({ surface: 'terminal', ...PANE })
  await ui.press({ key: 'tab-context' })
  expect(await ui.find({ type: 'Text', text: / · 2 tools · 0 calls$/ })).toBeDefined()
  await ui.unmount()
  next.turns = 7
  await $.session.measure({ context: { tokens: 100_000, window: 1_000_000, percent: 10 }, rateLimits: [], changed: ['context'] })
  ui = await $.ui.mount({ surface: 'terminal', ...PANE })
  await ui.press({ key: 'tab-context' })
  expect(await ui.find({ type: 'Text', text: / · 2 tools · 0 calls – unused so far$/ })).toBeDefined()
  await ui.unmount()
  // /resume or /branch: counted from there again.
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 60, context_tokens: 100_000 })
  await $.session.measure({ context: { tokens: 100_000, window: 1_000_000, percent: 10 }, rateLimits: [], changed: ['context'] })
  ui = await $.ui.mount({ surface: 'terminal', ...PANE })
  await ui.press({ key: 'tab-context' })
  expect(await ui.find({ type: 'Text', text: /unused so far/ })).toBeUndefined()
  await ui.unmount()
})

test('line under the answer: a line another mod put there is kept', async ($, on) => {
  const { next } = world(on, { turnText: 'other mod: summary' })
  await $.turn.start({ turnId: 't', text: 'hi' } as never)
  await step($)
  next.usd = 1.6
  expect((await complete($)).text).toBe('other mod: summary\n◉ Cache Meter · $0.10 spent · 1 request · 93% from cache · 6.0k written to cache')
})

test('line under the answer: when the core text is the answer itself, only the line', async ($, on) => {
  const { next } = world(on, { turnText: 'ok' })
  await $.turn.start({ turnId: 't', text: 'hi' } as never)
  await step($)
  next.usd = 1.6
  expect((await complete($)).text).toBe('◉ Cache Meter · $0.10 spent · 1 request · 93% from cache · 6.0k written to cache')
})
