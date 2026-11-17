# 快速验证：Task Lens

## 前置条件

Node.js 20+、npm、已配置模型且使用 0.1.5-alpha.1 接口批次的 DSH。真实 DSH 验收需要可用的 DeepSeek/其他已配置 provider；单元和契约测试不需要 API key。

## 本地开发

```sh
npm install
npm test
npm run typecheck
npm run build
npm pack --dry-run
dsh plugin --profile web add "link:$PWD"
```

Windows PowerShell 本地安装：

```powershell
dsh plugin --profile web add "link:$((Get-Location).Path)"
```

重启 DSH Web，打开一个会话并提交明确的多步骤任务，例如“设计并实现一个带测试的三模块示例项目”。

## 验收路径

1. 观察输入框上方：出现计划、completed/total、当前子任务与百分比。
2. 展开计划，点击进行中任务；选择“怎么做”“预计多久”“预期效果”“怎么测试”，观察流式回复。
3. 回复期间查看主对话：主任务继续，任务 revision 和主消息未被小窗改写。
4. 停止回复并重试；关闭再打开小窗，刷新页面，历史与任务状态应恢复。
5. 将面板浮动再停靠；确认没有新分支。
6. 点击“提升为分支”或拖到左侧会话列表；释放后先出现确认。取消无分支，确认后只创建一个原生分支。
7. 模拟失败任务，确认失败不计完成，原因可见；模型重试后状态恢复。

## 自动化覆盖边界

自动化测试验证状态机、权限、上下文限制、流式错误与组件行为。若没有真实 DSH/API key，不得把测试结果描述为真实模型或完整浏览器端到端验收。
