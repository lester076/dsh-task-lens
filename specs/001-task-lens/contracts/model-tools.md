# 模型工具契约：Task Lens

## task_lens_write

用于多步骤工作开始前创建或完整替换计划。一次性提交完整列表，短任务不使用。

参数：`title`（必填）、`tasks`（必填，2–30）。每项：`id`、`title`、可选 `description`、`acceptance`、`estimateMinutes`、`status`（仅 pending/in_progress）、`note`。首项通常 in_progress。

返回：`{ revision, tasks, counts: { pending, inProgress, completed, failed, blocked }, percent }`。

拒绝：重复/非法 id、空或超长字段、多个进行中、completed/failed 作为初始状态、无 Agent。

## task_lens_update

参数：`taskId`（必填）、`status`（必填）、可选 `note`。更新当前 revision 的一项，其他字段不变。

返回与 write 相同的规范快照。非法迁移、未知 id、并发导致多个进行中、无 Agent 均失败。工具结果只呈现任务事实，不返回 HTML、UI props 或本机路径。

## 模型指令

对可拆为多个实质步骤的长任务，在动手前写计划；开始某项时标记 in_progress，完成并验证后立即 completed，失败时 failed 并写原因。不得用百分比描述主观感受，不得把未验证工作标为完成。计划范围变化时完整替换并保留可复用 task id。不要在每次流式文字后更新计划。
