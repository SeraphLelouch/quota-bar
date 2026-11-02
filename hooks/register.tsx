import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit } from '../types'

const STORE_KEY = 'limits'
const WARN_AT = [80, 95]

// Change the tag when a window's fields change: it declines what an earlier
// version stored, which outlives a reload.
const limits = atom({ plugin: 'quota-bar', key: 'limits' } as const, [], {
  shape: 'limits-1',
})
const isHidden = atom({ plugin: 'quota-bar', key: 'isHidden' } as const, false)
const now = atom({ plugin: 'quota-bar', key: 'now' } as const, 0)

const LABELS: Record<string, string> = {
  five_hour: '5小时',
  seven_day: '7天',
  seven_day_opus: '7天 Opus',
  seven_day_sonnet: '7天 Sonnet',
  spend_limit: '消费上限',
}

export const label = (kind: string) => LABELS[kind] ?? kind

export const remaining = (limit: Limit) =>
  Math.max(0, Math.round((100 - limit.percentUsed) * 10) / 10)

const pad = (n: number) => String(n).padStart(2, '0')

export const countdown = (ms: number) => {
  const minutes = Math.ceil(ms / 60_000)
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  const m = minutes % 60

  return d > 0 ? `${d}天${h}小时` : h > 0 ? `${h}小时${m}分` : `${m}分`
}

export const clockTime = (at: Date, nowMs: number) => {
  const today = new Date(nowMs)
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`
  const isToday =
    at.getFullYear() === today.getFullYear() &&
    at.getMonth() === today.getMonth() &&
    at.getDate() === today.getDate()

  return isToday ? time : `${pad(at.getMonth() + 1)}/${pad(at.getDate())} ${time}`
}

export const describe = (limit: Limit, nowMs: number) => {
  const head = `${label(limit.kind)} 剩 ${remaining(limit)}%`
  if (!limit.resetsAt) return head

  const at = new Date(limit.resetsAt)
  const left = at.getTime() - nowMs
  if (Number.isNaN(left)) return head
  if (left <= 0) return `${label(limit.kind)} 已重置`

  return `${head} · ${clockTime(at, nowMs)} 重置（${countdown(left)}后）`
}

const short = (list: Limit[]) =>
  list.map(limit => `${label(limit.kind)} ${remaining(limit)}%`).join(' · ')

const isLimitList = (value: unknown): value is Limit[] =>
  Array.isArray(value) &&
  value.every(
    one =>
      typeof one === 'object' &&
      one !== null &&
      typeof one.kind === 'string' &&
      typeof one.percentUsed === 'number',
  )

// Thresholds already toasted, one per window period: `kind@resetsAt@pct`.
const warned = new Set<string>()

async function take($: EngineInterface, list: Limit[]) {
  if (list.length === 0) return

  await update($, limits, () => list)
  await $.store.set(STORE_KEY, list)
  $.ui.status(`额度 ${short(list)}`)

  for (const limit of list) {
    const pct = WARN_AT.filter(at => limit.percentUsed >= at).pop()
    const tag = `${limit.kind}@${limit.resetsAt ?? ''}@${pct}`
    if (pct === undefined || warned.has(tag)) continue

    warned.add(tag)
    $.ui.toast(`Claude ${label(limit.kind)}额度已用 ${limit.percentUsed}%`)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'quota',
      description: '显示 Claude 剩余额度和重置时间（/quota hide | show）',
    })

    const startedAt = await $.clock.now()
    await update($, now, () => startedAt)
    $.clock.every(60_000, async () => {
      const t = await $.clock.now()
      await update($, now, () => t)
    })

    const cached = await $.store.get(STORE_KEY)
    if (isLimitList(cached)) {
      await update($, limits, () => cached)
      $.ui.status(`额度 ${short(cached)}`)
    }

    const usage = await $.session.usage()
    await take($, usage.rateLimits)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await take($, e.rateLimits)

    return next(e)
  })

  on('command.run', { command: 'quota' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'hide' || arg === 'show') {
      await update($, isHidden, () => arg === 'hide')

      return { text: arg === 'hide' ? '额度信息条已隐藏。' : '额度信息条已显示。' }
    }

    const list = await read($, limits)
    if (list.length === 0) {
      return { text: '还没有额度数据：发一条消息后，引擎会从回复里读到额度。' }
    }

    const nowMs = await $.clock.now()

    return { text: list.map(limit => describe(limit, nowMs)).join('\n') }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, limits)
    if (e.props.hasSurvey || list.length === 0 || (await read($, isHidden))) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const nowMs = (await read($, now)) || (await $.clock.now())

    return (
      <Box flexDirection="row" flexWrap="wrap">
        {list.map((limit, i) => (
          <Text
            color={remaining(limit) < 20 ? 'warning' : undefined}
            dimColor={remaining(limit) >= 20}
          >
            {i > 0 ? '  |  ' : ''}
            {describe(limit, nowMs)}
          </Text>
        ))}
        <Text> </Text>
        <Button
          key="hide"
          label="隐藏"
          onPress={() => update($, isHidden, () => true)}
        />
      </Box>
    )
  })
}
