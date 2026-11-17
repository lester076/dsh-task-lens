/**
 * The plugin's session projections: what survives a page reload.
 *
 * `taskLens` is the plan, folded straight out of the log. Its only source is
 * the durable `meta` of a `tool/result` event, which the tools attach with
 * `output.presentationMeta`. That is deliberate: a plugin cannot declare new
 * session event types in another host's build (an unknown, non-ignorable event
 * type makes the host refuse to open the whole conversation), and
 * `appendPluginRecord` is not reachable from a third-party bundle either. The
 * tool result IS the durable record, so the projection reads it back and the
 * plan needs no separate event, cache file, or in-memory authority.
 *
 * `taskLensRoute` is host-only: it remembers the provider/model of the latest
 * request header so the question window can call the same model the
 * conversation uses, without depending on a live Agent object.
 */
import { z } from 'zod'
import type { ProjectionHandle, Session, SessionEvent, SessionHeader, SessionProjectionRegistry, ValueSchema } from './host-api'
import { planFromMeta, planSchema } from './plan'
import type { TaskPlan } from '../shared/types'

/** Projection key carrying the plan to the panel. */
export const PLAN_KEY = 'taskLens'
/** Host-only projection key carrying the conversation's model route. */
export const ROUTE_KEY = 'taskLensRoute'

/** Provider and model the conversation's last request was assembled for. */
export interface ModelRoute {
  readonly provider: string
  readonly model: string
}

/** Fold one log event into the plan state. */
export function foldPlan(state: TaskPlan | null, event: SessionEvent): TaskPlan | null {
  if (event.type !== 'tool/result') return state
  const data = event.data as { meta?: unknown } | undefined
  if (!data || data.meta === undefined) return state
  return planFromMeta(data.meta) ?? state
}

/** Fold one log event into the model route state. */
export function foldRoute(state: ModelRoute | null, event: SessionEvent): ModelRoute | null {
  if (event.type !== 'request/header') return state
  const config = (event.data as { header?: { config?: { provider?: unknown; model?: unknown } } } | undefined)?.header?.config
  if (!config || typeof config.provider !== 'string' || typeof config.model !== 'string') return state
  if (state?.provider === config.provider && state.model === config.model) return state
  return { provider: config.provider, model: config.model }
}

/** The state schema of both units; also their persisted-checkpoint validator. */
export const planStateSchema = planSchema.nullable() as unknown as ValueSchema<TaskPlan | null>
export const routeStateSchema = z.object({ provider: z.string(), model: z.string() }).nullable() as unknown as ValueSchema<ModelRoute | null>

/** Register both units and hand back their readers. */
export async function registerProjections(registry: SessionProjectionRegistry): Promise<{
  plan: ProjectionHandle<TaskPlan | null>
  route: ProjectionHandle<ModelRoute | null>
}> {
  const plan = await registry.register<string, TaskPlan | null>({
    key: PLAN_KEY,
    stateSchema: planStateSchema,
    init: (_header: SessionHeader) => null,
    apply: foldPlan,
    wire: { viewSchema: planStateSchema, view: (state: TaskPlan | null) => state },
    stateVersion: 1,
  })
  const route = await registry.register<string, ModelRoute | null>({
    key: ROUTE_KEY,
    stateSchema: routeStateSchema,
    init: (_header: SessionHeader) => null,
    apply: foldRoute,
    stateVersion: 1,
  })
  return { plan, route }
}

/** The plan a live session's log holds, or null. */
export function planOf(handle: ProjectionHandle<TaskPlan | null>, session: Session): TaskPlan | null {
  return handle.stateOf(session) ?? null
}
