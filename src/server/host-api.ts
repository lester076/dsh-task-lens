/**
 * The slice of the DeepSeek Harness (0.2.2) host API this plugin actually uses.
 *
 * A third-party bundle installed into a real `~/.dsh/profiles/<name>` cannot
 * resolve `@deepseek-ai/*` specifiers: the host packages live inside the
 * application archive, not in the profile's `node_modules`. Every working
 * profile plugin is therefore standalone, and so is this one. The contracts
 * below restate exactly what the plugin calls, as types only — nothing here is
 * emitted, so the built host bundle has no runtime dependency at all.
 *
 * Signatures follow `@deepseek-ai/dsh` 0.2.2-rc.3 (`dsh-tools`,
 * `dsh-session`, `dsh-session-projection`, `dsh-host-webserver`,
 * `dsh-client-connection`, `dsh-llm`).
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

/** Lossless JSON value, matching what the session log is allowed to store. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

/** One committed session log event; `seq` is its 0-based log index. */
export interface SessionEvent {
  readonly type: string
  readonly seq: number
  readonly data: unknown
}

/** Immutable per-session metadata handed to a projection's `init`. */
export interface SessionHeader { readonly id: string }

/** Read face of a live session. */
export interface Session {
  readonly id: string
  readonly header: SessionHeader
  readonly seq: number
  readonly inheritedEventCount: number
}

/** Any schema with a validating `parse`; the host uses zod instances here. */
export interface ValueSchema<T> { parse(value: unknown): T }

/** A registered projection's reader, valid even after unregistration. */
export interface ProjectionHandle<S> {
  stateOf(session: Session): S
  readerFor(session: Session): () => S
  dispose(): Promise<void>
}

/** One domain's state-driven computation unit. */
export interface ProjectionDefinition<K extends string, S> {
  key: K
  stateSchema: ValueSchema<S>
  init(header: SessionHeader, inheritedEventCount: number): S
  apply(state: S, event: SessionEvent): S
  /** Client view; omitted for host-only units. */
  wire?: {
    viewSchema: ValueSchema<unknown>
    view(state: S): unknown
    summary?: boolean
  }
  stateVersion: number
}

/** `ctx.sessionProjections`. */
export interface SessionProjectionRegistry {
  register<K extends string, S>(definition: ProjectionDefinition<K, S>): Promise<ProjectionHandle<S>>
}

/** `ctx.sessions` (host side). */
export interface SessionStore { get(id: string): Session | undefined }

/** The identity a tool call runs on behalf of. */
export interface Agent { readonly id: string }

/** Execution identity handed to a tool body. */
export interface ToolRunContext {
  readonly name: string
  readonly agent?: Agent
  readonly signal: AbortSignal
}

export interface TextBlock { readonly type: 'text'; readonly text: string }

/**
 * Canonical-output contract: validate, render for the model, project to the
 * durable `tool/result` meta. The host erases the value type here, so a typed
 * tool is adapted in `tools.ts` rather than re-declared per call site.
 */
export interface ToolOutputDefinition {
  schema: unknown
  render(args: unknown, value: unknown): TextBlock[]
  presentationMeta?(args: unknown, value: unknown): unknown
}

export interface GenericCallView {
  card: 'generic'
  title: string
  kind?: string
}

export interface ToolDefinition {
  name: string
  description: string
  /** Plain JSON Schema for the model-facing arguments. */
  parameters: Record<string, unknown>
  output: ToolOutputDefinition
  execute(args: unknown, exec: ToolRunContext): Promise<unknown>
  presentCall?(args: unknown): GenericCallView | undefined
}

/** `ctx.tools`. */
export interface ToolRegistry { register(definition: ToolDefinition): () => void }

/** One registered HTTP route; the handler owns the whole response lifecycle. */
export interface WebRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler(req: IncomingMessage, res: ServerResponse): void | Promise<void>
}

/** `ctx.webServer`. */
export interface WebServer { register(route: WebRoute): () => void }

/** The trust facts Connection needs to police a foreign web route. */
export interface ConnectionTrustRequest {
  readonly headers: Headers | Readonly<Record<string, string | readonly string[] | undefined>>
}

/** `ctx.connection`. */
export interface Connection {
  requestRejection(request: ConnectionTrustRequest): 401 | 403 | undefined
}

/** One tool-free user input for a one-shot model call. */
export interface RequestMessage {
  readonly role: 'user'
  readonly content: readonly TextBlock[]
}

/** Options of `ctx.llm.stream` that this plugin sets. */
export interface GenerateOptions {
  provider: string
  model: string
  messages: readonly RequestMessage[]
  system?: string
  maxTokens?: number
  signal?: AbortSignal
}

/** One streamed chunk, narrowed by `type` and read defensively. */
export interface StreamChunk {
  readonly type: string
  readonly text?: string
  readonly reason?: { readonly kind?: string }
}

/** `ctx.llm`. */
export interface Llm { stream(options: GenerateOptions): AsyncIterable<StreamChunk> }

/** One contributed system-prompt section. */
export interface PromptSection {
  readonly name: string
  readonly order: number
  readonly text: string
}

/** `ctx.systemPrompt`. */
export interface SystemPrompt {
  section(section: PromptSection): () => void
  /** Centrally allocated placement, e.g. `'PLAN_POLICY'`. */
  getSectionOrder(name: string): number
}

/** The plugin context, limited to the services this plugin declares. */
export interface HostContext {
  readonly tools: ToolRegistry
  readonly sessionProjections: SessionProjectionRegistry
  readonly webServer: WebServer
  readonly connection: Connection
  readonly llm: Llm
  readonly sessions: SessionStore
  readonly systemPrompt: SystemPrompt
  effect(execute: () => (() => void) | undefined, label?: string): () => void
  on(event: string, listener: (...args: never[]) => void): () => void
}

/** True for a plain JSON object. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
