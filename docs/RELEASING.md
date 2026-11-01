# 使用 GitHub Actions 发布正式版

普通 `Android` 工作流运行便携测试、Java 校验、前端构建、Android lint 和 Android 15 模拟器仪器测试。`Release Android` 工作流复用这套检查，全部通过后才构建正式 APK，再单独授予发布任务 `contents: write` 权限。PR 和普通 CI 不读取发布私钥。使用 runner 自带的 GitHub CLI 发布，无需新增 npm 依赖或长期访问令牌。

## 首次配置签名

在仓库 **Settings → Secrets and variables → Actions → Repository secrets** 配置：

| Secret | 内容 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | 现有正式签名 keystore 文件的 Base64 |
| `ANDROID_KEYSTORE_PROPERTIES_BASE64` | 现有 `keystore.properties` 文件的 Base64，必须含 `storePassword`、`keyAlias`、`keyPassword` |

保留原始密钥，不要重新生成；不同签名不能覆盖升级。上传秘密仅通过 GitHub 的加密 Secrets 表单或 `gh secret set`，不要放入源码、Issue、日志或聊天。CI 自动将 `storeFile` 重定向为 runner 内的临时路径，构建后总会删除临时配置和密钥。缺少秘密时明确失败，不回退到调试签名。

`release-signing.sha256` 提交正式密钥的**公开证书指纹**，由 `apksigner verify --print-certs` 核对。自行维护的 fork 若更换签名，需同步更新该文件，并明确不同签名的升级限制。

## 发布新版本

1. 同步修改 `package.json` 的版本、`app/build.gradle` 的 `versionName`，递增 `versionCode`，更新 README 版本徽章，并添加 `docs/releases/<版本>.md` 发布说明。
2. 运行 `npm run verify`，提交并推送到 `main`。
3. 在 **Actions → Release Android → Run workflow** 选择 `main` 运行，工作流按源码版本自动创建 `v<版本>` 标签。也可先推送匹配的标签触发：

```bash
git tag v1.0.7
git push origin v1.0.7
```

标签必须匹配源码版本，且已有标签必须指向本次构建提交；手动发布只允许从 `main` 运行。正式发布先经过模拟器测试，再使用原有签名构建，校验应用 ID、版本、非调试标记、签名指纹和 ZIP 对齐。版本只接受稳定的 `major.minor.patch` 格式。

发布包包括带版本号的 APK、`SHA256SUMS`、`signature.txt` 和 `release-metadata.json`。后者记录版本、源码提交、APK 校验值和签名指纹；Release 说明附 Actions 运行链接。用户可执行：

```bash
sha256sum --check SHA256SUMS
```

工作流先建立草稿，附件全部上传成功后才公开为最新正式版。上传失败可以重跑：仅允许继续同一源码提交的草稿，不会覆盖已公开的版本。签名包作为 Actions 产物保留 30 天，公开 Releases 附件不受该期限影响。

参考：[GitHub 的工作流复用](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)、[工作流权限](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions)、[GitHub CLI 发布命令](https://cli.github.com/manual/gh_release_create)。
