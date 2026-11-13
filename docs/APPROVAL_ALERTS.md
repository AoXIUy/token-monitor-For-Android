# 审批提醒（Codex / Antigravity）

Token Monitor for Android 为**严格只读**客户端。开启可选的「审批提醒」后，当电脑端 Codex 或 Antigravity 发起需要确认的操作时，手机会收到只读通知栏提醒并在「总览」页展示提醒卡片；所有允许或拒绝决策始终在电脑端界面完成，手机端不拦截、不阻塞、不回写任何审批结果。

## 工作链路

1. **电脑端非阻塞 Hook**：
   - Codex：`PermissionRequest` 命令钩子。
   - Antigravity：`PreToolUse` 命令钩子（默认匹配 `run_command`，可在桌面端多设备同步设置中调整匹配规则）。
   - 触发时通过桌面端 / Agent 本地 IPC 向桌面转发桥发送只读提醒并立即结束等待（桌面本地 IPC 确认上限 `<= 500 ms`），随即直接返回桌面默认确认决策（Codex 输出空标准输出、Antigravity 输出 `{"decision":"ask"}`），保证终端立即弹出本地确认框，不依赖手机端是否在线。
2. **Hub 内存队列**：
   - `POST /api/approval-alerts`（仅电脑端 Agent / 桌面端写入）将提醒放入内存环形队列，固定 TTL 为 2 分钟，全局最多 32 条、单设备最多 8 条；设备断开连接或关闭开关时清理。不写入历史数据库。
   - `GET /api/approval-alerts`（Android 只读读取）返回未过期的提醒列表 `{ ok, enabled, alerts }`；不会向电脑端发送任何写入或决策状态。
3. **Android 只读接收与展示**：
   - 开关默认关闭，保存在 `ApprovalStore`（`SharedPreferences("approval-alerts")`）。开启后复用现有 5 秒 GET 轮询与前台刷新读取 `GET /api/approval-alerts`。
   - 对每条未提示过的提醒 ID，通过 `ApprovalStore.claim(destination, id)`（最多保留 128 条哈希）在 `session-approvals` 高优先级通知通道发送**一次性只读通知**（锁屏公开版本隐藏项目和命令细节；无“允许/拒绝”按钮，仅支持点击打开应用并切换到「总览」页）。
   - 「总览」页顶部卡片展示设备名、Codex / Antigravity 来源、工具、项目、命令与相对时间，提示「请前往电脑端确认」，支持在本地「收起」单条卡片。

## 安全与只读边界

- `ConnectionSpec` 将该功能严格限制在只读 `GET /api/approval-alerts`，`HubClient` 保持 100% GET-only（无 POST 与写入体），始终携带 `Authorization: Bearer <secret>` 且拒绝重定向。
- 切换 Hub、断开连接或停用开关会立即清除提醒快照、`ApprovalStore` 状态与相关通知。
- 任何电脑端 Hook、IPC、Hub 或网络异常都不会影响或延迟电脑端原本的权限确认弹窗。
