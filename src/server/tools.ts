/**
 * The two model-facing tools.
 *
 * Both are plain `ToolDefinition`s built without `defineTool`: the plugin cannot
 * import from the host's `dsh-tools` package at runtime, and a JSON Schema is
 * all the host accepts (`parameters` is validated against a deliberately small
 * keyword subset, so only `type`/`properties`/`required`/`items`/`enum`/
 * `additionalProperties`/`description` appear below).
 *
 * The plan travels back through `output.presentationMeta`: the host persists
 * that value as the `tool/result` event's `meta`, which is what makes progress
 * survive a reload without any bespoke session event.
 */
import type { JsonValue, TextBlock, ToolDefinition, ToolRunContext } from './host-api'
import { MAX_STEPS, MIN_STEPS } from './plan'
import type { StepStatus, TaskPlan } from '../shared/types'

/** A typed tool, adapted once into the host's erased `ToolDefinition`. */
export interface ToolSpec<Args, Value> {
  name: string
  description: string
  parameters: Record<string, unknown>
  outputSchema: Record<string, unknown>
  /** Card title shown while the call is pending. */
  cardTitle: string
  render(args: Args, value: Value): TextBlock[]
  meta(args: Args, value: Value): JsonValue
  execute(args: Args, exec: ToolRunContext): Promise<Value>
}

/** The `meta` payload shape the `taskLens` projection reads back. */
export function planMeta(plan: TaskPlan): JsonValue {
  return { taskLens: JSON.parse(JSON.stringify(plan)) as JsonValue }
}

/** Erase one typed spec into the definition the host registry accepts. */
export function toDefinition<Args, Value>(spec: ToolSpec<Args, Value>): ToolDefinition {
  return {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    output: {
      schema: spec.outputSchema,
      render: (args, value) => spec.render(args as Args, value as Value),
      presentationMeta: (args, value) => spec.meta(args as Args, value as Value),
    },
    execute: (args, exec) => spec.execute(args as Args, exec),
    presentCall: () => ({ card: 'generic', title: spec.cardTitle }),
  }
}

/** Step shape shared by both tools' argument schemas. */
const stepProperties = {
  type: 'object',
  additionalProperties: false,
  required: ['title'],
  properties: {
    id: { type: 'string', description: 'Stable unique id; use step-1, step-2, etc.' },
    title: { type: 'string', description: 'Concrete action; never a vague objective.' },
    expectedOutcome: { type: 'string', description: 'Observable result after this step.' },
    test: { type: 'string', description: 'How the user can verify the result.' },
    estimate: { type: 'string', description: 'Optional rough duration; never a guaranteed ETA.' },
  },
}

/** Canonical result value of both tools: model text plus the whole new plan. */
const outputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'plan'],
  properties: {
    text: { type: 'string' },
    plan: {
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
    },
  },
}

export interface WriteArgs { title?: unknown; steps?: unknown }
export interface UpdateArgs { stepId?: unknown; status?: unknown; lastError?: unknown }
export interface ToolValue { text: string; plan: TaskPlan }

/** Callbacks the tools need from the plugin instance. */
export interface ToolDeps {
  /** Build the first plan version, throwing a model-actionable message on bad input. */
  create(sessionId: string, args: WriteArgs): TaskPlan
  /** Move one step, throwing a model-actionable message on an illegal move. */
  update(sessionId: string, args: UpdateArgs): TaskPlan
  /** Human-readable progress line returned to the model. */
  summarize(plan: TaskPlan): string
}

/** Resolve the owning session id of a tool call. */
function sessionIdOf(exec: ToolRunContext): string {
  const id = exec.agent?.id
  if (!id) throw new Error('task_lens tools require an owning agent session')
  return id
}

const WRITE_DESCRIPTION = 'For a long or multi-step user task, create its COMPLETE ordered plan before doing work'
  + ` (${MIN_STEPS} to ${MAX_STEPS} concrete steps). Include expected outcomes, verification and rough estimates.`
  + ' Also call this when the user asks for a plan or outlines one, before touching any file; if they asked only for a plan, stop after writing it.'
  + ' Replace the plan only when the task materially changes. The first step starts in_progress.'
  + ' Do not use for a trivial one-step request.'

const UPDATE_DESCRIPTION = 'Update one task step immediately after a real result. Complete the active step before'
  + ' starting the next. Use failed only after a concrete error; retry with in_progress.'
  + ' Never infer or invent completion.'

/** Build the two tool definitions bound to one plugin instance. */
export function createTools(deps: ToolDeps): ToolDefinition[] {
  const write: ToolSpec<WriteArgs, ToolValue> = {
    name: 'task_lens_write',
    description: WRITE_DESCRIPTION,
    cardTitle: 'Create task plan',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'steps'],
      properties: {
        title: { type: 'string', description: 'Short task title.' },
        steps: { type: 'array', items: stepProperties, description: `Between ${MIN_STEPS} and ${MAX_STEPS} ordered steps.` },
      },
    },
    outputSchema,
    render: (_args, value) => [{ type: 'text', text: value.text }],
    meta: (_args, value) => planMeta(value.plan),
    async execute(args, exec) {
      const sessionId = sessionIdOf(exec)
      const plan = deps.create(sessionId, args)
      return { text: `Plan recorded: ${plan.steps.length} steps. Complete each step in order and report it with task_lens_update.`, plan }
    },
  }
  const update: ToolSpec<UpdateArgs, ToolValue> = {
    name: 'task_lens_update',
    description: UPDATE_DESCRIPTION,
    cardTitle: 'Update task progress',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['stepId', 'status'],
      properties: {
        stepId: { type: 'string', description: 'Id of the step that actually changed.' },
        status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'failed'] },
        lastError: { type: 'string', description: 'Short concrete failure; only with failed status.' },
      },
    },
    outputSchema,
    render: (_args, value) => [{ type: 'text', text: value.text }],
    meta: (_args, value) => planMeta(value.plan),
    async execute(args, exec) {
      const sessionId = sessionIdOf(exec)
      const plan = deps.update(sessionId, args)
      return { text: deps.summarize(plan), plan }
    },
  }
  return [toDefinition(write), toDefinition(update)]
}

/** Narrow an untrusted status argument. */
export function asStepStatus(value: unknown): StepStatus {
  if (value === 'pending' || value === 'in_progress' || value === 'completed' || value === 'failed') return value
  throw new Error('status must be one of pending, in_progress, completed, failed')
}
