// The value types of the $.state contract, taken from PluginState (types/index.d.ts declares it) instead of
// importing that file: the directory reads a file a module imports as code it could load, and `declare`
// is not allowed there. One source still – each name below is a path into the contract.
import type { PluginState } from 'claude-code'

type State = PluginState['cache-meter']

export type CacheInfo = NonNullable<State['cache']>
export type Step = State['steps'][number]
export type Totals = State['totals']
export type Usage4 = Totals['main']
export type Measure = NonNullable<State['measure']>
export type Limit = Measure['limits'][number]
export type LimitStart = NonNullable<Measure['limitStart']>[string]
export type KeepWarm = State['keepWarm']
export type TtlConfig = State['ttlConfig']
export type ColdWrite = State['coldWrites'][number]
export type ContextMap = NonNullable<State['contextMap']>
export type Health = State['health']
export type ServerToolCall = NonNullable<Health['lastServerTools']>['calls'][number]
export type AgentUse = State['agents'][string]
export type ToolResults = State['toolResults']
