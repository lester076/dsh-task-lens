import { describe, expect, it } from 'vitest'
import { foldPlan, foldRoute } from '../src/server/events'
import { createPlan, updatePlanStep } from '../src/server/plan'
import type { SessionEvent } from '../src/server/host-api'

function event(type: string, data: unknown, seq = 0): SessionEvent {
  return { type, seq, data }
}

const plan = updatePlanStep(createPlan({
  title: '发布插件',
  steps: [{ id: 'a', title: '实现' }, { id: 'b', title: '发布' }],
}), 'a', 'completed')

describe('foldPlan', () => {
  it('folds the plan out of a tool result meta', () => {
    expect(foldPlan(null, event('tool/result', { meta: { taskLens: plan } }))).toEqual(plan)
  })

  it('keeps the previous plan for unrelated events and foreign results', () => {
    const start = foldPlan(null, event('tool/result', { meta: { taskLens: plan } }))
    expect(foldPlan(start, event('user/message', { content: [] }))).toBe(start)
    expect(foldPlan(start, event('tool/result', { message: {} }))).toBe(start)
    expect(foldPlan(start, event('tool/result', { meta: { other: true } }))).toBe(start)
    expect(foldPlan(start, event('tool/result', { meta: 'broken' }))).toBe(start)
  })

  it('stays null when no tool ever wrote a plan', () => {
    expect(foldPlan(null, event('tool/call', { name: 'task_lens_write' }))).toBeNull()
  })
})

describe('foldRoute', () => {
  const header = (provider: string, model: string) => event('request/header', { header: { config: { provider, model } } })

  it('remembers the latest request header route', () => {
    const first = foldRoute(null, header('deepseek', 'v4'))
    expect(first).toEqual({ provider: 'deepseek', model: 'v4' })
    expect(foldRoute(first, header('gateway', 'v41-flash'))).toEqual({ provider: 'gateway', model: 'v41-flash' })
  })

  it('reuses the state reference when nothing changed', () => {
    const first = foldRoute(null, header('deepseek', 'v4'))
    expect(foldRoute(first, header('deepseek', 'v4'))).toBe(first)
    expect(foldRoute(first, event('tool/result', {}))).toBe(first)
    expect(foldRoute(null, event('request/header', { header: {} }))).toBeNull()
  })
})
