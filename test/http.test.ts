import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { createHttpHandlers } from '../src/server/http'
import type { HttpDeps } from '../src/server/http'
import type { ConsultAdvisor } from '../src/server/adviser'
import { createPlan, snapshotOf } from '../src/server/plan'
import type { PlanSnapshot } from '../src/shared/types'

function request(method: string, url: string, body?: unknown): IncomingMessage {
  const payload = body === undefined ? [] : [typeof body === 'string' ? body : JSON.stringify(body)]
  const stream = Readable.from(payload)
  Object.assign(stream, { method, url, headers: {} })
  return stream as IncomingMessage
}

function response() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(key: string, value: string) { this.headers[key] = value },
    end(chunk = '') { this.body += chunk },
    write(chunk: string) { this.body += chunk; return true },
    destroyed: false,
  }
  return res as unknown as ServerResponse & { body: string; headers: Record<string, string> }
}

const plan = createPlan({
  title: '构建插件',
  steps: [
    { title: '实现', expectedOutcome: '构建通过', test: 'npm test', estimate: '20 分钟' },
    { title: '交付' },
  ],
})

/** Frozen read face: the routes never mutate a plan. */
const snapshots: Record<string, PlanSnapshot> = { s: snapshotOf(plan) }

function deps(adviser: ConsultAdvisor, rejection: 401 | 403 | undefined = undefined): HttpDeps {
  return {
    snapshot: (id: string) => snapshots[id] ?? null,
    adviser,
    requestRejection: () => rejection,
  }
}

describe('HTTP contract', () => {
  it('rejects untrusted calls before reading or answering', async () => {
    const adviser = { ask: vi.fn() } as unknown as ConsultAdvisor
    const handlers = createHttpHandlers(deps(adviser, 401))
    const state = response()
    await handlers.state(request('GET', '/?session=s'), state)
    expect(state.statusCode).toBe(401)
    expect(state.body).toBe('')
    const ask = response()
    await handlers.ask(request('POST', '/', { sessionId: 's', question: '怎么做' }), ask)
    expect(ask.statusCode).toBe(401)
    expect(adviser.ask).not.toHaveBeenCalled()
  })

  it('validates methods, session ids and bounded request bodies', async () => {
    const adviser = { ask: vi.fn(async () => 'ok') } as unknown as ConsultAdvisor
    const handlers = createHttpHandlers(deps(adviser))
    const wrongMethod = response()
    await handlers.state(request('POST', '/'), wrongMethod)
    expect(wrongMethod.statusCode).toBe(405)
    expect(wrongMethod.headers.allow).toBe('GET')
    const noSession = response()
    await handlers.state(request('GET', '/'), noSession)
    expect(noSession.statusCode).toBe(400)
    const unknown = response()
    await handlers.state(request('GET', '/?session=missing'), unknown)
    expect(unknown.statusCode).toBe(404)
    const empty = response()
    await handlers.ask(request('POST', '/', { sessionId: 's', question: ' ' }), empty)
    expect(empty.statusCode).toBe(400)
    const malformed = response()
    await handlers.ask(request('POST', '/', '{'), malformed)
    expect(malformed.statusCode).toBe(400)
    const noPlan = response()
    await handlers.ask(request('POST', '/', { sessionId: 'missing', question: '怎么做' }), noPlan)
    expect(noPlan.statusCode).toBe(404)
    const long = response()
    await handlers.ask(request('POST', '/', { sessionId: 's', question: '问'.repeat(4001) }), long)
    expect(long.statusCode).toBe(400)
    expect(adviser.ask).not.toHaveBeenCalled()
    const huge = response()
    await handlers.ask(request('POST', '/', { sessionId: 's', question: '问'.repeat(40000) }), huge)
    expect(huge.statusCode).toBe(400)
    expect(adviser.ask).not.toHaveBeenCalled()
  })

  it('returns the live snapshot for a session with a plan', async () => {
    const handlers = createHttpHandlers(deps({ ask: vi.fn() } as unknown as ConsultAdvisor))
    const state = response()
    await handlers.state(request('GET', '/?session=s'), state)
    expect(state.statusCode).toBe(200)
    const parsed = JSON.parse(state.body) as PlanSnapshot
    expect(parsed.plan?.title).toBe('构建插件')
    expect(parsed.percent).toBe(0)
    expect(parsed.current?.title).toBe('实现')
  })

  it('streams answer, completion and failure as NDJSON', async () => {
    const adviser = {
      ask: vi.fn(async (_input: unknown, emit: (event: object) => void) => {
        emit({ type: 'delta', text: '先实现' })
        return '先实现'
      }),
    } as unknown as ConsultAdvisor
    const handlers = createHttpHandlers(deps(adviser))
    const ask = response()
    await handlers.ask(request('POST', '/', { sessionId: 's', question: '怎么做' }), ask)
    expect(ask.statusCode).toBe(200)
    expect(ask.headers['content-type']).toContain('application/x-ndjson')
    expect(ask.body).toContain('"type":"delta"')
    expect(ask.body).toContain('"type":"done"')
    expect(ask.body.trim().split('\n').every(line => JSON.parse(line))).toBe(true)
    const failing = createHttpHandlers(deps({
      ask: vi.fn(async () => { throw new Error('model unavailable') }),
    } as unknown as ConsultAdvisor))
    const error = response()
    await failing.ask(request('POST', '/', { sessionId: 's', question: '怎么测' }), error)
    expect(error.body).toContain('"type":"error"')
    expect(error.body).toContain('model unavailable')
  })
})
