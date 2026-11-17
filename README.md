# dsh-task-lens

DeepSeek Harness 插件：AI 在执行长任务前建立结构化计划，在会话中显示真实进度，并提供不干扰主任务的只读问答小窗。

## 功能

- **AI 任务拆解**：`task_lens_write` 记录 2–30 个有序步骤，包括预期效果、测试方法和可选粗略估计。
- **实时进度**：整体百分比、当前步骤及 `待开始 / 进行中 / 已完成 / 失败` 状态；进度仅由模型工具产生的 Session 事件驱动，不解析流式文本。
- **只读小窗**：右栏或原生浮窗中询问“怎么做、预计多久、预期效果、怎么测试”，也可自由提问。回答使用独立的无工具 `ctx.llm.stream()` 请求，不启动主代理轮次，也不修改会话。
- **停止与重试**：停止仅取消当前咨询；失败可重试。
- **显式分支**：点击“转为会话分支”，或把浮窗标题拖到会话项目栏，确认后通过 DSH Session Controller 创建包含源会话历史的分支并打开。取消不会创建分支。
- **可恢复**：完整计划作为 Session 投影保存，恢复和 fork 时自动继承。

## 安装

在支持 DSH bundle patch 的配置中引用本包：

```yaml
- insert:
    - id: dsh-task-lens
      name: dsh-task-lens
```

本仓库的 `cordis.patch.yml` 提供相同配置。Web 客户端入口由 `package.json` 的 `dsh.client` 声明发现。目标接口为 DSH `0.1.5-alpha.1` 批次；DSH API 尚未稳定，升级宿主后请重新验收。

## 使用

1. 在主会话中提出一个多步骤任务。AI 会调用计划工具；不需要手工编写 JSON。
2. 输入区显示整体进度；点击可打开右栏。
3. 右栏右上角可将小窗浮动或收回右栏。
4. 小窗问答不会向主会话发送消息。需要继续讨论或独立执行时，显式创建分支。

> 小窗回答的预计时间只是估计，不代表精确 ETA。插件不会自动并行执行子任务，也不会通过问答替用户修改代码。

## 开发与验证

```bash
npm install --legacy-peer-deps
npm run check
npm pack --dry-run
```

Node.js 20+。`npm run check` 包含严格 TypeScript 检查、Vitest 测试和 Host/Web 双入口构建。

当前仓库环境没有 `dsh` 命令，因此真实 DSH 中模型工具调用、原生拖放和浏览器外观仍需在目标宿主进行端到端验收。纯状态机、HTTP 鉴权与流式协议、问答上下文边界、无工具模型请求和构建产物可以在本地验证。

## 文档

- [产品需求](docs/PRD.md)
- [规格与实施任务](specs/001-task-lens/tasks.md)
- [HTTP 接口](specs/001-task-lens/contracts/http-api.md)
- [模型工具接口](specs/001-task-lens/contracts/model-tools.md)

## License

MIT
