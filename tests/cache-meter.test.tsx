import { expect, mock, test } from 'claude-code/testing'

import {
  FIVE_MIN,
  HOUR,
  forecast,
  hitPct,
  litCells,
  parseKeepWarm,
  remainingLabel,
  resolveTtl,
} from '../hooks/lib'

const T0 = Date.parse('2026-10-12T10:00:00Z')

function band(bodyColumns: number) {
  return {
    plugin: 'cache-meter',
    component: 'AbovePrompt' as const,
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows: 3,
      bodyColumns,
      scroll: { offset: 0, bodyRows: 3 },
      view: {},
    },
  }
}

test('TTL: Einstellung vor Meldung vor Annahme', async () => {
  expect(resolveTtl('5m', '1h', []).ms).toBe(FIVE_MIN)
  expect(resolveTtl('auto', '5m', []).source).toBe('gemeldet')
  expect(resolveTtl('auto', null, []).ms).toBe(HOUR)
  expect(resolveTtl('auto', null, [{ kind: 'five_hour', percentUsed: 100 }]).ms).toBe(FIVE_MIN)
})

test('Trefferquote, Balken, Restzeit, Wetter', async () => {
  expect(hitPct({ input: 10, read: 930, write: 60, output: 5 })).toBe(93)
  expect(hitPct({ input: 0, read: 0, write: 0, output: 5 })).toBe(null)
  expect(litCells(HOUR, HOUR, 20)).toBe(20)
  expect(litCells(1000, HOUR, 20)).toBe(1)
  expect(litCells(0, HOUR, 20)).toBe(0)
  expect(remainingLabel(HOUR)).toBe('60m')
  expect(remainingLabel(45_000)).toBe('45s')
  expect(forecast(9, 97).icon).toBe('☀')
  expect(forecast(95, 97).icon).toBe('↯')
})

test('/keepwarm-Argumente', async () => {
  expect(parseKeepWarm('')).toBe(2 * HOUR)
  expect(parseKeepWarm('aus')).toBe(null)
  expect(parseKeepWarm('30m')).toBe(30 * 60_000)
  expect(parseKeepWarm('4h')).toBe(4 * HOUR)
  expect(parseKeepWarm('5m')).toBe(undefined)
  expect(parseKeepWarm('12h')).toBe(undefined)
  expect(parseKeepWarm('bald')).toBe(undefined)
})

test('Band: leer, dann warm nach Resume, dann abgelaufen', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  on('classic.SessionStart', () => ({}))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ surface, ...band(120) })
    expect(await ui.find({ type: 'Text', text: 'leer' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'compact' })).toBeDefined()
    await ui.unmount()
  }

  // Resumed 10 minutes after the last response: 50 of 60 minutes left.
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 600, context_tokens: 120_000 })
  const warm = await $.ui.mount({ surface: 'terminal', ...band(120) })
  expect(await warm.find({ type: 'Text', text: '50m' })).toBeDefined()
  await warm.unmount()

  await clock.advance(51 * 60_000)
  const cold = await $.ui.mount({ surface: 'terminal', ...band(120) })
  expect(await cold.find({ type: 'Text', text: 'abgelaufen' })).toBeDefined()
  expect(await cold.find({ type: 'Text', text: /Neuschreiben/ })).toBeDefined()
  await cold.unmount()
})

test('Band: feste TTL 5m aus der Einstellung', { options: { cacheTtl: '5m' } }, async ($, on) => {
  mock.clock(on, { now: T0 })
  on('classic.SessionStart', () => ({}))
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 60 })
  const ui = await $.ui.mount({ surface: 'terminal', ...band(120) })
  expect(await ui.find({ type: 'Text', text: '4m' })).toBeDefined()
  await ui.unmount()
})

test('Pane /tokens zeichnet auf jeder Oberfläche', async ($, on) => {
  mock.clock(on, { now: T0 })
  on('classic.SessionStart', () => ({}))
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 120, context_tokens: 80_000 })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'cache-meter',
      surface,
      component: 'Pane',
      requestId: 'cache-meter',
      props: {
        title: 'Tokens & Cache',
        isFocused: false,
        bodyColumns: 90,
        placement: 'dock',
        scroll: { offset: 0, bodyRows: 40 },
        view: {},
      },
    })
    expect(await ui.find({ type: 'Text', text: /warm · noch 58m/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Noch keine Anfrage gemessen/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'pane-compact' })).toBeDefined()
    await ui.unmount()
  }
})
