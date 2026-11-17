import { describe, expect, it, vi } from 'vitest'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { HostAdvisor } from '../src/server/host-adviser'
import type { TaskPlan } from '../src/shared/types'

const plan = { title: '发布', status: 'active', createdAt: 1, updatedAt: 1, steps: [{ id: 'a', title: '构建', status: 'in_progress' }] } satisfies TaskPlan
function fixture(chunks: object[] = [{ type: 'text-delta', text: '运行测试' }, { type: 'finish', reason: { kind: 'stop' } }]) {
  const session = Session.create(SessionId('s'))
  session.append('task-lens/write', { plan })
  const agent = { session, options: { provider: 'deepseek', model: 'deepseek-chat' as string | undefined } }
  const llm = { stream: vi.fn(async function* (_options: { provider: string }) { for (const chunk of chunks) yield chunk }) }
  const projections = { snapshot: () => ({ values: { taskLens: plan } }) }
  const advisor = new HostAdvisor(llm as never, projections as never, () => agent as never)
  return { advisor, llm, agent }
}

describe('HostAdvisor', () => {
  it('streams a tool-free one-shot using the session model without touching the session log', async () => {
    const { advisor, llm } = fixture()
    const emit = vi.fn()
    await expect(advisor.ask({ sessionId: 's', question: '怎么测试', signal: new AbortController().signal }, emit)).resolves.toBe('运行测试')
    const options = llm.stream.mock.calls[0]?.[0] as { provider: string }
    expect(options).toBeDefined()
    expect(options).not.toHaveProperty('tools')
    expect(options).not.toHaveProperty('sessionId')
    expect(options.provider).toBe('deepseek')
    expect(emit).toHaveBeenCalledWith({ type: 'delta', text: '运行测试' })
  })

  it('rejects missing models and model errors without affecting the main agent', async () => {
    const { advisor, agent } = fixture()
    await expect(new HostAdvisor({} as never, {} as never, () => undefined).ask({ sessionId: 'missing', question: '怎么做', signal: new AbortController().signal }, vi.fn())).rejects.toThrow('not active')
    agent.options.model = undefined
    await expect(advisor.ask({ sessionId: 's', question: '怎么做', signal: new AbortController().signal }, vi.fn())).rejects.toThrow('No model')
    const failing = fixture([{ type: 'finish', reason: { kind: 'error' } }])
    await expect(failing.advisor.ask({ sessionId: 's', question: '怎么做', signal: new AbortController().signal }, vi.fn())).rejects.toThrow('重试')
  })
})
