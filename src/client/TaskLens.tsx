import { useEffect, useRef, useState } from 'react'
import type { PlanSnapshot } from '../shared/types'
import { askQuestion } from './api'
import type { LocaleKey } from './locales'

export interface TaskLensProps {
  sessionId: string
  snapshot: PlanSnapshot
  floating: boolean
  onFloat(): void
  onDock(): void
  onClose(): void
  onBranch(): Promise<void>
  t(key: LocaleKey): string
}
interface ChatItem { role: 'user' | 'assistant'; content: string; error?: boolean }

/** Read-only progress and question panel. The only session mutation is the confirmed branch callback. */
export function TaskLens({ sessionId, snapshot, floating, onFloat, onDock, onClose, onBranch, t }: TaskLensProps) {
  const [question, setQuestion] = useState('')
  const [chat, setChat] = useState<ChatItem[]>([])
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [branchError, setBranchError] = useState(false)
  const [branchBusy, setBranchBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const controller = useRef<AbortController | undefined>(undefined)
  const lastQuestion = useRef('')
  useEffect(() => {
    controller.current?.abort()
    setQuestion('')
    setChat([])
    setBusy(false)
    setConfirming(false)
    setBranchError(false)
    setBranchBusy(false)
    setDragging(false)
    lastQuestion.current = ''
  }, [sessionId])
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => {
    if (!dragging) return
    const drop = (event: DragEvent) => {
      setDragging(false)
      if (event.dataTransfer?.types.includes('application/x-dsh-task-lens') && (event.target as Element | null)?.closest('[data-row-key^="session:"]')) setConfirming(true)
    }
    const cancel = () => setDragging(false)
    window.addEventListener('drop', drop, true)
    window.addEventListener('dragend', cancel, true)
    return () => { window.removeEventListener('drop', drop, true); window.removeEventListener('dragend', cancel, true) }
  }, [dragging])

  const send = (value = question) => {
    const text = value.trim()
    if (!text || busy) return
    lastQuestion.current = text; setQuestion(''); setBusy(true)
    setChat(items => [...items, { role: 'user', content: text }, { role: 'assistant', content: '' }])
    const abort = new AbortController(); controller.current = abort
    const patch = (content: string, error = false) => setChat(items => items.map((item, index) => index === items.length - 1 ? { ...item, content, error } : item))
    void askQuestion(sessionId, text, abort.signal, {
      onDelta: delta => setChat(items => items.map((item, index) => index === items.length - 1 ? { ...item, content: item.content + delta } : item)),
      onDone: answer => { patch(answer); setBusy(false) },
      onError: message => { patch(message, true); setBusy(false) },
    }).finally(() => setBusy(false))
  }
  const status = (key: string) => t(key as LocaleKey)
  const progress = <section className="dsh-task-lens-plan" aria-label={t('title')}>
    <div className="dsh-task-lens-heading"><strong>{snapshot.plan?.title ?? t('title')}</strong><span>{snapshot.percent}%</span></div>
    <progress max={100} value={snapshot.percent} aria-label={`${snapshot.percent}%`} />
    {snapshot.plan ? <ol>{snapshot.plan.steps.map(step => <li key={step.id} data-status={step.status}>
      <span className="dsh-task-lens-dot" aria-hidden="true" /> <span>{step.title}</span><small>{status(step.status)}</small>
      {step.status === 'in_progress' && <div className="dsh-task-lens-detail">{step.estimate}{step.lastError && <p role="alert">{step.lastError}</p>}</div>}
    </li>)}</ol> : <p className="dsh-task-lens-empty">{t('empty')}</p>}
  </section>
  const chatPanel = <section className="dsh-task-lens-chat">
    <p className="dsh-task-lens-note">{t('readonly')}</p>
    <div className="dsh-task-lens-shortcuts">{(['how', 'time', 'outcome', 'test'] as const).map(key => <button key={key} disabled={!snapshot.plan || busy} onClick={() => send(t(key))}>{t(key)}</button>)}</div>
    <div className="dsh-task-lens-messages" aria-live="polite">{chat.map((item, index) => <div key={index} className={`dsh-task-lens-message ${item.role}`}>
      <span>{item.content}{busy && index === chat.length - 1 && '…'}</span>{item.error && <button onClick={() => send(lastQuestion.current)}>{t('retry')}</button>}
    </div>)}</div>
    <form onSubmit={event => { event.preventDefault(); send() }}><textarea value={question} maxLength={4000} onChange={event => setQuestion(event.target.value)} placeholder={t('placeholder')} rows={2} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() } }} />
      {busy ? <button type="button" onClick={() => { controller.current?.abort(); setBusy(false) }}>{t('stop')}</button> : <button disabled={!question.trim() || !snapshot.plan}>{t('send')}</button>}
    </form>
    <button className="dsh-task-lens-branch" onClick={() => setConfirming(true)}>{t('branch')}</button>
  </section>
  return <div className={`dsh-task-lens ${floating ? 'is-floating' : ''}`}>
    <header draggable={floating} onDragStart={event => { event.dataTransfer.setData('application/x-dsh-task-lens', sessionId); event.dataTransfer.effectAllowed = 'copy'; setDragging(true) }} onDragEnd={() => setDragging(false)}>
      <strong>{t('title')}</strong><div>
      <button title={floating ? t('dock') : t('float')} onClick={floating ? onDock : onFloat}>{floating ? '▣' : '↗'}</button>
      <button title={t('close')} onClick={onClose}>×</button>
    </div></header>
    {dragging && <div className="dsh-task-lens-drag-note">{t('dragging')}</div>}
    <div className="dsh-task-lens-scroll">{progress}{chatPanel}</div>
    {confirming && <div className="dsh-task-lens-confirm" role="dialog" aria-modal="true"><p>{t('confirm')}</p>{branchError && <p role="alert">{t('branchFailed')}</p>}<button onClick={() => setConfirming(false)}>{t('cancel')}</button><button disabled={branchBusy} onClick={() => { setBranchError(false); setBranchBusy(true); void onBranch().then(() => setConfirming(false)).catch(() => setBranchError(true)).finally(() => setBranchBusy(false)) }}>{t('confirmBranch')}</button></div>}
  </div>
}
