# Android 开发指南

## 工程与运行入口

本仓库由原工程的 Android 子项目独立提取。Android Studio 打开仓库根目录；Gradle 的 `app` 模块是应用入口，`MainActivity.java` 管理 WebView、原生桥接和前台 Hub 读取。

| 路径 | 职责 |
| --- | --- |
| `app/src/main/java/com/tokenmonitor/android/` | 网络、Keystore、生命周期、完成监控和桌面微件 |
| `app/src/main/assets/model.js` | Android 展示模型，供网页与 Node 测试使用 |
| `ui/src/` | React + TypeScript 界面与原生消息状态 |
| `src/shared/` | 从源工程带入的可移植计算模块，来源见 [UPSTREAM.md](UPSTREAM.md) |
| `app/src/androidTest/` | WebView、认证请求、通知与微件仪器测试 |
| `tests/` | 可独立运行的 Node 展示/状态测试和 Java 校验 |

`buildUi` 执行前端类型检查与 Vite 构建，输出 `app/build/generated/ui/`。`syncDisplayAssets` 把 `src/shared/` 中的指定脚本复制到 `app/build/generated/assets/shared/`。不要编辑或提交这些生成目录。

生产资源固定为 `index.html`、`app.js`、`app.css` 以及原生白名单中的模型脚本；单 JavaScript bundle 与原生允许列表必须一致。浏览器开发预览由 Vite 直接读取同一份共享脚本。运行时使用系统字体，不加载 CDN。

## 原生边界

`LocalContentClient` 使用 AndroidX `WebViewAssetLoader`，仅在固定 HTTPS 源上映射明确允许的 APK 资源。未知地址必须返回阻止响应，不能回退到网络。网页禁用直接联网及文件访问；Hub 请求通过原生层执行。

`ConnectionSpec` 限制 Hub 地址与只读 GET 路径。请求使用 `Authorization: Bearer`，拒绝重定向，使用系统证书校验。凭据由 Android Keystore 加密保存，网页只能提交新值，不能读取已保存 secret。连接变化需要清空旧页面、通知和微件状态，并拒绝旧请求的迟到响应。

原生外层容器根据系统栏、DisplayCutout 和键盘边距缩小整个 WebView 视区，不能只给 WebView 加 padding。已处理的 Insets 继续传给子视图时清零，网页不重复添加安全区留白。验收时覆盖刘海模拟、横竖屏、手势 / 三键导航和键盘弹出收起。

## 软件更新

`AppUpdates` 使用独立的有界执行队列和 `GitHubUpdateClient` 读取固定的 `AoXIUy/token-monitor-For-Android/releases/latest` 公开 API，使用系统 TLS、10 秒连接 / 读取超时、512 KiB 响应上限并拒绝重定向。请求不读取 `ConnectionStore`，不带 Hub 凭据，WebView 仍保持禁止直接联网。自动检查默认开启，冷启动时检查，普通前后台切换沿用 12 小时间隔；手动检查可在自动检查关闭时执行。同一次检查合并重复请求，进入后台或销毁时取消；代次检查拒绝迟到结果，取消的检查可在恢复前台后重试。

`AppUpdatePolicy` 按三段整数比较稳定版本，不能使用字典序。`GitHubRelease` 排除草稿和预发布，严格匹配版本、Release 页面、APK 与 `release-metadata.json` 的文件名、上传状态和固定仓库 HTTPS 下载路径；缺少有效附件时显示失败，不能把它当作已是最新。只缓存有界的更新元数据和检查时间，读取缓存时重新验证；失败保留旧结果，界面显示旧检查时间和错误。更新状态独立于 Hub 连接，更新说明按纯文本显示；原生生成提示标识，稍后、返回键和配置重建不会重复弹出同一次提示，手动检查可生成新提示。

`HubNative.downloadUpdate()`、`installUpdate()` 与取消接口不接收 URL 或文件路径。`AppUpdateDownloads` 在独立有界队列内下载、校验与恢复安装包；`UpdateDownloadClient` 仅从已验证的固定附件地址开始，最多允许 4 次重定向到明确列出的 GitHub HTTPS 资产主机，无 Hub 认证头，限制响应大小、读写时间和 APK 上限。部分文件不进入分享目录，取消或失败后清理；完成包与最小校验记录保存在应用私有目录，恢复与每次交给安装器前重新校验。

`UpdateManifest` 绑定版本、文件名、正整数版本代码、SHA-256、源码 SHA 与签名指纹；存在 GitHub APK 摘要时也必须匹配。`UpdateApkVerifier` 核对文件完整性，并通过 `PackageManager` 获取 APK 身份与签名，拒绝错误包名、版本代码未增加、调试包、多个签名、非原正式签名及当前安装包签名不兼容的情况。Gradle 从公开 `release-signing.sha256` 生成 BuildConfig 校验常量。FileProvider 只映射 `files/updates/verified/`，以临时只读 URI 授权交给系统安装器，不开放其他文件。

应用声明 `REQUEST_INSTALL_PACKAGES`，仅在用户主动选择下载安装且包已校验后检查来源安装授权；需要时打开本 App 的系统授权页，返回后复核文件再继续。系统安装器仍需要用户确认，应用不会宣称仅打开安装器就已安装成功。安装版本从 `PackageManager` 获取。

回归包括 Java 版本 / 调度 / APK 信任规则、Node 消息状态、原生 Release 与元数据解析、下载取消和迟到结果、缓存恢复、受限 URI、异常网络及真实 WebView 更新弹窗。仪器测试使用注入数据并关闭自动联网，不依赖 GitHub 可用性，也不实际安装软件。真实系统授权和正式签名覆盖安装仍需专用设备验收，验证记录见 [UPDATES.md](UPDATES.md)。

## 状态与提醒

会话工具筛选在搜索后、分页前执行，匹配组内任一工具时保留完整会话家族及用量；切换周期、设备、连接或选择失效时清除工具选择。活跃 / 等待数量使用当前工具筛选结果，状态筛选在其上继续过滤，均不改变总览或原生通知计算。

“已结束”的数量与筛选只接受明确的 `ended` 状态。断线、后台或读取过期后的 `unknown`，以及空闲、归档会话仍可在“全部”查看。设备会话详情与总览共用周期失效检查；优先周期失效后尝试另一个有效周期，两者都失效时显示明细不可用。

来源设备按当前周期的真实会话统计键查找，跨设备家族和多设备副本保留全部来源，同名设备通过 ID 区分。硬件图标仅使用 Hub 的 `deviceKind`，由可移植 `src/shared/deviceKind.js` 规范化；旧 Hub 或未知类型使用通用图标，不从操作系统推断硬件。新增脚本须同时进入 Gradle 打包、Vite 加载和 `LocalContentClient` 精确允许列表。

Codex / Claude 推理强度独立于活动状态和推理 Token 显示；模型组成只展示 Hub 的已观测覆盖范围，不按比例补齐未知组成。提示缓存估计仅用于 Claude，旧 Codex 记录携带此字段时也不展示。额度保持 Hub 的产品和账户边界：Muse 网页与 CLI 分开，Manus 积分不显示为美元，余额说明与重置时间可同时展示。

前台每 5 秒读取 Hub，失败后退避至 60 秒；后台暂停界面轮询。会话状态依赖观测所属设备及新鲜 Hub 读取，30 秒原生活动租约到期后重新判断。推断活动保留独立标记，其他在线设备不能使旧观测重新有效。父子分组只使用明确关系或已验证连续身份，不能按标题合并。

`SessionMonitorService` 是用户主动开启的 `dataSync` 前台服务，使用独立通知通道。只有先观察到活动，再观察到明确结束标记才提醒；首次、重启及长断线后的快照仅建立基线。去重标记在通知展示前持久化；连接切换、授权失败或存储失败时停止监控。空闲、消失、租约到期或推断活动不能升级为完成事件。

Android 15+ 对 `dataSync` 前台服务有后台运行预算；应用处理服务超时并停止，用户需在 App 内重新开启。网络、省电、系统清理及强行停止也可能中断送达。应用不自动申请电池白名单、不在开机后自动启动监控。

已有 Activity 收到通知点击时，只更新启动 Intent 中的会话键与连接指纹，页面就绪后校验并消费一次；通知 URI 仅区分 PendingIntent，不替换 Activity 的启动身份。AndroidX `ActivityScenario` 按启动 Intent 的 action、data 和 categories 等字段匹配生命周期事件，替换整个 Intent 会使通知跳转后的销毁事件被忽略，最终在测试清理时停留于 `PAUSED` 并超时。回归用真实通知 PendingIntent 检查跳转、参数消费及跳转后的后台 / 前台转换，清理仍须正常等待 Activity 销毁。

## 额度历史

`LimitsHistoryStore` 将前台成功读取的 Hub 额度写入 Android 私有 SQLite；记录使用 provider 的原始 `updatedAt`，不把轮询时间当作新的测量。所有写入与查询均在现有网络工作线程执行，不额外探测 provider、不增加 Hub API，也不在后台新增服务。数据库异常只影响历史，界面显示存储错误并继续展示 Hub 统计；保留出错数据库，不自动删除或重建。

历史按连接指纹、provider、已验证账户/工作区、产品、窗口 ID 与单位隔离；匿名账户继续按来源设备隔离。持久化仅包含散列身份、数值、时间和摘要，不存储账户名称、邮箱、工作区名称或凭据。当前原生统计附加不透明的 `androidHistoryKey`，`HubNative.quotaHistory(key)` 只允许查询当前快照中的键，并使用连接代次拒绝迟到响应。查询最多保留一个进行中的任务及一个最新待查询键；WebView 仍禁止直接联网。

观测与日汇总在同一事务提交。相同时间戳、乱序或过期读数不新增消费；一致的来源切换沿用已验证账户时间线，冲突、配额缺失、实际额度变化和重置打断比较。失败刷新与普通采样间隔仍允许同一手机本地日期的兼容端点计算净变化，并标记覆盖不完整；跨日变化不分摊。零变化需要真实区间，无区间保持未知。百分比与原币种分别记录，不把余额推算比例写成测量。

保留 180 个本地日的明细与 730 个本地日的摘要，保留最后真实基线以检测重置；稳定读数在同一小时合并首尾观测。预览只显示当前周期/最近范围的趋势和近 14 天日汇总；一次曲线最多 1440 个点，高密度数据省略的区间不连线，日汇总不受绘图采样影响。新增共享计算脚本必须同时进入 Gradle、Vite 与 `LocalContentClient` 的明确白名单。详见 [v0.86 适配记录](upstream-0.86.md)。

## 桌面微件

桌面微件提供四类原生 `RemoteViews` 卡片：`UsageWidgetProvider`（今日用量，支持 `2×2` / `4×2` / `4×3`）、`CompactUsageWidgetProvider`（紧凑速览，支持 `2×1` 横条与 `2×2` / `4×2` 展开）、`PeriodOverviewWidgetProvider`（多周期总览，同屏对比今日、本月、累计及展开的近 7 日总量与单日峰值）和 `QuotaWidgetProvider`（额度监控，展示账户健康数与高占用率窗口进度条）。Android 12+ 使用 `SizeF` 响应式视图映射，Android 8.0–11 按 `AppWidgetOptions` 断点切换尺寸布局；所有卡片共享同一个 `UsageWidgetRefreshService`（`JobScheduler`）与本地快照。系统每 30 分钟请求刷新，实际运行可能延后；前台成功读取也会同步更新全部已放置微件。

`UsageWidgetSnapshot` 只持久化带日期的有界展示摘要（周期汇总、输入输出组成、近 7 日汇总、内置工具白名单名称与匿名窗口占用率），不保存完整统计、会话标题 / ID、设备名称 / ID、账户邮箱 / 名称或凭据。失败时标记并保留旧快照，未知费用和缺失字段不能显示成零。连接替换立即清除旧卡片，使用连接代次拒绝迟到响应；仅当所有种类的微件全部从桌面移除后才取消调度并清除摘要。微件不表示实时会话状态，也不自动开启完成监控。

成功与失败结果共用 `startedAt` 排序边界，较旧的结果不能覆盖更新的错误；失败不改变最后成功数据的 `fetchedAt`。历史汇总以快照读取时的手机本地日期为终点，分别使用含当日在内的 7 / 14 个日历日；非法、未来和窗口外日期不参与，同日重复行取最大读数以避免重复累计。缺失日期不补零，无有效读数显示未知；不足 7 天读数时标为“7日小计”，无障碍说明包含实际天数。旧版缓存缺少日历窗口标记时保留其他读数，历史汇总等待重新读取。

额度微件与共享余额展示保持同一口径：优先使用明确百分比，余额型窗口否则使用余额及已观测月支出估算剩余比例；明确零余额触发耗尽告警，缺失余额保持未知。隐藏进度条、金额消费窗口和 Muse 网页的额外 Token 文案不被转换为额度条；账户、余额金额及月支出仍不进入微件持久化摘要。

## 正式签名

首次创建自己的签名（在仓库根目录运行）：

```bash
mkdir -p signing
keytool -genkeypair -keystore signing/token-monitor-release.jks -storetype JKS -alias token-monitor-release -keyalg RSA -keysize 4096 -sigalg SHA256withRSA -validity 36500
```

复制 `keystore.properties.example` 为 `keystore.properties`，填写真实密码。`storeFile` 相对于仓库根目录，也支持绝对路径。密钥与配置必须在项目外安全备份，不能提交或分享。后续升级必须继续使用同一签名。

```bash
sh ./gradlew assembleRelease lintRelease
```

Windows 使用 `.\gradlew.bat assembleRelease lintRelease`。输出为 `app/build/outputs/apk/release/app-release.apk`。缺少签名配置会明确失败，不会回退到调试签名。可使用 SDK Build Tools 的 `apksigner verify --verbose --print-certs` 验证生成的 APK。

首次从不同签名的调试版或正式版切换时需要先卸载旧版，连接配置会随卸载清除。仓库不包含发布私钥；普通 GitHub CI 只构建调试包，正式发布工作流从 Actions Secrets 恢复签名，详见 [发布指南](RELEASING.md)。`release-signing.sha256` 是正式签名的公开证书指纹；发布校验必须与它匹配，不能换用临时密钥或调试签名。

## 验证范围

安装 `ui/` 依赖后，`npm run verify` 运行 Node 展示与原生消息状态测试、Java 连接与完成检测校验，以及前端类型检查和生产构建。独立仓库使用协议形状的测试数据验证客户端行为；完整 Node Hub、生产端额度解析及 Electron 对照集成测试仍属于源工程，不作为此仓库的运行依赖。

```bash
sh ./gradlew assembleDebug assembleDebugAndroidTest lint
sh ./gradlew connectedDebugAndroidTest
```

后一个命令需要专用设备或模拟器，并会清空本 App 的测试连接配置。GitHub Actions 使用 Android 15 模拟器，以提供 Chromium 111+ 的 WebView。SDK setup 明确只请求 `platform-tools`，避免安装已下线的旧 `tools` 包。

原生验收应包括：本地资源白名单、认证读取、Keystore、通知允许 / 拒绝、后台完成 / 去重 / 点击跳转、常驻通知停止按钮、连接替换、服务超时，以及微件添加 / 调整 / 移除、刷新、断网和跨日读数。浏览器截图只能验证显示效果；不同系统版本、桌面启动器及字体缩放仍需真机检查。
