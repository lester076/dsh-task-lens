# 数据模型：Task Lens

## TaskPlanV1

| 字段 | 类型 | 约束 |
|---|---|---|
| version | `1` | 固定协议版本 |
| revision | 正整数 | 每次完整计划写入递增 |
| title | string | 1–200 字符 |
| tasks | Subtask[] | 2–30 项，顺序即展示顺序 |
| updatedAt | ISO string | 写入时间 |

## Subtask

| 字段 | 类型 | 约束 |
|---|---|---|
| id | string | 计划内唯一；1–64；建议 slug |
| title | string | trim 后 1–200 |
| description | string | ≤4000，可为空 |
| acceptance | string | ≤4000，可为空 |
| estimateMinutes | number \| null | 1–10080，明确为 AI 估算 |
| status | enum | pending / in_progress / completed / failed / blocked |
| note | string | ≤2000；失败原因或进展说明 |
| startedAt / completedAt | ISO string \| null | 按迁移设置 |

### 合法迁移

- pending → in_progress / blocked
- in_progress → completed / failed / blocked
- failed / blocked → in_progress（重试）
- completed → completed（幂等，仅允许相同状态）或 pending（显式修订）
- 不允许 pending → completed，防止未开始直接完成；不允许 completed → in_progress，先修订 pending。
- 任意迁移后最多一个 in_progress。
- `task_lens_write` 创建 revision；`task_lens_update` 不修改标题、说明和估算，只迁移状态/note。

### 派生值

`completedCount = tasks.filter(completed).length`；`percent = round(completedCount / total * 100)`。当前项取唯一 in_progress；否则取首个 failed/blocked；全完成时无当前项。

## FocusMessage

| 字段 | 类型 | 约束 |
|---|---|---|
| id | string | 小窗内唯一 |
| role | user / assistant | 固定枚举 |
| text | string | 用户 ≤4000；助手持久化 ≤32000 |
| status | completed / aborted / error | 用户消息总为 completed |
| createdAt | ISO string | 创建时间 |
| error | string? | 安全、可展示错误 |

## FocusThread

| 字段 | 类型 | 约束 |
|---|---|---|
| id | string | 不可预测 id |
| sessionId / taskId | string | 只属一个主 Session 与子任务 |
| planRevision | integer | 创建时计划版本 |
| title | string | 创建时子任务标题快照 |
| messages | FocusMessage[] | 每线程最多 100 条 |
| provider / model | string | 创建时选择的模型路由 |
| branchSessionId | string? | 显式提升成功后记录 |

每个 Session 最多 30 个 FocusThread；超出拒绝新建，已有历史不静默删除。

## Session 事件

- `task-lens/plan`：`{ plan: TaskPlanV1 }`；最后写入获胜。
- `task-lens/thread`：`{ thread: FocusThread }`；按 thread id 最后写入获胜。

这些事件是展示与插件咨询的事实源，不加入主代理普通用户/助手消息历史。未知版本或非法持久化数据在 API/投影边界拒绝，不能崩溃宿主。

## 状态与身份规则

所有外部身份来自宿主；任务 id 只在计划内唯一。快照不可原地修改。模型回答和任务写入使用独立并发通道。线程创建时捕获模型路由，刷新后仍可使用同一路由，用户明确重试时可重新解析当前路由。
