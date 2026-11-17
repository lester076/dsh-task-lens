import { describe, expect, it, vi } from 'vitest'
import { BoundedConversation, buildConsultMessages } from '../src/server/adviser'
import { PlanStore } from '../src/server/plan-store'

const plan = { title: '开发功能', steps: [{ title: '写实现', expectedOutcome: '接口可用', test: '运行测试', estimate: '约 20 分钟' }, { title: '验证' }] }

describe('isolated adviser', () => {
  it('contains current plan, recent bounded context and no tool declarations', () => {
    const store = new PlanStore(); store.create('s', plan)
    const history = new BoundedConversation(4, 500)
    history.add('user', '老问题'); history.add('assistant', '老回答')
    history.add('user', '怎么做'); history.add('assistant', '这样'); history.add('user', '怎么测试')
    const messages = buildConsultMessages(store.snapshot('s'), history.get(), '怎么测试')
    expect(messages[0]?.role).toBe('system')
    expect(messages[0]?.content).toContain('写实现')
    expect(messages[0]?.content).toContain('只读')
    expect(messages[0]?.content).not.toContain('老问题')
    expect(messages.at(-1)?.content).toBe('怎么测试')
    expect(JSON.stringify(messages)).not.toContain('tools')
  })

  it('keeps role, length, history limits and copies', () => {
    const history = new BoundedConversation(2, 10)
    history.add('user', '12345678901')
    expect(history.get()[0]?.content).toHaveLength(10)
    history.add('assistant', '答')
    history.add('user', '新')
    expect(history.get().map((item) => item.content)).toEqual(['答', '新'])
    const copy = history.get(); copy[0]!.content = 'mutated'
    expect(history.get()[0]?.content).toBe('答')
  })
})
