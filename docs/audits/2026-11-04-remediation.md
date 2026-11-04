# 2026-11-04 审计修复与验证记录

本轮修复 [代码审计报告](2026-11-04-code-audit.md) 中的 F01–F05。基础提交为 `d719c3a3f3fd5454972822f4760e7a3fe847dbac`，修复位于本地分支 `codex/fix-audit-findings`。

## 修复结果

| 问题 | 修复后的行为 | 回归证据 |
| --- | --- | --- |
| F01 微件请求排序 | 失败结果也推进 `startedAt`；旧成功和旧失败均不能清除更新的认证失败，最后成功读数的 `fetchedAt` 保留；更新的成功请求可以恢复卡片 | `UsageWidgetTest` 覆盖交叠、首次失败、恢复与连接替换；隔离 JVM 复核旧响应被拒绝且认证失败保留 |
| F02 日历窗口 | 以快照读取时的手机本地日期为终点，近 7 日用量与近 14 日峰值按日历过滤；未来、非法日期及窗口外记录不参与，同一天重复记录取最大值 | Node 历史用例与 Java 合约检查覆盖稀疏日期、边界、未知、零值与闰日；实际 Java 投影复核 `315 → 15` |
| F03 余额告警 | 原生端与共享余额展示模型使用相同的百分比优先级、明确零余额与月支出估计规则；缺失余额保持未知，隐藏进度条及纯金额窗口保持原有语义 | Java 合约检查、原生投影测试覆盖零余额、备用余额、月支出、隐藏与缺失读数；实际零余额投影产生 `100%` 已用及 1 项告警 |
| F04 已结束分类 | 计数和筛选共用模型函数，只把 `ended` 归入已结束；未知、暂停、空闲和归档仍可在全部列表查看 | Node 用实际状态投影检查分类；真实 React 静态渲染复核未知会话对应已结束数量为 0；新增 WebView 筛选仪器测试 |
| F05 详情周期 | 设备详情复用周期失效规则，跳过过期的优先周期后回退到另一个有效周期，两者都失效时返回不可用 | Node 检查日界、月界及旧 Hub 时间回退；真实详情组件复核返回有效本月 `99 Tokens`，不再显示失效今日 `10 Tokens` |

近 7 日没有完整读数时显示“7日小计”，无障碍说明包含有读数的天数；无读数显示 `—`。旧微件缓存缺少新的日历窗口标记时，保留今日、本月等其他摘要，历史汇总等待重新读取。该缓存场景也已加入原生回归。

实现主要位于：

- [UsageWidgetStore.java](/home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/UsageWidgetStore.java)
- [UsageWidgetSnapshot.java](/home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/UsageWidgetSnapshot.java) 与 [WidgetLayoutPolicy.java](/home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/WidgetLayoutPolicy.java)
- [model.js](/home/cloud/code/token-monitor-For-Android/app/src/main/assets/model.js)、[SessionsView.tsx](/home/cloud/code/token-monitor-For-Android/ui/src/components/SessionsView.tsx) 与 [WidgetGalleryCard.tsx](/home/cloud/code/token-monitor-For-Android/ui/src/components/WidgetGalleryCard.tsx)

开发约定已同步到 [DEVELOPMENT.md](../DEVELOPMENT.md)。没有新增项目依赖；`src/shared/` 六个上游快照文件保持原校验值。

## 实际验证

| 检查 | 结果 |
| --- | --- |
| `npm run verify` | 通过：69 项 Node 测试，TypeScript 检查，Vite 生产构建 |
| Java 合约检查 | JDK 17 下通过：连接 14、完成跟踪 24、更新策略 19、微件策略 74，共 131 项 |
| `sh ./gradlew assembleDebug assembleDebugAndroidTest lint` | 通过：调试 APK、仪器测试 APK 及 Android lint |
| lint 明细 | 0 项错误、36 项警告：32 项既有小字号、2 项嵌套布局权重、1 项基线对齐、1 项 Gradle 更新提示；32 项字号均与基础提交相同 |
| 日历时区复核 | `Asia/Shanghai` 与 `America/Los_Angeles` 下，Node 日历回归及原始 Java 投影均通过 |
| 审计输入复核 | F01–F03 原始 Java 存储 / 投影通过；F04–F05 实际 React 组件静态渲染通过 |
| 上游来源 | 6 / 6 SHA-256 与 `docs/upstream-files.json` 匹配 |
| `git diff --check` | 通过 |

本轮在 `/tmp/tokenmonitor-fix-validation/` 准备了 Temurin JDK `17.0.21`、Android SDK Platform 36 和 Build Tools 35.0.0，解决原审计阶段的 JDK / SDK 构建阻塞。Node 为 `v24.11.1`。

生成的调试产物：

- [应用 APK](/home/cloud/code/token-monitor-For-Android/app/build/outputs/apk/debug/app-debug.apk)
- [仪器测试 APK](/home/cloud/code/token-monitor-For-Android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk)
- [Android lint 报告](/home/cloud/code/token-monitor-For-Android/app/build/reports/lint-results-debug.html)

验证日志在 `/tmp/tokenmonitor-fix-validation/verify.log`、`android-build.log`、`java-proof.log`、`ui-proof.log`。Java 存储复核沿用原审计的内存 Context / SharedPreferences 替身，仅证明结果排序与投影逻辑；React 复核使用实际组件的静态渲染。

## 设备验收边界

`connectedDebugAndroidTest` 本轮未执行，新增仪器测试已编译进入测试 APK。当前没有建立专用 Android 测试设备 / 模拟器环境，本机没有 `/dev/kvm`。构建、lint、JVM 和 React 验证不能代替实际 WebView、Launcher 与系统调度验收。

在专用设备上应执行 `sh ./gradlew connectedDebugAndroidTest`，实际验证断线筛选、微件错误与恢复、稀疏历史标签、零余额卡片和来源设备周期切换。该测试会清空应用连接配置。
