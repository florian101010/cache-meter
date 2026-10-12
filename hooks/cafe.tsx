// The café under the request chart: a barista and a cup that act out the cache. A surface module
// (interface › Build a tree from elements: Client) – it runs on the drawing side with its own frame
// clock and gets no mods API at all: the hooks module hands it one word, the cache's state, and
// nothing about the session. Four frames a second, only while the Overview is on screen.
import type { ClientModule, ClientSurface } from 'claude-code'

export type CafeState = 'empty' | 'working' | 'warm' | 'last' | 'cold' | 'ping' | 'brewing'
export type CafeProps = { state: CafeState }
type Local = { f: number }

export const FRAME_MS = 250
// Rows the full scene takes: six of art and a caption.
export const SCENE_ROWS = 7
const SCENE_COLUMNS = 20

const BODY = 'claude'
const EYES = '#2a1a12'
const APRON = '#f3e7d9'
const COFFEE = '#8b5a3c'
// The barista's cap: its own figure, not anyone's mascot – a cap with a brim over a round-eyed face.
const CAP = '#5b3a29'

const CAPTION: Record<CafeState, string> = {
  empty: 'cup empty · waiting for the first answer',
  working: 'Claude is working · stirring',
  warm: 'cache warm · sipping',
  last: 'last stretch · watching the clock',
  cold: 'cache cold · napping',
  ping: 'keepwarm ping · topped up',
  brewing: 'fresh cache · brewing',
}

// One piece of a row: text with its color, background and dimness.
type Seg = { t: string; c?: string; bg?: string; dim?: boolean; bold?: boolean }

/** What the scene shows at frame `f` in `state`: six rows of segments, the caption apart. */
export function sceneRows(state: CafeState, f: number): Seg[][] {
  const blink = f % 16 === 0
  const eyes = state === 'cold' ? ' ─ ─ ' : blink ? ' ▁ ▁ ' : state === 'last' ? '  ● ●' : ' ● ● '
  const isSip = state === 'warm' && f % 24 < 3
  const mouth = state === 'cold' ? '  ~  ' : isSip ? '  o  ' : state === 'ping' ? '  ◡  ' : '  ‿  '
  // The cup: how full, and what it holds.
  const fill =
    state === 'empty'
      ? '     '
      : state === 'brewing'
        ? '▓'.repeat(Math.min(5, 1 + (f % 6))).padEnd(5)
        : state === 'cold'
          ? '░░░░░'
          : state === 'last'
            ? '▒▒▒▒▒'
            : '▓▓▓▓▓'
  const fillColor = state === 'cold' || state === 'empty' ? 'inactive' : COFFEE
  // Above the cup (columns 10–16): steam, a falling drop, or a stirring spoon.
  const wave = (k: number) => ((f + k) % 2 === 0 ? '(' : ')')
  let above: [string, string] = ['       ', '       ']
  if (state === 'warm' || state === 'working') above = [` ${wave(0)}  ${wave(1)}  `, `  ${wave(1)}  ${wave(0)} `]
  if (state === 'ping') above = [`${wave(0)} ${wave(1)} ${wave(0)} `, ` ${wave(1)} ${wave(0)} ${wave(1)}`]
  if (state === 'last') above = f % 4 === 3 ? ['       ', '       '] : [`   ${wave(0)}   `, `    ${wave(1)}  `]
  if (state === 'brewing') above = f % 2 === 0 ? ['   ╻   ', '       '] : ['       ', '   ╻   ']
  if (state === 'working') above = [above[0], f % 4 < 2 ? '  ╲    ' : '    ╱  ']
  // Beside the head: a clock in the last stretch, z's while cold.
  const clock = '◷◶◵◴'[f % 4]!
  const side0 = state === 'last' ? ` ${clock} ` : state === 'cold' ? (f % 4 < 2 ? '  z' : ' z ') : '   '
  const side1 = state === 'cold' ? (f % 4 < 2 ? ' z ' : 'Z  ') : '   '
  const steam = state === 'ping' ? { c: 'text', bold: true } : { dim: true }
  // A right arm toward the cup while sipping or stirring.
  const arm = isSip || state === 'working' || state === 'ping' ? '▄' : ' '

  return [
    [{ t: '  ▄▄▄  ', c: CAP }, { t: side0, c: 'subtle' }, { t: above[0], ...steam }],
    [{ t: '▄█████▄', c: CAP }, { t: side1, c: 'subtle' }, { t: above[1], ...steam }],
    [{ t: '█', c: BODY }, { t: eyes, c: EYES, bg: BODY }, { t: '█', c: BODY }, { t: '   ' }, { t: '╭─────╮', c: 'subtle' }],
    [{ t: '█', c: BODY }, { t: mouth, c: EYES, bg: BODY }, { t: '█', c: BODY }, { t: arm, c: BODY }, { t: '  ' }, { t: '│', c: 'subtle' }, { t: fill, c: fillColor }, { t: '├╮', c: 'subtle' }],
    [{ t: '█', c: BODY }, { t: '     ', bg: APRON }, { t: '█', c: BODY }, { t: '   ' }, { t: '│', c: 'subtle' }, { t: fill, c: fillColor }, { t: '├╯', c: 'subtle' }],
    [{ t: ' ▀   ▀ ', c: BODY }, { t: '   ' }, { t: '╰─────╯', c: 'subtle' }],
  ]
}

const Cafe: ClientModule<CafeProps, Local> = (props, surface: ClientSurface<Local>) => {
  const { Box, Text } = surface.elements
  if (surface.state === undefined) {
    // Started once; the instance (and with it the timer) ends when the Overview leaves the screen.
    // Frames advance only while the full scene shows: the one-line fallback does not move, so it
    // costs no redraws at all (terminal apps that repaint badly – Termius – showed traces there).
    surface.every(FRAME_MS, () => {
      if (surface.rows >= SCENE_ROWS && surface.columns >= SCENE_COLUMNS) surface.setState({ f: (surface.state?.f ?? 0) + 1 })
    })
    surface.setState({ f: 0 })
  }
  const f = surface.state?.f ?? 0
  // An unknown word claims nothing: the empty cup.
  const state = CAPTION[props.state] === undefined ? 'empty' : props.state
  const draw = (seg: Seg) => (
    <Text color={seg.c} backgroundColor={seg.bg} dimColor={seg.dim} bold={seg.bold}>
      {seg.t}
    </Text>
  )
  // Too little room (or none measured yet): one line, so the region never leaves a half figure.
  if (surface.rows < SCENE_ROWS || surface.columns < SCENE_COLUMNS) {
    return (
      <Text wrap="truncate-end">
        <Text dimColor>{state === 'cold' || state === 'empty' ? '◌' : '⌇'} {CAPTION[state]}</Text>
      </Text>
    )
  }

  return (
    <Box flexDirection="column" justifyContent="flex-end" paddingLeft={1}>
      {sceneRows(state, f).map(row => (
        <Text wrap="truncate-end">{row.map(draw)}</Text>
      ))}
      <Text dimColor wrap="truncate-end">
        {CAPTION[state]}
      </Text>
    </Box>
  )
}

export default Cafe
