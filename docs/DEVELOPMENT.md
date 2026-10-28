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

## 状态与提醒

前台每 5 秒读取 Hub，失败后退避至 60 秒；后台暂停界面轮询。会话状态依赖观测所属设备及新鲜 Hub 读取，30 秒原生活动租约到期后重新判断。推断活动保留独立标记，其他在线设备不能使旧观测重新有效。父子分组只使用明确关系或已验证连续身份，不能按标题合并。

`SessionMonitorService` 是用户主动开启的 `dataSync` 前台服务，使用独立通知通道。只有先观察到活动，再观察到明确结束标记才提醒；首次、重启及长断线后的快照仅建立基线。去重标记在通知展示前持久化；连接切换、授权失败或存储失败时停止监控。空闲、消失、租约到期或推断活动不能升级为完成事件。

Android 15+ 对 `dataSync` 前台服务有后台运行预算；应用处理服务超时并停止，用户需在 App 内重新开启。网络、省电、系统清理及强行停止也可能中断送达。应用不自动申请电池白名单、不在开机后自动启动监控。

已有 Activity 收到通知点击时，只更新启动 Intent 中的会话键与连接指纹，页面就绪后校验并消费一次；通知 URI 仅区分 PendingIntent，不替换 Activity 的启动身份。AndroidX `ActivityScenario` 按启动 Intent 的 action、data 和 categories 等字段匹配生命周期事件，替换整个 Intent 会使通知跳转后的销毁事件被忽略，最终在测试清理时停留于 `PAUSED` 并超时。回归用真实通知 PendingIntent 检查跳转、参数消费及跳转后的后台 / 前台转换，清理仍须正常等待 Activity 销毁。

## 桌面微件

`UsageWidgetProvider` 使用原生 `RemoteViews`；刷新由 `UsageWidgetRefreshService` 通过 `JobScheduler` 执行。系统每 30 分钟请求刷新，实际运行可能延后；前台成功读取也会更新卡片。

只持久化带日期的有界摘要，不保存完整统计、会话或设备名称。失败时标记并保留旧快照，未知费用和缺失字段不能显示成零。连接替换立即清除旧卡片，使用连接代次拒绝迟到响应；移除最后一个微件后取消任务并清除摘要。微件不表示实时会话状态，也不自动开启完成监控。

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

首次从不同签名的调试版或正式版切换时需要先卸载旧版，连接配置会随卸载清除。仓库不包含发布私钥，GitHub CI 默认只构建调试包。

## 验证范围

安装 `ui/` 依赖后，`npm run verify` 运行 Node 展示与原生消息状态测试、Java 连接与完成检测校验，以及前端类型检查和生产构建。独立仓库使用协议形状的测试数据验证客户端行为；完整 Node Hub、生产端额度解析及 Electron 对照集成测试仍属于源工程，不作为此仓库的运行依赖。

```bash
sh ./gradlew assembleDebug assembleDebugAndroidTest lint
sh ./gradlew connectedDebugAndroidTest
```

后一个命令需要专用设备或模拟器，并会清空本 App 的测试连接配置。GitHub Actions 使用 Android 15 模拟器，以提供 Chromium 111+ 的 WebView。SDK setup 明确只请求 `platform-tools`，避免安装已下线的旧 `tools` 包。

原生验收应包括：本地资源白名单、认证读取、Keystore、通知允许 / 拒绝、后台完成 / 去重 / 点击跳转、常驻通知停止按钮、连接替换、服务超时，以及微件添加 / 调整 / 移除、刷新、断网和跨日读数。浏览器截图只能验证显示效果；不同系统版本、桌面启动器及字体缩放仍需真机检查。
