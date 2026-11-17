# 实施计划：Task Lens

**分支**：`main` | **日期**：2026-11-17 | **规格**：[spec.md](spec.md)

## 摘要

实现一个 DSH Cordis 插件：宿主半注册结构化任务工具、Session 事件折叠、只读小窗 LLM 流与鉴权 HTTP 路由；浏览器半在输入区上方显示进度，并提供原生右栏/浮窗子任务问答与显式 fork。使用 TypeScript 严格模式与 React，优先复用 DSH 0.1.5-alpha.1 接口批次公开接缝。

## 技术环境

- **语言/版本**：TypeScript 5.9+，Node.js 24+，ESM。
- **主要依赖**：`@deepseek-ai/dsh-*`（peer/dev）、Cordis、React 18；tsdown 构建。
- **存储**：DSH Session 事件（计划与 FocusThread）；无外部数据库。
- **测试**：Vitest + jsdom；纯状态机、HTTP 契约、LLM 流、React 交互、打包烟测。
- **目标平台**：DSH Web 0.1.5-alpha.1 接口批次与同源桌面 Web 容器。
- **性能目标**：本地状态提交后 <1 秒可见；UI 更新 O(任务数)，上限 30。
- **约束**：请求 64 KiB；上下文 12 条/24k 字符；线程 100 条/32k 每答；无遥测。
- **范围**：单 npm 包，宿主与浏览器两个入口。

## 宪章检查

- 状态真实：结构化事件与完成计数，符合。
- 宿主优先：tools/session/llm/webServer/connection/slots/sidebarRight/sessions，符合。
- 主对话隔离：只读咨询与显式 fork，符合。
- 测试先行：状态机/API/组件测试先于对应实现，符合。
- 简单有界：所有集合、文本、上下文和正文有上限，符合。
- 安全与质量门：鉴权、类型检查、构建、打包和文档，符合。

## 文档结构

```text
specs/001-task-lens/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-api.md
│   └── model-tools.md
└── tasks.md
```

## 源码结构

```text
src/
├── protocol.ts              # 共享类型、常量、校验与纯状态机
├── host/
│   ├── index.ts             # Cordis 装载与释放
│   ├── tools.ts             # task_lens_write/update
│   ├── store.ts             # Session 事件与快照
│   ├── routes.ts            # 鉴权 GET/POST
│   └── advisor.ts           # 有界上下文与 LLM NDJSON 流
└── client/
    ├── index.ts             # 字典、slots、资源与右栏注册
    ├── store.ts             # 同源状态与请求 observable
    ├── ProgressDock.tsx     # 进度条与任务列表
    ├── FocusPanel.tsx       # 问答、浮窗与提升入口
    ├── branch.ts            # 确认/fork/拖放纯决策与调用
    ├── locales.ts           # 中英文文案
    └── styles.ts            # 有作用域样式
tests/
├── plan.test.ts
├── routes.test.ts
├── advisor.test.ts
├── tools.test.ts
├── client.test.tsx
└── package.test.ts
```

**结构决策**：单包降低安装与版本一致性成本；宿主/浏览器只通过共享协议类型耦合，不共享运行时服务。

## 实施顺序

1. 固化协议与测试；实现计划状态机。
2. 接入模型工具与 Session 事件，测试无 Agent 和非法迁移。
3. 实现 Session 恢复、鉴权路由与有界咨询流，测试隔离/取消/错误。
4. 实现浏览器 observable、进度条、右栏/浮窗和问答。
5. 接入显式 fork 和拖放确认，测试取消/失败/幂等。
6. 完成文档、构建、打包和真实 DSH 验证记录。

## 风险处理

- 对预稳定 DSH 类型使用窄适配接口，并在 package tests 固定关键注册名。
- 小窗更新先校验 Session/task/revision 和请求代次，防止串写。
- LLM 文本与状态只在提交点持久化；断线保存 aborted，不宣称完成。
- 若真实宿主的分支 API 与文档不同，只修改 branch 适配层并补集成测试，不引入私有复制逻辑。
