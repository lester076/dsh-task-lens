import { z } from 'zod'
import type { Session } from '@deepseek-ai/dsh-session'
import type { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import type { PlanInput, StepStatus, TaskPlan } from '../shared/types'

declare module '@deepseek-ai/dsh-session' {
  interface SessionEventMap {
    'task-lens/write': { plan: TaskPlan }
  }
}

declare module '@deepseek-ai/dsh-session-projection' {
  interface SessionProjectionMap { taskLens: TaskPlan | null }
}

export const planSchema = z.object({
  title: z.string(), status: z.enum(['active', 'completed']), createdAt: z.number(), updatedAt: z.number(),
  steps: z.array(z.object({
    id: z.string(), title: z.string(), status: z.enum(['pending', 'in_progress', 'completed', 'failed']),
    expectedOutcome: z.string().optional(), test: z.string().optional(), estimate: z.string().optional(), lastError: z.string().optional(),
  })),
})

/** Replay the complete plan snapshots recorded in a session. */
export function foldPlan(state: TaskPlan | null, event: { type: string; data: unknown }): TaskPlan | null {
  return event.type === 'task-lens/write' ? (event.data as { plan: TaskPlan }).plan : state
}

/** A live session's plan, if the plugin projection is installed. */
export function planFrom(session: Session, projections: SessionProjectionRegistry): TaskPlan | null {
  return projections.snapshot(session).values.taskLens ?? null
}
