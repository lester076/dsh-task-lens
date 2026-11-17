/**
 * dsh-task-lens — client half.
 *
 * The right column and its floating panel are the host's own tab machinery: this
 * plugin only declares one page kind and the body that renders under it, so
 * dock/float/close/resize all behave exactly like a built-in tab instead of a
 * hand-rolled overlay. The composer dock is a launcher that opens that tab.
 *
 * Like the host half, this bundle has no `@deepseek-ai/*` runtime import: it
 * `require`s only `react` and `react/jsx-runtime` from the host module loader,
 * and restates the one contract it needs below.
 */
import type { ComponentType } from 'react'
import type { TaskPlan } from '../shared/types'
import { TaskLens } from './TaskLens'
import { en, zh } from './locales'
import type { LocaleKey } from './locales'
import { installStyles } from './styles'

/** Right-column page kind owned by this plugin. */
const KIND = 'task-lens'
/** Cell key, tab-type id, and page address this plugin claims. */
const ID = 'dsh-task-lens'
const ADDRESS = `sidebar://${KIND}`
/** Dictionary namespace bound to `t` on both slot registrations. */
const NS = 'taskLens'

/** Every client service this plugin reads. */
export const inject = ['slots', 'sessions', 'sidebarRight', 'sidebarRightTabs', 'locale', 'uiWorkspace'] as const

/** The client context slice used here (`@deepseek-ai/cordis` in the host). */
interface ClientContext {
  effect(execute: () => (() => void) | undefined, label?: string): () => void
  slots: {
    inject(name: string, factory: () => () => void): () => void
    register(options: Record<string, unknown>, component: ComponentType<any>): () => void
  }
  locale: {
    register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void
    bind(namespace: string): (key: string) => string
  }
  sidebarRight: { openTab(kind: string, options?: Record<string, unknown>): void }
  sidebarRightTabs: {
    register(definition: {
      id: string
      kind: string
      title(address: string): string
      patterns?: readonly string[]
      canOpen?(address: string): boolean
      priority?: 'extension' | 'builtin' | 'fallback'
    }): () => void
  }
  sessions: { fork(options: { sessionId: string; increaseTitle?: boolean }): Promise<string> }
  /** `SessionTarget` is the branded session id itself, not an object. */
  uiWorkspace: { openSession(sessionId: string): void }
}

/** Props every session-scoped slot entry receives, plus the bound dictionary. */
interface SlotProps {
  sessionId: string
  useProjection(key: string): TaskPlan | null
  t(key: LocaleKey): string
}

/** Percent of steps the model actually reported as complete. */
function percentOf(plan: TaskPlan | null): number {
  if (!plan?.steps.length) return 0
  return Math.round(plan.steps.filter(step => step.status === 'completed').length / plan.steps.length * 100)
}

/**
 * Install the tab type, its body, the composer launcher, and the dictionary.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  installStyles()
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'task-lens: dictionaries')
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: ID,
    kind: KIND,
    patterns: [ADDRESS],
    canOpen: address => address === ADDRESS,
    title: () => t('title'),
  }), 'task-lens: sidebar type')

  const Panel: ComponentType<SlotProps> = (props) => {
    const plan = props.useProjection('taskLens')
    const snapshot = plan
      ? { plan, percent: percentOf(plan), current: plan.steps.find(step => step.status === 'in_progress' || step.status === 'failed') ?? null }
      : { plan: null, percent: 0, current: null }
    return (
      <TaskLens
        sessionId={props.sessionId}
        snapshot={snapshot}
        onBranch={async () => {
          const child = await ctx.sessions.fork({ sessionId: props.sessionId, increaseTitle: true })
          ctx.uiWorkspace.openSession(child)
        }}
        t={props.t}
      />
    )
  }

  const Launcher: ComponentType<SlotProps> = (props) => {
    const plan = props.useProjection('taskLens')
    if (!plan) return null
    const percent = percentOf(plan)
    return (
      <button className="dsh-task-lens-launcher" title={props.t('open')} onClick={() => ctx.sidebarRight.openTab(KIND)}>
        <span>{plan.title}</span>
        <progress max={100} value={percent} />
        <span>{percent}%</span>
      </button>
    )
  }

  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: ID, locale: NS }, Panel))
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: ID, order: 20, locale: NS }, Launcher))
}
