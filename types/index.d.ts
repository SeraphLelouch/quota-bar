// One rate-limit window, as `session.measure` reports it.
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'quota-bar': {
      limits: Shaped<Limit[]>
      isHidden: boolean
      now: number
    }
  }
}
