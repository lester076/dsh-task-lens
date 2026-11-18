# 任务：Task Lens

**输入**：`specs/001-task-lens/` 全部设计文档。  
**组织**：按可独立交付的用户故事排列；测试先于实现。

> **实现路径**：初稿中的文件路径是规划时的拆分建议；实际实现采用 `src/server/`、`src/shared/`、`src/client/` 和 `test/` 布局，功能与验收目标不变。勾选表示该任务的实现或离线验证已完成，不代表已通过真实 DSH 端到端验收。

## Phase 1：项目与规格

- [x] T001 初始化 GitHub 仓库与 npm/TypeScript 结构。
- [x] T002 [P] 完成 PRD、宪章、调研与同类插件检索。
- [x] T003 [P] 完成 spec、plan、data-model、contracts、quickstart。
- [x] T004 配置 tsdown、Vitest、严格 TypeScript 与打包白名单。

## Phase 2：共享基础

- [x] T005 [P] 在 `test/plan-store.test.ts` 编写计划校验、状态迁移、百分比和恢复测试。
- [x] T006 [P] 在 `test/http.test.ts` 编写鉴权、Session 范围、正文上限、方法与非法输入测试。
- [x] T007 在 `src/shared/types.ts`、`src/server/plan-store.ts` 实现有界类型、校验、计划状态机和快照。
- [x] T008 在 `src/server/events.ts`、`src/server/plan-store.ts` 实现 Session 事件折叠、线程限制与投影恢复。

## Phase 3：US1 真实任务进度（P1，MVP）

- [x] T009 [P] [US1] 在 `test/plan-store.test.ts` 编写模型计划写入、无 Agent、非法迁移与事件测试。
- [x] T010 [US1] 在 `src/index.ts` 实现 `task_lens_write` 模型工具并接入 Host 插件。
- [x] T011 [P] [US1] 增加 React 客户端组件测试：无计划、50%、当前项、文字状态和完成状态。
- [x] T012 [US1] 实现 `src/client/TaskLens.tsx`、进度视图、样式和中英文。
- [x] T013 [US1] 在 `src/client/index.tsx` 注册 `conversation.input.dock`，使用 Cordis 生命周期注册。

**检查点**：仅交付本阶段也能看见可信任务进度（真实宿主验收见 T025）。

## Phase 4：US2 子任务小窗问答（P2）

- [x] T014 [P] [US2] 在 `test/adviser.test.ts`、`test/host-adviser.test.ts` 和 `test/http.test.ts` 编写上下文上限、无工具、流式、取消、失败、revision 和串写测试。
- [x] T015 [US2] 实现 `src/server/host-adviser.ts` 和 `src/server/http.ts` 的 NDJSON 咨询接口。
- [x] T016 [P] [US2] 增加客户端交互测试：四快捷问题、自由提问、停止/重试和跨会话历史隔离。
- [x] T017 [US2] 实现 `TaskLens.tsx` 与 `src/client/api.ts` 流式请求，注册右栏资源和浮动面板。

**检查点**：小窗不改变主会话，且可独立咨询与恢复（真实宿主验收见 T025）。

## Phase 5：US3 显式分支（P3）

- [x] T018 [P] [US3] 增加提升确认、模拟拖放确认、取消、失败和防重复分支交互测试。
- [x] T019 [US3] 在 `src/client/index.tsx` 与 `TaskLens.tsx` 实现按钮、拖放目标和原生 fork/open 接线。
- [x] T020 [US3] 组件测试已验证拖拽确认、取消、失败与防重复；真实 `0.2.2-rc.3` 宿主 + Edge 中已验证原生浮动（把“任务透镜”标签拖出右栏）、停靠、关闭，拖到会话列表先出现确认，确认后宿主创建分支 `…(2)` 并在主区打开（`ctx.sessions.fork` → `ctx.uiWorkspace.openSession(child)`；`SessionTarget` 是会话 id 本身，不是对象）。

## Phase 6：质量与交付

- [x] T021 [P] 编写包清单、公开接缝、无遥测和隐私检查。
- [x] T022 完成 README、安装、权限、已知限制和 Spec Kit 追溯。
- [x] T023 执行测试、类型检查、构建、`npm pack --dry-run` 并修复。
- [x] T024 执行规格一致性检查，提交并推送 GitHub main。
- [x] T025 在桌面版 `0.2.2-rc.3` 宿主、真实 `~/.dsh` 凭据与真实模型（`easy-cliproxyapi` / `wb-deepseek-v4.1-flash-cn`）上完成 quickstart 1–8 步：模型真实调用 `task_lens_write` 建立 4 步计划、面板显示状态与当前步骤、刷新后从日志恢复、模型调用 `task_lens_update` 后同步为 25%、只读问答返回带计划上下文的真实回答、`/state` 返回 200/404/405、标签拖出右栏得到原生浮窗、拖到会话列表确认后成功建分支并打开。仍未覆盖：桌面 profile 内的同一份安装需重启 Electron 应用后由用户点开；时长估计的准确性。

## 0.2.2 移植要点（T026）

- [x] T026 从 `0.1.5-alpha.1` 迁到 `0.2.2-rc.3`：删除 `plan-store`（计划唯一权威是会话日志），新增 `src/server/host-api.ts`（本地声明的宿主类型，零运行依赖）、`src/server/plan.ts`（纯函数 + zod schema）、`src/server/tools.ts`（`ToolSpec` → 宿主 `ToolDefinition`）；计划经 `output.presentationMeta` 写成 `tool/result` 的持久 `meta`，由 `taskLens` 投影折叠恢复；模型路由用宿主独有投影 `taskLensRoute` 折叠 `request/header`；咨询改为单条 user 消息（`GenerateOptions.system` 在该路线上被适配器丢弃，实测无效），`ctx.uiWorkspace.openSession(sessionId)` 传 id 而非对象。

## 计划策略（T027）

- [x] T027 修「工具注册了但模型不用」：真机复测发现，只声明 `task_lens_write` 时，模型在 ~180 个工具的环境里直接开工（会话 `session-3e38ed2a` 里 `request/header` 含两个工具声明，14 步全程无 `task_lens_*` 调用，进度条因此永不出现）。新增 `src/server/prompt.ts`：通过宿主 `ctx.systemPrompt.section()` 在 `PLAN_POLICY` 位置注入计划策略（多步任务先建计划再动手、要求「只要计划」时写完即停、目标有歧义也要先带假设建计划、每步真实变化才 `task_lens_update`、单步请求不用），并把 `inject` 扩到 `systemPrompt`；`WRITE_DESCRIPTION` 补「用户要计划时先写计划再碰文件」。真实模型复测（同宿主同凭据）：明确的多步任务当场建计划、入口显示 `… 0%`、面板 8 步齐全；有歧义的静态页面请求先问一次，回答后立刻建计划并由入口显示 `给 Stouch 静态页面加暗色模式（跟随系统 + 手动切换）0%`。

## 依赖与并行

Phase 1–2 阻塞所有故事。US1 是 MVP；US2 依赖共享存储与协议；US3 依赖 US2 小窗。测试文件与互不重叠的实现可并行。最终质量门必须在最新代码上执行。
