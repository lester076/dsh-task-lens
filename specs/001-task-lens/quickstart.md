# 快速验证：Task Lens

## 前置条件

Node.js 20+、npm，以及 **DSH 0.2.2-rc.3**（桌面版或 Web 容器）。真实验收需要已配置的 provider 与凭据（本仓库验收用的是 `easy-cliproxyapi` / `wb-deepseek-v4.1-flash-cn`）；单元和契约测试不需要 API key。

## 本地开发

```sh
npm install
npm run check          # typecheck + vitest + 双入口构建
npm pack --dry-run
```

## 装进真实 profile

插件不能 `import` 任何 `@deepseek-ai/*`：真实 profile 的 `node_modules` 解析不到宿主包，因此 zod 内联、客户端只 `require` 宿主的 `react` 与 `react/jsx-runtime`。

```powershell
$profile = "$env:USERPROFILE\.dsh\profiles\task-lens-verify"
New-Item -ItemType Directory -Force -Path "$profile\node_modules\dsh-task-lens" | Out-Null
Copy-Item -Recurse -Force .\lib "$profile\node_modules\dsh-task-lens\lib"
Copy-Item -Force .\package.json,.\cordis.patch.yml,.\README.md,.\LICENSE "$profile\node_modules\dsh-task-lens"
```

在该 profile 的 `package.json` 中把包加入依赖，并把 `dsh-task-lens` 追加到 `dsh.profile.bundles`（bundle 层顺序即 patch 应用顺序），然后用 `--dump-config` 确认组合结果里出现这个条目：

```powershell
dsh --profile task-lens-verify --dump-config | Select-String dsh-task-lens
```

桌面 profile 只能由 Electron 应用启动，安装后需重启桌面应用。

## 启动验收宿主

```powershell
dsh --profile task-lens-verify --no-open --port 3399
```

终端会打印带 token 的地址（`http://127.0.0.1:3399/?token=…`），用浏览器打开即可；自动化脚本用 `playwright-core` 驱动系统 Edge。

## 验收路径（均已在本机真实宿主上走过）

1. 提交一个多步骤任务，直接用自己的话即可（例如“帮我给静态页面加暗色模式，先列个计划”）。模型应主动调用 `task_lens_write`，输入框上方出现「任务名 0%」。
2. 点击入口打开右栏“任务透镜”：整体完成度、当前步骤、每步状态（待开始/进行中/已完成/失败）与当前步骤的粗略估计都在。
3. 刷新页面或换一个客户端再打开同一会话：计划与状态应从会话日志恢复（插件没有内存里的计划副本）。
4. 让模型如实记录进展（“第 1 步已完成，现在开始第 2 步”）：面板与入口应同步变成 25%，第 1 步已完成、第 2 步进行中。
5. 点“怎么做/预计多久/预期效果/怎么测试”或自由提问：应得到带本计划上下文的真实回答，且主会话不应出现新消息、计划不应变化。
6. 把“任务透镜”标签拖出右栏：出现宿主原生浮窗，面板在其中正常工作；也可以继续用右栏自带的分栏/全屏/关闭。
7. 把面板顶部拖到会话项目栏，或点“转为会话分支”：先出现确认；取消不建分支；确认后创建一个标题递增（如 `…(1)`）的分支并在主区打开，历史与计划继承。
8. 只读状态接口：浏览器上下文内 `fetch('/__dsh/task-lens/state?session=<id>')` 返回 200 快照，未知会话 404，错误方法 405。

## 「看不见进度条」怎么排查

进度条不是常驻控件：它只在模型真的调用 `task_lens_write` 之后出现。按顺序查：

1. **工具是否注册**：会话日志 `session.v4.jsonl.zstd` 的 `request/header` 事件里应能找到 `task_lens_write`、`task_lens_update`；没有就是宿主没加载插件（桌面版需重启 Electron 应用）。
2. **策略是否注入**：同一会话的 `system/message` 事件里应含 `user-visible task-progress panel`（`PLAN_POLICY` 段）。缺了它模型很可能在有上百个工具的环境里直接开工。
3. **模型是否被允许先计划**：若请求的目标本身有歧义（工作区里有多个候选文件），模型可能先提问一次；回答后应立刻建计划。目标明确的多步任务则应当场建计划。

2026-11-18 用真实模型（`easy-cliproxyapi` / `wb-deepseek-v4.1-flash-cn`）复测：目标明确的多步任务 → 当场 `task_lens_write`，入口显示 `… 0%`、面板 8 步齐全；目标有歧义 → 先问一次，点选项并提交后立刻 `task_lens_write`，入口显示「给 Stouch 静态页面加暗色模式（跟随系统 + 手动切换）0%」。

## 自动化覆盖边界

`npm run check` 覆盖状态机、投影折叠（含 `tool/result` meta 恢复）、HTTP 鉴权与流式协议、问答上下文边界、无工具模型请求、计划策略段的注册与内容、React 组件交互与打包产物约束。

真实宿主验收使用桌面版 `0.2.2-rc.3`、真实 `~/.dsh` 凭据、独立 profile `task-lens-verify` 与系统 Edge，上述 1–8 步全部真实执行：模型真的调用了两个工具，顾问回答真的来自真实模型，分支真的由宿主 Session Controller 创建并打开。仍未覆盖的是桌面 profile 内的同一份安装（需重启 Electron 应用后由用户点开），以及时长估计的准确性——它是模型估计，不是 ETA。
