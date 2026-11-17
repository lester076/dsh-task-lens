/**
 * The task plan value: its only authority.
 *
 * A plan is written exactly once per model turn by `task_lens_write` and then
 * folded forward by `task_lens_update`. Every write carries the COMPLETE
 * post-change plan (the session-projection whole-value rule), it is persisted as
 * the tool result's `meta`, and the `taskLens` projection rebuilds it from the
 * log. There is no side cache to drift out of sync with the session.
 */
import { z } from 'zod'
import type { PlanSnapshot, PlanStep, StepInput, StepStatus, TaskPlan } from '../shared/types'

/** A plan needs at least two steps: one step is not a long task. */
export const MIN_STEPS = 2
/** Upper bound on a plan, so a runaway model cannot bloat the log. */
export const MAX_STEPS = 30
const MAX_TEXT = 5000
const MAX_ERROR = 1000

const STATUSES = ['pending', 'in_progress', 'completed', 'failed'] as const

/** Validate and trim one free-text field. */
function text(value: unknown, label: string, required = true): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`)
  const result = value.trim()
  if (required && !result) throw new Error(`${label} cannot be empty`)
  if (result.length > MAX_TEXT) throw new Error(`${label} is too long`)
  return result
}

/** Normalize the model's step list into a fresh, validated step array. */
function normalizeSteps(steps: unknown): PlanStep[] {
  if (!Array.isArray(steps)) throw new Error('Plan steps must be an array')
  if (steps.length < MIN_STEPS || steps.length > MAX_STEPS) throw new Error(`A plan needs between ${MIN_STEPS} and ${MAX_STEPS} steps`)
  const ids = new Set<string>()
  return steps.map((raw, index) => {
    if (typeof raw !== 'object' || raw === null) throw new Error('Each step must be an object')
    const step = raw as Partial<StepInput>
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

/** Build the first version of a plan; the first step starts in progress. */
export function createPlan(input: { title?: unknown; steps?: unknown }, now = Date.now()): TaskPlan {
  return {
    title: text(input.title, 'Plan title'),
    status: 'active',
    createdAt: now,
    updatedAt: now,
    steps: normalizeSteps(input.steps),
  }
}

/**
 * Move one step, returning a new plan. Illegal transitions throw with a message
 * the model can act on, so a wrong call teaches the next turn instead of
 * silently corrupting progress.
 */
export function updatePlanStep(plan: TaskPlan | null, stepId: string, status: StepStatus, lastError?: unknown, now = Date.now()): TaskPlan {
  if (!plan) throw new Error('No plan exists for this session; call task_lens_write first')
  if (plan.status === 'completed') throw new Error('Plan is already completed')
  if (!STATUSES.includes(status)) throw new Error('Invalid step status')
  if (status === 'pending') throw new Error('Steps cannot move backward to pending')
  const index = plan.steps.findIndex(step => step.id === stepId)
  const step = plan.steps[index]
  if (!step) throw new Error(`Unknown step: ${stepId}`)
  if (step.status === status) return plan
  if (step.status === 'completed') throw new Error('Completed steps cannot change')
  if (status === 'in_progress') {
    if (index > 0 && plan.steps[index - 1]?.status !== 'completed') throw new Error('All previous steps must be completed')
    if (plan.steps.some(item => item.status === 'in_progress')) throw new Error('Another step is already in progress')
  }
  if (status === 'completed' && step.status !== 'in_progress') throw new Error('Start a step before completing it')
  const next: PlanStep = { ...step, status }
  if (typeof lastError === 'string' && lastError.trim()) next.lastError = text(lastError, 'Error', false).slice(0, MAX_ERROR)
  else if (status === 'in_progress' || status === 'completed') delete next.lastError
  const steps = plan.steps.map((item, position) => position === index ? next : item)
  return {
    ...plan,
    steps,
    status: steps.every(item => item.status === 'completed') ? 'completed' : 'active',
    updatedAt: now,
  }
}

/** The progress the panel and the adviser both read. */
export function snapshotOf(plan: TaskPlan | null): PlanSnapshot {
  if (!plan) return { plan: null, percent: 0, current: null }
  const done = plan.steps.filter(step => step.status === 'completed').length
  return {
    plan,
    percent: plan.steps.length ? Math.round(done / plan.steps.length * 100) : 0,
    current: plan.steps.find(step => step.status === 'in_progress') ?? plan.steps.find(step => step.status === 'failed') ?? null,
  }
}

/** Validating shape of a persisted plan; also the projection's state schema. */
export const planSchema = z.object({
  title: z.string(),
  status: z.enum(['active', 'completed']),
  createdAt: z.number(),
  updatedAt: z.number(),
  steps: z.array(z.object({
    id: z.string(),
    title: z.string(),
    status: z.enum(['pending', 'in_progress', 'completed', 'failed']),
    expectedOutcome: z.string().optional(),
    test: z.string().optional(),
    estimate: z.string().optional(),
    lastError: z.string().optional(),
  })),
})

/** JSON Schema of a plan, for the canonical tool output the model sees validated. */
export const planJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'status', 'createdAt', 'updatedAt', 'steps'],
  properties: {
    title: { type: 'string' },
    status: { type: 'string', enum: ['active', 'completed'] },
    createdAt: { type: 'number' },
    updatedAt: { type: 'number' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'status'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'failed'] },
          expectedOutcome: { type: 'string' },
          test: { type: 'string' },
          estimate: { type: 'string' },
          lastError: { type: 'string' },
        },
      },
    },
  },
}

/**
 * Recover a plan from a `tool/result` event's opaque meta.
 * @param meta - the tool-private payload, or undefined.
 * @returns the validated plan, or null when this result carries none.
 */
export function planFromMeta(meta: unknown): TaskPlan | null {
  if (typeof meta !== 'object' || meta === null) return null
  const candidate = (meta as { taskLens?: unknown }).taskLens
  const parsed = planSchema.safeParse(candidate)
  return parsed.success ? parsed.data as TaskPlan : null
}
