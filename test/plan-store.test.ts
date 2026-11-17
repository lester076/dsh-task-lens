import { describe, expect, it, vi } from 'vitest'
import { PlanStore } from '../src/server/plan-store'

const plan = {
  title: '发布插件',
  steps: [
    { id: 'a', title: '实现', expectedOutcome: '可构建', test: '运行测试', estimate: '20 分钟' },
    { id: 'b', title: '发布', expectedOutcome: '可使用', test: '安装检查', estimate: '10 分钟' },
  ],
}

describe('PlanStore', () => {
  it('creates a plan with the first step active and replaces obsolete plans', () => {
    const store = new PlanStore()
    expect(store.create('s', plan).steps.map((step) => step.status)).toEqual(['in_progress', 'pending'])
    const changed = store.create('s', { title: '新任务', steps: [{ title: '验证' }, { title: '交付' }] })
    expect(changed.title).toBe('新任务')
    expect(changed.steps[0]?.status).toBe('in_progress')
  })

  it('rejects invalid plan boundaries and step transitions', () => {
    const store = new PlanStore()
    expect(() => store.create('s', { title: '', steps: [] })).toThrow()
    expect(() => store.create('s', { title: 'bad', steps: [{ id: 'same', title: 'a' }, { id: 'same', title: 'b' }] })).toThrow()
    store.create('s', plan)
    expect(() => store.update('s', 'missing', 'completed')).toThrow('Unknown step')
    expect(() => store.update('s', 'b', 'in_progress')).toThrow('previous')
    expect(() => store.update('s', 'a', 'pending')).toThrow('backward')
  })

  it('only completes when every step is completed', () => {
    const store = new PlanStore()
    store.create('s', plan)
    expect(store.get('s')?.status).toBe('active')
    store.update('s', 'a', 'completed')
    expect(store.get('s')?.status).toBe('active')
    store.update('s', 'b', 'in_progress')
    store.update('s', 'b', 'completed')
    expect(store.get('s')?.status).toBe('completed')
    expect(() => store.update('s', 'b', 'in_progress')).toThrow('completed')
  })

  it('restores safely and caps plans, steps, text and source errors', () => {
    vi.useFakeTimers()
    const store = new PlanStore({ maxPlans: 2, maxSteps: 2, maxErrorLength: 5 })
    const first = store.create('first', plan)
    expect(() => store.create('first', { title: 'x', steps: [{ title: 'a' }, { title: 'b' }, { title: 'c' }] })).toThrow('between 2 and 2')
    store.update('first', 'a', 'failed', '123456789')
    expect(store.get('first')?.steps[0]?.lastError).toBe('12345')
    store.create('second', { title: '二', steps: [{ title: 'a' }, { title: 'b' }] })
    vi.advanceTimersByTime(1000)
    store.create('third', { title: '三', steps: [{ title: 'a' }, { title: 'b' }] })
    expect(store.get('first')).toBeUndefined()
    expect(store.list()).toHaveLength(2)
    expect(store.restore('third', first).title).toBe('发布插件')
    expect(store.get('third')?.steps[0]?.status).toBe('in_progress')
    expect(() => store.restore('bad', { title: 'bad', steps: [] })).toThrow()
    vi.useRealTimers()
  })
})
