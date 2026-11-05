# 上游 v0.86 主线 Android 适配

本次来源为 [Javis603/token-monitor 的 main 提交 `8b22ae8`](https://github.com/Javis603/token-monitor/commit/8b22ae85502ba2fa9c9cf49d4cf99d3dabe99845)，于 2026-11-05 拉取。对比基线为 v0.85.0 的 `d7fd7db7`。目标源码版本为 0.86.0，额外包含 v0.86.0 发布提交之后合入的 OpenDesign 工作区额度。

## 已适配

| 上游变化 | Android 行为 |
| --- | --- |
| OpenDesign 工作区订阅额度（#1366） | 展示 Hub 已归并的工作区身份、5 小时和每周窗口、重置时间及状态；不同工作区保留独立卡片和历史；原生额度微件识别 OpenDesign。Cookie 仍在采集设备配置。 |
| 本地额度历史（#1352、#1359、#1360） | 点击账户的“额度历史”展开预览，切换当前额度窗口，查看剩余比例/余额/累计消费曲线与近 14 天观测净变化。点击日期读取对应金额，键盘和无障碍服务可读取日期、数值与覆盖状态。 |
| 周期与净变化语义 | 使用明确的 `windowMinutes`（包括 Command Code 实际账期长度），或已知的每日/每周/5 小时周期；未知周期使用近 14 天范围。百分比周期显示均匀使用参考虚线。缓存不新增测量，失败/间隔不伪造观测，重置、冲突、实际配额变化及跨日变化不计成普通当日消费。 |
| 纯余额展示（#1356） | 保留无进度条余额的实际金额和原单位；旧 Hub 只在账户 `balance` 提供金额时也能展示。未观测的余额比例不写入额度历史。 |

额度历史只来自安卓前台收到的原始观测，保存在本机私有数据库，不读取桌面历史，不上传 Hub，也不能重建开始记录之前的数据。历史按连接、provider、账户/工作区、产品、窗口和单位隔离。验证账户可跨来源设备连续，匿名账户按来源隔离；冲突后的来源切换使用不确定基线。详情保留 180 个本地日，日汇总保留 730 个本地日，预览显示近 14 天。数据库仅保存散列身份及数值；磁盘故障显示错误并保留旧库。

手机使用点击展开代替桌面的悬停浮窗。Android 使用系统 SQLite 和现有工作线程，无新增依赖；相同数值按小时合并首尾观测，预览曲线最多 1440 点，省略区间不连线，日汇总不被采样。未引入上游的 Electron 窗口动画、桌面代理、服务状态采集或 Claude CLI 回退配置。这些功能属于桌面/采集端；安卓仍只读取 Hub，不运行采集器。

共享 `windowLabels.js` 保持上游字节内容；`historyModel.js` 仅调整 CommonJS 的相对导入。原路径、提交和校验和见 [upstream-files.json](upstream-files.json)。原有六个共享模块保持原快照。未修改 MIT 版权、正式签名、现有发布标签或发布流程。本次适配对应 Android **1.4.0 / versionCode 15**，更新内容见 [发布说明](releases/1.4.0.md)。

## 验证

- `npm ci --prefix ui`、`npm run verify`：覆盖展示/消息状态、上游额度与历史计算、浏览器全局加载、共享文件校验和、TypeScript、生产 UI 和 Java 策略。
- `sh ./gradlew assembleDebug assembleDebugAndroidTest lint`：JDK 17、SDK Platform 36、Build Tools 35.0.0。
- `LimitsHistoryStoreTest`：真实 Android SQLite 的持久化、重复/乱序读数、跨设备连续与冲突、账户/Hub 隔离、失败/间隔、窗口丢失、跨日变化、重置/配额变化、零变化与稳定窗口 ID。
- `StartupTest`：本地脚本白名单、OpenDesign 卡片和可访问的历史预览、刷新保留与连接切换清除。

原生仪器测试只有在 `connectedDebugAndroidTest` 实际完成后才构成运行时验收；调试包构建成功不代表设备测试通过。发布流程将在 GitHub Actions 运行 Android 15 模拟器仪器测试，结果以正式 Release 链接的工作流记录为准。

2026-11-05 本地执行结果：`npm run verify` 通过（79 个 Node 回归及 Java 策略检查，含前端类型检查与生产构建）；JDK 17 的 `assembleDebug assembleDebugAndroidTest lint` 通过，lint 为 0 错误、36 个警告，新增历史存储类没有 lint 项。浏览器演示验证了 OpenDesign 卡片、额度窗口切换和 14 天净变化预览。专用 Android 15 软件模拟器缺少 KVM 加速，`connectedDebugAndroidTest` 在设备属性获取阶段出现 `ShellCommandUnresponsiveException` / `Unknown API Level`，最终报告 `No compatible devices connected`；没有运行应用仪器用例，不能据此声称通过原生运行时验收。
