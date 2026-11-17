// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TaskLens } from '../src/client/TaskLens'
import type { TaskLensProps } from '../src/client/TaskLens'
import type { PlanSnapshot, TaskPlan } from '../src/shared/types'
import { zh } from '../src/client/locales'

const { askQuestion } = vi.hoisted(() => ({ askQuestion: vi.fn() }))
vi.mock('../src/client/api', () => ({ askQuestion }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

function plan(statuses: TaskPlan['steps'][number]['status'][] = ['completed', 'in_progress', 'pending', 'pending']): TaskPlan {
  return {
    title: '实现任务透镜', status: 'active', createdAt: 1, updatedAt: 2,
    steps: statuses.map((status, index) => ({ id: `step-${index + 1}`, title: `步骤 ${index + 1}`, status, ...(index === 1 ? { estimate: '10 分钟' } : {}) })),
  }
}

function snapshot(value: TaskPlan | null = plan()): PlanSnapshot {
  if (!value) return { plan: null, percent: 0, current: null }
  return { plan: value, percent: Math.round(value.steps.filter(step => step.status === 'completed').length / value.steps.length * 100), current: value.steps.find(step => step.status === 'in_progress' || step.status === 'failed') ?? null }
}

function props(overrides: Partial<TaskLensProps> = {}): TaskLensProps {
  return { sessionId: 'source', snapshot: snapshot(), floating: false, onFloat: vi.fn(), onDock: vi.fn(), onClose: vi.fn(), onBranch: vi.fn(async () => {}), t: key => zh[key], ...overrides }
}

describe('TaskLens progress and window controls', () => {
  it('renders empty, half-complete and all-complete states without inventing a current step', () => {
    const { rerender } = render(<TaskLens {...props({ snapshot: snapshot(null) })} />)
    expect(screen.getByText(zh.empty)).toBeTruthy()
    expect(screen.getByRole('button', { name: zh.send })).toHaveProperty('disabled', true)

    rerender(<TaskLens {...props({ snapshot: snapshot(plan(['completed', 'in_progress'])) })} />)
    expect(screen.getByText('50%')).toBeTruthy()
    expect(screen.getByText('步骤 2')).toBeTruthy()
    expect(screen.getByText(zh.in_progress)).toBeTruthy()
    expect(screen.getByText('10 分钟')).toBeTruthy()
    expect(screen.queryByText('步骤 3')).toBeNull()

    rerender(<TaskLens {...props({ snapshot: snapshot(plan(['completed', 'completed'])) })} />)
    expect(screen.getByText('100%')).toBeTruthy()
    expect(screen.queryByText(zh.in_progress)).toBeNull()
    expect(screen.getAllByText(zh.completed)).toHaveLength(2)
  })

  it('uses native float, dock and close callbacks without creating a branch', () => {
    const float = vi.fn(); const dock = vi.fn(); const close = vi.fn(); const branch = vi.fn()
    const { rerender } = render(<TaskLens {...props({ onFloat: float, onDock: dock, onClose: close, onBranch: branch })} />)
    fireEvent.click(screen.getByTitle(zh.float)); fireEvent.click(screen.getByTitle(zh.close))
    rerender(<TaskLens {...props({ floating: true, onFloat: float, onDock: dock, onClose: close, onBranch: branch })} />)
    fireEvent.click(screen.getByTitle(zh.dock))
    expect(float).toHaveBeenCalledOnce(); expect(dock).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce()
    expect(branch).not.toHaveBeenCalled()
  })
})

describe('TaskLens isolated questions', () => {
  it('supports all four shortcuts and bounded free-question input', async () => {
    const user = userEvent.setup()
    askQuestion.mockImplementation(async (_session: string, _question: string, _signal: AbortSignal, handlers: { onDone(answer: string): void }) => { handlers.onDone('回答') })
    render(<TaskLens {...props()} />)
    for (const key of ['how', 'time', 'outcome', 'test'] as const) await user.click(screen.getByRole('button', { name: zh[key] }))
    expect(askQuestion.mock.calls.map(call => call[1])).toEqual([zh.how, zh.time, zh.outcome, zh.test])
    expect(askQuestion.mock.calls.every(call => call[0] === 'source')).toBe(true)
    const input = screen.getByPlaceholderText(zh.placeholder)
    expect(input).toHaveProperty('maxLength', 4000)
    await user.type(input, '如何验收？')
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
    await waitFor(() => expect(askQuestion).toHaveBeenCalledTimes(5))
    expect(askQuestion.mock.calls[4]?.[1]).toBe('如何验收？')
  })

  it('stops only the current request and retries the last failed question', async () => {
    const user = userEvent.setup()
    let failNext = false
    askQuestion.mockImplementation(async (_session: string, _question: string, signal: AbortSignal, handlers: { onError(message: string): void }) => {
      if (failNext) handlers.onError('模型不可用')
      else await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
    })
    render(<TaskLens {...props()} />)
    await user.click(screen.getByRole('button', { name: zh.how }))
    expect(askQuestion).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: zh.stop }))
    expect(askQuestion.mock.calls[0]?.[2].aborted).toBe(true)

    failNext = true
    await user.click(screen.getByRole('button', { name: zh.how }))
    await screen.findByText('模型不可用')
    await user.click(screen.getByRole('button', { name: zh.retry }))
    expect(askQuestion.mock.calls.at(-1)?.[1]).toBe(zh.how)
  })

  it('does not display one session\'s chat in another session', async () => {
    askQuestion.mockImplementation(async (_session: string, _question: string, _signal: AbortSignal, handlers: { onDone(answer: string): void }) => { handlers.onDone('源会话回答') })
    const user = userEvent.setup()
    const { rerender } = render(<TaskLens {...props()} />)
    await user.click(screen.getByRole('button', { name: zh.how }))
    await screen.findByText('源会话回答')
    rerender(<TaskLens {...props({ sessionId: 'other' })} />)
    expect(screen.queryByText('源会话回答')).toBeNull()
    expect(screen.queryByText(zh.how, { selector: '.dsh-task-lens-message' })).toBeNull()
  })
})

describe('TaskLens explicit branching', () => {
  it('cancels and confirms the branch dialog exactly once', async () => {
    const user = userEvent.setup(); const branch = vi.fn(async () => {})
    render(<TaskLens {...props({ onBranch: branch })} />)
    await user.click(screen.getByRole('button', { name: zh.branch }))
    await user.click(screen.getByRole('button', { name: zh.cancel }))
    expect(branch).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: zh.branch }))
    const confirm = screen.getByRole('button', { name: zh.confirmBranch })
    fireEvent.click(confirm); fireEvent.click(confirm)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(branch).toHaveBeenCalledOnce()
  })

  it('keeps the panel and draft after branch failure', async () => {
    const user = userEvent.setup(); let draft = ''
    askQuestion.mockImplementation(async () => {})
    const branch = vi.fn(async () => { draft = (document.querySelector('textarea') as HTMLTextAreaElement).value; throw new Error('not allowed') })
    render(<TaskLens {...props({ onBranch: branch })} />)
    await user.type(screen.getByPlaceholderText(zh.placeholder), '保留输入')
    await user.click(screen.getByRole('button', { name: zh.branch }))
    await user.click(screen.getByRole('button', { name: zh.confirmBranch }))
    await screen.findByRole('alert')
    expect(screen.getByText(zh.branchFailed)).toBeTruthy()
    expect(screen.getByPlaceholderText(zh.placeholder)).toHaveProperty('value', '保留输入')
    expect(draft).toBe('保留输入')
  })

  it('asks for confirmation only when a floating window is dropped on a session row', () => {
    const { rerender } = render(<TaskLens {...props()} />)
    expect(screen.getByRole('banner').draggable).toBe(false)
    rerender(<TaskLens {...props({ floating: true })} />)
    const header = screen.getByRole('banner')
    expect(header.draggable).toBe(true)
    fireEvent.dragStart(header, { dataTransfer: { setData: vi.fn(), effectAllowed: 'copy', types: ['application/x-dsh-task-lens'] } })
    fireEvent.drop(document.body, { dataTransfer: { types: ['application/x-dsh-task-lens'] } })
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.dragStart(header, { dataTransfer: { setData: vi.fn(), effectAllowed: 'copy', types: ['application/x-dsh-task-lens'] } })
    const row = document.createElement('div'); row.dataset.rowKey = 'session:other'; document.body.append(row)
    fireEvent.drop(row, { dataTransfer: { types: ['application/x-dsh-task-lens'] } })
    expect(screen.getByRole('dialog')).toBeTruthy()
    row.remove()
  })

  it('opens no question dialog from a normal floating action', () => {
    render(<TaskLens {...props()} />)
    expect(within(screen.getByRole('banner')).getByTitle(zh.float)).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
