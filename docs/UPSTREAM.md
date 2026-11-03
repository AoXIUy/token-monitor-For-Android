# 来源与共享代码

本项目是 [Javis603/token-monitor](https://github.com/Javis603/token-monitor) 的 Android 只读客户端独立工程，保留原作者 Javis 的 [MIT 版权声明](../LICENSE)。桌面端、Agent、Hub 部署与服务端能力继续以主线项目为准。

Android 源码从现有工作区的 `android/` 提取，初次提取版本为 **1.0.5 / versionCode 6**；当前版本以 `app/build.gradle` 与 `package.json` 为准。提取时源工作区提交为 `f945fba0dc70f6772c4f3173327b05e368937c0f`。这是本次本地源快照标识，不表示该提交一定存在于主线 GitHub 仓库。提取不包含源工作区未提交的桌面端或 Linux Agent 改动。

1.1.0 将主线 v0.84/v0.85 的 Android 适配从源工作区提交 `b8bd88e804a7998665f2e8e56fb7108898c1b9da` 整合至独立仓库，主线上游版本为 v0.85.0（`d7fd7db7`）。只移植 Android 展示模型、界面、必要共享模块和回归用例，保留本仓库的 GitHub 自动更新、界面改进与发布流程。独立仓库的发布提交由 `release-metadata.json` 记录，与源工作区提交分别标识。

## 共享模块

独立仓库的 `src/shared/` 带入源工程的可移植计算模块，保持原路径及字节内容。文件与 SHA-256 校验记录见 [upstream-files.json](upstream-files.json)。它们在此仓库构成独立依赖闭包，不需要克隆主线才能构建。

这些模块负责紧凑 Token 显示、额度金额格式、活动来源、会话状态、会话分组及设备类型规范化。Gradle 把它们复制进 APK；Node 测试与浏览器开发预览直接加载同一份源码。

更新共享模块时，从对应源版本一次同步必要的闭包，检查 CommonJS require 和浏览器全局依赖，更新校验记录，并运行 `npm run verify` 和 Android 构建 / 仪器测试。不要仅更新 APK 生成目录，也不要为通过测试复制 Hub 或 Electron 应用。

## 独立工程的调整

Android 工程提升至仓库根目录，修正 Gradle、Vite 和展示模型的相对路径；保留 Gradle Wrapper、前端锁文件、原生与仪器测试。GitHub CI 使用独立目录结构，Node 展示测试移除对整个 Hub / Electron 工程的依赖，具体范围见 [tests/README.md](../tests/README.md)。

README 和展示图为本次独立发布重新编写与排版，图中使用现有页面的演示数据截图。签名私钥、实际密码配置、旧设计压缩包及本地构建缓存不属于公开源码。
