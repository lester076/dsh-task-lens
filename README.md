# dsh-task-lens

DeepSeek Harness 插件：AI 在执行长任务前建立结构化计划，在会话中显示真实进度，并提供不干扰主任务的只读问答小窗。

面向 DSH **0.2.2-rc.3** 桌面/Web 容器，已在真实安装、真实 profile、真实模型凭据下端到端验收（见「真实验收」一节）。

## 功能

- **AI 任务拆解**：`task_lens_write` 记录 2–30 个有序步骤，包含预期效果、测试方法和可选粗略估计。
- **实时进度**：整体百分比、当前步骤及 `待开始 / 进行中 / 已完成 / 失败` 状态；进度只来自模型工具调用，不解析流式文本，也不推测完成。
- **只读小窗**：右栏标签页里询问“怎么做、预计多久、预期效果、怎么测试”，也可自由提问。回答走一次独立的、不挂工具的 `ctx.llm.stream()` 请求，不开启主代理轮次，不追加任何消息，也不会修改计划。
- **停止与重试**：停止只取消当前这次咨询；失败可重试。
- **显式分支**：点击“转为会话分支”，或把面板顶部拖到会话项目栏，先弹出确认；确认后创建继承源会话历史的分支并打开，取消不创建。
- **可恢复**：计划随会话日志持久化，刷新页面、换客户端、fork 都会继承；问答上下文只存在于当前 Host 进程内，按会话隔离，不跨重启恢复。

## 安装

插件是**零 `@deepseek-ai/*` 运行依赖**的独立 bundle：真实 profile 的 `node_modules` 解析不到宿主包，所以 zod 被内联进 Host bundle，客户端 bundle 只 `require` 宿主的 `react` 与 `react/jsx-runtime`。

1. 把包放进目标 profile（示例为 `desktop`）：

   ```powershell
   $dest = "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-task-lens"
   New-Item -ItemType Directory -Force -Path $dest | Out-Null
   Copy-Item -Recurse -Force .\lib "$dest\lib"
   Copy-Item -Force .\package.json,.\cordis.patch.yml .\README.md,.\LICENSE $dest
   ```

2. 在该 profile 的 `package.json` 里登记依赖与 bundle 层（`dsh.profile.bundles` 的顺序即 patch 层顺序）：

   ```json
   {
     "dependencies": { "dsh-task-lens": "file:E:/DSHCHA" },
     "dsh": { "profile": { "bundles": [ "...", "dsh-task-lens" ] } }
   }
   ```

3. 重启 DSH（桌面版必须重启 Electron 主进程，插件只在启动时挂载）。

本仓库的 `cordis.patch.yml` 就是第 2 步需要的 bundle 层：

```yaml
- insert:
    - id: dsh-task-lens
      name: dsh-task-lens
```

Web 客户端入口由 `package.json` 的 `dsh.client` 声明发现。

## 使用

1. 在主会话提出一个多步骤任务，AI 会自己调用计划工具；不需要手写 JSON。
2. 输入框上方的进度条显示任务名与完成度，点击即可打开右栏“任务透镜”标签；右栏的关闭、分栏、全屏皆沿用宿主自带控件。
3. 想让它变成独立小窗时，把“任务透镜”标签拖出右栏，宿主会给出原生浮动面板（插件不做自绘浮层）。
4. 浮动面板顶部可拖到会话项目栏，或点“转为会话分支”，确认后创建分支。
5. 小窗问答不会向主会话发送消息。

> 小窗给出的时长只是估计，不是精确 ETA。插件不会自动并行执行子任务，也不会通过问答替你改代码。

## 真实验收

环境：桌面版 DSH `0.2.2-rc.3`（`E:\dsh\DeepSeek Harness.exe`），真实 `~/.dsh` 凭据，provider `easy-cliproxyapi` / 模型 `wb-deepseek-v4.1-flash-cn`，用 `dsh --profile task-lens-verify --no-open --port 3399` 启动宿主，Edge + Playwright 驱动。

已实际发生并通过：

| 验收项 | 证据 |
| --- | --- |
| 工具注册与模型调用 | 真实一轮对话里模型调用 `task_lens_write`，4 步计划入库 |
| 进度显示 | 输入框入口显示“给静态页面加暗色模式 0%”，打开右栏后 4 步状态与当前步骤说明齐全 |
| 计划持久化 | 刷新/重开会话后计划与状态从会话日志恢复（无内存缓存） |
| 进度推进 | 模型按真实结果调用 `task_lens_update`，面板与入口变为 25%、第 1 步已完成、第 2 步进行中 |
| 只读问答 | 点“怎么做”得到带本计划上下文的真实回答（含当前步骤与 10–15 分钟估计），主会话无新增消息 |
| 只读状态查询 | `GET /__dsh/task-lens/state?session=…` 经 Connection 信任门返回 200 快照；未知会话 404；错误方法 405 |
| 浮动 | 把“任务透镜”标签拖出右栏后出现宿主原生浮窗，插件面板在其中正常渲染 |
| 分支 | 把面板顶部拖到会话列表 → 出现确认 → 确认后生成 “…(2)” 分支并在主区打开，历史与计划继承 |

已知未覆盖/限制：

- 桌面版 profile 的插件安装只能由 Electron 应用启动时加载，安装后需重启桌面应用；本轮真实模型验收在同一个 `0.2.2-rc.3` 宿主、同一套凭据的独立 profile 上完成。
- 时长是模型估计，不是精确 ETA；不做自动多代理执行。
- 只读问答的注入防护是“单条用户消息内声明规则”，不是多方隔离的沙箱；它不执行任何工具，因此不会改动会话。

## 开发与验证

```bash
npm install
npm run check          # 严格 TypeScript + Vitest + Host/Web 双入口构建
npm pack --dry-run
```

Node.js 20+。产物检查：`lib/index.js` 不得出现 `@deepseek-ai`（zod 已内联），`lib/client.js` 只允许 `require("react")` 与 `require("react/jsx-runtime")`。

## 文档

- [产品需求](docs/PRD.md)
- [规格与实施任务](specs/001-task-lens/tasks.md)
- [快速验证](specs/001-task-lens/quickstart.md)
- [HTTP 接口](specs/001-task-lens/contracts/http-api.md)
- [模型工具接口](specs/001-task-lens/contracts/model-tools.md)

## License

MIT
