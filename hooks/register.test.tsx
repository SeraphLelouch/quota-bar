import { expect, mock, test } from 'claude-code/testing'

const NOW = Date.UTC(2026, 10, 2, 8, 0)
const HOUR = 3_600_000

const LIMITS = [
  { kind: 'five_hour', percentUsed: 38, resetsAt: new Date(NOW + 2 * HOUR + 13 * 60_000).toISOString() },
  { kind: 'seven_day', percentUsed: 85.5, resetsAt: new Date(NOW + 3 * 24 * HOUR).toISOString() },
]

const usage = (rateLimits: typeof LIMITS) => ({
  value: { startedAt: NOW, context: { window: 200_000 }, rateLimits },
})

const start = async (
  $: Parameters<Parameters<typeof test>[1]>[0],
  on: Parameters<Parameters<typeof test>[1]>[1],
  figures: typeof LIMITS,
  cache?: typeof LIMITS,
) => {
  const lines: (string | undefined)[] = []
  const clock = mock.clock(on, { now: NOW })
  mock.store(on, cache ? { limits: cache } : undefined)
  on('command.register', () => ({ value: { command: 'quota' } }))
  on('session.usage', () => usage(figures))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.status', (_, e) => {
    lines.push(e.text)

    return { value: undefined }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()

  return { lines, clock }
}

test('the status line shows what is left and when it resets', async ($, on) => {
  const { lines } = await start($, on, LIMITS)
  const line = lines.at(-1) ?? ''

  expect(line).toMatch(/^额度 5h 62% \S+ · 7d 14\.5% \S+$/)
  expect(line.length).toBeLessThan(40)
})

test('the countdown moves each minute and a passed window reads as reset', async ($, on) => {
  const { lines, clock } = await start($, on, [], LIMITS)
  expect(lines.at(-1)).toContain('5h 62%')

  await clock.advance(3 * HOUR)
  expect(lines.at(-1)).toContain('5h 已重置')
})

test('with no figure yet the line says it is waiting', async ($, on) => {
  const { lines } = await start($, on, [])

  expect(lines.at(-1)).toContain('等待首次回复')
})
