# 上游 v0.89 / v0.90 主线 Android 增量适配

2026-11-10 从 [Javis603/token-monitor 的 main 提交 `82e0051`](https://github.com/Javis603/token-monitor/commit/82e00510cf93fc61415571ccc04d4ab58e68202f) 同步，源码版本 **0.90.0**，包含 v0.90 标签之后的缓存命中率与会话明细提交。上次同步点为 `eb8cf9d8de2b243deb3f00658ec75440e7dfe880`（0.88.0），应用基线为 **1.6.0 / versionCode 17**。本次适配随 Android **1.7.0 / versionCode 18** 发布，更新内容见 [发布说明](releases/1.7.0.md)。

## 已适配

| 主线变化 | Android 行为 |
| --- | --- |
| Hark 账户额度（#1431） | 读取现有 Hub 中的 Hark provider，显示 Daily / Monthly / 功能额度的已用量与上限。超额读数保留绝对值，条宽最多 100%；Top-up 是独立的 USD 消费，无百分比进度条。没有明确周期时长时不推算自然月，空窗口不解释为零额度或无限额。微件加入 Hark 静态名称。Hark 没有用量账本，不创建工具或会话数据。 |
| Qoder 个人和团队积分（#1301） | Credits 与 Team credits 各自显示真实上限、绝对数量和重置时间，保持独立历史窗口；不加总成一个池。部分失败继续展示 Hub 传来的旧读数与失败状态，不用个人池填补团队池。旧版单 Credits 窗口仍可展示。 |
| 会话最近模型（#1423、#1434） | 列表显示 `latestModel` 和其他已测量模型的数量；家族只使用最新主会话续接记录的字段，不能由最近活动的子代理覆盖。详情分别展示最近模型与全部历史模型用量。缺失、非法或显式空值回退为模型数量，不按最大用量或对象顺序推断；尚无 Token 的最近模型不插入用量桶。历史 / 归档快照保留其真实字段。 |
| 输入缓存命中率与会话明细（#1307） | 总览显示当前所选周期的输入命中率，排除输出和未知用量，缓存写入属于未命中。可展开全部已测量会话，按输入量排序，包含已结束会话；列表可滚动，不限制为前六条，也不依赖实时状态或过期计时。明确零命中显示 0%，没有遥测显示未知。会话详情使用相同的输入计算规则。 |
| 累计活跃天数完整性（#241） | 只有 `historyPreview.summary.activeDaysComplete === true` 时展示 Hub 的累计活跃天数；旧版、混合版本或采集失败时只显示当前 14 条日记录内去重的活跃日期。不会累加各设备天数或把滚动窗口称为累计；保持原有 `GET /api/stats` 入口。 |
| 共享历史计算修正 | 同步 `limits/historyModel.js`，恢复后压缩区间的冲突标记附着于历史冲突时刻，避免把恢复后的端点继续标成冲突。保留其 CommonJS 导入路径调整，浏览器接口不变。 |

`limits/windowText.js` 与固定主线提交字节一致；`limits/historyModel.js` 仅调整导入 `windowLabels` 的相对路径。校验和与逐文件来源见 [upstream-files.json](upstream-files.json)。其他共享快照保持原内容，不新增 npm 依赖、网络接口或远端脚本。

缓存总览按主线 `fixedPeriodRanges.tokenComponentBreakdown` 的已观测输入拆分计算：缓存读取为命中，已分类总量扣除缓存读取和输出后为未命中。部分组件由 `unclassifiedTokens` 排除；旧 Hub 缺少完整性标记时，只有真实缓存流量才建立兼容读数。会话使用主线 `sessionCacheHitPercent` 的边界：零缓存需要 `cacheReported: true`，否则输入 Token 本身不能证明零命中。原生微件已有的“缓存读取占比”继续表示缓存读取 / 总 Token，名称与输入命中率分开，缓存格式与持久化范围不变。

## 其他主线变化的适用范围

- 桌面额度历史跨 local / Hub / iCloud 模式接续（#1424、#1427）：该迁移依赖桌面保存的模式与旧源索引。Android 只有 Hub 读取模式，本次继续按连接指纹隔离手机 SQLite 历史，不合并不同连接或导入桌面数据库；已有数据、结构和保护标记不重写。
- Grok 登录 Token 轮换后的稳定账户键（#1422）：由生产端建立新键，安卓沿用 Hub 的账户键。旧键的历史不会仅凭同名或同邮箱猜测归属，也不在手机读取凭据来推导别名。
- Thinking Machines Inkling 模型品牌（#1416）：安卓模型列表直接显示原始模型名，能够保留 `inkling-2-small` 等名称与用量，不需要桌面图标或品牌外观设置。
- Collector 时区、Cursor 后台收集、WSL 扫描默认关闭及 Antigravity 同步修复：属于桌面 / Agent 数据生产，手机读取兼容结果；不将采集器或 Hub 放入此工程。
- Edge Dock 五分钟速率趋势（#1441）依赖桌面实时匹配计数观察，未作为此 Hub 完整快照字段传输。Android 现有速率仍是累计匹配计时的平均值，不将它生成一条假的实时趋势。
- 插件额度跨桌面卡片共享（#1419）：固定主线的 [插件协议](https://github.com/Javis603/token-monitor/blob/82e00510cf93fc61415571ccc04d4ab58e68202f/docs/plugins/author-limits.md) 仍明确额度不进入 DeviceRecord / Hub / Worker 传输。本次不加入插件执行器、OpenAI API credit 采集或凭据设置。
- 西班牙语桌面翻译、Wayland 微件位置、Windows 玻璃材质和卡片截图边界是桌面界面功能；安卓保留现有原生容器、WebView 与语言界面。

## 验证范围

新增回归使用归一化的合成 Hub 数据，不验证在线 Hark / Qoder 接口或采集器解析行为。所有代码改动保留 Android 只读网络边界，原生测试数据不包含真实账户或凭据。

2026-11-10 本地结果：

- `npm ci --prefix ui`、`npm run verify` 通过：107 项 Node 测试；TypeScript 与生产 UI 构建通过；Java 检查通过（连接 14、完成检测 24、更新策略 19、APK 策略 25、微件策略 90、历史接管策略 14）。
- JDK 17 / SDK Platform 36 / Build Tools 35.0.0 的 `assembleDebug assembleDebugAndroidTest lint` 通过；lint 为 0 错误、36 个警告。新增 WebView 与 SQLite 仪器用例已编译。
- 浏览器演示预览确认 Hark 日 / 月额度与 Top-up、Qoder 双积分池、最近模型及完整模型组成、输入缓存命中率与全部会话明细。
- `adb devices -l` 没有连接设备。`connectedDebugAndroidTest` 的执行申请被自动审批拒绝，理由为缺少专用设备且测试会清空连接设置；本轮没有运行设备仪器用例。编译和浏览器预览不代表原生运行验收。
- 共享快照校验、APK 内脚本检查、本地发布元数据校验及 `git diff --check` 通过；当时应用基线为 1.6.0 / versionCode 17。

以上为本地发布前验证记录。本次采用新版本 1.7.0 / versionCode 18，沿用原有正式签名，保留既有标签和发布资产。正式发布流程会在 GitHub Actions 运行 Android 15 模拟器仪器测试，结果以对应 Release 链接的工作流记录为准。
