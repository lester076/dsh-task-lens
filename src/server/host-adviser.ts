import { createMessage } from '@deepseek-ai/dsh-llm'
import type { LlmRuntime, Message } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import { BoundedConversation, buildConsultMessages } from './adviser'
import type { ConsultAdvisor, ConsultInput } from './adviser'
import { planFrom } from './events'

/** One-shot, tool-free LLM advice with a per-session bounded memory. */
export class HostAdvisor implements ConsultAdvisor {
  private readonly histories = new Map<string, BoundedConversation>()
  constructor(private readonly llm: LlmRuntime, private readonly projections: SessionProjectionRegistry, private readonly agentFor: (id: string) => Agent | undefined) {}

  async ask(input: ConsultInput, emit: (event: { type: 'delta'; text: string }) => void): Promise<string> {
    const agent = this.agentFor(input.sessionId)
    if (!agent) throw new Error('This session is not active')
    const provider = agent.options.provider
    const model = agent.options.model
    if (!provider || !model) throw new Error('No model is selected for this session')
    const selection = { provider, model }
    const plan = planFrom(agent.session, this.projections)
    if (!plan) throw new Error('No plan exists for this session')
    const done = plan.steps.filter(step => step.status === 'completed').length
    const snapshot = { plan, percent: Math.round(done / plan.steps.length * 100), current: plan.steps.find(step => step.status === 'in_progress' || step.status === 'failed') ?? null }
    const history = this.histories.get(input.sessionId) ?? new BoundedConversation()
    this.histories.set(input.sessionId, history)
    history.add('user', input.question)
    const source = buildConsultMessages(snapshot, history.get().slice(0, -1), input.question)
    const messages: Message[] = source.map((message, index) => createMessage({ ...message, content: [{ type: 'text', text: message.content }], source: index === 0 ? { kind: 'plugin', plugin: 'dsh-task-lens' } : message.role === 'user' ? { kind: 'user' } : { kind: 'model', provider, model } }))
    const answer: string[] = []
    const stream = this.llm.stream({ ...selection, messages, signal: input.signal, maxTokens: 2000 })
    for await (const chunk of stream) {
      if (input.signal.aborted) throw new Error('回答已停止')
      if (chunk.type === 'text-delta') { answer.push(chunk.text); emit({ type: 'delta', text: chunk.text }) }
      if (chunk.type === 'finish' && chunk.reason.kind !== 'stop' && chunk.reason.kind !== 'tool-calls') throw new Error(chunk.reason.kind === 'aborted' ? '回答已停止' : '模型回答失败，请重试')
    }
    const content = answer.join('')
    if (!content) throw new Error('模型没有返回答案，请重试')
    history.add('assistant', content)
    return content
  }
}
