# 上游 v0.87 主线 Android 增量适配

2026-11-06 从 [Javis603/token-monitor 的 main 提交 `00effb2`](https://github.com/Javis603/token-monitor/commit/00effb2b62535afeb9f85874ff349dc278a51bfa) 同步，源码版本 **0.87.0**，包含该版本标签之后的 MiniMax、余额账户选择和月度托盘提交。安卓基线为上次适配的 `8b22ae8`，应用基线为 1.4.0 / versionCode 15。本次适配随 Android **1.5.0 / versionCode 16** 发布，更新内容见 [发布说明](releases/1.5.0.md)。

## 已适配

| 上游变化 | Android 行为 |
| --- | --- |
| MiniMax Code 积分与 API 计费分离（#1284） | 独立显示 MiniMax Code、MiniMax API、MiniMax Token Plan；保留区域、原币种、真实套餐名和各自状态。Code 总积分直接采用已有窗口，不重复叠加赠送/购买组成。 |
| 经过服务端确认的账户关系 | 仅同区域、有效 API `relatedAccountKey` 指向当前 Code `accountKey` 时共享账户标题；不合并身份、额度、费用、状态或本地历史。多个 API 键仍保留独立卡片，登录失效不改变兄弟产品的健康状态。 |
| API 钱包及现金消费 | 余额保留 CNY / USD；今日、近 7 天、本月和累计消费直接展示 `balance` 中的原始账单快照。零消费可见，缺少或失败的周期显示未知；现金不分配给 Code 积分，不由余额差额或 Token 量推算消费。 |
| Code 无限额和视频次数窗口 | `detail: unlimited` 显示“无限额”且不生成假零历史；Video 保留占用百分比和 `3/20` 形式的绝对次数。没有明确时长时不把 Video 的 `weekly` 传输分类当作七天周期；原生微件使用“视频”标签。 |
| 共享窗口文字 | 原样同步 `src/shared/limits/windowText.js`，同时加入 Gradle、Vite、原生资源白名单及浏览器回归。现有共享模块没有上游字节变化，保留原快照与原始来源记录。 |

MiniMax 新 Code 历史增加独立 OAuth 产品边界，已有 API 历史身份保持不变；账户关联字段只影响分组展示。新窗口仍使用原来的受认证 `GET /api/stats`，不读取电脑端凭据、不在安卓调用 MiniMax CLI 或提供账户配置。

## 其余主线变化的适用范围

- 月度 Token / 费用托盘预设（#1346）：Android 已有“本月”统计及多周期微件；保留相同数据入口并补回归，不引入桌面托盘或悬浮窗。
- 纯余额账户优先选择（#1357）：上游修改桌面单格摘要的获胜账户；安卓额度页继续展示全部账户，微件继续只持久化既有匿名额度摘要，不增加跨币种比较或持久化账户现金余额。
- 上传增量、历史传输优化与 Worker 请求上限（#1374、#1376）：属于生产端 / Hub；读取端 `GET /api/stats` 的完整响应仍兼容，安卓不新增上传 API。
- Codex 空闲 Dots 采集、服务状态来源与桌面卡片调度（#1377、#1370、#1379、#1380、#1368）：属于电脑采集或 Electron。本仓库不包含这些组件；现有只读协议、会话状态及本地 WebView 网络边界保留。

## 验证范围

`upstream87Limits.json` 使用归一化的合成 Hub 数据，覆盖新 MiniMax Code/API 输出形状；它不建立在线 MiniMax 接口或凭据行为的正确性。Node 回归覆盖产品身份/币种、关联边界、独立异常状态、现金消费缺失/零值、无限额、视频周期、月度统计和浏览器脚本。原生用例覆盖 SQLite 产品历史隔离、视频周期、微件文字和 WebView。

2026-11-06 本地验证：

- `npm ci --prefix ui` 和 `npm run verify` 通过：88 个 Node 回归通过，含 TypeScript 与生产 UI 构建；Java 检查通过（连接 14、完成检测 24、更新策略 19、APK 策略 25、微件策略 81）。
- JDK 17 / SDK Platform 36 / Build Tools 35.0.0 的 `assembleDebug assembleDebugAndroidTest lint` 通过；lint 为 0 错误、36 个警告。
- `git diff --check`、本地发布元数据校验及共享快照 SHA-256 校验通过；新增 `windowText.js` 与上游原文件字节一致。
- 浏览器使用演示数据验证 Code 积分、无限额、Video 绝对次数、API 现金消费的零值/未知值及独立 Token Plan 卡片；预览不是设备验收。
- `connectedDebugAndroidTest` 已执行，但环境没有连接专用测试设备，返回 `DeviceException: No connected devices!`，没有运行应用仪器用例；新增原生用例目前只完成编译。

本次发布更新应用版本为 1.5.0 / versionCode 16，沿用原有正式签名，保留既有标签和发布资产。以上为本地发布前验证记录；GitHub Actions 会运行 Android 15 模拟器仪器测试，结果以对应 Release 链接的工作流记录为准。
