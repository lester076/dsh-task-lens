/**
 * dsh-task-lens — a model-driven task plan, live progress, and an isolated
 * read-only question window for DeepSeek Harness.
 *
 * The host half is deliberately standalone: it imports nothing from
 * `@deepseek-ai/*` at runtime (a real profile cannot resolve those specifiers),
 * and it declares no new session event type (an unknown, non-ignorable event
 * type makes the host refuse to open the conversation at all). The plan
 * therefore lives where the host already persists plugin data: the `meta` of the
 * two tools' `tool/result` events, folded back by the `taskLens` projection.
 */
import type { HostContext } from './server/host-api'
import { registerProjections } from './server/events'
import { createHttpHandlers } from './server/http'
import { HostAdvisor } from './server/host-adviser'
import { createPlan, snapshotOf, updatePlanStep } from './server/plan'
import { asStepStatus, createTools } from './server/tools'
import type { PlanSnapshot, TaskPlan } from './shared/types'

/** Host bundle id; the client half registers under the same identity. */
export const name = 'dsh-task-lens'

/** Every host service this plugin reads. */
export const inject = ['tools', 'sessionProjections', 'webServer', 'connection', 'llm', 'sessions'] as const

const STATE_PATH = '/__dsh/task-lens/state'
const ASK_PATH = '/__dsh/task-lens/ask'

/**
 * Install the plan tools, their projection, and the question routes.
 * @param ctx - plugin context carrying the host services above.
 */
export async function apply(ctx: HostContext): Promise<void> {
  const projections = await registerProjections(ctx.sessionProjections)
  const plans = projections.plan

  /** The live session's plan. The log is the only authority; nothing is cached. */
  const livePlan = (sessionId: string): TaskPlan | null => {
    const session = ctx.sessions.get(sessionId)
    return session ? plans.stateOf(session) : null
  }
  const snapshot = (sessionId: string): PlanSnapshot | null => {
    const plan = livePlan(sessionId)
    return plan ? snapshotOf(plan) : null
  }

  const tools = createTools({
    create: (_sessionId, args) => createPlan(args),
    update: (sessionId, args) => {
      const stepId = typeof args.stepId === 'string' ? args.stepId.trim() : ''
      if (!stepId) throw new Error('stepId must be a non-empty string')
      return updatePlanStep(livePlan(sessionId), stepId, asStepStatus(args.status), args.lastError)
    },
    summarize: (plan) => {
      const progress = snapshotOf(plan)
      return `Progress: ${progress.percent}%. Current step: ${progress.current?.title ?? 'none'}.`
    },
  })
  for (const definition of tools) ctx.effect(() => ctx.tools.register(definition), `task-lens: ${definition.name}`)

  const adviser = new HostAdvisor(ctx.llm, ctx.sessions, plans, projections.route)
  const handlers = createHttpHandlers({
    snapshot,
    adviser,
    requestRejection: (req) => ctx.connection.requestRejection({ headers: req.headers }),
  })
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: STATE_PATH, handler: handlers.state }), 'task-lens: state route')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: ASK_PATH, handler: handlers.ask }), 'task-lens: ask route')
}
