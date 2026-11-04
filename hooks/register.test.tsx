import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'quota-bar',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const NOW = Date.UTC(2026, 10, 2, 8, 0)
const HOUR = 3_600_000

const LIMITS = [
  { kind: 'five_hour', percentUsed: 38, resetsAt: new Date(NOW + 2 * HOUR + 13 * 60_000).toISOString() },
  { kind: 'seven_day', percentUsed: 85.5, resetsAt: new Date(NOW + 3 * 24 * HOUR).toISOString() },
]

const usage = (rateLimits: typeof LIMITS) => ({
  value: { startedAt: NOW, context: { window: 200_000 }, rateLimits },
})

test('the band shows what is left and when it resets', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on)
  on('command.register', () => ({ value: { command: 'quota' } }))
  on('session.usage', () => usage(LIMITS))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const five = await ui.find({ type: 'Text', text: /5小时/ })
    expect(five?.text).toContain('5小时 剩 62%')
    expect(five?.text).toContain('2小时13分后')
    const week = await ui.find({ type: 'Text', text: /7天/ })
    expect(week?.text).toContain('7天 剩 14.5%')
    expect(week?.text).toContain('3天0小时后')
    await ui.unmount()
  }
})

test('a window past its reset reads as reset, and hide hides the band', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on, { limits: LIMITS })
  on('command.register', () => ({ value: { command: 'quota' } }))
  on('session.usage', () => usage([]))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(3 * HOUR)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /5小时/ }))?.text).toContain('5小时 已重置')
  await ui.press({ key: 'hide' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})

test('before any figure arrives the band says it is waiting', async ($, on) => {
  mock.clock(on, { now: NOW })
  mock.store(on)
  on('command.register', () => ({ value: { command: 'quota' } }))
  on('session.usage', () => usage([]))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text' }))?.text).toContain('等待第一次回复')
  await ui.unmount()
})
