export interface AnswerHandlers {
  onDelta(text: string): void
  onDone(answer: string): void
  onError(message: string): void
}

/** Ask the isolated adviser and decode its bounded NDJSON response. */
export async function askQuestion(sessionId: string, question: string, signal: AbortSignal, handlers: AnswerHandlers): Promise<void> {
  try {
    const response = await fetch('/__dsh/task-lens/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId, question }), signal })
    if (!response.ok || !response.body) throw new Error('暂时无法连接任务顾问')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n'); buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line) continue
        const event = JSON.parse(line) as { type: string; text?: string; answer?: string; error?: string }
        if (event.type === 'delta') handlers.onDelta(event.text ?? '')
        else if (event.type === 'done') handlers.onDone(event.answer ?? '')
        else if (event.type === 'error') handlers.onError(event.error ?? '回答失败')
      }
    }
  } catch (error) {
    if (signal.aborted) return
    handlers.onError(error instanceof Error ? error.message : '回答失败')
  }
}
