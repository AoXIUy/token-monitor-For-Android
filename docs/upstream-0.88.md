# 上游 v0.88 主线 Android 增量适配

2026-11-09 从 [Javis603/token-monitor 的 main 提交 `eb8cf9d`](https://github.com/Javis603/token-monitor/commit/eb8cf9d8de2b243deb3f00658ec75440e7dfe880) 同步，源码版本 **0.88.0**，包含版本标签之后的 Gemini CLI 支持与桌面内存优化。安卓上次同步点为 `00effb2b62535afeb9f85874ff349dc278a51bfa`，应用基线为 **1.5.0 / versionCode 16**。本次适配随 Android **1.6.0 / versionCode 17** 发布，更新内容见 [发布说明](releases/1.6.0.md)。

## 已适配

| 上游变化 | Android 行为 |
| --- | --- |
| Gemini CLI、Mistral Vibe、Prime Agent、Jcode 用量跟踪（#1413、#1384、#1390） | 总览工具分布、会话列表、工具筛选、详情与微件预览使用共享工具名称。保留 Hub 的会话身份、缓存组成、总 Token、费用与来源；同名会话不合并，缺少逐消息数据时不补造归属。近期使用仍标记为推断，不产生原生完成事件。 |
| Mistral 订阅额度与信用余额（#1387） | 分别展示 Included API、Included Vibe Code 与 Balance。真实金额可用时展示已用 / 总额，仅有占用率时只显示百分比；钱包不转换为百分比，不加总进订阅额度，保留负余额与原币种。缺少明确周期时长时不推算自然月。当前没有经过验证的账户键，继续按来源设备隔离匿名账户。 |
| MiMo 账户与余额展示（#1402） | 区分 MiMo Console 与 MiMo Desktop，套餐独立显示。折叠的“余额组成”展示已知赠送余额和现金余额，保留零值，未知字段不补零；已有总余额直接展示，不重复叠加。读取失败保持独立状态。 |
| 兼容来源接管后的额度历史（#1392） | 将原生 SQLite 的来源保护区分为真实冲突 `1` 和接管后优先来源 `2`。优先来源健康时阻止旧来源插入跳变；失效或过期后，兼容端点仍可计算当日净变化，覆盖标记不完整。真实冲突、分母变化与旧 `guarded=1` 保留原有隔离，不将来源差异当作消费，不重写旧数据。 |
| 共享计算快照 | 原样新增 `src/shared/clientCatalog.js` 并更新 `src/shared/limits/windowText.js`，同时加入 Gradle、Vite 和 WebView 资源允许列表。其余共享快照未发生字节变化，保留各自来源记录。原生历史存储按上游规则适配，不引入桌面 SQLite 或 Electron 依赖。 |

内置工具名称仍在原生微件的静态白名单内，未知工具归为“其他”；账户名称、余额金额与完整统计不增加到微件持久化摘要。前台继续通过现有受认证的只读 `GET /api/stats` 读取归一化数据，不在手机运行采集器或访问 provider 凭据。

## 其余主线变化的适用范围

- 插件原生额度、手动凭据与 OpenAI API credit 插件（#1391、#1407、#1409）：上游明确限定为桌面本地注册表，当前没有进入 DeviceRecord 或 Hub / Worker 传输，见固定提交的 [插件额度协议](https://github.com/Javis603/token-monitor/blob/eb8cf9d8de2b243deb3f00658ec75440e7dfe880/docs/plugins/author-limits.md)。本次没有为安卓虚构插件额度、接收电脑端凭据或增加插件执行器。
- Grok CLI 安装查找、Cursor 旧账户清理、Copilot 来源健康、tokscale 运行时与 MiMo 采集：属于桌面 / Agent 生产端。Android 展示其上传的结果，升级手机不能替代采集端升级。
- 历史传输、定价下载和采集器内存优化：保留现有完整统计读取协议，不引入上传或采集任务。
- Electron 内存、边缘停靠窗、微件外观、原生下拉框与插件设置保存：属于桌面运行时与界面；Android 保留现有 React + WebView、原生桌面微件及连接设置。

## 验证范围

新增回归采用归一化的合成 Hub 数据，不证明在线 Mistral、Gemini 或 MiMo 接口和生产端解析行为。仪器用例另覆盖真实 Android WebView 与 SQLite；浏览器预览只验证页面显示。

2026-11-09 本地验证结果：

- `npm ci --prefix ui`、`npm run verify` 通过：95 个 Node 测试，TypeScript 检查与生产 UI 构建通过；Java 检查通过（连接 14、完成检测 24、更新策略 19、APK 策略 25、微件策略 88、历史接管策略 14）。
- JDK 17 / SDK Platform 36 / Build Tools 35.0.0 的 `assembleDebug assembleDebugAndroidTest lint` 通过；lint 为 0 错误、36 个警告。
- `git diff --check`、本地发布元数据校验、共享快照 SHA-256 校验通过；新增 / 更新共享文件与固定上游原文件字节一致。
- 浏览器演示预览确认 Mistral 金额与百分比窗口、独立无进度条钱包，以及可展开的 MiMo 余额组成（含零赠送余额）。
- 本地已执行 `connectedDebugAndroidTest`，实际返回 `DeviceException: No connected devices!`。新增 SQLite 接管和 WebView 用例已编译，但本地没有运行设备仪器测试。

以上为本地发布前验证记录。本次发布采用新版本 1.6.0 / versionCode 17，沿用原有正式签名，保留既有标签和发布资产。正式发布流程会在 GitHub Actions 运行 Android 15 模拟器仪器测试，结果以对应 Release 链接的工作流记录为准。
