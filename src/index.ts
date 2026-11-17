import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { IncomingMessage, ServerResponse } from 'node:http'

declare module '@deepseek-ai/cordis' {
  interface Context {
    webServer: { register(route: { kind: 'exact'; path: string; handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> }): () => void }
    connection: { requestRejection(req: IncomingMessage): number | undefined }
  }
}
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { TaskPlan } from './shared/types'
import { createHttpHandlers } from './server/http'
import { PlanStore } from './server/plan-store'
import { HostAdvisor } from './server/host-adviser'
import { foldPlan, planFrom, planSchema } from './server/events'

export const name = 'dsh-task-lens'
export const inject = ['tools', 'sessionProjections', 'webServer', 'connection', 'llm', 'agents'] as const

const stepProperties = {
  type: 'object', additionalProperties: false,
  properties: {
  id: { type: 'string', description: 'Stable unique id; use step-1, step-2, etc.' },
  title: { type: 'string', required: true, description: 'Concrete action, not an vague objective.' },
  expectedOutcome: { type: 'string', description: 'Observable result after this step.' },
  test: { type: 'string', description: 'How the user can verify the result.' },
  estimate: { type: 'string', description: 'Optional rough duration, never a guaranteed ETA.' },
  },
} as const

/** Install task planning tools, its durable projection, and isolated question routes. */
export async function apply(ctx: Context): Promise<void> {
  const store = new PlanStore()
  const advisor = new HostAdvisor(ctx.llm, ctx.sessionProjections, id => ctx.agents.get(SessionId(id)))
  await ctx.sessionProjections.register<'taskLens', TaskPlan | null>({
    key: 'taskLens', stateSchema: planSchema.nullable() as z.ZodType<TaskPlan | null>, init: () => null,
    apply: (state: TaskPlan | null, event: SessionEvent) => foldPlan(state, event),
    wire: { viewSchema: planSchema.nullable() as z.ZodType<TaskPlan | null>, view: (state: TaskPlan | null) => state }, stateVersion: 1,
  })
  ctx.on('session/created', session => {
    const plan = planFrom(session, ctx.sessionProjections)
    if (plan) store.restore(session.id, plan)
  })
  ctx.on('session/event', (session, event) => {
    if (!event.type.startsWith('task-lens/')) return
    const plan = planFrom(session, ctx.sessionProjections)
    if (plan) store.restore(session.id, plan)
  })
  const handlers = createHttpHandlers(store, advisor, req => ctx.connection.requestRejection(req))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/__dsh/task-lens/state', handler: handlers.state }), 'task-lens: state')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/__dsh/task-lens/ask', handler: handlers.ask }), 'task-lens: ask')
  ctx.tools.register(defineTool({
    name: 'task_lens_write',
    description: 'For a long or multi-step user task, create its COMPLETE ordered plan before doing work (2 to 30 concrete steps). Include expected outcomes, verification and rough estimates. Replace the plan only when the task materially changes. The first step starts in_progress. Do not use for a trivial one-step request.',
    parameters: {
      title: { type: 'string', required: true, description: 'Short task title.' },
      steps: { type: 'array', required: true, items: stepProperties },
    },
    output: { schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string', required: true } } }, render: (_args, value) => [{ type: 'text', text: value.text }] },
    execute(args, exec) {
      if (!exec.agent) throw new Error('task_lens_write requires an owning agent session')
      const plan = store.create(exec.agent.session.id, args)
      try { exec.agent.session.append('task-lens/write', { plan }) }
      catch (error) { const previous = planFrom(exec.agent.session, ctx.sessionProjections); if (previous) store.restore(exec.agent.session.id, previous); throw error }
      return Promise.resolve({ text: `Plan recorded: ${plan.steps.length} steps. Complete each step and move to the next using task_lens_update.` })
    },
    presentCall: () => ({ card: 'generic', title: 'Create task plan', kind: 'other' }),
  }))
  ctx.tools.register(defineTool({
    name: 'task_lens_update',
    description: 'Update one task step immediately after a real result. Complete the active step before starting the next. Use failed only after a concrete error; retry with in_progress. Never infer or invent completion.',
    parameters: {
      stepId: { type: 'string', required: true },
      status: { type: 'string', required: true, enum: ['pending', 'in_progress', 'completed', 'failed'] },
      lastError: { type: 'string', description: 'Short concrete failure, only for failed status.' },
    },
    output: { schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string', required: true } } }, render: (_args, value) => [{ type: 'text', text: value.text }] },
    execute(args, exec) {
      if (!exec.agent) throw new Error('task_lens_update requires an owning agent session')
      const plan = store.update(exec.agent.session.id, args.stepId, args.status, args.lastError)
      try { exec.agent.session.append('task-lens/write', { plan }) }
      catch (error) { const previous = planFrom(exec.agent.session, ctx.sessionProjections); if (previous) store.restore(exec.agent.session.id, previous); throw error }
      return Promise.resolve({ text: `Progress: ${store.snapshot(exec.agent.session.id).percent}%. Current step: ${store.snapshot(exec.agent.session.id).current?.title ?? 'none'}.` })
    },
    presentCall: () => ({ card: 'generic', title: 'Update task progress', kind: 'other' }),
  }))
}
