# Project guidance

This repository contains the Android read-only client for [Token Monitor](https://github.com/Javis603/token-monitor). It does not contain a Hub, desktop collector or Electron application.

- Use Node 22.15+; install frontend dependencies with `npm ci --prefix ui`; run portable checks with `npm run verify`.
- Build with JDK 17, SDK Platform 36 and Build Tools 35.0.0: `sh ./gradlew assembleDebug assembleDebugAndroidTest lint`.
- Run native acceptance on a dedicated Android device/emulator with `sh ./gradlew connectedDebugAndroidTest`; these tests clear this application's connection settings.
- Read `docs/DEVELOPMENT.md` before changing native networking, WebView interception, credentials, completion monitoring or widget refreshes.
- `src/shared/` is the portable upstream calculation snapshot. Read `docs/UPSTREAM.md` before updating it; keep browser globals and CommonJS exports compatible.
- Never commit signing keys, actual signing properties, credentials, local SDK paths or build output. Keep the original MIT copyright notice.
- Do not add dependencies or tooling without discussing the reason in the issue or PR description.
- Commit subjects use conventional commits, for example `fix(android): preserve connection state on refresh`. Do not add AI co-author trailers.

## Android version standard

Read [docs/RELEASING.md](docs/RELEASING.md) before preparing or repairing a release. The executable checks are [scripts/release-metadata.js](scripts/release-metadata.js) and [scripts/package-release.js](scripts/package-release.js); keep this guidance and the release guide current when those contracts change.

- Before choosing a version, fetch `origin/main` and tags and inspect published GitHub Releases and the version/code recorded in their `release-metadata.json` or tagged source. Each new APK release must use an unused version higher than the published versions, with a positive integer `versionCode` greater than every published code. Do not infer release availability from the working tree alone.
- Use stable `major.minor.patch` versions without a `v` prefix, leading zeroes, prerelease suffixes or build metadata. Use patch increments for compatible fixes, minor increments for compatible features and major increments for incompatible behavior or contracts. Reset lower components when incrementing a higher one.
- Update `package.json` → `version` and `app/build.gradle` → `versionName` together, increment Android `versionCode`, update the README version badge and add reviewed `docs/releases/<version>.md` notes in the same release commit. The private UI package's `ui/package.json` version is not the Android application version.
- The tag is exactly `v<version>` and must resolve to the exact commit being built. Lightweight and annotated tags are supported. A new APK from a different commit needs a new version and code; keep existing release tags and published assets unchanged. Never delete or move an old tag to bypass a conflict.
- Documentation-only changes do not require a version bump or an APK release. When publishing later application changes, prepare a fresh version instead of rerunning an already published version from the newer `main` commit.

## GitHub Android release procedure

The release repository is [AoXIUy/token-monitor-For-Android](https://github.com/AoXIUy/token-monitor-For-Android). Verify `git remote -v`, branch and worktree before committing or pushing; preserve unrelated changes. Ordinary CI is [Android](.github/workflows/android.yml); signed publication is [Release Android](.github/workflows/release.yml).

1. Fetch the latest `main` and tags, integrate the intended source changes, then prepare the version and notes above. Resolve any existing tag conflict by choosing a new version.
2. Run `npm ci --prefix ui`, `npm run verify`, `node scripts/release-metadata.js` and `git diff --check`. The local metadata command checks versions and notes; Actions additionally verifies the checkout against `GITHUB_SHA` and any existing version tag. Record failures and resolve them before release.
3. Commit the reviewed release source and push it to `main`. Trigger exactly one release route: **Actions → Release Android → Run workflow → main**, or create and push the matching `v<version>` tag at that release commit. Derive the tag from the source version rather than copying a previously released tag. Manual releases must run from `main`.
4. Wait for the release workflow to finish. It validates metadata, reuses the complete Android CI (portable tests, UI build, debug APKs, lint and Android emulator instrumentation), then runs `assembleRelease lintRelease` with the original signing key and packages the verified APK. Only the publishing job receives `contents: write`; ordinary CI and PRs do not read release signing secrets.
5. Publication creates a draft, uploads all assets, then marks the release public and latest. A failed upload may resume only for a draft belonging to the same source commit. An already published release is complete; do not overwrite it or disable checks to make a rerun pass. Inspect failed job logs and reports before retrying, and distinguish a same-source retry from a new release.
6. Verify the public release and downloadable assets, not just successful Git pushes: tag, application version/code and metadata source SHA must match the intended release commit; check `SHA256SUMS`, certificate identity and ZIP alignment. Report the commit, tag, Actions run URL, Release URL and actual validation results. A browser preview or a successful build alone does not establish native runtime acceptance.

### Signing and published assets

- GitHub Actions uses the repository secrets `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PROPERTIES_BASE64`; the latter contains the existing signing properties. Preserve the original key and compare the public certificate against `release-signing.sha256`. Missing secrets must fail explicitly; do not generate a replacement key or fall back to a debug signature.
- Signing material belongs only in ignored local files or encrypted Actions Secrets, never in tracked files, logs, issues or chat. The workflow restores temporary signing files and removes them after the build. Do not print secret values when checking configuration.
- `scripts/package-release.js` requires application ID `com.tokenmonitor.android`, matching version/code, a non-debuggable APK, one signer matching the pinned certificate, and successful `apksigner` / `zipalign` verification.
- Public assets are `Token-Monitor-Android-<version>.apk`, `SHA256SUMS`, `signature.txt` and `release-metadata.json`; metadata records the exact source commit, APK hash and certificate fingerprint. Keep the APK name and stable `v<version>` tag format: the app updater validates these exact GitHub Release asset URLs.
