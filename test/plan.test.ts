import { describe, expect, it } from 'vitest'
import { MAX_STEPS, createPlan, planFromMeta, snapshotOf, updatePlanStep } from '../src/server/plan'

const input = {
  title: '发布插件',
  steps: [
    { id: 'a', title: '实现', expectedOutcome: '可构建', test: '运行测试', estimate: '20 分钟' },
    { id: 'b', title: '发布', expectedOutcome: '可使用', test: '安装检查', estimate: '10 分钟' },
  ],
}

describe('createPlan', () => {
  it('starts the first step and keeps the rest pending', () => {
    expect(createPlan(input).steps.map(step => step.status)).toEqual(['in_progress', 'pending'])
  })

  it('derives ids and drops empty optional fields', () => {
    const plan = createPlan({ title: ' 新任务 ', steps: [{ title: '验证' }, { title: '交付' }] })
    expect(plan.title).toBe('新任务')
    expect(plan.steps.map(step => step.id)).toEqual(['step-1', 'step-2'])
    expect(plan.steps[0]).toEqual({ id: 'step-1', title: '验证', status: 'in_progress' })
  })

  it('rejects bad boundaries', () => {
    expect(() => createPlan({ title: '', steps: [{ title: 'a' }, { title: 'b' }] })).toThrow('Plan title cannot be empty')
    expect(() => createPlan({ title: 'x', steps: [{ title: 'a' }] })).toThrow('between 2 and 30')
    expect(() => createPlan({ title: 'x', steps: Array.from({ length: MAX_STEPS + 1 }, () => ({ title: 'a' })) })).toThrow('between 2 and 30')
    expect(() => createPlan({ title: 'x', steps: [{ id: 'same', title: 'a' }, { id: 'same', title: 'b' }] })).toThrow('Duplicate step id')
    expect(() => createPlan({ title: 'x', steps: [{ title: 'a'.repeat(5001) }, { title: 'b' }] })).toThrow('too long')
  })
})

describe('updatePlanStep', () => {
  it('walks forward one step at a time and completes only at the end', () => {
    const created = createPlan(input)
    const first = updatePlanStep(created, 'a', 'completed', undefined, 2)
    expect(first.status).toBe('active')
    const second = updatePlanStep(first, 'b', 'in_progress', undefined, 3)
    const done = updatePlanStep(second, 'b', 'completed', undefined, 4)
    expect(done.status).toBe('completed')
    expect(done.steps.map(step => step.status)).toEqual(['completed', 'completed'])
    expect(done.updatedAt).toBe(4)
    expect(created.steps[0]?.status).toBe('in_progress')
  })

  it('rejects unknown steps, skipped order and backward moves', () => {
    const plan = createPlan(input)
    expect(() => updatePlanStep(plan, 'missing', 'completed')).toThrow('Unknown step')
    expect(() => updatePlanStep(plan, 'b', 'in_progress')).toThrow('previous steps must be completed')
    expect(() => updatePlanStep(plan, 'a', 'pending')).toThrow('backward')
    expect(() => updatePlanStep(plan, 'b', 'completed')).toThrow('Start a step before completing it')
    expect(() => updatePlanStep(null, 'a', 'completed')).toThrow('call task_lens_write first')
    expect(() => updatePlanStep(createPlan(input), 'a', 'nonsense' as never)).toThrow('Invalid step status')
  })

  it('refuses to change a completed step or a completed plan', () => {
    const done = updatePlanStep(updatePlanStep(updatePlanStep(createPlan(input), 'a', 'completed'), 'b', 'in_progress'), 'b', 'completed')
    expect(done.status).toBe('completed')
    expect(() => updatePlanStep(done, 'a', 'in_progress')).toThrow('already completed')
  })

  it('records a capped failure reason and clears it when the step recovers', () => {
    const failed = updatePlanStep(createPlan(input), 'a', 'failed', 'x'.repeat(1200))
    expect(failed.steps[0]?.lastError).toHaveLength(1000)
    const retried = updatePlanStep(failed, 'a', 'in_progress')
    expect(retried.steps[0]?.lastError).toBeUndefined()
  })
})

describe('snapshotOf', () => {
  it('reports percent, current step and the empty state', () => {
    expect(snapshotOf(null)).toEqual({ plan: null, percent: 0, current: null })
    const created = createPlan(input)
    expect(snapshotOf(created).current?.id).toBe('a')
    // Completing a step does not silently start the next one: the model must say so.
    const half = updatePlanStep(created, 'a', 'completed')
    expect(snapshotOf(half)).toMatchObject({ percent: 50, current: null })
    expect(snapshotOf(updatePlanStep(half, 'b', 'in_progress')).current?.id).toBe('b')
  })
})

describe('planFromMeta', () => {
  it('round-trips a plan through the tool result meta', () => {
    const plan = updatePlanStep(createPlan(input), 'a', 'completed')
    expect(planFromMeta({ taskLens: plan })).toEqual(plan)
  })

  it('ignores foreign or malformed meta', () => {
    expect(planFromMeta(undefined)).toBeNull()
    expect(planFromMeta({ other: 1 })).toBeNull()
    expect(planFromMeta({ taskLens: { title: 'x' } })).toBeNull()
    expect(planFromMeta('nope')).toBeNull()
  })
})
