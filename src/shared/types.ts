export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'failed'
export type PlanStatus = 'active' | 'completed'

export interface StepInput {
  id?: string
  title: string
  expectedOutcome?: string
  test?: string
  estimate?: string
}

export interface PlanInput {
  title: string
  steps: StepInput[]
}

export interface PlanStep extends StepInput {
  id: string
  status: StepStatus
  lastError?: string
}

export interface TaskPlan extends Omit<PlanInput, 'steps'> {
  steps: PlanStep[]
  status: PlanStatus
  createdAt: number
  updatedAt: number
}

export interface PlanSnapshot {
  plan: TaskPlan | null
  percent: number
  current: PlanStep | null
}

export interface ConsultMessage {
  role: 'user' | 'assistant'
  content: string
}
