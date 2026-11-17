import type { Context } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-session-projection/types'
import type { ISidebarRight } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { TaskPlan } from '../shared/types'
import { TaskLens } from './TaskLens'
import { en, zh } from './locales'
import type { LocaleKey } from './locales'
import { installStyles } from './styles'

declare module '@deepseek-ai/dsh-session-projection' {
  interface SessionProjectionMap { taskLens: TaskPlan | null }
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { taskLens: LocaleKey }
}
declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightTabParamsMap { 'task-lens': Record<string, never> }
}

const KIND = 'task-lens'
export const inject = ['slots', 'sessions', 'sidebarRight', 'sidebarRightTabs', 'locale'] as const

interface ExtraActions { sidebarRight: ISidebarRight; sessions: Pick<ISessions, 'fork' | 'open'> }
type PanelProps = PropsRuntime<'sidebar.right.pane.tab', 'dsh-task-lens'> & ExtraActions & { t(key: LocaleKey): string }
function Panel(props: PanelProps) {
  const plan = props.useSession().session.projections.faceOf('taskLens').getSnapshot() as TaskPlan | null | undefined
  const snapshot = { plan: plan ?? null, percent: plan?.steps.length ? Math.round(plan.steps.filter(step => step.status === 'completed').length / plan.steps.length * 100) : 0, current: plan?.steps.find(step => step.status === 'in_progress' || step.status === 'failed') ?? null }
  return <TaskLens sessionId={props.sessionId} snapshot={snapshot} floating={props.useTabInfo().panel.isFloating} onFloat={() => props.sidebarRight.float(props.useTabInfo().tab.id)} onDock={() => props.sidebarRight.dock(props.useTabInfo().panel.id)} onClose={props.useTabInfo().tab.actions.close} onBranch={async () => { const child = await props.sessions.fork({ sessionId: props.sessionId, increaseTitle: true }); props.sessions.open(child) }} t={props.t} />
}
type DockProps = PropsRuntime<'conversation.input.dock'> & Pick<ExtraActions, 'sidebarRight'> & { t(key: LocaleKey): string }
function Dock(props: DockProps) {
  const plan = props.useSession().session.projections.faceOf('taskLens').getSnapshot() as TaskPlan | null | undefined
  if (!plan) return null
  const percent = Math.round(plan.steps.filter(step => step.status === 'completed').length / plan.steps.length * 100)
  return <button className="dsh-task-lens-launcher" onClick={() => props.sidebarRight.openTab(KIND)} title={props.t('open')}><span>{plan.title}</span><progress max={100} value={percent} />{percent}%</button>
}

/** Register the session plan projection's dock and native right-sidebar/floating panel. */
export function apply(ctx: Context): void {
  installStyles()
  ctx.effect(() => ctx.locale.register('taskLens', { zh, en }), 'task-lens: locale')
  ctx.sidebarRightTabs.register({ id: 'dsh-task-lens', kind: KIND, title: () => ctx.locale.bind('taskLens')('title') })
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: 'dsh-task-lens', locale: 'taskLens', inject: () => ({ sidebarRight: ctx.sidebarRight, sessions: ctx.sessions }) }, Panel))
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'task-lens', order: 20, locale: 'taskLens', inject: () => ({ sidebarRight: ctx.sidebarRight }) }, Dock))
}
