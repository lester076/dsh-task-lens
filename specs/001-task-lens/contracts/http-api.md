# HTTP 契约：Task Lens

所有路由为同源、精确路径。任何处理前先执行 DSH `connection.requestRejection(req)`；拒绝时返回其状态且无业务数据。响应 `cache-control: no-store`，JSON/NDJSON 均 UTF-8。请求体最大 65,536 字节。

> 本文件描述当前 0.1.0 实现。早期草稿中的线程 ID、taskId、revision 和问答事件持久化不属于当前接口。

## GET /__dsh/task-lens/state?session=<sessionId>

只返回一个 Session 的当前任务快照，不接受跨会话列表。进度 UI 主要使用原生 `taskLens` Session projection；此接口为插件状态读取接缝。

**200**：

```json
{
  "plan": {
    "title": "构建插件",
    "status": "active",
    "createdAt": 1770000000000,
    "updatedAt": 1770000000000,
    "steps": []
  },
  "percent": 0,
  "current": { "id": "step-1", "title": "实现", "status": "in_progress" }
}
```

**400**：缺少 sessionId。**401/403**：宿主鉴权结果。**404**：该 Session 没有计划。**405**：非 GET，Allow 为 GET。

## POST /__dsh/task-lens/ask

```json
{
  "sessionId": "session-id",
  "question": "怎么测试这个子任务？"
}
```

- question trim 后 1–4000 字符；请求正文仍受 64 KiB 上限约束。
- 只接受上述两个字段；当前 Session 必须存在计划、活跃 Agent 和已选模型，否则通过 NDJSON error 事件返回可重试错误。
- 每个 Session 的问答历史保存在 Host 进程内的有界缓冲区，最多 100 条且总计最多 24,000 字符；不写入主会话或 Session 事件，不跨 Host 重启恢复。
- 助手回复以 NDJSON 流式返回；客户端断线中止本次模型调用，停止的回答不保存为已完成答案。

**200** `application/x-ndjson`，每行一个事件：

```json
{"type":"delta","text":"先验证..."}
{"type":"done","answer":"先验证……"}
```

失败时：

```json
{"type":"error","error":"模型回答失败，请重试"}
```

**400**：JSON/字段非法或问题超长/为空。**401/403**：宿主鉴权结果。**404**：Session 没有计划。**405**：Allow POST。

## 安全与隔离

- 响应不包含本机路径、凭据、provider 配置或工具结果原文。
- 模型上下文只含计划快照、近期用户/助手文本和本次问题；不提供工具。
- 不调用主 Agent prompt/inject/cancel，不创建分支。
- 分支不经过此插件 HTTP API，使用 DSH 浏览器原生 Session 服务。
