# Project guidance

This repository contains the standalone Android read-only client for [Token Monitor](https://github.com/Javis603/token-monitor) (official upstream) and its companion desktop/Hub fork [AoXIUy/token-monitor](https://github.com/AoXIUy/token-monitor) (local sibling workspace `../token-monitor`). It supports both Node Hub and Cloudflare Worker Hub for core stats/subscriptions/limits, and gracefully consumes optional Node-Hub-only fork extensions (online conversations, live session rates, read-only approval alerts, usage & AI analysis reports, Antigravity live session activity, and read-only Antigravity account pool snapshots). It does not contain a Hub, desktop collector or Electron application.

- Use Node 22.15+; install frontend dependencies with `npm ci --prefix ui`; run portable checks with `npm run verify` (Node tests + React `tsc`/Vite build + pure Java 17 policy checks via `scripts/check-java.js`).
- Build with JDK 17, SDK Platform 36 and Build Tools 35.0.0: `sh ./gradlew assembleDebug assembleDebugAndroidTest lint`.
- Run native acceptance on a dedicated Android device/emulator with `sh ./gradlew connectedDebugAndroidTest`; these tests clear this application's connection settings.
- Read `docs/DEVELOPMENT.md` before changing native networking, WebView interception, credentials, completion monitoring, SQLite limits history, in-app updates or widget refreshes.
- `src/shared/` is the portable calculation snapshot synced from upstream and `AoXIUy/token-monitor`. Read `docs/UPSTREAM.md` and `docs/upstream-files.json` before updating it; keep browser globals and CommonJS exports compatible.
- Never commit signing keys, actual signing properties, credentials, local SDK paths or build output (`app/build/generated/ui/`, `app/build/generated/assets/shared/`). Keep the original MIT copyright notice.
- Do not add dependencies or tooling without discussing the reason in the issue or PR description.
- Commit subjects use conventional commits, for example `fix(android): preserve connection state on refresh`. Do not add AI co-author trailers.

## Where guidance lives

| Changing… | Read first |
| --- | --- |
| native networking, WebView asset isolation, Keystore, lifecycle, completion notifications, SQLite limits history, widgets or in-app updates | `docs/DEVELOPMENT.md` |
| `src/shared/` snapshot closure, upstream version baseline or fork-synced modules | `docs/UPSTREAM.md` and `docs/upstream-files.json` |
| on-demand Antigravity / Codex session conversations | `docs/SESSION_CONVERSATIONS.md` |
| read-only Codex / Antigravity approval alerts | `docs/APPROVAL_ALERTS.md` |
| in-app GitHub Release updates and APK verification | `docs/UPDATES.md` |
| portable Node/Java test scope vs emulator acceptance scope | `tests/README.md` |
| signing secrets, version checks and GitHub Actions APK publication | `docs/RELEASING.md` |

## Tripwires

- **4-place shared script registration.** Every module under `src/shared/` must be Node/Electron-free with dual browser-global + CommonJS exports, and any newly added script must be registered in all four places: (1) `docs/upstream-files.json` (with exact `sha256`, `sourceCommit`, `sourcePath`, and `sourceProject` when sourced from `AoXIUy/token-monitor`), (2) `app/build.gradle` (`syncDisplayAssets`), (3) `ui/vite.config.ts` (`sharedScripts` in load order), and (4) `app/src/main/java/com/tokenmonitor/android/LocalContentClient.java` (`PATHS`). Missing any one causes silent WebView `403` blocks or broken builds.
- **Strict offline WebView and flat UI bundle.** `LocalContentClient` serves only exact HTTPS paths under `https://appassets.androidplatform.net/assets/` and returns `403` for everything else (including queries/fragments/unknown paths). Keep `ui/vite.config.ts` outputting flat `app.js` and `app.css` without code splitting; never enable direct WebView networking or filesystem access.
- **Strict read-only `ConnectionSpec` allowlist and graceful degradation.** All Hub requests are native authenticated `GET` calls through explicit `ConnectionSpec` endpoint builders (`/api/stats`, `/api/subscriptions`, `/api/sync/settings/limitAccountPresentation`, `/api/session-conversations`, `/api/approval-alerts`, `/api/reports`, `/api/reports/<granularity>/<periodKey>`, `/api/antigravity-manager`). Never add write/mutation endpoints or accept raw URLs/paths from WebView JS. Isolate optional reads on dedicated bounded queues with connection-generation and request-ID guards, cancel in-flight calls on Hub switch or backgrounding, and degrade cleanly (e.g. HTTP `404` on fork-only routes against older Hubs or Cloudflare Worker).
- **Credentials, privacy and widget allowlist.** Hub secrets stay encrypted in Android Keystore and never cross into WebView JS, `UsageWidgetSnapshot`, `LimitsHistoryStore`, or logs. Whenever `src/shared/clientCatalog.js` or quota window labels expand, update `WidgetLayoutPolicy.java` and `tests/android/WidgetPolicyChecks.java` so native widgets recognize the new labels instead of collapsing them to "Other".
- **Notification launch Intent identity.** When handling notification taps in an existing Activity, update only the session/connection extras rather than replacing the launch Intent's action, data or categories; replacing launch identity breaks `ActivityScenario` teardown and causes instrumentation tests to hang in `PAUSED`.
- **Verification boundaries.** A browser preview, `npm run verify`, or a compiled instrumentation APK does not establish native runtime acceptance; run `connectedDebugAndroidTest` on the Android 15 emulator when native Java, WebView, SQLite, notification, or widget behavior changes.

## Syncing official upstream and desktop fork changes

Treat updates from both [Javis603/token-monitor](https://github.com/Javis603/token-monitor) (official upstream) and [AoXIUy/token-monitor](https://github.com/AoXIUy/token-monitor) (companion desktop/Hub fork) as a **one-way sync** into this repository. Fetch and review changes, then adapt and verify the relevant read-only features locally. Do not push branches or tags to the official upstream or open an upstream PR for local changes unless the user explicitly requests it. Publishing to this project's `origin` is a separate task governed by the release procedure below.

Follow this adaptation workflow when syncing a new official upstream release or desktop fork feature:

1. **Triage against the read-only boundary.** Compare the source changes since `docs/upstream-files.json` → `upstreamCommit` (for official releases) or the desktop fork commits in `../token-monitor`, and classify each item into:
   - *Shared calculation closure (`src/shared/`)* — portable catalog, formatting, currency, limits, or session helpers;
   - *Read-only Hub consumer* — `ConnectionSpec`, `HubClient`, `MainActivity`, `app/src/main/assets/model.js`, `ui/src/` state/components/types/formatters/demoData;
   - *Native Android surfaces* — `LimitsHistoryStore` / `LimitsHistoryPolicy`, `WidgetLayoutPolicy` / `UsageWidgetSnapshot`, `SessionMonitorService`, `DisplayPrefs`;
   - *Desktop/write-only (N/A)* — local `tokscale` scanning, provider OAuth/credentials, Hub mutations, Electron plugins, desktop window chrome (document as out of scope rather than breaking read-only guarantees).
2. **Sync `src/shared/` and record provenance.** Copy updated shared modules verbatim whenever possible; if an import path must be rebased (such as `limits/historyModel.js`), record the exact `transformation` in `docs/upstream-files.json`. Update every changed file's `sha256`, `sourceCommit`, `sourcePath` (plus `sourceProject` when sourced from `AoXIUy/token-monitor`), and advance `upstreamVersion` / `upstreamCommit` when aligning with a new official release. Apply the 4-place registration rule above for any newly added script.
3. **Adapt model, UI and native layers.** Wire new Hub fields into `model.js` and `ui/src/`, update `WidgetLayoutPolicy.java` for any new client/quota labels, preserve older-Hub / Worker fallback behavior, and keep `demoData.ts` representative for preview and instrumentation tests.
4. **Update documentation and add targeted regressions.** Record the synced commit, scope and read-only boundaries in `docs/UPSTREAM.md` (and `docs/DEVELOPMENT.md` if native queues, endpoints or storage changed). Add portable regression coverage (`tests/android/upstream<NN>.test.js` asserting `docs/upstream-files.json` SHA-256 digests and consumer semantics, or dedicated state tests such as `reports.test.js` / `ag-manager-state.test.js`), update pure Java checks under `tests/android/*Checks.java`, and add instrumentation coverage in `app/src/androidTest/` for WebView, SQLite, notification, or widget behavior.
5. **Verify across all three tiers before committing.**
   - Portable checks: `npm ci --prefix ui && npm run verify`
   - Android build & lint: `sh ./gradlew assembleDebug assembleDebugAndroidTest lint`
   - Native emulator instrumentation: `ANDROID_SERIAL=emulator-5554 sh ./gradlew connectedDebugAndroidTest` (using `token-monitor-api35`, see below)
6. **Separate adaptation commits from release commits.** Commit the reviewed feature/adaptation changes first (for example `feat(android): adapt upstream v0.96.0`), then prepare the version bump and release notes in a dedicated `chore(release): prepare <version>` commit.

## Local Android development on Ubuntu x86_64

Use the Gradle wrapper from the repository root. Install Node 22.15+ and JDK 17. On Ubuntu, install `openjdk-17-jdk-headless`, `unzip` and `libglu1-mesa` with `apt`. Adjust `JAVA_HOME` below if your JDK 17 is installed elsewhere.

Download the [Android SDK Command-Line Tools for Linux](https://developer.android.com/studio#command-line-tools-only). Extract the `cmdline-tools` directory as `$ANDROID_HOME/cmdline-tools/latest` so `sdkmanager` is under `latest/bin`. This workstation uses `$HOME/Android/Sdk` and loads the tool paths from `~/.zshenv`. On another shell, add these exports to its startup file.

```sh
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
sdkmanager --licenses
sdkmanager 'platform-tools' 'platforms;android-36' 'build-tools;35.0.0' \
  'emulator' 'system-images;android-35;google_apis;x86_64'
npm ci --prefix ui
npm run verify
sh ./gradlew assembleDebug assembleDebugAndroidTest lint
```

Use the dedicated `token-monitor-api35` AVD for instrumentation. Its Android 15 Google APIs x86_64 image and Pixel 2 profile match CI and provide a WebView compatible with Tailwind v4. API 36 is the compile SDK. Check KVM access with `emulator -accel-check`. If `/dev/kvm` belongs to `kvm` and the account lacks access, run `sudo usermod -aG kvm "$USER"` and sign out and back in. For the current session, `sudo setfacl -m "u:${USER}:rw" /dev/kvm` grants temporary access until the device permissions are reset.

```sh
# Create once per workstation.
printf 'no\n' | avdmanager create avd --name token-monitor-api35 \
  --package 'system-images;android-35;google_apis;x86_64' --device pixel_2

# Start in a separate terminal. Omit -no-window for interactive UI checks.
emulator -avd token-monitor-api35 -port 5554 -accel on -gpu swiftshader \
  -cores 4 -memory 4096 -no-window -no-audio -no-boot-anim -no-snapshot
```

With the AVD running, wait for Android to finish booting and confirm the serial in `adb devices -l` before testing. If port 5554 is in use, pick another free even port and use its matching serial below. The tests clear this application's connection settings on the selected device. The reports are in `app/build/reports/androidTests/connected/` and `app/build/reports/lint-results-debug.html`.

```sh
adb devices -l
timeout 180s adb -s emulator-5554 wait-for-device
adb -s emulator-5554 shell getprop sys.boot_completed  # Wait for 1.
adb -s emulator-5554 shell input keyevent KEYCODE_WAKEUP
adb -s emulator-5554 shell wm dismiss-keyguard
ANDROID_SERIAL=emulator-5554 sh ./gradlew connectedDebugAndroidTest
```

For manual checks, use `ANDROID_SERIAL=emulator-5554 sh ./gradlew installDebug` and launch Token Monitor. Stop the emulator with `adb -s emulator-5554 emu kill` when finished.

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
