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

const SHORT: Record<string, string> = { five_hour: '5h', seven_day: '7d' }

// One window in as few cells as will do: `5h 62% 16:40`.
const brief = (limit: Limit, nowMs: number) => {
  const name = SHORT[limit.kind] ?? label(limit.kind)
  const at = limit.resetsAt ? new Date(limit.resetsAt) : undefined
  if (!at || Number.isNaN(at.getTime())) return `${name} ${remaining(limit)}%`
  if (at.getTime() <= nowMs) return `${name} 已重置`

  return `${name} ${remaining(limit)}% ${clockTime(at, nowMs).replace(/ \d\d:\d\d$/, '')}`
}

const statusText = (list: Limit[], nowMs: number) =>
  list.length === 0
    ? '等待首次回复'
    : list.map(limit => brief(limit, nowMs)).join(' · ')

const isLimitList = (value: unknown): value is Limit[] =>
  Array.isArray(value) &&
  value.every(
    one =>
      typeof one === 'object' &&
      one !== null &&
      typeof one.kind === 'string' &&
      typeof one.percentUsed === 'number',
  )

// The one place the mod draws: a status line under the prompt, beside the model picker.
async function paint($: EngineInterface) {
  if (await read($, isHidden)) {
    $.ui.status(undefined)

    return
  }

  const nowMs = (await read($, now)) || (await $.clock.now())
  $.ui.status(statusText(await read($, limits), nowMs))
}

// Thresholds already toasted, one per window period: `kind@resetsAt@pct`.
const warned = new Set<string>()

async function take($: EngineInterface, list: Limit[]) {
  if (list.length === 0) return

  await update($, limits, () => list)
  await $.store.set(STORE_KEY, list)
  await paint($)

  for (const limit of list) {
    const pct = WARN_AT.filter(at => limit.percentUsed >= at).pop()
    const tag = `${limit.kind}@${limit.resetsAt ?? ''}@${pct}`
    if (pct === undefined || warned.has(tag)) continue

    warned.add(tag)
    $.ui.toast(`Claude ${label(limit.kind)}额度已用 ${limit.percentUsed}%`)
  }
}


// Fill the window figures from the engine, else from the last session's cache,
// for a session this mod joined after `session.start` (an install mid-session).
async function load($: EngineInterface): Promise<Limit[]> {
  const have = await read($, limits)
  if (have.length > 0) return have

  try {
    const usage = await $.session.usage()
    if (usage.rateLimits.length > 0) {
      await take($, usage.rateLimits)

      return usage.rateLimits
    }
  } catch {
    // no reading yet: fall back to the cache
  }

  const cached = await $.store.get(STORE_KEY)
  if (isLimitList(cached) && cached.length > 0) {
    await update($, limits, () => cached)
    await paint($)

    return cached
  }

  return []
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'quota',
      description: '显示 Claude 剩余额度和重置时间（/quota hide | show 切换状态栏显示）',
    })

    const startedAt = await $.clock.now()
    await update($, now, () => startedAt)
    $.clock.every(60_000, async () => {
      const t = await $.clock.now()
      await update($, now, () => t)
      await paint($)
    })

    const cached = await $.store.get(STORE_KEY)
    if (isLimitList(cached)) {
      await update($, limits, () => cached)
    }
    await paint($)

    await load($)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await take($, e.rateLimits)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await load($)

    return next(e)
  })

  on('command.run', { command: 'quota' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'hide' || arg === 'show') {
      await update($, isHidden, () => arg === 'hide')
      await paint($)

      return { text: arg === 'hide' ? '状态栏额度已隐藏。' : '状态栏额度已显示。' }
    }

    const list = await load($)
    if (list.length === 0) {
      return { text: '还没有额度数据：发一条消息后，引擎会从回复里读到额度。' }
    }

    const nowMs = await $.clock.now()

    return { text: list.map(limit => describe(limit, nowMs)).join('\n') }
  })
}
