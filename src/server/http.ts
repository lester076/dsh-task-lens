import type { IncomingMessage, ServerResponse } from 'node:http'
import type { PlanStore } from './plan-store'
import type { ConsultAdvisor } from './adviser'

const MAX_BODY = 64 * 1024

function send(res: ServerResponse, status: number, body: unknown, type = 'application/json; charset=utf-8') {
  res.statusCode = status
  res.setHeader('content-type', type)
  res.setHeader('cache-control', 'no-store')
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

function sessionFrom(url: string | undefined) {
  try { return new URL(url ?? '/', 'http://localhost').searchParams.get('session') ?? '' } catch { return '' }
}

async function body(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of req) {
    length += Buffer.byteLength(chunk)
    if (length > MAX_BODY) throw new Error('Request body exceeds 64 KiB')
    chunks.push(Buffer.from(chunk))
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export function createHttpHandlers(store: PlanStore, advisor: ConsultAdvisor, requestRejection: (req: IncomingMessage) => number | undefined) {
  const state = async (req: IncomingMessage, res: ServerResponse) => {
    const rejection = requestRejection(req)
    if (rejection !== undefined) return send(res, rejection, '')
    if (req.method !== 'GET') { res.setHeader('allow', 'GET'); return send(res, 405, { error: 'Method not allowed' }) }
    const id = sessionFrom(req.url)
    if (!id) return send(res, 400, { error: 'Session id is required' })
    const snapshot = store.snapshot(id)
    if (!snapshot.plan) return send(res, 404, { error: 'No plan for this session' })
    send(res, 200, snapshot)
  }
  const ask = async (req: IncomingMessage, res: ServerResponse) => {
    const rejection = requestRejection(req)
    if (rejection !== undefined) return send(res, rejection, '')
    if (req.method !== 'POST') { res.setHeader('allow', 'POST'); return send(res, 405, { error: 'Method not allowed' }) }
    let input: { sessionId?: unknown; question?: unknown }
    try { input = await body(req) as typeof input } catch (error) { return send(res, 400, { error: error instanceof Error ? error.message : 'Invalid JSON' }) }
    if (typeof input.sessionId !== 'string' || !input.sessionId || typeof input.question !== 'string' || !input.question.trim()) return send(res, 400, { error: 'sessionId and question are required' })
    if (input.question.trim().length > 4000) return send(res, 400, { error: 'Question is too long' })
    if (!store.get(input.sessionId)) return send(res, 404, { error: 'No plan for this session' })
    res.statusCode = 200
    res.setHeader('content-type', 'application/x-ndjson; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    const emit = (event: object) => { if (!res.destroyed) res.write(JSON.stringify(event) + '\n') }
    try {
      const controller = new AbortController()
      req.on('close', () => controller.abort())
      const answer = await advisor.ask({ sessionId: input.sessionId, question: input.question.trim(), signal: controller.signal }, emit)
      emit({ type: 'done', answer })
    } catch (error) {
      emit({ type: 'error', error: error instanceof Error ? error.message : 'The adviser is unavailable' })
    } finally { if (!res.destroyed) res.end() }
  }
  return { state, ask }
}
