import type { ConsultMessage, PlanSnapshot } from '../shared/types'

export class BoundedConversation {
  constructor(private readonly maxMessages = 100, private readonly maxChars = 24000) {}
  private messages: ConsultMessage[] = []

  add(role: ConsultMessage['role'], content: string) {
    this.messages.push({ role, content: content.slice(-this.maxChars) })
    while (this.messages.length > this.maxMessages || this.messages.reduce((sum, item) => sum + item.content.length, 0) > this.maxChars) this.messages.shift()
  }

  get() { return this.messages.map((item) => ({ ...item })) }
  clear() { this.messages = [] }
}

export interface AdviserMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export function buildConsultMessages(snapshot: PlanSnapshot, history: ConsultMessage[], question: string): AdviserMessage[] {
  const plan = snapshot.plan
  const steps = plan?.steps.map((step) => `- [${step.status}] ${step.title}\n  预期效果：${step.expectedOutcome ?? '未指定'}\n  测试：${step.test ?? '未指定'}\n  粗略估计：${step.estimate ?? '无法可靠估计'}${step.lastError ? `\n  最近错误：${step.lastError}` : ''}`).join('\n') ?? '暂无计划'
  return [
    { role: 'system', content: `你是 DeepSeek Harness 的只读任务顾问。你只能根据提供的计划解释，不得执行工具、修改文件或改变主任务。时间只能是粗略估计，未知就明确说明。用中文简洁回答怎么做、预计多久、预期效果和怎么测试。\n\n任务：${plan?.title ?? '无'}\n整体完成度：${snapshot.percent}%\n${steps}` },
    ...history,
    { role: 'user', content: question },
  ]
}

export interface ConsultInput {
  sessionId: string
  question: string
  signal: AbortSignal
}

export interface ConsultAdvisor {
  ask(input: ConsultInput, emit: (event: { type: 'delta'; text: string }) => void): Promise<string>
}
