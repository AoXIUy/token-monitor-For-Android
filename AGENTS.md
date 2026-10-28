# Project guidance

This repository contains the Android read-only client for [Token Monitor](https://github.com/Javis603/token-monitor). It does not contain a Hub, desktop collector or Electron application.

- Install frontend dependencies with `npm ci --prefix ui`; run portable checks with `npm run verify`.
- Build with JDK 17, SDK Platform 36 and Build Tools 35.0.0: `sh ./gradlew assembleDebug assembleDebugAndroidTest lint`.
- Run native acceptance on a dedicated Android device/emulator with `sh ./gradlew connectedDebugAndroidTest`; these tests clear this application's connection settings.
- Read `docs/DEVELOPMENT.md` before changing native networking, WebView interception, credentials, completion monitoring or widget refreshes.
- `src/shared/` is the portable upstream calculation snapshot. Read `docs/UPSTREAM.md` before updating it; keep browser globals and CommonJS exports compatible.
- Never commit signing keys, actual signing properties, credentials, local SDK paths or build output. Keep the original MIT copyright notice.
- Do not add dependencies or tooling without discussing the reason in the issue or PR description.
- Commit subjects use conventional commits, for example `fix(android): preserve connection state on refresh`. Do not add AI co-author trailers.
