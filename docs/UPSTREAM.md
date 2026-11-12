# 来源与共享代码

本项目是 [Javis603/token-monitor](https://github.com/Javis603/token-monitor) 的 Android 只读客户端独立工程，保留原作者 Javis 的 [MIT 版权声明](../LICENSE)。桌面端、Agent、Hub 部署与服务端能力继续以主线项目为准。

Android 源码从现有工作区的 `android/` 提取，初次提取版本为 **1.0.5 / versionCode 6**；当前版本以 `app/build.gradle` 与 `package.json` 为准。提取时源工作区提交为 `f945fba0dc70f6772c4f3173327b05e368937c0f`。这是本次本地源快照标识，不表示该提交一定存在于主线 GitHub 仓库。提取不包含源工作区未提交的桌面端或 Linux Agent 改动。

1.1.0 将主线 v0.84/v0.85 的 Android 适配从源工作区提交 `b8bd88e804a7998665f2e8e56fb7108898c1b9da` 整合至独立仓库，主线上游版本为 v0.85.0（`d7fd7db7`）。只移植 Android 展示模型、界面、必要共享模块和回归用例，保留本仓库的 GitHub 自动更新、界面改进与发布流程。独立仓库的发布提交由 `release-metadata.json` 记录，与源工作区提交分别标识。

## 共享模块

2026-11-05 从主线 `main` 同步至 **`8b22ae85502ba2fa9c9cf49d4cf99d3dabe99845`**（源码版本 **0.86.0**，包含标签之后的 OpenDesign 功能）。本次适配 OpenDesign 工作区额度、只在手机本地积累的额度历史和余额展示，随 Android **1.4.0 / versionCode 15** 发布；范围及 Android 差异见 [v0.86 适配记录](upstream-0.86.md)。

2026-11-06 增量同步至 **`00effb2b62535afeb9f85874ff349dc278a51bfa`**（源码版本 **0.87.0**，包含标签之后的 MiniMax 与月度托盘提交）。安卓适配 MiniMax Code / API / Token Plan 的独立展示、已确认账户关联、现金消费周期和视频次数 / 无限额窗口，随 Android **1.5.0 / versionCode 16** 发布；详见 [v0.87 适配记录](upstream-0.87.md)。

2026-11-09 增量同步主线 `main` 至 **`eb8cf9d8de2b243deb3f00658ec75440e7dfe880`**（源码版本 **0.88.0**，包含标签之后的 Gemini CLI 提交）。适配 Gemini CLI、Mistral Vibe、Prime Agent、Jcode 的工具展示，Mistral 额度、MiMo 产品及余额明细，以及兼容来源切换后的本地额度历史，随 Android **1.6.0 / versionCode 17** 发布；详见 [v0.88 适配记录](upstream-0.88.md)。

2026-11-10 增量同步主线 `main` 至 **`82e00510cf93fc61415571ccc04d4ab58e68202f`**（源码版本 **0.90.0**，覆盖 v0.89 及 v0.90 标签之后的缓存明细提交）。适配 Hark 额度、Qoder 个人 / 团队积分、会话最近模型、输入缓存命中率与会话明细，以及完整性受控的累计活跃天数，随 Android **1.7.0 / versionCode 18** 发布；范围及验证见 [v0.89 / v0.90 适配记录](upstream-0.90.md)。

独立仓库的 `src/shared/` 带入源工程的可移植计算模块。文件与 SHA-256 校验记录见 [upstream-files.json](upstream-files.json)，新同步文件同时注明上游提交、原路径和必要的导入路径调整。已有 v0.85 快照保持字节内容不变；`limits/historyModel.js` 从上游 renderer 的纯计算模块提取，仅重定位 CommonJS 的 `windowLabels` 导入，浏览器全局与计算语义保持一致。它们在此仓库构成独立依赖闭包，不需要克隆主线才能构建。

这些模块负责工具名称、紧凑 Token 显示、额度金额及窗口文字、活动来源、会话状态、会话分组及设备类型规范化。v0.88 新增 `clientCatalog.js`；v0.90 更新 `limits/windowText.js` 与 `limits/historyModel.js`。前者与固定上游提交字节一致，后者仅保留上述导入路径调整；其余文件保留各自快照与来源。Gradle 把它们复制进 APK；Node 测试与浏览器开发预览直接加载同一份源码，不引入 Electron 或新的 npm 依赖。

更新共享模块时，从对应源版本一次同步必要的闭包，检查 CommonJS require 和浏览器全局依赖，更新校验记录，并运行 `npm run verify` 和 Android 构建 / 仪器测试。不要仅更新 APK 生成目录，也不要为通过测试复制 Hub 或 Electron 应用。

会话实时速率模块 `sessionRealtime.js` 来自 [AoXIUy/token-monitor](https://github.com/AoXIUy/token-monitor) 分支，逐字节同步并在 `upstream-files.json` 中单独记录来源仓库、提交和 SHA-256；不代表主线已包含该功能。它保持浏览器全局 `TokenMonitorSessionRealtime` 与 CommonJS 双入口，不依赖 Electron 或第三方库。Android 和桌面使用相同的计数增量、时间、失效和曲线规则；安卓仅负责原生生命周期与界面适配。

## 独立工程的调整

Android 工程提升至仓库根目录，修正 Gradle、Vite 和展示模型的相对路径；保留 Gradle Wrapper、前端锁文件、原生与仪器测试。GitHub CI 使用独立目录结构，Node 展示测试移除对整个 Hub / Electron 工程的依赖，具体范围见 [tests/README.md](../tests/README.md)。

README 和展示图为本次独立发布重新编写与排版，图中使用现有页面的演示数据截图。签名私钥、实际密码配置、旧设计压缩包及本地构建缓存不属于公开源码。
