import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { PlanStore } from '../src/server/plan-store'
import { createHttpHandlers } from '../src/server/http'
import type { ConsultAdvisor } from '../src/server/adviser'

function request(method: string, url: string, body?: unknown): IncomingMessage {
  const stream = Readable.from(body === undefined ? [] : [JSON.stringify(body)])
  Object.assign(stream, { method, url, headers: {} })
  return stream as IncomingMessage
}

function response() {
  const res = { statusCode: 0, headers: {} as Record<string, string>, body: '', setHeader(key: string, value: string) { this.headers[key] = value }, end(chunk = '') { this.body += chunk }, write(chunk: string) { this.body += chunk; return true }, destroyed: false }
  return res as unknown as ServerResponse & { body: string; headers: Record<string, string> }
}

const plan = { title: '构建插件', steps: [{ title: '实现', expectedOutcome: '构建通过', test: 'npm test', estimate: '20 分钟' }, { title: '交付' }] }

describe('HTTP contract', () => {
  it('rejects unauthenticated calls before reading or answering', async () => {
    const store = new PlanStore(); store.create('s', plan)
    const advisor = { ask: vi.fn() } as unknown as ConsultAdvisor
    const handlers = createHttpHandlers(store, advisor, () => 401)
    const state = response(); await handlers.state(request('GET', '/?session=s'), state)
    expect(state.statusCode).toBe(401); expect(state.body).toBe('')
    const ask = response(); await handlers.ask(request('POST', '/', { sessionId: 's', question: '怎么做' }), ask)
    expect(ask.statusCode).toBe(401); expect(advisor.ask).not.toHaveBeenCalled()
  })

  it('validates methods, session ids and bounded request bodies', async () => {
    const store = new PlanStore(); store.create('s', plan)
    const advisor = { ask: vi.fn(async () => {}) } as unknown as ConsultAdvisor
    const handlers = createHttpHandlers(store, advisor, () => undefined)
    const state = response(); await handlers.state(request('POST', '/'), state)
    expect(state.statusCode).toBe(405)
    const unknown = response(); await handlers.state(request('GET', '/?session=missing'), unknown)
    expect(unknown.statusCode).toBe(404)
    const empty = response(); await handlers.ask(request('POST', '/', { sessionId: 's', question: ' ' }), empty)
    expect(empty.statusCode).toBe(400)
    const malformed = response(); await handlers.ask(request('POST', '/', '{'), malformed)
    expect(malformed.statusCode).toBe(400)
    const long = response(); await handlers.ask(request('POST', '/', { sessionId: 's', question: '问'.repeat(4001) }), long)
    expect(long.statusCode).toBe(400); expect(advisor.ask).not.toHaveBeenCalled()
    const trimmedLong = response(); await handlers.ask(request('POST', '/', { sessionId: 's', question: ` ${'问'.repeat(4000)} ` }), trimmedLong)
    expect(trimmedLong.statusCode).toBe(200)
  })

  it('streams answer, completion and failure as NDJSON', async () => {
    const store = new PlanStore(); store.create('s', plan)
    const advisor = { ask: vi.fn(async (_input: unknown, emit: (event: object) => void) => { emit({ type: 'delta', text: '先实现' }); return '先实现' }) } as unknown as ConsultAdvisor
    const handlers = createHttpHandlers(store, advisor, () => undefined)
    const ask = response(); await handlers.ask(request('POST', '/', { sessionId: 's', question: '怎么做' }), ask)
    expect(ask.statusCode).toBe(200)
    expect(ask.headers['content-type']).toContain('application/x-ndjson')
    expect(ask.body).toContain('"type":"delta"')
    expect(ask.body).toContain('"type":"done"')
    const failing = createHttpHandlers(store, { ask: vi.fn(async () => { throw new Error('model unavailable') }) } as unknown as ConsultAdvisor, () => undefined)
    const error = response(); await failing.ask(request('POST', '/', { sessionId: 's', question: '怎么测' }), error)
    expect(error.body).toContain('"type":"error"')
    expect(error.body).toContain('model unavailable')
  })
})
