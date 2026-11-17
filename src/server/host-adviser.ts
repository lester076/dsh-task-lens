/**
 * The question window's answerer.
 *
 * It is a one-shot, tool-free `llm.stream` call on the same provider/model the
 * conversation last used: no agent turn is opened, no message is appended, and
 * no tool can run, so asking a question cannot alter the main task. The route
 * comes from the host-only `taskLensRoute` projection rather than a live Agent
 * object, so it still resolves for a session that was restored from disk.
 */
import type { GenerateOptions, Llm, ProjectionHandle, RequestMessage, SessionStore } from './host-api'
import { BoundedConversation, buildConsultRequest } from './adviser'
import type { ConsultAdvisor, ConsultInput } from './adviser'
import type { ModelRoute } from './events'
import { snapshotOf } from './plan'
import type { TaskPlan } from '../shared/types'

/** Bound on one advice answer, so a stray long generation cannot stream forever. */
const MAX_TOKENS = 2000
/** Bound on remembered sessions, so a long-lived host cannot leak Q&A buffers. */
const MAX_HISTORIES = 50

export class HostAdvisor implements ConsultAdvisor {
  private readonly histories = new Map<string, BoundedConversation>()

  constructor(
    private readonly llm: Llm,
    private readonly sessions: SessionStore,
    private readonly plans: ProjectionHandle<TaskPlan | null>,
    private readonly routes: ProjectionHandle<ModelRoute | null>,
  ) {}

  /** Drop buffered Q&A when its session ends, so the map cannot grow unbounded. */
  forget(sessionId: string): void {
    this.histories.delete(sessionId)
  }

  async ask(input: ConsultInput, emit: (event: { type: 'delta'; text: string }) => void): Promise<string> {
    const session = this.sessions.get(input.sessionId)
    if (!session) throw new Error('This session is not active')
    const route = this.routes.stateOf(session)
    if (!route) throw new Error('No model is selected for this session')
    const plan = this.plans.stateOf(session)
    if (!plan) throw new Error('No plan exists for this session')
    const history = this.histories.get(input.sessionId) ?? new BoundedConversation()
    this.histories.set(input.sessionId, history)
    if (this.histories.size > MAX_HISTORIES) {
      const oldest = this.histories.keys().next().value
      if (oldest !== undefined && oldest !== input.sessionId) this.histories.delete(oldest)
    }
    const { prompt } = buildConsultRequest(snapshotOf(plan), history.get(), input.question)
    const messages: RequestMessage[] = [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
    const options: GenerateOptions = { provider: route.provider, model: route.model, messages, maxTokens: MAX_TOKENS, signal: input.signal }
    const answer: string[] = []
    for await (const chunk of this.llm.stream(options)) {
      if (input.signal.aborted) throw new Error('回答已停止')
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
        answer.push(chunk.text)
        emit({ type: 'delta', text: chunk.text })
      }
      if (chunk.type === 'finish') {
        const kind = chunk.reason?.kind
        if (kind !== undefined && kind !== 'stop' && kind !== 'tool-calls') throw new Error(kind === 'aborted' ? '回答已停止' : '模型回答失败，请重试')
      }
    }
    const content = answer.join('')
    if (!content) throw new Error('模型没有返回答案，请重试')
    history.add('user', input.question)
    history.add('assistant', content)
    return content
  }
}
