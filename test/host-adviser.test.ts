import { describe, expect, it, vi } from 'vitest'
import { HostAdvisor } from '../src/server/host-adviser'
import { createPlan, updatePlanStep } from '../src/server/plan'
import type { GenerateOptions, Llm, Session, SessionStore, ProjectionHandle, StreamChunk } from '../src/server/host-api'
import type { ModelRoute } from '../src/server/events'
import type { TaskPlan } from '../src/shared/types'

const plan = updatePlanStep(createPlan({
  title: '发布',
  steps: [{ id: 'a', title: '构建' }, { id: 'b', title: '交付' }],
}), 'a', 'completed')

const session = { id: 's', header: { id: 's' }, seq: 0, inheritedEventCount: 0 } as Session

function handle<T>(value: T): ProjectionHandle<T> {
  return { stateOf: () => value, readerFor: () => () => value, dispose: async () => {} }
}

function fixture(
  chunks: StreamChunk[] = [{ type: 'text-delta', text: '运行测试' }, { type: 'finish', reason: { kind: 'stop' } }],
  overrides: { route?: ModelRoute | null; plan?: TaskPlan | null; session?: Session | undefined } = {},
) {
  const llm = { stream: vi.fn((_options: GenerateOptions) => (async function* () { for (const chunk of chunks) yield chunk })()) } as unknown as Llm & { stream: { mock: { calls: GenerateOptions[][] } } }
  const store: SessionStore = { get: (id: string) => 'session' in overrides ? overrides.session : id === 's' ? session : undefined }
  const route = 'route' in overrides ? overrides.route ?? null : { provider: 'deepseek', model: 'deepseek-chat' }
  const planValue = 'plan' in overrides ? overrides.plan ?? null : plan
  const advisor = new HostAdvisor(llm, store, handle(planValue), handle(route))
  return { advisor, llm }
}

const question = { sessionId: 's', question: '怎么测试', signal: new AbortController().signal }

describe('HostAdvisor', () => {
  it('streams a tool-free one-shot on the session model', async () => {
    const { advisor, llm } = fixture()
    const emit = vi.fn()
    await expect(advisor.ask(question, emit)).resolves.toBe('运行测试')
    const options = llm.stream.mock.calls[0]?.[0]
    expect(options).toBeDefined()
    expect(options).not.toHaveProperty('tools')
    expect(options).not.toHaveProperty('sessionId')
    expect(options?.provider).toBe('deepseek')
    expect(options?.model).toBe('deepseek-chat')
    expect(options?.maxTokens).toBe(2000)
    expect(options).not.toHaveProperty('system')
    expect(options?.messages[0]?.content[0]?.text).toContain('只读')
    expect(emit).toHaveBeenCalledWith({ type: 'delta', text: '运行测试' })
  })

  it('remembers earlier questions in the same session', async () => {
    const { advisor, llm } = fixture()
    await advisor.ask(question, vi.fn())
    await advisor.ask({ ...question, question: '预计多久', signal: new AbortController().signal }, vi.fn())
    const second = llm.stream.mock.calls[1]?.[0]
    expect(second?.messages[0]?.content[0]?.text).toContain('怎么测试')
  })

  it('rejects an inactive session, a missing model, a missing plan and model failures', async () => {
    await expect(fixture([], { session: undefined }).advisor.ask({ ...question, sessionId: 'gone' }, vi.fn())).rejects.toThrow('not active')
    await expect(fixture([], { route: null }).advisor.ask(question, vi.fn())).rejects.toThrow('No model')
    await expect(fixture([], { plan: null }).advisor.ask(question, vi.fn())).rejects.toThrow('No plan')
    const failing = fixture([{ type: 'finish', reason: { kind: 'error' } }])
    await expect(failing.advisor.ask(question, vi.fn())).rejects.toThrow('重试')
    const empty = fixture([{ type: 'finish', reason: { kind: 'stop' } }])
    await expect(empty.advisor.ask(question, vi.fn())).rejects.toThrow('没有返回答案')
  })

  it('aborts cleanly when the panel stops the answer', async () => {
    const { advisor } = fixture()
    const controller = new AbortController()
    controller.abort()
    await expect(advisor.ask({ ...question, signal: controller.signal }, vi.fn())).rejects.toThrow('停止')
  })
})
