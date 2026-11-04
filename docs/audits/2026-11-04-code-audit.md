# Token Monitor Android 代码审计报告

审计日期：2026-11-04（Asia/Shanghai）。

审计基线：`main`，提交 `d719c3a3f3fd5454972822f4760e7a3fe847dbac`，应用版本 `1.2.1`，`versionCode 13`。仓库为 `AoXIUy/token-monitor-For-Android`，审计开始时工作区干净。

## 审计结论

确认 **5 项 P2（中等优先级）缺陷**，涉及微件请求排序、统计周期、余额告警和会话状态展示。本轮没有获得可确认的 P0 / P1 漏洞证据。问题均附代码位置、触发条件、实际复现结果、修复建议和回归要求。

现有便携验证通过：**64 项 Node 测试、110 项 Java 合约检查、TypeScript 检查和生产 UI 构建**。新增的审计复现说明，现有测试尚未覆盖这些边界。不能据此认定 Android 运行验收已通过：本次 Gradle 构建受 JDK 环境阻塞，Android lint 与设备仪器测试没有完成。

原始审计阶段未修改业务代码。2026-11-04 整改更新：F01–F05 已完成源码修复与回归验证，Android 调试包、测试包和 lint 已通过；设备仪器测试尚未执行。具体行为、验证结果及边界见 [修复验证记录](2026-11-04-remediation.md)。下文的缺陷说明与复现结果保留审计基线含义。

| 编号 | 优先级 | 问题 | 已确认的影响 |
| --- | --- | --- | --- |
| F01 | P2 | 微件失败结果没有推进请求排序标记 | 较旧成功响应可覆盖更新的认证失败，清除错误状态 |
| F02 | P2 | “近 7 日总量”实际累加最后 7 条记录 | 稀疏历史可把数周前的用量计入最近一周 |
| F03 | P2 | 零余额账户在预览与原生额度微件中结论不同 | 预览显示耗尽，原生卡片却显示账户正常且没有额度告警 |
| F04 | P2 | “已结束”筛选包含所有非运行、非等待状态 | 断线后的未知状态、空闲和归档状态被计为已结束 |
| F05 | P2 | 会话详情没有使用统计周期失效检查 | 来源设备的昨日快照仍标为今日，并抢先于有效本月数据返回 |

优先级口径：P0 为紧急严重问题，P1 为高影响问题，P2 为应安排修复的功能或可靠性问题，P3 为低影响改进。上述分级以已证实影响为依据，不将静态检查发现扩大为未经验证的远程利用结论。

## 范围与方法

本报告针对上述本地提交。覆盖 Android 入口与 Manifest、原生网络和凭据存储、WebView 本地资源与桥接、前后台轮询、完成提醒、桌面微件、React 展示模型与状态、GitHub 更新，以及构建和发布脚本。

审计先阅读 `AGENTS.md`、`docs/DEVELOPMENT.md`、`docs/UPSTREAM.md`、`docs/RELEASING.md` 与测试说明，再结合入口到输出的数据流阅读源码、运行现有验证，并对疑点构造合成输入。检查不涉及 Hub 服务端、桌面采集器或生产数据。

| 区域 | 主要检查对象 |
| --- | --- |
| 连接与认证 | `ConnectionSpec`、`HubClient`、`ConnectionStore`、`MainActivity` |
| WebView 边界 | `LocalContentClient`、WebSettings、CSP、`HubNative` 桥接 |
| 完成监控 | `SessionMonitorService`、`CompletionObservations`、`SessionCompletionTracker`、通知与持久化去重 |
| 桌面微件 | 四类 Provider、`UsageWidgetStore`、`UsageWidgetRefreshService`、`UsageWidgetSnapshot`、`WidgetLayoutPolicy` |
| 前端 | `nativeState.js`、`useNativeMonitor`、`model.js`、会话、详情、额度、总览与微件预览组件 |
| 更新与发布 | `AppUpdates`、`GitHubRelease`、`GitHubUpdateClient`、两套 Actions 工作流和发布校验脚本 |
| 来源和依赖 | 共享模块校验记录、npm 锁文件、安全公告查询、跟踪文件中的常见密钥模式 |

F01–F03 使用**原始 Java 源码**在隔离 JVM 中运行；JSON 运行库为 JSON-java `20240303`，仅下载到 `/tmp`。其中 F01 的 Android `Context`、SharedPreferences 和系统渲染调用采用内存替身，用于验证存储排序逻辑；没有替换被审计方法。F04–F05 使用真实展示模型及 React 组件的服务端静态渲染。它们验证的是逻辑与输出，不能替代 Android WebView、JobScheduler、Launcher 或真实设备验收。

## F01：微件失败结果未推进请求排序标记

**优先级：P2。复现状态：隔离 JVM 已复现。**

代码位置：[UsageWidgetStore.java:39](/home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/UsageWidgetStore.java:39)，失败写入逻辑为第 39–45 行；成功写入的排序检查见 [UsageWidgetStore.java:25](/home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/UsageWidgetStore.java:25)。

`publish()` 用快照中的 `startedAt` 拒绝较旧结果，`failed()` 也读取这一字段，但是保存失败状态时没有写入本次失败请求的 `startedAt`。因此，排序边界仍停留在上一次成功请求。

前台 Activity 和后台微件 Job 都能读取 Hub 并发布到此存储，两个请求可能交叠。可触发的顺序为：

1. 已有快照来自 `startedAt=100` 的成功请求。
2. 较早的请求 A 在 `200` 开始，尚未完成。
3. 较新的请求 B 在 `300` 开始，先返回认证失败；卡片被标记为认证失败。
4. A 随后返回成功。因为保存的排序标记仍为 `100`，`publish()` 接受 A，并清除 B 的失败状态。

实际复现输出：

```json
{"storedStartedAtAfterFailure":100,"failureRequestStartedAt":300,"olderSuccessStartedAt":200,"olderSuccessAccepted":true,"authenticationAfterOlderSuccess":false}
```

**影响：** 当前网络或授权已经失败时，微件可能恢复为普通快照状态，隐藏更新的错误。连接绑定校验仍然有效，本次未发现旧 Hub 数据跨连接写入；这里的问题是同一连接下的结果排序。

**修复建议：** 为成功与失败共用一个“最近已处理请求”的排序字段，接受失败时也推进它，同时保留最后成功快照的 `fetchedAt` 和展示数据。所有比较与写入继续置于现有锁内；不要把失败时间当成数据成功更新时间。

**回归要求：** 覆盖“旧成功晚于新失败”“旧失败晚于新认证失败”“新成功恢复失败状态”和重新连接后的旧绑定拒绝。已有 [UsageWidgetTest.java:60](/home/cloud/code/token-monitor-For-Android/app/src/androidTest/java/com/tokenmonitor/android/UsageWidgetTest.java:60) 检查了较旧结果晚于较新成功的情况，但未检查较新结果是失败的情况。

## F02：“近 7 日总量”使用记录条数代替日历窗口

**优先级：P2。复现状态：原始 Java 投影已复现。**

代码位置：[UsageWidgetSnapshot.java:116](/home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/UsageWidgetSnapshot.java:116)，尤其第 130–145 行；同样的预览算法见 [WidgetGalleryCard.tsx:133](/home/cloud/code/token-monitor-For-Android/ui/src/components/WidgetGalleryCard.tsx:133)。用户文案见 [strings.xml:29](/home/cloud/code/token-monitor-For-Android/app/src/main/res/values/strings.xml:29)。

代码对日期排序后取最后 14 条，再累加最后 7 条。它没有根据快照日期确定一周的开始和结束，也没有排除窗口外记录。主总览明确把趋势称为“最近 14 个有记录日”，但微件把该算法的结果称为“近 7 日总量”。

以 2026-11-04 为快照日期，输入为：

| 日期 | Tokens |
| --- | ---: |
| 2026-10-01 | 100 |
| 2026-10-15 | 200 |
| 2026-11-02 | 10 |
| 2026-11-04 | 5 |

近 7 个日历日内已观测到的用量是 `15`；实际投影的 `sevenDayTokens` 为 **`315`**，把十月上半月的记录也计入了最近一周。

**影响：** 低频使用、采集断档或历史稀疏时，周用量明显偏大，用户无法依据卡片文案判断实际时间跨度。

**修复建议：** 如果产品定义为自然日窗口，应使用 Hub 约定的日期边界，传入快照日期并按日期范围过滤；缺失日期保持未知，必要时标明数据不完整。如果保留按记录条数统计，则同步把原生卡片、应用内预览和发布说明改为“最近 7 个有记录日”。

**回归要求：** 覆盖连续日期、跨月稀疏日期、全部记录已过期、未来日期、非法日期、同一天重复记录及不足 7 天的情况。预览与原生投影必须对同一输入使用同一窗口定义。

## F03：零余额账户在原生微件中漏掉耗尽告警

**优先级：P2。复现状态：原始 Java 投影与实际前端模型均已复现。**

代码位置：[WidgetLayoutPolicy.java:84](/home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/WidgetLayoutPolicy.java:84)、[UsageWidgetSnapshot.java:160](/home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/UsageWidgetSnapshot.java:160)。预览判断见 [WidgetGalleryCard.tsx:153](/home/cloud/code/token-monitor-For-Android/ui/src/components/WidgetGalleryCard.tsx:153)，小卡片正常账户文案见 [UsageWidgetProvider.java:231](/home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/UsageWidgetProvider.java:231)。

输入一个正常读取、余额已耗尽的账户，未提供百分比或固定总额度：

```json
{
  "provider": "openrouter",
  "status": "ok",
  "balance": {"amount": 0, "currency": "USD"},
  "windows": [{"kind": "credits", "metric": "credits", "remaining": 0, "currency": "USD"}]
}
```

前端复用的 `creditsMeterPercent()` 对明确的零余额返回 `0%` 剩余，微件预览将其转换为 `100%` 已用并告警。原生方法只有在存在百分比，或 `credits` 窗口同时存在正数 `limit` 时才返回占用率；这里返回 `null`，窗口被丢弃。

实际结果：

| 输出位置 | 结果 |
| --- | --- |
| 前端模型 / 预览使用的计算 | `$0.00`，剩余 `0%`，已用 `100%` |
| 原生快照 | `quotaHealthy=1`、`quotaAlerts=0`、`quotas=[]` |
| 原生小型额度卡片的对应分支 | `1 账户正常` |

**影响：** 用户在 App 内看到耗尽状态，添加到桌面的实际卡片却没有相同告警。正常采集状态掩盖了余额耗尽这一需要关注的事实。

**修复建议：** 统一余额窗口的展示与告警政策。至少应将明确的零余额与缺失余额区分；对于没有固定分母的正余额，明确是否沿用共享展示模型的估计规则，并让预览与原生端保持一致。可分别展示“采集正常”和“余额需关注”，保留 `showMeter=false` 的约定。

**回归要求：** 对零余额、缺失余额、有固定限额、无固定限额、有当月支出和隐藏进度条逐项比较原生快照与预览。不能为了显示进度条把缺失金额补成零。

## F04：“已结束”筛选把未知与空闲也当作结束

**优先级：P2。复现状态：真实 React 组件静态渲染已复现。**

代码位置：[SessionsView.tsx:166](/home/cloud/code/token-monitor-For-Android/ui/src/components/SessionsView.tsx:166)，计数为第 168–170 行，筛选为第 172–179 行，标签为第 223 行。

`endedCount` 与筛选条件均使用：

```ts
state !== 'running' && state !== 'waiting'
```

该条件同时接受 `unknown`、`idle` 和 `archived`。展示模型在断线、进入后台、Hub 读取过期或无法确认来源时，恰好会返回 `unknown`。

复现输入保留一条 `turnEnded=false` 的近期会话，将 `statusHealthy` 设为 `false`。实际渲染结果为：

```text
会话行：data-session-state="unknown"
筛选栏：全部 1 活跃 0 等待 0 已结束 1
```

**影响：** 网络中断或状态过期后，原本仍在执行的任务会被计入“已结束”，点击该筛选也会显示未知或空闲会话。该问题发生在 UI 分类层；此次没有证据表明它会触发原生完成通知。

**修复建议：** “已结束”的计数与筛选应只接受 `state === 'ended'`。未知、空闲和归档保留各自语义，可通过“全部”或明确命名的其他分类查看。

**回归要求：** 直接验证渲染结果与筛选结果，覆盖在线、断线、后台、30 秒过期及归档场景；显式结束应进入已结束，未知或空闲不得进入。现有模型测试对未知状态的验证不能替代组件分类测试。

## F05：会话详情绕过来源设备的周期失效检查

**优先级：P2。复现状态：原始模型与真实详情组件静态渲染已复现。**

代码位置：[model.js:117](/home/cloud/code/token-monitor-For-Android/app/src/main/assets/model.js:117)，尤其第 120–125 行；对比同文件 [model.js:28](/home/cloud/code/token-monitor-For-Android/app/src/main/assets/model.js:28) 的 `expired()` 与第 37–46 行的 `select()`。详情周期文案见 [SessionDetailView.tsx:206](/home/cloud/code/token-monitor-For-Android/ui/src/components/SessionDetailView.tsx:206)。

`select()` 会根据来源设备的 `periodWindows.endsAt` 或更新时间阻止过期的今日 / 本月数据进入总览。`sessionDetail()` 则按今日、本月的优先顺序查找键，只要记录存在就立即返回，没有执行相同的周期检查。

复现时，同一设备、同一会话具备已经失效的今日记录 `10 Tokens` 和仍有效的本月记录 `99 Tokens`。选择今日查看详情，实际结果为：

```json
{"overviewPeriod":null,"overviewExpired":true,"detailPeriod":"today","detailTokens":10,"detailStillLabelsToday":true,"validMonthTokens":99}
```

**影响：** 用户在详情页跨过来源设备的日界，或继续查看离线设备缓存时，总览已经认为今日数据失效，详情仍把旧读数称为“今日统计快照”；即使存在有效的本月记录，也不会走到该回退分支。

**修复建议：** 为设备详情复用 `expired(device, period, now)`，先排除失效周期，再尝试其他允许的周期。若产品希望保留历史快照，应返回明确的过期标记及原始日期，避免以今日或本月名义展示；该行为需与总览保持一致。

**回归要求：** 覆盖今日刚过期但本月有效、月界、两个周期均过期、来源设备被移除、全部设备视图和通知跳转。无有效记录时应显示明确的不可用或历史状态。

## 安全边界检查结果

以下是当前源码中已核对的防护，不代表本次完成了原生运行验证：

| 边界 | 代码证据与检查结果 |
| --- | --- |
| 只读 Hub 请求 | `ConnectionSpec.endpoint()` 只允许 `/api/stats`、`/api/subscriptions`；`HubClient` 固定 GET，拒绝重定向，限制响应大小并使用系统 TLS |
| 凭据 | `ConnectionStore` 使用 Android Keystore 与 AES-GCM；保存的 secret 没有被发送回前端状态；地址和 secret 作为同一连接绑定保存 |
| 明文 HTTP | Manifest 允许应用网络层使用 HTTP；`ConnectionSpec` 另行要求显式打开 `allowHttp`，设置页说明明文传输风险，本轮未将这一已声明能力计为漏洞 |
| WebView | 关闭文件、content 与直接网络访问；`LocalContentClient` 精确允许 APK 资源，未知 URL 返回 403；生产 CSP 禁止直接连接和框架加载 |
| 页面内容 | React 将会话标题和更新说明作为文本渲染；未发现 UI 直接使用 `dangerouslySetInnerHTML` 或动态执行 Hub 文本的调用 |
| 更新来源 | 固定 GitHub API 与下载仓库；Release 解析核对稳定标签、页面、APK 名称、上传状态和下载路径；更新请求不读取 Hub 凭据 |
| 原生提醒 | 检查明确活动后再接受结束事件；具有初始基线、断线间隔检查和持久化去重；通知使用不可变 PendingIntent |
| 应用组件与备份 | 后台服务和微件 Receiver 未导出；JobService 带绑定权限；应用关闭备份并配置数据迁移排除规则 |
| 发布 | 校验包名、版本、非调试标记、单签名、固定证书指纹与 ZIP 对齐；发布写权限单独授予，签名临时文件配置为构建后清理 |
| 跟踪文件 | 未发现跟踪的真实签名文件、实际签名属性、APK、SDK 本地路径文件，或常见私钥 / GitHub token / AWS access key 模式命中 |

密钥模式检查不等于完整凭据泄漏检测；本报告没有核验远端 Secrets 内容或公开 APK 的实际签名。本次也没有对 Hub、真实账户或生产连接发起测试。

## 验证记录

| 命令 / 检查 | 本次实际结果 |
| --- | --- |
| `npm ci --prefix ui` | 通过；使用锁文件，未修改依赖版本 |
| `npm run verify` | 通过；64 项 Node 测试全部通过，TypeScript 与 Vite 构建通过 |
| Java 合约检查 | 通过；连接 14 项、完成跟踪 24 项、更新策略 19 项、微件策略 53 项，共 110 项；使用 `javac --release 17` 编译，在 JDK 25 上运行 |
| `node scripts/release-metadata.js` | 通过；输出 `1.2.1 / 13 / v1.2.1`；这是本地版本与说明检查，没有代替 Actions 的 source SHA 和标签校验 |
| `npm audit --prefix ui --json` | 公开 npm 公告查询成功，锁定依赖报告 0 项已知漏洞；未执行 Gradle 依赖漏洞扫描 |
| 共享源码 SHA-256 | `docs/upstream-files.json` 中 6 / 6 文件匹配 |
| 审计复现 | F01–F03 的原始 Java 存储 / 投影复现成功；F04–F05 的模型与 React 输出复现成功 |
| `sh ./gradlew assembleDebug assembleDebugAndroidTest lint` | 环境阻塞；配置阶段退出，`Unsupported class file major version 69` |
| `connectedDebugAndroidTest` | 未执行；本次未建立专用设备 / 模拟器验收环境 |
| `git diff --check` | 通过 |

环境中 Node 为 `v24.11.1`，满足项目的 `22.15+` 下限。现有 JDK 为 `25.0.4.1`，项目要求 JDK 17；本机发现的 Android SDK 仅有 Platform 35，项目要求 Platform 36。Gradle 在进入 Android 编译和 lint 前已失败，该失败没有被计为业务代码缺陷。

第一次沙箱内验证中，发布测试创建临时 Git 仓库时出现 `spawnSync git EPERM`，依赖安装出现 DNS `EAI_AGAIN`。在允许相应本地验证和联网的环境中重跑后，依赖安装与完整 `npm run verify` 均成功，因此没有把最初的沙箱失败计为代码问题。

本次详细日志保留在 `/tmp/tokenmonitor-audit-verify.log`、`/tmp/tokenmonitor-audit-android-build.log`、`/tmp/tokenmonitor-audit-dependencies.json`；复现源文件和输出保留在 `/tmp/tokenmonitor-audit-evidence/`。这些是临时验证材料，关键输入和结果已写入本报告。隔离复现使用的 JSON-java JAR SHA-256 为 `3cf6cd6892e32e2b4c1c39e0f52f5248a2f5b37646fdfbb79a66b46b618414ed`，没有加入工程依赖。

## 后续修复与验收建议

建议先处理 F04 与 F01，避免未知任务被称为结束，以及更新的错误状态被旧结果清除；随后统一 F03 的额度告警政策，修正 F02 和 F05 的日期 / 周期语义。每项回归应验证用户可见输出或请求交叠结果。

此外有两项加固建议，未纳入已确认缺陷计数：

| 建议 | 依据与目的 |
| --- | --- |
| 增加历史版本单调性门禁 | `release-metadata.js` 检查版本匹配、正整数代码、说明、来源提交与同名标签冲突，但不自动比较全部已发布版本和代码。仓库规范目前依赖发布前人工核对；可在 metadata 阶段增加远端公开元数据比较，降低误发不可升级 APK 的机会 |
| 补充异常 Hub 数据的展示兜底 | `MainActivity` 主要检查 `periods` 和 `devices` 的顶层形状，深层数据随后进入组件；可增加必要字段校验与页面级错误边界，让不兼容响应显示可恢复错误，并保留连接设置入口 |

修复完成后运行 `npm run verify`，在 JDK 17、Platform 36、Build Tools 35.0.0 的环境中完成调试 APK、测试 APK 与 lint，再在专用设备 / 模拟器执行仪器测试。该仪器测试会清空应用连接配置。设备验收应实际覆盖断线状态筛选、来源设备跨日、微件刷新请求交叠、余额耗尽和不同尺寸卡片；本次没有验证这些设备侧行为。
