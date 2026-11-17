# Phase 0 调研：Task Lens

**日期**：2026-11-17  
**依据**：DSH 官方源码 `deepseek-ai/deepseek-harness`（0.2.2-rc.3 文档）、awesome-dsh-plugin 目录、相邻插件源码。

## 决策 1：独立插件而非 fork 相邻项目

**决定**：新建 `dsh-task-lens`。  
**理由**：`dsh-task-progress` 面向脚本/后台 job 文件上报；`dsh-codex-side` 面向分支侧聊；均不包含本规格完整组合。  
**已考虑替代**：扩展 `dsh-task-progress`，但其生产者协议与 AI 计划/问答的目标不同，合并会扩大无关范围。

## 决策 2：Session 事件作为任务事实源

**决定**：模型工具调用 `exec.agent.session.append()` 持久化完整计划，Session projection 和宿主快照均由事件折叠。  
**理由**：重启、回放、会话隔离和 UI 一致性由宿主提供；不写平行的 JSON 真相。  
**替代**：工作区 JSONL 易实现但无法自然表达 Session 权限与回放；放弃。

## 决策 3：专用工具，不推断 `todo_write`

**决定**：提供 `task_lens_write` 与 `task_lens_update`。  
**理由**：原生 todo 只有 content/status，缺少稳定 task id、说明、验收、失败原因、revision 和估算。  
**替代**：解析自然语言或复用 todo 文本不可靠；放弃。

## 决策 4：进度 UI 使用公开 slot

**决定**：注册到 `conversation.input.dock`，右栏 tab 注册到 `sidebarRightTabs` 与 `sidebar.right.pane.tab`。  
**理由**：均为官方公开接缝，支持追加、释放和原生浮动。  
**替代**：DOM 注入易随宿主更新失效；放弃。

## 决策 5：小窗是只读咨询，不是隐藏分支

**决定**：宿主通过 `ctx.llm.stream()` 发起独立模型调用，读取有界会话摘要；不写主代理消息，不提供工具。历史仅保存在 Host 进程内的按 Session 隔离有界缓冲区。  
**理由**：满足“不新对话”的字面交互与主上下文隔离；MVP 不将问答写入主会话或 Session 事件。  
**限制**：这是独立 LLM 咨询线程，不是同一 Agent 的隐藏轮次；问答历史不跨重启恢复，UI 必须清楚说明只读。  
**替代**：主会话插话会改变主任务；自动 fork 违反默认不新建分支；均放弃。

## 决策 6：原生 fork 与显式确认

**决定**：浏览器调用 `ctx.uiWorkspace.forkSession()` 或 `ctx.sessions.fork()`，创建后 `openSession()`。拖拽仅进入确认。  
**理由**：复用权限、继承、Workspace 展示与错误语义。  
**替代**：自造会话复制会绕过权限与格式迁移；放弃。

## 决策 7：HTTP 同源接口与事件恢复

**决定**：`GET /__dsh/task-lens/state?session=` 读取折叠快照；`POST /__dsh/task-lens/ask` 建立有界咨询请求；两者先调用 `connection.requestRejection`。  
**理由**：与当前 DSH 插件兼容，不引入额外端口或凭据。计划首次加载从 Session 事件恢复；状态接口服务小窗数据。  
**替代**：自定义 WebSocket 无必要；MVP 用 NDJSON 流式响应，减少基础设施。

## 技术限制

- DSH 公开 API 处于预稳定阶段；本实现以实际安装的 `@deepseek-ai/dsh-*` 0.1.5-alpha.1 接口批次为验证目标。
- 原生右栏 `openTab` 的公开 options 不直接接受 `destination: float`；本实现使用 `sidebarRight.float(tabId)` 与 `dock(panelId)` 切换浮动和停靠。
- fork 要求源会话可迁移且存在可 fork 的完成点；界面透传失败而不绕过限制。
- 当前环境未预装 `dsh` 命令，也没有模型凭据；真实模型/浏览器验收需后续在已配置 DSH 环境执行。
