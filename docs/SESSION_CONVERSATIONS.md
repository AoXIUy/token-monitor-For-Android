# 在线会话正文

Android 1.8.0 开始支持从在线设备按需查看 **Antigravity 和 ChatGPT Codex** 会话的提问、回复、上下文及日志中的工具记录。进入「会话 → 查看完整详情 → 对话与上下文」，选择来源设备并点击「查看对话」。长对话可继续加载，刷新可读取最新日志；工具、上下文和可读思考摘要默认折叠，正文支持复制。

需要使用 [AoXIUy/token-monitor](https://github.com/AoXIUy/token-monitor) 中支持此扩展的 Node Hub 和来源设备采集端。在 Hub 和每台允许查询的设备上分别设置：

```env
TOKEN_MONITOR_SESSION_CONVERSATIONS=1
```

重启 Hub、常驻 Agent 或桌面应用后生效，连接参数和 shared secret 保持一致。一次性采集不提供服务；Cloudflare Worker 和旧 Hub 暂不支持此接口。桌面安装包通过系统环境变量启用，具体命令及源码启动方式见[来源端部署说明](https://github.com/AoXIUy/token-monitor/blob/main/docs/session-conversations.md)。独立 Agent 运行时需在 Agent 上开启。

该功能默认关闭；开启后，持有当前 Hub secret 的客户端可查询已上报会话正文。它与标题同步开关独立。设备只有在线并运行查询服务时才可读取，同一会话的多设备来源分别选择，不合并正文。

Antigravity 使用本机 `brain/<会话 ID>/.system_generated/logs/transcript_full.jsonl` 导出日志，包括 CLI、IDE 和 CC Switch 私有根目录；只有二进制数据而没有导出正文时显示不可用。Codex 使用当前或归档 rollout 日志，包括压缩日志；只有 Dots 用量而没有正文时也不会补造对话。可查询会话必须存在于所选设备的今日 / 本月统计快照，对话内容本身不受该周期裁剪。

App 仅在点击查看、刷新或继续加载时发起原生认证 GET；设备此时才读取对应日志，Hub 在内存中转发当前页，不把正文写入统计、磁盘或常规同步。退出详情、切换会话 / 设备 / Hub 或进入后台会清除当前显示并拒绝旧响应。正文按纯文本显示，不运行 HTML 或加载外部图片；凭据仍保存在原生 Keystore。

单个解码日志上限 64 MiB，每页最多 384 KiB / 40 个片段；长消息拆成续文，不丢弃尾部。日志在分页期间更新会要求刷新，避免混合不同版本。无法解析或尚未写完的记录会标记不完整。离线、来源端未开启、缺少日志、旧 Hub 和查询超时都有独立提示。
