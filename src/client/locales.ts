export const zh = {
  title: '任务透镜', open: '打开任务问答', branch: '转为会话分支',
  empty: '长任务开始后，这里会显示 AI 的计划和真实进度。', current: '当前', ask: '提问', placeholder: '只读询问当前任务…', send: '发送', stop: '停止', retry: '重试',
  how: '怎么做', time: '预计多久', outcome: '预期效果', test: '怎么测试',
  readonly: '只读咨询，不修改主任务。', dragging: '拖到会话项目栏可转为分支',
  confirm: '将创建包含源会话历史的新分支。原会话不受影响。', cancel: '取消', confirmBranch: '创建分支', branchFailed: '分支创建失败',
  pending: '待开始', in_progress: '进行中', completed: '已完成', failed: '失败', completedPlan: '全部完成',
}
export const en = {
  title: 'Task Lens', open: 'Open task questions', branch: 'Create session branch',
  empty: 'When a long task starts, the AI plan and real progress appear here.', current: 'Current', ask: 'Ask', placeholder: 'Ask about this task without changing it…', send: 'Send', stop: 'Stop', retry: 'Retry',
  how: 'How?', time: 'How long?', outcome: 'Expected result', test: 'How to test',
  readonly: 'Read-only advice. Your main task is not changed.', dragging: 'Drag to the session list to create a branch',
  confirm: 'Create a branch with the source session history. The original is unchanged.', cancel: 'Cancel', confirmBranch: 'Create branch', branchFailed: 'Could not create the branch',
  pending: 'Pending', in_progress: 'In progress', completed: 'Completed', failed: 'Failed', completedPlan: 'All complete',
}
export type LocaleKey = keyof typeof zh
