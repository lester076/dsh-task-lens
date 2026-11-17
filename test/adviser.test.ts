import { describe, expect, it } from 'vitest'
import { BoundedConversation, buildConsultRequest } from '../src/server/adviser'
import { createPlan, snapshotOf } from '../src/server/plan'

const plan = createPlan({
  title: '开发功能',
  steps: [
    { title: '写实现', expectedOutcome: '接口可用', test: '运行测试', estimate: '约 20 分钟' },
    { title: '验证' },
  ],
})

describe('buildConsultRequest', () => {
  it('carries the plan, the progress and the read-only rule in one turn', () => {
    const { prompt } = buildConsultRequest(snapshotOf(plan), [], '怎么做')
    expect(prompt).toContain('只读')
    expect(prompt).toContain('标题：开发功能')
    expect(prompt).toContain('整体完成度：0%')
    expect(prompt).toContain('当前步骤：写实现')
    expect(prompt).toContain('预期效果：接口可用')
    expect(prompt).toContain('测试：运行测试')
    expect(prompt).toContain('粗略估计：约 20 分钟')
    expect(prompt.endsWith('【本次提问】\n怎么做')).toBe(true)
    expect(prompt).not.toContain('tools')
  })

  it('keeps earlier turns inside the same turn, after the plan', () => {
    const history = new BoundedConversation(4, 500)
    history.add('user', '老问题')
    history.add('assistant', '老回答')
    const { prompt } = buildConsultRequest(snapshotOf(plan), history.get(), '新问题')
    expect(prompt).toContain('老问题')
    expect(prompt).toContain('老回答')
    expect(prompt.indexOf('老问题')).toBeGreaterThan(prompt.indexOf('当前步骤'))
    expect(prompt.endsWith('【本次提问】\n新问题')).toBe(true)
  })

  it('states the empty-plan case instead of inventing one', () => {
    const { prompt } = buildConsultRequest({ plan: null, percent: 0, current: null }, [], '怎么做')
    expect(prompt).toContain('标题：无')
    expect(prompt).toContain('暂无计划')
  })
})

describe('BoundedConversation', () => {
  it('keeps length limits and hands out copies', () => {
    const history = new BoundedConversation(2, 10)
    history.add('user', '12345678901')
    expect(history.get()[0]?.content).toHaveLength(10)
    history.add('assistant', '答')
    history.add('user', '新')
    expect(history.get().map(item => item.content)).toEqual(['答', '新'])
    const copy = history.get()
    copy[0]!.content = 'mutated'
    expect(history.get()[0]?.content).toBe('答')
  })
})
