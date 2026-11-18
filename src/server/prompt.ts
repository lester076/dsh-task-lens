/**
 * The one instruction that makes the plan tools part of the model's job.
 *
 * Declaring a tool is not enough: a session with ~180 tools and a terse request
 * ("帮我给静态页面加暗色模式，先列个计划") went straight to `ops_bash` and never
 * touched `task_lens_write`, so the progress panel stayed invisible. The host
 * exposes `systemPrompt` for exactly this reason — a plugin states when its
 * tools apply. The section is placed at the host's PLAN_POLICY slot, next to
 * the harness's own planning guidance.
 */
import type { SystemPrompt } from './host-api'

/** Stable section name; a second registration with this name would throw. */
export const PLAN_POLICY_SECTION = 'task-lens:plan-policy'

/**
 * The guidance itself. Written in English because the rest of the harness
 * prompt is, and phrased as conditions rather than encouragement so it stays
 * out of the way of one-step requests.
 */
export const PLAN_POLICY_TEXT = [
  'This session has a user-visible task-progress panel driven by the `task_lens_write` and `task_lens_update` tools.',
  '- Before starting a long or multi-step task (roughly three or more distinct steps), publish the complete plan with `task_lens_write` first, then do the work.',
  '- When the user asks for a plan, or you propose one, record it with `task_lens_write` before touching files. If the user asked only for a plan, write it and stop.',
  '- For a multi-step request, write the plan before asking clarifying questions: record the assumptions you are making in the step titles, then refine the plan once the user answers. Asking first is fine only for a request whose scope you genuinely cannot guess.',
  '- Give each step a concrete expected outcome and a way to test it, in the order you will really execute them.',
  '- Call `task_lens_update` the moment a step genuinely starts, completes, fails, or is retried. Mark a step completed only after you have evidence; never report progress the tools were not told about.',
  '- Skip both tools for a single-step request, a question, or ordinary conversation.',
].join('\n')

/**
 * Register the guidance at the host's PLAN_POLICY order.
 * @param systemPrompt - the host prompt registry.
 * @returns the registration's disposer.
 */
export function registerPlanPolicy(systemPrompt: SystemPrompt): () => void {
  return systemPrompt.section({
    name: PLAN_POLICY_SECTION,
    order: systemPrompt.getSectionOrder('PLAN_POLICY'),
    text: PLAN_POLICY_TEXT,
  })
}
