import { describe, expect, it, vi } from 'vitest'
import { PLAN_POLICY_SECTION, PLAN_POLICY_TEXT, registerPlanPolicy } from '../src/server/prompt'
import type { PromptSection, SystemPrompt } from '../src/server/host-api'

function fake(): { systemPrompt: SystemPrompt; sections: PromptSection[] } {
  const sections: PromptSection[] = []
  return {
    sections,
    systemPrompt: {
      section: (section) => {
        sections.push(section)
        return () => { sections.pop() }
      },
      getSectionOrder: (name) => (name === 'PLAN_POLICY' ? 500 : 0),
    },
  }
}

describe('plan policy prompt section', () => {
  it('registers once at the host plan-policy slot', () => {
    const { systemPrompt, sections } = fake()
    const dispose = registerPlanPolicy(systemPrompt)
    expect(sections).toHaveLength(1)
    expect(sections[0]?.name).toBe(PLAN_POLICY_SECTION)
    expect(sections[0]?.order).toBe(500)
    dispose()
    expect(sections).toHaveLength(0)
  })

  it('tells the model when to write a plan and when to report progress', () => {
    expect(PLAN_POLICY_TEXT).toContain('task_lens_write')
    expect(PLAN_POLICY_TEXT).toContain('task_lens_update')
    expect(PLAN_POLICY_TEXT).toContain('asks for a plan')
    expect(PLAN_POLICY_TEXT).toContain('never report progress')
    expect(PLAN_POLICY_TEXT).toContain('Skip both tools for a single-step request')
  })

  it('never claims tools it does not have', () => {
    expect(PLAN_POLICY_TEXT).not.toContain('todo_write')
  })
})
