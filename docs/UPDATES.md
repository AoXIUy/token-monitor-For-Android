# 应用内更新

自动检查默认开启。冷启动时检查 GitHub 最新正式版，发现更高版本会弹窗展示更新说明，提供“下载并安装”和“稍后再说”。普通前后台切换使用 12 小时间隔，关闭自动检查后仍可在「连接 → 软件更新」手动检查。提示关闭状态独立于 Hub 连接，配置重建会保留同一次提示的处理状态。

## 下载与安装流程

1. 点击“下载并安装”，在 App 内显示进度，可取消或在失败后重新下载。
2. 校验发布元数据、安装包大小、SHA-256、应用 ID、版本及原有正式签名。缺少校验附件、文件损坏、签名不兼容或版本代码没有增加时，会阻止安装。
3. 首次需要来源安装授权时，打开 Token Monitor 的系统授权页；用户授权返回后再次校验文件，再继续安装。
4. 系统安装器显示确认界面，由用户决定是否安装。返回应用后不会把“已打开安装器”当作安装成功。

校验完成的包保存在应用私有目录，安装时仅为该 APK 提供临时只读 URI，不需要存储权限。取消和失败会清理部分下载；Activity 被销毁时未完成下载会取消，可重试。已完成包可在恢复并重新校验后继续安装。调试签名与正式签名不兼容时会显示原因，不能用调试安装包覆盖正式版来验证升级。

## 原生边界

| 区域 | 约定 |
| --- | --- |
| Release 来源 | 固定 `AoXIUy/token-monitor-For-Android` 的最新正式 Release，拒绝草稿和预发布 |
| 资源绑定 | APK 与 `release-metadata.json` 必须使用固定仓库、标签、文件名及 HTTPS 下载路径；附件已上传且大小有效 |
| 传输 | 保留系统 TLS 校验，不发送 Hub 认证信息；重定向逐跳检查，仅接受原地址或明确列出的 GitHub 资产 HTTPS 主机，最多 4 次 |
| 资源上限 | Release API 512 KiB、校验附件 16 KiB、APK 128 MiB；资产读取设连接 / 读取超时及总时限 |
| 完整性 | 实际字节数、SHA-256 与发布元数据匹配；GitHub 提供 APK 摘要时也必须一致 |
| 身份与签名 | 仅安装 `com.tokenmonitor.android` 的更高版本代码、非调试包、单个原正式签名；检查当前已安装包签名兼容性 |
| 签名固定值 | 从公开 `release-signing.sha256` 生成 BuildConfig 常量，缺失或无效时构建失败 |
| 私有文件 | 下载部分文件与已校验目录分离；FileProvider 只映射 `files/updates/verified/`，不分享凭据或其他文件 |
| 原生桥接 | 下载、取消及安装入口均不接受网页提供的 URL 或路径；每次安装交接前重新校验 |
| 生命周期 | 重复点击合并；取消、关闭后的迟到结果不能发布或触发安装；完成包与最小元数据可恢复，已安装版本的旧包会清理 |

主要实现为 `AppUpdates`、`GitHubRelease`、`UpdateManifest`、`UpdateDownloadClient`、`AppUpdateDownloads`、`ApkUpdatePolicy`、`UpdateApkVerifier`，以及 React 的 `AppUpdateDialog` 与 `UpdateDownloadPanel`。使用已有 AndroidX Core 的 FileProvider，没有新增项目依赖。

## 验证记录（2026-11-04）

| 检查 | 实际结果 |
| --- | --- |
| `npm run verify` | 71 项 Node 测试、TypeScript 与生产 UI 构建通过 |
| Java 合约检查 | JDK 17 下 156 项通过，包括 25 项新增 APK 更新策略检查 |
| `assembleDebug assembleDebugAndroidTest lint` | 通过，调试 APK 与仪器测试 APK 均生成 |
| Android lint | 0 错误、36 项既有字号 / 布局 / Gradle 提示 |
| 线上下载 | 使用实际 `UpdateDownloadClient` 下载公开 `v1.2.1` 元数据和 1,117,622 字节 APK，通过大小及 SHA-256 校验 |
| 线上签名与身份 | 实际下载样本通过 `apksigner verify`、固定公开证书、包名、版本 `1.2.1 / 13` 核对 |
| 设备仪器测试 | 已新增并编译，尚未在专用设备执行 |

线上 `v1.2.1` 作为下载校验样本，新增功能从 `1.3.0 / versionCode 14` 开始提供。上表记录本地发布前验证；发布流程还会在 GitHub Actions 运行 Android 模拟器仪器测试，结果以对应 Release 链接的 Actions 记录为准。验证日志保留在 `/tmp/tokenmonitor-update-verify.log`、`/tmp/tokenmonitor-update-build.log` 与 `/tmp/tokenmonitor-update-validation/`。

新增仪器测试覆盖：启动提示与去重、关闭 / 返回键、下载进度、取消与迟到结果、缓存恢复、重复校验、错误元数据和哈希、重定向限制、截断下载、私有目录及 URI 授权边界。测试使用合成数据，不实际安装软件。真实授权页、OEM 安装器、后台进程回收和原正式签名覆盖安装仍需专用设备验收。

参考：[Android 来源安装授权](https://developer.android.com/studio/publish#publishing-unknown)、[安全分享文件](https://developer.android.com/training/secure-file-sharing)、[FileProvider](https://developer.android.com/reference/androidx/core/content/FileProvider)、[APK 签名信息](https://developer.android.com/reference/android/content/pm/SigningInfo)。
