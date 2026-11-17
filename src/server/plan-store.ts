import type { PlanInput, PlanSnapshot, PlanStep, StepInput, StepStatus, TaskPlan } from '../shared/types'

const DEFAULTS = { maxPlans: 100, maxSteps: 30, maxErrorLength: 1000 }

function text(value: unknown, label: string, required = true): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`)
  const result = value.trim()
  if (required && !result) throw new Error(`${label} cannot be empty`)
  if (result.length > 5000) throw new Error(`${label} is too long`)
  return result
}

export class PlanStore {
  private readonly plans = new Map<string, TaskPlan>()
  private readonly options: typeof DEFAULTS

  constructor(options: Partial<typeof DEFAULTS> = {}) {
    this.options = { ...DEFAULTS, ...options }
  }

  create(sessionId: string, input: PlanInput): TaskPlan {
    const plan: TaskPlan = {
      title: text(input.title, 'Plan title'),
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      steps: this.validateSteps(input.steps),
    }
    this.plans.delete(sessionId)
    this.plans.set(sessionId, plan)
    this.evict()
    return structuredClone(plan)
  }

  restore(sessionId: string, input: unknown): TaskPlan {
    if (!input || typeof input !== 'object') throw new Error('Invalid stored plan')
    const raw = input as Partial<TaskPlan>
    if (raw.status !== 'active' && raw.status !== 'completed') throw new Error('Invalid stored status')
    if (typeof raw.createdAt !== 'number' || typeof raw.updatedAt !== 'number') throw new Error('Invalid stored timestamps')
    const plan: TaskPlan = {
      title: text(raw.title, 'Plan title'),
      status: raw.status,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      steps: this.validateSteps(raw.steps ?? []).map((step, index) => {
        const saved = raw.steps?.[index]
        const { status: _initialStatus, lastError: _initialError, ...fields } = step
        return {
          ...fields,
          status: saved?.status ?? 'pending',
          ...(saved?.lastError ? { lastError: saved.lastError.slice(0, this.options.maxErrorLength) } : {}),
        }
      }),
    }
    if (plan.steps.filter((step) => step.status === 'in_progress').length > 1) throw new Error('Multiple active steps')
    plan.steps.forEach((step, index) => {
      if (step.status === 'in_progress' && plan.steps.slice(0, index).some((item) => item.status !== 'completed')) throw new Error('Steps out of order')
    })
    if (plan.steps.every((step) => step.status === 'completed')) plan.status = 'completed'
    if (plan.status === 'completed' && plan.steps.some((step) => step.status !== 'completed')) throw new Error('Invalid completed plan')
    this.plans.set(sessionId, plan)
    this.evict()
    return structuredClone(plan)
  }

  update(sessionId: string, stepId: string, status: StepStatus, lastError?: string): TaskPlan {
    const plan = this.require(sessionId)
    if (plan.status === 'completed') throw new Error('Plan is already completed')
    const index = plan.steps.findIndex((step) => step.id === stepId)
    const step = plan.steps[index]
    if (!step) throw new Error(`Unknown step: ${stepId}`)
    if (!['pending', 'in_progress', 'completed', 'failed'].includes(status)) throw new Error('Invalid step status')
    if (status === 'pending') throw new Error('Steps cannot move backward to pending')
    if (step.status === status) return this.snapshot(sessionId).plan!
    if (step.status === 'completed') throw new Error('Completed steps cannot change')
    if (status === 'in_progress') {
      if (index > 0 && plan.steps[index - 1]?.status !== 'completed') throw new Error('All previous steps must be completed')
      if (plan.steps.some((item) => item.status === 'in_progress')) throw new Error('Another step is already in progress')
    }
    if (status === 'completed' && step.status !== 'in_progress') throw new Error('Start a step before completing it')
    step.status = status
    if (lastError !== undefined) step.lastError = text(lastError, 'Error', false).slice(0, this.options.maxErrorLength)
    else if (status === 'in_progress' || status === 'completed') delete step.lastError
    if (plan.steps.every((item) => item.status === 'completed')) plan.status = 'completed'
    plan.updatedAt = Date.now()
    return structuredClone(plan)
  }

  get(sessionId: string): TaskPlan | undefined {
    const plan = this.plans.get(sessionId)
    return plan ? structuredClone(plan) : undefined
  }

  require(sessionId: string): TaskPlan {
    const plan = this.plans.get(sessionId)
    if (!plan) throw new Error('No plan exists for this session')
    return plan
  }

  snapshot(sessionId: string): PlanSnapshot {
    const plan = this.get(sessionId)
    if (!plan) return { plan: null, percent: 0, current: null }
    const done = plan.steps.filter((step) => step.status === 'completed').length
    return {
      plan,
      percent: plan.steps.length ? Math.round(done / plan.steps.length * 100) : 0,
      current: plan.steps.find((step) => step.status === 'in_progress') ?? plan.steps.find((step) => step.status === 'failed') ?? null,
    }
  }

  list(): TaskPlan[] {
    return [...this.plans.values()].map((plan) => structuredClone(plan))
  }

  private validateSteps(steps: StepInput[]): PlanStep[] {
    if (!Array.isArray(steps) || steps.length < 2 || steps.length > this.options.maxSteps) throw new Error(`A plan needs between 2 and ${this.options.maxSteps} steps`)
    const ids = new Set<string>()
    return steps.map((step, index) => {
      const id = text(step.id ?? `step-${index + 1}`, 'Step id')
      if (ids.has(id)) throw new Error(`Duplicate step id: ${id}`)
      ids.add(id)
      return {
        id,
        title: text(step.title, 'Step title'),
        status: index === 0 ? 'in_progress' : 'pending',
        ...(step.expectedOutcome ? { expectedOutcome: text(step.expectedOutcome, 'Expected outcome') } : {}),
        ...(step.test ? { test: text(step.test, 'Test') } : {}),
        ...(step.estimate ? { estimate: text(step.estimate, 'Estimate') } : {}),
      }
    })
  }

  private evict() {
    while (this.plans.size > this.options.maxPlans) {
      const oldest = [...this.plans.entries()].sort(([, a], [, b]) => a.updatedAt - b.updatedAt)[0]
      if (!oldest) break
      this.plans.delete(oldest[0])
    }
  }
}
