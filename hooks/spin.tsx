// The keepwarm card's turning arrow while keepwarm runs: a surface module (interface › Build a tree
// from elements: Client) with its own frame clock, so hours of keepwarm cost the pane no redraws. It
// gets no props and no mods API; it draws one cell.
import type { ClientModule, ClientSurface } from 'claude-code'

type Local = { f: number }

export const SPIN_MS = 200
export const SPIN_FRAMES = ['◜', '◝', '◞', '◟'] as const

const Spin: ClientModule<Record<string, never>, Local> = (props, surface: ClientSurface<Local>) => {
  const { Text } = surface.elements
  if (surface.state === undefined) {
    // Started once; it ends with the instance (keepwarm off, another tab, pane closed).
    surface.every(SPIN_MS, () => surface.setState({ f: (surface.state?.f ?? 0) + 1 }))
    surface.setState({ f: 0 })
  }

  return (
    <Text color="claude" bold>
      {SPIN_FRAMES[(surface.state?.f ?? 0) % SPIN_FRAMES.length]}
    </Text>
  )
}

export default Spin
